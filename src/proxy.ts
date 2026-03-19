/**
 * Claude Code Compaction Proxy
 *
 * Sits between Claude Code and the Anthropic API. Normal requests pass
 * through unchanged. When Claude Code triggers compaction, we intercept
 * that call and replace it with our own compaction logic.
 *
 * Claude Code's compaction flow:
 *   1. Internal token counter hits ~167k threshold
 *   2. Claude Code appends a user message: "Your task is to create a
 *      detailed summary of the conversation..."
 *   3. Sends the full history + that instruction to the API
 *   4. Takes the <summary>...</summary> from the response
 *   5. Replaces its entire internal history with the summary
 *   6. Token counter resets to reflect the summary size
 *
 * We intercept step 3 and return our own summary at step 4.
 * Claude Code doesn't know the difference — it just sees a valid
 * compaction response and updates its state accordingly.
 *
 * Usage:
 *   ANTHROPIC_BASE_URL=http://localhost:4800 claude
 */

import { onCompact, type RequestBody } from "./transforms";

const UPSTREAM = process.env.UPSTREAM_URL || "https://api.anthropic.com";
const PORT = parseInt(process.env.PROXY_PORT || "4800");

// ─── Compaction Detection ───────────────────────────────────────────

const COMPACT_MARKER = "Your task is to create a detailed summary";

function isCompactRequest(body: RequestBody): boolean {
  for (const msg of body.messages) {
    if (msg.role !== "user") continue;
    if (typeof msg.content === "string") {
      if (msg.content.includes(COMPACT_MARKER)) return true;
    } else {
      for (const block of msg.content) {
        if (block.type === "text" && (block as any).text?.includes(COMPACT_MARKER))
          return true;
      }
    }
  }
  return false;
}

// ─── Proxy Server ───────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const upstreamUrl = `${UPSTREAM}${url.pathname}${url.search}`;

    const isMessagesEndpoint =
      req.method === "POST" && url.pathname === "/v1/messages";

    // Copy request headers
    const fwdHeaders = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const k = key.toLowerCase();
      if (k === "host" || k === "accept-encoding") continue;
      fwdHeaders.set(key, value);
    }

    let body: BodyInit | undefined;

    if (isMessagesEndpoint) {
      const json = (await req.json()) as RequestBody;

      if (isCompactRequest(json)) {
        // ── Compaction intercepted ──
        console.log(
          `[proxy] COMPACT intercepted — ${json.messages.length} msgs, model=${json.model}`
        );

        // Hand off to custom compaction logic
        const result = await onCompact(json, fwdHeaders, UPSTREAM);

        // Return the result to Claude Code — it will replace its
        // internal history with the <summary> from this response
        return result;
      }

      // ── Normal request — pass through unchanged ──
      console.log(
        `[proxy] ${json.messages.length} msgs, model=${json.model}, stream=${json.stream}`
      );
      body = JSON.stringify(json);
      fwdHeaders.set(
        "content-length",
        String(new TextEncoder().encode(body as string).byteLength)
      );
    } else {
      body = req.body ?? undefined;
    }

    // Forward to upstream
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: req.method,
        headers: fwdHeaders,
        body,
      });
    } catch (err) {
      console.error(`[proxy] Upstream error:`, err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    // Forward response, stripping encoding headers (Bun auto-decompresses)
    const resHeaders = new Headers();
    for (const [key, value] of upstreamRes.headers.entries()) {
      const k = key.toLowerCase();
      if (k === "content-encoding" || k === "content-length") continue;
      resHeaders.set(key, value);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: resHeaders,
    });
  },
});

console.log(`[proxy] Listening on http://localhost:${PORT}`);
console.log(`[proxy] Upstream: ${UPSTREAM}`);
console.log(`[proxy] Usage: ANTHROPIC_BASE_URL=http://localhost:${PORT} claude`);
