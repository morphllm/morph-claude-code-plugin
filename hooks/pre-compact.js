import { text } from "node:stream/consumers";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { STATE_DIR, stateFile, log, fileExists } from "./lib/state.js";
import { parseTranscript } from "./lib/transcript.js";
import { compact } from "./lib/morph.js";

async function hookPreCompact() {
  const input = JSON.parse(await text(process.stdin));

  if (!input.session_id) throw new Error("no session_id in hook input");
  if (!input.transcript_path)
    throw new Error("no transcript_path in hook input");

  log(`PreCompact triggered: trigger=${input.trigger} session=${input.session_id}`);

  if (!(await fileExists(input.transcript_path))) {
    throw new Error(`transcript not found: ${input.transcript_path}`);
  }

  await mkdir(STATE_DIR, { recursive: true });

  const sf = stateFile(input.session_id);
  if (await fileExists(sf)) {
    const prev = JSON.parse(await readFile(sf, "utf-8"));
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
    const ratio = inputChars > 0 ? ((summary.length / inputChars) * 100).toFixed(1) : "N/A";

    log(`PreCompact: compaction complete in ${durationMs}ms — ${inputChars} → ${summary.length} chars (${ratio}% ratio)`);

    const state = {
      summary,
      warn: false,
      stats: { messageCount: messages.length, inputChars, outputChars: summary.length, durationMs },
    };

    await writeFile(sf, JSON.stringify(state));
  } catch (e) {
    log(`PreCompact: error — ${e.message}`);
    const state = {
      summary: "",
      warn: false,
      error: e.message,
    };
    await writeFile(sf, JSON.stringify(state));
  }
}

await hookPreCompact().catch((e) =>
  process.stderr.write(
    `[morph-compact] pre-compact UNCAUGHT ERROR: ${e.message}\n${e.stack}\n`,
  ),
);
