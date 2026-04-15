/**
 * Reverse proxy that intercepts all Claude Code → Anthropic API traffic.
 * Captures every request payload and tags compaction requests.
 *
 * Usage:
 *   1. bun test/proxy.ts
 *   2. In another terminal: ANTHROPIC_BASE_URL=http://localhost:8877 claude
 *   3. Trigger /compact morph
 *   4. Inspect test/captures/ or run: bun test/validate.ts
 */
import { mkdir } from "fs/promises";
import { join } from "path";

const UPSTREAM = "https://api.anthropic.com";
const CAPTURE_DIR = join(import.meta.dir, "captures");
const PORT = 8877;

await mkdir(CAPTURE_DIR, { recursive: true });

let requestCount = 0;

const OVERRIDE_MARKER = "SYSTEM OVERRIDE - COMPACTION MODE ACTIVE";

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS" || url.pathname === "/health") {
      return new Response("ok");
    }

    const upstreamUrl = `${UPSTREAM}${url.pathname}${url.search}`;
    const body = await req.text();
    requestCount++;
    const id = String(requestCount).padStart(4, "0");

    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(body);
    } catch {}

    const model: string = parsed.model || "unknown";
    const msgCount: number = parsed.messages?.length || 0;
    const hasCompactBeta =
      req.headers.get("anthropic-beta")?.includes("compact") || false;
    const hasContextMgmt = !!parsed.context_management;

    // Check if messages contain our override
    const messagesText = JSON.stringify(parsed.messages || []);
    const hasOverride = messagesText.includes(OVERRIDE_MARKER);

    // Heuristic: compaction request if model is sonnet, has compact beta,
    // context_management, or our override marker
    const isLikelyCompaction =
      model.includes("sonnet") ||
      hasCompactBeta ||
      hasContextMgmt ||
      hasOverride;

    const label = isLikelyCompaction ? "COMPACTION" : "conversation";

    // Save auth headers from real CC requests so the injection test can reuse them
    if (url.pathname === "/v1/messages" && req.method === "POST") {
      const authHeaders: Record<string, string> = {};
      for (const [key, value] of req.headers.entries()) {
        if (
          key.startsWith("x-api-key") ||
          key.startsWith("authorization") ||
          key.startsWith("anthropic-")
        ) {
          authHeaders[key] = value;
        }
      }
      await Bun.write(
        join(CAPTURE_DIR, "_auth_headers.json"),
        JSON.stringify(authHeaders, null, 2),
      );
    }

    // Build capture object
    const capture: Record<string, unknown> = {
      id,
      timestamp: new Date().toISOString(),
      label,
      method: req.method,
      path: url.pathname,
      model,
      stream: parsed.stream === true,
      messageCount: msgCount,
      hasCompactBeta,
      hasContextMgmt,
      hasOverride,
    };

    // Always capture full messages — we need to see everything for compaction debugging
    capture.messages = parsed.messages;
    capture.system =
      typeof parsed.system === "string"
        ? { type: "string", length: parsed.system.length, preview: parsed.system.slice(0, 300) }
        : Array.isArray(parsed.system)
          ? parsed.system.map((b: any) => ({
              type: b.type,
              textLength: typeof b.text === "string" ? b.text.length : undefined,
              textPreview:
                typeof b.text === "string"
                  ? b.text.slice(0, 200)
                  : undefined,
            }))
          : null;

    // Check if this looks like a compaction request by inspecting the last message
    const lastMsg = parsed.messages?.[parsed.messages.length - 1];
    const lastMsgText = typeof lastMsg?.content === "string"
      ? lastMsg.content
      : JSON.stringify(lastMsg?.content || "");
    const hasCompactPrompt = lastMsgText.includes("CRITICAL: Respond with TEXT ONLY");
    if (hasCompactPrompt) {
      capture.label = "COMPACTION";
      capture.detectedVia = "compact-prompt-in-last-message";
    }

    const filename = `${id}-${label}.json`;
    await Bun.write(
      join(CAPTURE_DIR, filename),
      JSON.stringify(capture, null, 2),
    );

    // Console output
    const overrideTag = hasOverride ? " \x1b[32m✓ HAS_OVERRIDE\x1b[0m" : "";
    console.log(
      `[${id}] \x1b[${isLikelyCompaction ? "33" : "36"}m${label}\x1b[0m | ` +
        `${req.method} ${url.pathname} | model=${model} | msgs=${msgCount}${overrideTag}`,
    );

    if (isLikelyCompaction) {
      console.log(`  → Captured to ${filename}`);
      if (hasOverride) {
        console.log(
          `  → \x1b[32m✅ Override detected — compaction model sees only our message\x1b[0m`,
        );
      } else {
        console.log(
          `  → \x1b[31m❌ WARNING: No override in compaction request!\x1b[0m`,
        );
      }
    }

    // Forward to upstream — strip accept-encoding so response comes back
    // uncompressed (avoids Zlib mismatch between upstream and CC)
    const fwdHeaders = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const lk = key.toLowerCase();
      if (lk === "host" || lk === "content-length" || lk === "accept-encoding") {
        continue;
      }
      fwdHeaders.set(key, value);
    }

    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers: fwdHeaders,
      body,
    });

    // Stream response back — strip content-encoding since Bun's fetch
    // auto-decompresses, so the body is already plain text
    const resHeaders = new Headers();
    for (const [key, value] of upstreamRes.headers.entries()) {
      const lk = key.toLowerCase();
      if (lk === "content-encoding" || lk === "content-length") continue;
      resHeaders.set(key, value);
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: resHeaders,
    });
  },
});

console.log(`\n\x1b[1m🔍 Morph Compaction Test Proxy\x1b[0m`);
console.log(`   Listening: http://localhost:${PORT}`);
console.log(`   Upstream:  ${UPSTREAM}`);
console.log(`   Captures:  ${CAPTURE_DIR}/`);
console.log(
  `\n\x1b[1mTo use:\x1b[0m ANTHROPIC_BASE_URL=http://localhost:${PORT} claude`,
);
console.log(`Then trigger: /compact morph\n`);
