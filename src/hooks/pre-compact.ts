import { hookPreCompact } from "../hook.ts";

await hookPreCompact().catch((e) =>
  process.stderr.write(`morph-compact: pre-compact: ${(e as Error).message}\n`),
);
