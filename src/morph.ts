import { join } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";
import { CompactClient } from "@morphllm/morphsdk";
import type { TranscriptMessage } from "./transcript.ts";

const COMPACT_TIMEOUT = 60000;
const COMPACT_PRESERVE_RECENT = parseInt(
  process.env.MORPH_COMPACT_PRESERVE_RECENT || "1",
  10,
);
const COMPACT_RATIO = parseFloat(process.env.MORPH_COMPACT_RATIO || "0.3");

export const MORPH_STATE_DIR = join(homedir(), ".claude", "morph");
const ENV_FILE = join(MORPH_STATE_DIR, ".env");

function loadApiKey(): string {
  const envKey = process.env.MORPH_API_KEY;
  if (envKey) return envKey;

  try {
    const text = readFileSync(ENV_FILE, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^MORPH_API_KEY=(.+)$/);
      if (m) return m[1].trim();
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

export async function compact(messages: TranscriptMessage[]): Promise<string> {
  if (messages.length === 0) return "Empty session - no prior context.";

  const lastUserMsg = messages.findLast((m) => m.role === "user");

  const result = await client.compact({
    messages,
    query: lastUserMsg?.content,
    compressionRatio: COMPACT_RATIO,
    preserveRecent: COMPACT_PRESERVE_RECENT,
    includeMarkers: true,
  });

  return result.output;
}
