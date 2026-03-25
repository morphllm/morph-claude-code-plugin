import { hookPreCompact } from "../hook.ts";

await hookPreCompact().catch(() => {});
