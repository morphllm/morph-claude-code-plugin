import { CompactClient } from "@morphllm/morphsdk";
import type { TranscriptMessage } from "./transcript.ts";

const COMPACT_TIMEOUT = 60000;
const COMPACT_PRESERVE_RECENT = parseInt(
  process.env.MORPH_COMPACT_PRESERVE_RECENT || "1",
  10,
);
const COMPACT_RATIO = parseFloat(process.env.MORPH_COMPACT_RATIO || "0.3");

const client = new CompactClient({ timeout: COMPACT_TIMEOUT });

export async function compact(messages: TranscriptMessage[]): Promise<string> {
  if (messages.length === 0) return "Empty session - no prior context.";

  const lastUserMsg = messages.findLast((m) => m.role === "user");

  const result = await client.compact({
    messages,
    query: lastUserMsg?.content,
    compressionRatio: COMPACT_RATIO,
    preserveRecent: COMPACT_PRESERVE_RECENT,
    includeMarkers: true,
  });

  return result.output;
}
