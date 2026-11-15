# CLAUDE.md Architecture: What Loads When, and What Belongs Where

CLAUDE.md is loaded **in full, every session**, delivered as a user message after the system
prompt. Every line occupies context and instruction budget in every conversation, and
"longer files reduce adherence" ([Anthropic memory docs](https://code.claude.com/docs/en/memory)).
This file explains the loading mechanics and the placement rules that follow from them.

The budget that matters is **attention, not billing**. Where a cache hit lands, a cached read is
priced at roughly a tenth of an ordinary input token
([prompt caching](https://code.claude.com/docs/en/prompt-caching)), which is why the token cost of
a fat entry file is not the argument against it. Whether any given session hits that cache is not
something you can assume: hits require an exact prefix match within a lookback window and a
minimum size, and anything that changes an earlier part of the prompt invalidates what follows.

The safe form of the claim is the one that does not depend on the cache at all: a long entry file
is followed worse than a short one. Trim for adherence, and treat whatever it saves on the bill as
a side effect you did not verify.

## Size Targets

- **Official: under 200 lines per CLAUDE.md file.** Files beyond that trigger `/doctor`'s
  trim proposal ([Anthropic](https://code.claude.com/docs/en/memory)).
- HumanLayer: "under 300 lines is best, and shorter is even better"; their own root file is
  under 60 lines ([source](https://www.humanlayer.dev/blog/writing-a-good-claude-md)).
- Rationale: models follow a limited instruction budget with reasonable consistency, and the
  CLI's own system prompt already spends a share of it. Generic filler buries the rules that
  matter. The "roughly 150 to 200 instructions total" figure circulating in the community is
  UNVERIFIED; the mechanism is documented, the number is not.

## The Loading-Mechanism Table

This table is the core decision input. The right-hand column is the only question that
matters when choosing where content goes.

| Mechanism | When it loads | Cuts what is loaded? |
|---|---|---|
| Root and ancestor CLAUDE.md | Every session, in full | No, always loaded |
| `@path` imports | At launch, in full (max 4 hops) | **No, organisation only** |
| Subdirectory CLAUDE.md | When the agent reads a file in that directory | **Yes** |
| A rules file carrying `paths:` frontmatter | When files matching those globs are touched | **Yes** |
| A rules file with no `paths:` | Every session | No |
| Skills | Metadata always, body only on trigger | **Yes** |
| `docs/` plus an index | Only when routed to | **Yes, fully on demand** |

Rules files live in the CLI's own configuration directory, which differs per CLI. Read the
CLI's documentation for the exact location rather than assuming one.

Key trap: **`@imports` do not cut what loads.** Anthropic, verbatim: "Splitting into @path
imports helps organization but doesn't reduce context, since imported files load at launch."
To actually reduce what loads, content must move to a subdirectory CLAUDE.md, a path-scoped
rule, a skill, or an indexed doc.

Hierarchy note: managed policy, then the user-level memory file, then the project file, then
the local override are **concatenated**, not overridden. After a compaction the root
CLAUDE.md is re-injected but nested files are not; they reload on the next read in that
directory.

Freshness note: CLAUDE.md is read once at session start and held from there, so a mid-session
edit does not apply. It takes effect on the next clear, compact or restart.

Skills, commands and file reads arrive as conversation messages appended after the entry file
rather than as edits to it, so routing into them does not rewrite the earlier part of the prompt.
That is a statement about prompt structure, not a guarantee about any given session's cache. Decide
placement on attention: it holds whether or not the cache cooperates.

## What Belongs in CLAUDE.md

Anthropic's test: keep "facts Claude should hold in *every* session, build commands,
conventions, 'always do X' rules." And explicitly: "If an entry is a multi-step procedure or
only matters for one part of the codebase, move it to a skill or a path-scoped rule instead."

| Content | Home |
|---|---|
| Always-do rules, pitfalls, conventions that differ from the defaults | CLAUDE.md |
| The build, test and run commands used every session | CLAUDE.md, stated once, canonically |
| Multi-step procedures (workflows, pipelines) | A skill |
| Facts relevant to one subsystem or module | A subdirectory CLAUDE.md, or a path-scoped rule |
| Reference knowledge (architecture, runbooks, ADRs) | `docs/` plus an index line |
| Anything derivable from the codebase (directory layout, dependency lists) | Nowhere; propose it for deletion and delete only after the owner confirms |
| Rules that MUST run (format, lint, checks) | A hook or a CI check, not prose |

CLAUDE.md is "context, not enforced configuration". A rule that must never be skipped is a
hook or a CI job; writing it in prose makes it advisory.

Write verifiable specifics: name the command and where it is defined, never "test your
changes". Prefer pointers over copies: `file:line` references, never a pasted code snippet,
which goes stale silently.

## Anti-Patterns

- **Generic filler** ("write clean code", "be careful"): spends instruction budget and
  buries real rules.
- **LLM-as-linter**: "Never send an LLM to do a linter's job" (HumanLayer). Mechanical rules
  belong in hooks and linters.
- **Contradictory or stale rules**: "If two rules contradict each other, Claude may pick one
  arbitrarily." Review periodically and delete dead rules.
- **`@imports` as compaction**: they load at launch. Restructure into on-demand mechanisms.
- **Restating what the codebase reveals**: directory trees, stack lists, architecture
  overviews the agent derives by reading.
- **Duplicating docs content**: CLAUDE.md carries a routed pointer, never the content.

## Degradation Evidence

- Anthropic (official, mechanism): adherence drops as the file grows. No published numeric
  curve.
- HumanLayer field data: keep context utilisation between 40% and 60%; beyond roughly 40%
  they observe a zone where signal-to-noise degrades agent output
  ([ACE-FCA](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md)). <!-- portable-ok --><!-- external citation, not a repository this skill installs into -->
  Anecdotal, not controlled.
- Every non-load-bearing line spends context and dilutes the rules that matter, in every
  session. Caching discounts the tokens. Nothing discounts the dilution.

## Fast Wins on an Oversized CLAUDE.md

1. Run `/doctor` in Claude Code. It proposes an auto-trim: it cuts derivable content and
   keeps pitfalls, rationale and conventions.
2. Move per-subsystem blocks to a subdirectory CLAUDE.md or a path-scoped rule.
3. Convert every multi-step procedure into a skill and leave only the trigger hint.
4. Replace descriptive tables with `file:line` pointers.
5. Deduplicate against `docs/`: keep one canonical home and link from CLAUDE.md.
