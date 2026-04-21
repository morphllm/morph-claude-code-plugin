import { join } from "node:path";
import { tmpdir } from "node:os";
import { access } from "node:fs/promises";

export const STATE_DIR = join(tmpdir(), "compact-hook");

export function stateFile(sessionId) {
  return join(STATE_DIR, sessionId);
}

export function log(msg) {
  process.stderr.write(`[morph-compact] ${msg}\n`);
}

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function emitContext(hookEventName, data) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: data,
      },
    }),
  );
}
