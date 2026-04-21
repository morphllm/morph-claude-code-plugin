import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/stdin.ts
import { text } from "node:stream/consumers";
async function readStdinText() {
  return await text(process.stdin);
}

// src/hooks/subagent-start.ts
var input = JSON.parse(await readStdinText());
var agentType = (input.agent_type ?? "").toLowerCase();
var additionalContext;
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
        additionalContext
      }
    })
  );
  process.stderr.write(
    `[morph-hooks] SubagentStart: injected codebase_search nudge for agent_type=${agentType}
`
  );
} else {
  process.stderr.write(
    `[morph-hooks] SubagentStart: no injection for agent_type=${agentType}
`
  );
}
