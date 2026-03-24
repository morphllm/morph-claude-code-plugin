import { join } from "path";
import { tmpdir } from "os";
import { mkdir, unlink } from "fs/promises";
import { parseTranscript } from "./transcript.ts";
import { compact } from "./morph.ts";

interface HookInput {
  session_id: string;
  transcript_path: string;
  trigger: string;
  custom_instructions: string;
}

interface StateData {
  summary: string;
  warn: boolean;
}

const STATE_DIR = join(tmpdir(), "compact-hook");

function stateFile(sessionID: string): string {
  return join(STATE_DIR, sessionID);
}

async function readHookInput(): Promise<HookInput> {
  return JSON.parse(await Bun.stdin.text()) as HookInput;
}

const COMPACT_INSTRUCTIONS =
  "Do not summarize the conversation. Output only the following and nothing else: " +
  "Summary provided via SessionStart hook.";

export async function hookPreCompact(): Promise<void> {
  const input = await readHookInput();

  if (!input.session_id) throw new Error("no session_id in hook input");
  if (!input.transcript_path)
    throw new Error("no transcript_path in hook input");

  if (!(await Bun.file(input.transcript_path).exists())) {
    throw new Error(`transcript not found: ${input.transcript_path}`);
  }

  const messages = await parseTranscript(input.transcript_path);
  const summary = await compact(messages);

  const state: StateData = {
    summary,
    warn: input.trigger === "manual" && !input.custom_instructions,
  };

  await mkdir(STATE_DIR, { recursive: true });
  await Bun.write(stateFile(input.session_id), JSON.stringify(state));
}

export async function hookSessionStart(): Promise<void> {
  const input = await readHookInput();
  if (!input.session_id) throw new Error("no session_id in hook input");

  const sf = stateFile(input.session_id);
  const file = Bun.file(sf);
  if (!(await file.exists())) return;

  const state = (await file.json()) as StateData;
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
