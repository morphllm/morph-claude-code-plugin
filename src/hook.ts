import { join } from "path";
import { tmpdir } from "os";
import { mkdir, unlink } from "fs/promises";
import { parseTranscript } from "./transcript.ts";
import { compact } from "./morph.ts";

interface PreCompactInput {
  session_id: string;
  transcript_path: string;
  trigger: string;
  custom_instructions: string;
}

interface SessionStartInput {
  session_id: string;
  transcript_path: string;
  source: "startup" | "resume" | "compact";
}

interface StateData {
  summary: string;
  warn: boolean;
  error?: string;
  stats?: {
    messageCount: number;
    inputChars: number;
    outputChars: number;
    durationMs: number;
  };
}

const STATE_DIR = join(tmpdir(), "compact-hook");

function stateFile(sessionID: string): string {
  return join(STATE_DIR, sessionID);
}

async function readStdin<T>(): Promise<T> {
  return JSON.parse(await Bun.stdin.text()) as T;
}

const COMPACT_INSTRUCTIONS = "morph";

function log(msg: string): void {
  process.stderr.write(`[morph-compact] ${msg}\n`);
}

export async function hookPreCompact(): Promise<void> {
  const input = await readStdin<PreCompactInput>();

  if (!input.session_id) throw new Error("no session_id in hook input");
  if (!input.transcript_path)
    throw new Error("no transcript_path in hook input");

  log(`PreCompact triggered: trigger=${input.trigger} session=${input.session_id}`);

  if (!(await Bun.file(input.transcript_path).exists())) {
    throw new Error(`transcript not found: ${input.transcript_path}`);
  }

  await mkdir(STATE_DIR, { recursive: true });

  const sf = stateFile(input.session_id);
  const existing = Bun.file(sf);
  if (await existing.exists()) {
    const prev = (await existing.json()) as StateData;
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

    const state: StateData = {
      summary,
      warn: input.trigger === "manual" && !input.custom_instructions,
      stats: { messageCount: messages.length, inputChars, outputChars: summary.length, durationMs },
    };

    await Bun.write(sf, JSON.stringify(state));
  } catch (e) {
    log(`PreCompact: error — ${(e as Error).message}`);
    const state: StateData = {
      summary: "",
      warn: false,
      error: (e as Error).message,
    };
    await Bun.write(sf, JSON.stringify(state));
  }
}

function emitContext(data: string): void {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: data,
      },
    }),
  );
}

export async function hookSessionStart(): Promise<void> {
  const input = await readStdin<SessionStartInput>();
  if (!input.session_id) throw new Error("no session_id in hook input");

  log(`SessionStart: source=${input.source} session=${input.session_id}`);

  const sf = stateFile(input.session_id);
  const file = Bun.file(sf);
  if (!(await file.exists())) {
    log("SessionStart: no state file, nothing to inject");
    return;
  }

  const state = (await file.json()) as StateData;
  log(`SessionStart: state=${JSON.stringify({ error: state.error, warn: state.warn, summaryLen: state.summary?.length ?? 0, stats: state.stats })}`);

  if (state.error) {
    log(`SessionStart: injecting error — ${state.error}`);
    emitContext(
      "ERROR: Morph compaction failed: " + state.error + "\n" +
      "Inform the user about this error. Context from the previous conversation was NOT preserved.",
    );
    await unlink(sf).catch(() => {});
    return;
  }

  if (!state.summary) {
    log("SessionStart: state file has no summary, skipping");
    return;
  }

  let data = state.summary;

  if (state.warn) {
    data +=
      "\n\n---\n" +
      "WARNING: `/compact` was run without the `morph` instruction, " +
      "so Claude performed its own slow summarization. " +
      "Inform the user that for faster compaction they should run: `/compact morph`";
  }

  if (state.stats) {
    const { messageCount, inputChars, outputChars, durationMs } = state.stats;
    const ratio = inputChars > 0 ? ((outputChars / inputChars) * 100).toFixed(1) : "N/A";
    log(`SessionStart: injecting summary — ${messageCount} messages, ${inputChars} → ${outputChars} chars (${ratio}%), took ${durationMs}ms`);
  } else {
    log(`SessionStart: injecting summary (${data.length} chars)`);
  }

  emitContext(data);
  await unlink(sf).catch(() => {});
}
