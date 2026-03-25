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
}

const STATE_DIR = join(tmpdir(), "compact-hook");

function stateFile(sessionID: string): string {
  return join(STATE_DIR, sessionID);
}

async function readStdin<T>(): Promise<T> {
  return JSON.parse(await Bun.stdin.text()) as T;
}

const COMPACT_INSTRUCTIONS =
  "IMPORTANT: Output ONLY this exact text: Summary provided via SessionStart hook. " +
  "Do NOT write a summary. Do NOT write bullet points. Do NOT analyze the conversation. " +
  "Your ENTIRE output must be exactly: Summary provided via SessionStart hook. " +
  "Nothing else. Just: Summary provided via SessionStart hook.";

export async function hookPreCompact(): Promise<void> {
  const input = await readStdin<PreCompactInput>();

  if (!input.session_id) throw new Error("no session_id in hook input");
  if (!input.transcript_path)
    throw new Error("no transcript_path in hook input");

  if (!(await Bun.file(input.transcript_path).exists())) {
    throw new Error(`transcript not found: ${input.transcript_path}`);
  }

  await mkdir(STATE_DIR, { recursive: true });

  try {
    const messages = await parseTranscript(input.transcript_path);
    const summary = await compact(messages);

    const state: StateData = {
      summary,
      warn: input.trigger === "manual" && !input.custom_instructions,
    };

    await Bun.write(stateFile(input.session_id), JSON.stringify(state));
  } catch (e) {
    const msg = (e as Error).message;
    const state: StateData = {
      summary: "",
      warn: false,
      error: msg,
    };
    await Bun.write(stateFile(input.session_id), JSON.stringify(state));

    process.stderr.write(
      `Morph compaction failed: ${msg}\n` +
        `Context from the previous conversation was NOT preserved.\n`,
    );
    process.exit(1);
  }
}

export async function hookSessionStart(): Promise<void> {
  const input = await readStdin<SessionStartInput>();
  if (!input.session_id) throw new Error("no session_id in hook input");

  // additionalContext is ignored for compact; errors are surfaced
  // directly from PreCompact via systemMessage instead
  if (input.source === "compact") return;

  const sf = stateFile(input.session_id);
  const file = Bun.file(sf);
  if (!(await file.exists())) return;

  const state = (await file.json()) as StateData;

  if (state.error) {
    await unlink(sf).catch(() => {});
    return;
  }

  let data = state.summary;

  if (state.warn) {
    data +=
      "\n\n---\n" +
      "WARNING: `/compact` was run without Morph compaction instructions, " +
      "so Claude performed its own slow summarization. " +
      "Inform the user that for faster compaction they should run:\n" +
      `/compact ${COMPACT_INSTRUCTIONS}`;
  }

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: data,
      },
    }),
  );

  await unlink(sf).catch(() => {});
}
