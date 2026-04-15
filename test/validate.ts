/**
 * Reads captured proxy requests and validates compaction payloads.
 * Checks that the compaction API call only contains our override message
 * and none of the original conversation content.
 *
 * Usage: bun test/validate.ts
 */
import { readdir } from "fs/promises";
import { join } from "path";

const CAPTURE_DIR = join(import.meta.dir, "captures");
const OVERRIDE_MARKER = "SYSTEM OVERRIDE - COMPACTION MODE ACTIVE";
const EXPECTED_RESPONSE = "Summary provided via SessionStart hook.";
const COMPACT_PROMPT_MARKER = "CRITICAL: Respond with TEXT ONLY";

const files = (await readdir(CAPTURE_DIR).catch(() => [] as string[]))
  .filter((f) => f.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.log(
    "No captures found. Run the proxy and trigger compaction first.",
  );
  console.log("  1. bun test/proxy.ts");
  console.log("  2. ANTHROPIC_BASE_URL=http://localhost:8877 claude");
  console.log("  3. /compact morph");
  console.log("  4. bun test/validate.ts");
  process.exit(1);
}

console.log(`Found ${files.length} captured requests:\n`);

let compactionCount = 0;
let passed = 0;
let failed = 0;

for (const file of files) {
  const capture = await Bun.file(join(CAPTURE_DIR, file)).json();
  const isCompaction = capture.label === "COMPACTION";

  const tag = isCompaction ? "\x1b[33mCOMPACTION\x1b[0m" : "conversation";
  console.log(
    `  ${file}: ${tag} | model=${capture.model} | msgs=${capture.messageCount}`,
  );

  // Also detect compaction by compact prompt in last message
  const msgs: any[] = capture.messages || [];
  const allText = JSON.stringify(msgs);
  const hasCompactPrompt = allText.includes(COMPACT_PROMPT_MARKER);

  if (!isCompaction && !hasCompactPrompt) continue;

  compactionCount++;

  const hasOverride = allText.includes(OVERRIDE_MARKER);
  const hasExpectedResponse = allText.includes(EXPECTED_RESPONSE);
  const messageRoles = msgs.map((m: any) => m.role);

  // Count how many non-override user messages exist (real conversation leaked?)
  const realUserMessages = msgs.filter((m: any) => {
    if (m.role !== "user") return false;
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return !text.includes(OVERRIDE_MARKER) && !text.includes(COMPACT_PROMPT_MARKER);
  });

  console.log(`    Roles: ${JSON.stringify(messageRoles)}`);
  console.log(
    `    Has override marker:    ${hasOverride ? "\x1b[32m✅ yes\x1b[0m" : "\x1b[31m❌ no\x1b[0m"}`,
  );
  console.log(
    `    Has compact prompt:     ${hasCompactPrompt ? "\x1b[33m✅ yes\x1b[0m" : "no"}`,
  );
  console.log(
    `    Has expected response:  ${hasExpectedResponse ? "\x1b[32m✅ yes\x1b[0m" : "\x1b[31m❌ no\x1b[0m"}`,
  );
  console.log(
    `    Real user msgs leaked:  ${realUserMessages.length === 0 ? "\x1b[32m0 (good)\x1b[0m" : `\x1b[31m${realUserMessages.length} LEAKED\x1b[0m`}`,
  );
  console.log(`    Total messages:         ${msgs.length}`);
  console.log(`    Total payload chars:    ${allText.length}`);

  // Dump each message for manual inspection
  for (let i = 0; i < msgs.length; i++) {
    const content =
      typeof msgs[i].content === "string"
        ? msgs[i].content
        : JSON.stringify(msgs[i].content);
    const preview =
      content.length > 200 ? content.slice(0, 200) + "..." : content;
    console.log(`    [${i}] ${msgs[i].role}: ${preview}`);
  }

  const overrideWorked = hasOverride && realUserMessages.length === 0;
  if (overrideWorked) {
    console.log(
      `    \x1b[32m→ PASS: Compaction payload contains only override, no real conversation leaked\x1b[0m`,
    );
    passed++;
  } else if (hasOverride) {
    console.log(
      `    \x1b[31m→ FAIL: Override present but real conversation also leaked (${realUserMessages.length} msgs)\x1b[0m`,
    );
    failed++;
  } else {
    console.log(
      `    \x1b[31m→ FAIL: No override — full conversation sent to Anthropic compaction\x1b[0m`,
    );
    failed++;
  }
  console.log();
}

console.log("=".repeat(50));
console.log(`Total requests captured: ${files.length}`);
console.log(`Compaction requests:     ${compactionCount}`);
if (compactionCount > 0) {
  console.log(
    `Passed: ${passed}  Failed: ${failed}  → ${failed === 0 ? "\x1b[32mALL PASS\x1b[0m" : "\x1b[31mFAILURES\x1b[0m"}`,
  );
}

if (compactionCount === 0) {
  console.log(
    `\n⚠️  No compaction requests found. Did you trigger /compact morph?`,
  );
  process.exit(1);
}

process.exit(failed > 0 ? 1 : 0);
