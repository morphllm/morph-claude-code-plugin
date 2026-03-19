/**
 * Compaction Handler
 *
 * When Claude Code triggers compaction, the proxy calls onCompact()
 * instead of forwarding to Anthropic. This function receives the full
 * conversation history and must return a Response that Claude Code
 * will accept as a valid compaction result.
 *
 * Claude Code expects:
 *   - A standard Messages API response (SSE or JSON)
 *   - The assistant's text contains <summary>...</summary>
 *   - Claude Code extracts the <summary> and uses it as the new
 *     conversation context going forward
 */

// ─── Types ──────────────────────────────────────────────────────────

export type ContentBlock =
  | { type: "text"; text: string; [k: string]: unknown }
  | { type: string; [k: string]: unknown };

export type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

export type RequestBody = {
  model: string;
  messages: Message[];
  system?: string | Array<{ type: string; text: string; cache_control?: unknown }>;
  stream?: boolean;
  max_tokens?: number;
  [k: string]: unknown;
};

// ─── Compaction Handler ─────────────────────────────────────────────

/**
 * Called when Claude Code triggers compaction.
 *
 * `body` contains the full message history + the compaction instruction
 * as the last user message. `headers` has the auth headers.
 * `upstream` is the real Anthropic API base URL.
 *
 * Must return a Response. The simplest approach: forward to Anthropic
 * as-is (default compaction). To customize, replace the body or call
 * a different service entirely.
 */
export async function onCompact(
  body: RequestBody,
  headers: Headers,
  upstream: string
): Promise<Response> {
  // ── DEFAULT: Forward to Anthropic (native compaction) ──
  // Replace this with your own compaction logic.
  //
  // For example, to call Morph's compaction API:
  //   const compacted = await callMorphCompact(body.messages);
  //   return buildCompactResponse(compacted);

  const url = `${upstream}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  console.log(`[compact] Forwarded to Anthropic — ${res.status}`);

  // Strip encoding headers
  const resHeaders = new Headers();
  for (const [key, value] of res.headers.entries()) {
    const k = key.toLowerCase();
    if (k === "content-encoding" || k === "content-length") continue;
    resHeaders.set(key, value);
  }

  return new Response(res.body, {
    status: res.status,
    headers: resHeaders,
  });
}

// ─── Helpers for building custom compaction responses ────────────────

/**
 * Build a non-streaming Messages API response containing a summary.
 * Claude Code will parse the <summary> tags from this.
 */
export function buildCompactResponse(summary: string): Response {
  const body = {
    id: `msg_compact_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: "custom-compact",
    content: [{ type: "text", text: summary }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
