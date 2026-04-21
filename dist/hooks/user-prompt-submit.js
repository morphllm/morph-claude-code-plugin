import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/stdin.ts
import { text } from "node:stream/consumers";
async function readStdinText() {
  return await text(process.stdin);
}

// src/hooks/user-prompt-submit.ts
var input = JSON.parse(await readStdinText());
var prompt = input.prompt ?? "";
var keywords = /\b(where|explain|find)\b/i;
if (keywords.test(prompt)) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "Tip: it is best practice to use the codebase_search tool to begin with, when trying to understand unfamiliar code."
      }
    })
  );
  process.stderr.write(
    `[morph-hooks] UserPromptSubmit: injected codebase_search tip (matched keyword in prompt)
`
  );
} else {
  process.stderr.write(
    `[morph-hooks] UserPromptSubmit: no keyword match, skipping
`
  );
}
