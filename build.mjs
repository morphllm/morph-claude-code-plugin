import { build } from "esbuild";
import { rm } from "node:fs/promises";

const entryPoints = [
  "src/hooks/pre-compact.ts",
  "src/hooks/session-start.ts",
  "src/hooks/subagent-start.ts",
  "src/hooks/user-prompt-submit.ts",
];

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints,
  outdir: "dist/hooks",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  // @morphllm/morphsdk ships transitive native binaries (@vscode/ripgrep) whose
  // __dirname-based binary path resolution breaks once inlined. Keep it external
  // and resolve at runtime via node_modules installed next to the plugin.
  external: ["@morphllm/morphsdk"],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});

console.log("Build complete: dist/hooks/");
