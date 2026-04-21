import { readFile } from "node:fs/promises";

function extractText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        if (block.text) parts.push(block.text);
        break;
      case "tool_use":
        if (block.name) parts.push(`[tool: ${block.name}]`);
        break;
      case "tool_result":
        if (typeof block.input === "string" && block.input) {
          parts.push(`[result]: ${block.input}`);
        }
        break;
    }
  }
  return parts.join("\n");
}

export async function parseTranscript(path) {
  const text = await readFile(path, "utf-8");
  const messages = [];

  for (const line of text.split("\n")) {
    if (!line) continue;

    let tl;
    try {
      tl = JSON.parse(line);
    } catch {
      continue;
    }

    if (!tl.message?.content) continue;
    const extracted = extractText(tl.message.content);
    if (!extracted) continue;

    messages.push({ role: tl.message.role, content: extracted });
  }

  return messages;
}
