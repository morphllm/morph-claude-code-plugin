import type { SubagentStartInput } from "./types.ts";

const input: SubagentStartInput = JSON.parse(await Bun.stdin.text());

const agentType = (input.agent_type ?? "").toLowerCase();

let additionalContext: string | undefined;

if (agentType === "plan" || agentType === "explore") {
  additionalContext = `Start by doing 1-4 concurrent codebase_search tool calls to understand the relevant parts of the codebase.`;
}

if (additionalContext) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext,
      },
    }),
  );
  process.stderr.write(
    `[morph-hooks] SubagentStart: injected codebase_search nudge for agent_type=${agentType}\n`,
  );
} else {
  process.stderr.write(
    `[morph-hooks] SubagentStart: no injection for agent_type=${agentType}\n`,
  );
}
