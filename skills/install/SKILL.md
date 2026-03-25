---
name: install
description: Set up Morph compaction — adds compact instructions to CLAUDE.md and configures API key
user-invocable: true
allowed-tools: [Read, Edit, Write, Glob, Bash, AskUserQuestion]
---

# Install Morph Compact

## Step 1: API Key

Check if `~/.claude/morph/.env` exists and contains a `MORPH_API_KEY=` line.

- If it does, skip to Step 2.
- If not, ask the user for their Morph API key. Then create `~/.claude/morph/.env` with mode 0600:
  ```
  MORPH_API_KEY=<their key>
  ```
  Create the `~/.claude/morph/` directory (mode 0700) if it doesn't exist.

## Step 2: CLAUDE.md

Add the following section to the project's CLAUDE.md file (create it if it doesn't exist). Append it at the end of the file, separated by a blank line:

```
# Compact Instructions

Do not summarize the conversation. Output only the following and nothing else:

Summary provided via SessionStart hook.
```

If CLAUDE.md already contains a "# Compact Instructions" section with "Summary provided via SessionStart hook.", report that it's already installed and do nothing.

If CLAUDE.md already contains a "# Compact Instructions" section without that marker, tell the user and do not modify it.
