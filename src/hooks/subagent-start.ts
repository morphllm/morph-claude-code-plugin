import type { SubagentStartInput } from "./types.ts";

const input: SubagentStartInput = JSON.parse(await Bun.stdin.text());

const agentType = (input.agent_type ?? "").toLowerCase();

let additionalContext: string | undefined;

if (agentType === "plan") {
  additionalContext = `Before you begin planning. Think deeply about what questions you need answered from this codebase. Think of 2-4 different angles of questioning. What code relationships do you want to explore? What do you want to look for? Then fire consecutive codebase_search tool calls.`;
} else if (agentType === "explore") {
  additionalContext = `Always start searching with using the codebase_search tool. Think deeply about what questions you need answered from this codebase. Think of 2-4 different angles of questioning. What code relationships do you want to explore? What do you want to look for? Then fire consecutive codebase_search tool calls.`;
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
