import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/hook.ts
import { join as join2 } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, unlink, readFile as readFile2, writeFile, access } from "node:fs/promises";

// src/transcript.ts
import { readFile } from "node:fs/promises";
function extractText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        if (block.text) parts.push(block.text);
        break;
      case "tool_use":
        if (block.name) parts.push(`[tool: ${block.name}]`);
        break;
      case "tool_result":
        if (typeof block.input === "string" && block.input) {
          parts.push(`[result]: ${block.input}`);
        }
        break;
    }
  }
  return parts.join("\n");
}
async function parseTranscript(path) {
  const text2 = await readFile(path, "utf-8");
  const messages = [];
  for (const line of text2.split("\n")) {
    if (!line) continue;
    let tl;
    try {
      tl = JSON.parse(line);
    } catch {
      continue;
    }
    if (!tl.message?.content) continue;
    const extracted = extractText(tl.message.content);
    if (!extracted) continue;
    messages.push({ role: tl.message.role, content: extracted });
  }
  return messages;
}

// src/morph.ts
import { join } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";
import { CompactClient } from "@morphllm/morphsdk";
var COMPACT_TIMEOUT = 6e4;
var COMPACT_PRESERVE_RECENT = parseInt(
  process.env.MORPH_COMPACT_PRESERVE_RECENT || "1",
  10
);
var COMPACT_RATIO = parseFloat(process.env.MORPH_COMPACT_RATIO || "0.3");
var MORPH_STATE_DIR = join(homedir(), ".claude", "morph");
var ENV_FILE = join(MORPH_STATE_DIR, ".env");
function loadApiKey() {
  const envKey = process.env.MORPH_API_KEY;
  if (envKey) return envKey;
  try {
    const text2 = readFileSync(ENV_FILE, "utf-8");
    for (const line of text2.split("\n")) {
      const m = line.match(/^MORPH_API_KEY=(.+)$/);
      if (m && m[1]) return m[1].trim();
    }
  } catch {
  }
  throw new Error(
    "Morph API key not found. Run /morph-compact:install to configure it, or set MORPH_API_KEY environment variable."
  );
}
var client = new CompactClient({
  timeout: COMPACT_TIMEOUT,
  morphApiKey: loadApiKey()
});
async function compact(messages) {
  if (messages.length === 0) return "Empty session - no prior context.";
  const lastUserMsg = messages.findLast((m) => m.role === "user");
  const result = await client.compact({
    messages,
    query: lastUserMsg?.content,
    compressionRatio: COMPACT_RATIO,
    preserveRecent: COMPACT_PRESERVE_RECENT,
    includeMarkers: true
  });
  return result.output;
}

// src/stdin.ts
import { text } from "node:stream/consumers";
async function readStdinText() {
  return await text(process.stdin);
}

// src/hook.ts
var STATE_DIR = join2(tmpdir(), "compact-hook");
function stateFile(sessionID) {
  return join2(STATE_DIR, sessionID);
}
async function readStdin() {
  return JSON.parse(await readStdinText());
}
async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function log(msg) {
  process.stderr.write(`[morph-compact] ${msg}
`);
}
async function hookPreCompact() {
  const input = await readStdin();
  if (!input.session_id) throw new Error("no session_id in hook input");
  if (!input.transcript_path)
    throw new Error("no transcript_path in hook input");
  log(`PreCompact triggered: trigger=${input.trigger} session=${input.session_id}`);
  if (!await fileExists(input.transcript_path)) {
    throw new Error(`transcript not found: ${input.transcript_path}`);
  }
  await mkdir(STATE_DIR, { recursive: true });
  const sf = stateFile(input.session_id);
  if (await fileExists(sf)) {
    const prev = JSON.parse(await readFile2(sf, "utf-8"));
    if (prev.summary) {
      log("PreCompact: cached summary found, skipping API call");
      return;
    }
  }
  try {
    const messages = await parseTranscript(input.transcript_path);
    const inputChars = messages.reduce((n, m) => n + m.content.length, 0);
    log(`PreCompact: parsed ${messages.length} messages (${inputChars} chars), calling Morph API...`);
    const start = performance.now();
    const summary = await compact(messages);
    const durationMs = Math.round(performance.now() - start);
    const ratio = inputChars > 0 ? (summary.length / inputChars * 100).toFixed(1) : "N/A";
    log(`PreCompact: compaction complete in ${durationMs}ms \u2014 ${inputChars} \u2192 ${summary.length} chars (${ratio}% ratio)`);
    const state = {
      summary,
      warn: false,
      stats: { messageCount: messages.length, inputChars, outputChars: summary.length, durationMs }
    };
    await writeFile(sf, JSON.stringify(state));
  } catch (e) {
    log(`PreCompact: error \u2014 ${e.message}`);
    const state = {
      summary: "",
      warn: false,
      error: e.message
    };
    await writeFile(sf, JSON.stringify(state));
  }
}

// src/hooks/pre-compact.ts
await hookPreCompact().catch(
  (e) => process.stderr.write(
    `[morph-compact] pre-compact UNCAUGHT ERROR: ${e.message}
${e.stack}
`
  )
);
