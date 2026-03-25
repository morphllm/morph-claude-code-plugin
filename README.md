# morph-claude-code-plugin

A [Claude Code](https://claude.com/product/claude-code) marketplace that houses Morph integration plugins. There is currently only one plugin:
- **Compaction** — 25,000+ tok/s context compression in sub-2s, +0.6% on SWE-Bench Pro

> [!IMPORTANT]
> This repository contains only one of the four tools that are enabled in [opencode-morph-plugin](https://github.com/morphllm/opencode-morph-plugin). Consider using it if you want to take advantage of everything we have to offer.

## Compaction

The `morph-compact` plugin hooks parts of the compaction lifecycle in order to inject [Morph Compact](https://www.morphllm.com/products/compact) into its context.

### How it works
1. Before a compaction is run, the plugin calls out to the Morph Compact API with the current context.
2. After compaction is complete, it injects the summarized context.

The former uses the [PreCompact](https://code.claude.com/docs/en/hooks#precompact) hook and the latter uses the [SessionStart](https://code.claude.com/docs/en/hooks#sessionstart) hook.

### Limitations

Due to limitations with Claude Code's hooks, we are unable to alter the output of a compaction.

To work around this, skill commands are bundled with the plugin that allows you to add compact instructions that both reduce time spent compacting and context pollution:
```
/morph-compact:install
```

This injects a section in your CLAUDE.md that instructs Claude Code's automatic compaction to output a minimal summary. You may choose to remove this afterwards manually or with:
```
/morph-compact:uninstall
```

For manual compaction, you must provide custom instructions:
```
/compact Do not summarize the conversation. Output only the following and nothing else: Summary provided via SessionStart hook.
```

If this is not detected in the output, a warning will be injected into the context to notify you.

> [!WARNING]
> Even with these custom instructions, there's no guarantee that compaction will respect them.
