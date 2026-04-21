import { text } from "node:stream/consumers";

const input = JSON.parse(await text(process.stdin));

const prompt = input.prompt ?? "";
const keywords = /\b(where|explain|find)\b/i;

if (keywords.test(prompt)) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "Tip: it is best practice to use the codebase_search tool to begin with, when trying to understand unfamiliar code.",
      },
    }),
  );
  process.stderr.write(
    `[morph-hooks] UserPromptSubmit: injected codebase_search tip (matched keyword in prompt)\n`,
  );
} else {
  process.stderr.write(
    `[morph-hooks] UserPromptSubmit: no keyword match, skipping\n`,
  );
}
