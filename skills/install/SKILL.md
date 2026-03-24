---
name: install
description: Set up Morph compaction — adds compact instructions to CLAUDE.md
user-invocable: true
allowed-tools: [Read, Edit, Write, Glob]
---

# Install Morph Compact

Add the following section to the project's CLAUDE.md file (create it if it doesn't exist). Append it at the end of the file, separated by a blank line:

```
# Compact Instructions

Do not summarize the conversation. Output only the following and nothing else:

Summary provided via SessionStart hook.
```

If CLAUDE.md already contains a "# Compact Instructions" section with "Summary provided via SessionStart hook.", report that it's already installed and do nothing.

If CLAUDE.md already contains a "# Compact Instructions" section without that marker, tell the user and do not modify it.
