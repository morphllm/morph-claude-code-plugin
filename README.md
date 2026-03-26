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

### Installation

Run the install skill to set up your API key and compact instructions:
```
/morph-compact:install
```

This will:
1. Prompt for your Morph API key and store it in `~/.claude/morph/.env`
2. Add compact instructions to your global `~/.claude/CLAUDE.md`

To remove:
```
/morph-compact:uninstall
```

The API key can also be provided via the `MORPH_API_KEY` environment variable, which takes precedence over the file.

### Limitations

Due to limitations with Claude Code's hooks, we are unable to alter the output of a compaction.

To work around this, the install skill adds compact instructions to `~/.claude/CLAUDE.md` that tell Claude to skip its own summarization when Morph is handling it. This reduces time spent compacting.

For manual compaction, simply run:
```
/compact morph
```

Claude will see the `morph` instruction and output only the sentinel text, letting Morph's summary take over.

If the compact instructions are not followed (more likely on very large sessions), the plugin will detect this and prompt you to run `/compact morph` again. The second compaction operates on a much smaller context and is far more likely to succeed. The Morph summary is cached, so no additional API call is made on retry.

> [!WARNING]
> Even with these instructions, there's no guarantee that compaction will respect them. We are currently working on a more reliable way to fully disable claude's own compaction.
# test
