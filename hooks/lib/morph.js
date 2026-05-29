import { join } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";
import { CompactClient } from "@morphllm/morphsdk";
import { log } from "./state.js";

const COMPACT_TIMEOUT = 60000;
const COMPACT_PRESERVE_RECENT = parseInt(
  process.env.MORPH_COMPACT_PRESERVE_RECENT || "1",
  10,
);
const COMPACT_RATIO = parseFloat(process.env.MORPH_COMPACT_RATIO || "0.3");

// Retry config. Morph Compact can fail transiently — 429 rate-limit bursts, 5xx,
// or a network/timeout blip. Before this, a single failed call lost the entire
// summary (pre-compact.js caches an empty summary on throw), so a momentary 429
// wiped the user's whole prior context. Retry retryable failures with exponential
// backoff + full jitter before giving up. Set MORPH_COMPACT_MAX_RETRIES=0 to disable.
const COMPACT_MAX_RETRIES = Math.max(
  0,
  parseInt(process.env.MORPH_COMPACT_MAX_RETRIES || "3", 10),
);
const COMPACT_RETRY_BASE_MS = Math.max(
  0,
  parseInt(process.env.MORPH_COMPACT_RETRY_BASE_MS || "1000", 10),
);

export const MORPH_STATE_DIR = join(homedir(), ".claude", "morph");
const ENV_FILE = join(MORPH_STATE_DIR, ".env");

function loadApiKey() {
  const envKey = process.env.MORPH_API_KEY;
  if (envKey) return envKey;

  try {
    const text = readFileSync(ENV_FILE, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^MORPH_API_KEY=(.+)$/);
      if (m && m[1]) return m[1].trim();
    }
  } catch {}

  throw new Error(
    "Morph API key not found. Run /morph-compact:install to configure it, " +
    "or set MORPH_API_KEY environment variable.",
  );
}

const client = new CompactClient({
  timeout: COMPACT_TIMEOUT,
  morphApiKey: loadApiKey(),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The SDK throws `new Error("Compact API error <status>: <body>")` for any non-2xx
// (it does NOT attach a numeric status property), and a plain network/abort Error
// (no status) on connection or timeout failure. So we classify by parsing the
// message: retry transient HTTP statuses and all network/timeout errors; fail fast
// on auth/validation 4xx (401/403/400/404) where a retry can never succeed.
function isRetryable(err) {
  const msg = String((err && err.message) || err || "");
  const httpMatch = msg.match(/Compact API error (\d{3})/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    return (
      status === 408 ||
      status === 425 ||
      status === 429 ||
      (status >= 500 && status <= 599)
    );
  }
  // No HTTP status in the message → treat connection/timeout/abort errors as retryable.
  return /fetch failed|network|timeout|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|aborted|AbortError/i.test(
    msg,
  );
}

export async function compact(messages) {
  if (messages.length === 0) return "Empty session - no prior context.";

  const lastUserMsg = messages.findLast((m) => m.role === "user");

  let lastErr;
  for (let attempt = 0; attempt <= COMPACT_MAX_RETRIES; attempt++) {
    try {
      const result = await client.compact({
        messages,
        query: lastUserMsg?.content,
        compressionRatio: COMPACT_RATIO,
        preserveRecent: COMPACT_PRESERVE_RECENT,
        includeMarkers: true,
      });
      return result.output;
    } catch (err) {
      lastErr = err;
      if (attempt >= COMPACT_MAX_RETRIES || !isRetryable(err)) break;
      // Exponential backoff with full jitter: random in [0, base * 2^attempt).
      const ceiling = COMPACT_RETRY_BASE_MS * Math.pow(2, attempt);
      const delay = Math.round(Math.random() * ceiling);
      log(
        `compact attempt ${attempt + 1}/${COMPACT_MAX_RETRIES + 1} failed ` +
        `(${String((err && err.message) || err).slice(0, 140)}); ` +
        `retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}
