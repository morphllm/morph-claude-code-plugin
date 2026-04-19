---
name: uninstall
description: Remove Morph compaction — removes compact instructions from CLAUDE.md and API key
user-invocable: true
allowed-tools: [Read, Edit, Glob, Bash, AskUserQuestion]
---

# Uninstall Morph Compact

## Step 1: CLAUDE.md

Find and remove the "# Compact Instructions" section from the global `~/.claude/CLAUDE.md` file, but only if it contains the text "Summary of previous conversation in SessionStart hook" (confirming it was added by this plugin).

Remove the heading, all content up to the next heading (or end of file), and any trailing blank lines left behind.

If no such section exists, or the section doesn't contain the marker, report that there's nothing to remove.

## Step 2: API Key

Ask the user if they also want to remove their Morph API key from `~/.claude/morph/.env`.

- If yes, delete the file (and the `~/.claude/morph/` directory if empty).
- If no, leave it in place.
