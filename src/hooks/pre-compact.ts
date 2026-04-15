import { hookPreCompact } from "../hook.ts";

await hookPreCompact().catch((e) =>
  process.stderr.write(
    `[morph-compact] pre-compact UNCAUGHT ERROR: ${(e as Error).message}\n${(e as Error).stack}\n`,
  ),
);
