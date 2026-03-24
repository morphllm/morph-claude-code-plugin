import { hookSessionStart } from "../hook.ts";

await hookSessionStart().catch((e) =>
  process.stderr.write(
    `morph-compact: session-start: ${(e as Error).message}\n`,
  ),
);
