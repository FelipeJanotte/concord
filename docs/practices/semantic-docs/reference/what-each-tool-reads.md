# What each tool actually reads

Read this before assuming a documentation layout will work for a colleague on a different tool.

Gathered from each vendor's own current documentation on 2026-09-04. Behaviour changes without
notice, so check the tool you actually care about before relying on a row for something expensive.

## The instruction file

| Tool | Reads | Nested files | Includes |
|---|---|---|---|
| Claude Code | `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/**` | ancestors at launch, subdirectories when it reads files there | `@path`, up to four hops, loaded in full at launch | <!-- portable-ok --><!-- these paths are the subject: this file documents which directory each tool reads -->
| Cursor | `.cursor/rules/**/*.mdc`, `AGENTS.md`, root `CLAUDE.md` | yes, combined with parents, more specific wins | rules can `@filename` | <!-- portable-ok --><!-- these paths are the subject: this file documents which directory each tool reads -->
| Codex | `AGENTS.override.md` then `AGENTS.md` per directory | root to working directory, at most one file per directory, stops there | none documented |
| Copilot | `.github/copilot-instructions.md`, `.github/instructions/**`, `AGENTS.md`, `CLAUDE.md` | CLI searches broadly; nested `AGENTS.md` in the editor is experimental and off by default | `@relative/path` in some files, not all | <!-- portable-ok --><!-- these paths are the subject: this file documents which directory each tool reads -->
| Gemini CLI | `GEMINI.md` by default, filename configurable to `AGENTS.md` | discovered just in time when a tool touches the directory | `@file.md` |
| Amp | `AGENTS.md`, falling back to `AGENT.md` or `CLAUDE.md` per directory | ancestors always, descendants when it reads there | `@path` with globs |
| OpenCode | `AGENTS.md` only, no `CLAUDE.md` fallback | nearest first, added once when discovered | its `instructions` array does not currently load |
| Cline | `.clinerules/*` first, then root `AGENTS.md` | not documented for `AGENTS.md` | none |
| Kiro | `.kiro/steering/*.md`, `AGENTS.md` | every discovered `AGENTS.md` is included | none for `AGENTS.md` | <!-- portable-ok --><!-- these paths are the subject: this file documents which directory each tool reads -->
| Aider | nothing automatically | none | explicit `--read` or `read:` in config |

## Two things follow from that table

**Precedence is mostly undefined.** Copilot CLI states it has no general precedence order.
OpenCode says it does not resolve conflicts. Kiro and Cline do not define it between nested files.
Claude Code documents load order but still says that if two rules contradict each other it "may
pick one arbitrarily".

So a contradiction between two files is not resolved by a rule you can look up. It is resolved by
chance, differently per tool. That is why one fact has one home: not for tidiness, but because
nothing promises which copy wins.

**Automatic loading is not universal.** Aider loads no instruction file unless told to. A layout
that depends on a file being picked up silently does nothing there.

## Is AGENTS.md the answer?

It is a real cross-tool convention, under Linux Foundation stewardship since 2025-12-09, with
independent native adoption by Codex, Cursor, Copilot, Devin, Cline, Amp, OpenCode and Kiro.
<https://agents.md/>, <https://openai.com/index/agentic-ai-foundation/> (2025-12-09)

What it standardises is the **filename and free-form Markdown**. It does not standardise discovery,
precedence, imports or size limits, which is exactly where the table above disagrees. Adopting the
name does not make a layout portable.

Two tools need a bridge. Claude Code reads `CLAUDE.md` and not `AGENTS.md`, and its own
documentation gives the two ways across: a `CLAUDE.md` containing `@AGENTS.md`, or a symlink.
Gemini CLI reads `GEMINI.md` unless its `context.fileName` is configured.
<https://code.claude.com/docs/en/memory>

## Size

One published target is under 200 lines per file, with a hard skip above 4 MiB, on the grounds that
longer files are followed less reliably. Codex documents a 32 KiB aggregate limit across the files
it selects. The others publish no number.

Treat 200 lines as a trigger to restructure rather than a limit to sit against, and do not assume
another tool shares it.
