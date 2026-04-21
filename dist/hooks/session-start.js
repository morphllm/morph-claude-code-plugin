import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/hook.ts
import { join as join2 } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, unlink, readFile, writeFile, access } from "node:fs/promises";

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
function emitContext(data) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: data
      }
    })
  );
}
async function hookSessionStart() {
  const input = await readStdin();
  if (!input.session_id) throw new Error("no session_id in hook input");
  log(`SessionStart: source=${input.source} session=${input.session_id}`);
  const sf = stateFile(input.session_id);
  if (!await fileExists(sf)) {
    log("SessionStart: no state file, nothing to inject");
    return;
  }
  const state = JSON.parse(await readFile(sf, "utf-8"));
  log(`SessionStart: state=${JSON.stringify({ error: state.error, summaryLen: state.summary?.length ?? 0, stats: state.stats })}`);
  if (state.error) {
    log(`SessionStart: injecting error \u2014 ${state.error}`);
    emitContext(
      "ERROR: Morph compaction failed: " + state.error + "\nInform the user about this error. Context from the previous conversation was NOT preserved."
    );
    await unlink(sf).catch(() => {
    });
    return;
  }
  if (!state.summary) {
    log("SessionStart: state file has no summary, skipping");
    return;
  }
  const data = state.summary;
  if (state.stats) {
    const { messageCount, inputChars, outputChars, durationMs } = state.stats;
    const ratio = inputChars > 0 ? (outputChars / inputChars * 100).toFixed(1) : "N/A";
    log(`SessionStart: injecting summary \u2014 ${messageCount} messages, ${inputChars} \u2192 ${outputChars} chars (${ratio}%), took ${durationMs}ms`);
  } else {
    log(`SessionStart: injecting summary (${data.length} chars)`);
  }
  emitContext(data);
  await unlink(sf).catch(() => {
  });
}

// src/hooks/session-start.ts
await hookSessionStart().catch(
  (e) => process.stderr.write(
    `morph-compact: session-start: ${e.message}
`
  )
);
