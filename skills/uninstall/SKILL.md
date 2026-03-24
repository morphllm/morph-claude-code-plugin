---
name: uninstall
description: Remove Morph compaction — removes compact instructions from CLAUDE.md
user-invocable: true
allowed-tools: [Read, Edit, Glob]
---

# Uninstall Morph Compact

Find and remove the "# Compact Instructions" section from the project's CLAUDE.md file, but only if it contains the text "Summary provided via SessionStart hook." (confirming it was added by this plugin).

Remove the heading, all content up to the next heading (or end of file), and any trailing blank lines left behind.

If no such section exists, or the section doesn't contain the marker, report that there's nothing to remove.
