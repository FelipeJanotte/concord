# Semantic Docs

Decide where repository instructions, rules and references belong, with one canonical home and routing indexes. Use for oversized guides, missing indexes or duplicated guidance. Instruction wording belongs to prompt-engineering; human-facing prose to human-writing.

Category: competency. Owns placement and navigation of repository guidance.

Structure a repository's documentation so an agent loads the smallest set of high-signal content
per task, and so the guidance still means one thing when a colleague opens the repository with a
different tool.

## What is actually shared between tools

Agentic coding tools each read an instruction file, and they agree on very little beyond that.
Discovery, combination order, imports and size limits all differ, and several tools state that they
define no precedence at all. `reference/what-each-tool-reads.md` has the current matrix with
sources.

Three things hold widely enough to design against:

1. **Something is loaded automatically, and its size costs you.** Every tool but one picks up an
   entry file without being asked, and long files are followed less reliably than short ones. What
   the file is called differs.
2. **More specific guidance usually exists, and is usually discovered later.** Subdirectory files,
   path-scoped rules, per-topic files. When and whether they load varies.
3. **Contradiction is not resolved for you.** This is the important one, below.

The constraint being managed is the model's **attention, not the bill**. Trim the entry file
because long files are followed worse. Do not argue a trim on token cost: whether a session pays
full price for those tokens depends on caching behaviour you cannot see, and the adherence
argument holds either way.

## One fact, one home, because nothing promises which copy wins

Several tools state plainly that they define no precedence between the files they load. One that
does document load order still says that if two rules contradict each other it may pick one
arbitrarily.

So duplication is not untidy, it is **undefined behaviour**. The same repository can give two
answers on two machines, and neither developer is doing anything wrong. Every rule below that looks
like organisation hygiene is really about this.

When the same fact must appear twice, make one copy the statement and the other a pointer to it.

## Where the entry file is re-read

Guidance that is stale in a running session is a common source of confusion, and the answer is
tool-specific. For the one tool that documents it: the project-root file survives compaction and is
re-read from disk, nested files and path-scoped rules reload when the agent next reads a file they
apply to, and an instruction given only in conversation does not survive at all.
<https://code.claude.com/docs/en/memory>

Do not assume another tool re-reads anything mid-session. Keep volatile state out of the entry file
regardless: it is guidance, not a place to record what is happening right now.

## The Placement Decision

Run this table on every fact, rule or document.

| The content is... | Put it in | Why |
|---|---|---|
| Needed every session (always-do rule, pitfall, convention that differs from the default) | the entry file | Worth the per-session cost |
| A multi-step procedure or workflow | A skill | Body loads only on trigger |
| Relevant to one subsystem or path | A subdirectory instruction file, or a path-scoped rule where the tool has them | Loads only when those files are touched, on tools that do this at all |
| Reference knowledge (architecture, runbook, ADR, how-to) | `docs/{category}/{topic}.md` plus an index line | Fully on demand |
| A dump the agent can regenerate by looking (a directory tree, a dependency list) | Propose for deletion; delete only after the owner confirms | It goes stale, and the code is the truth |
| A layout fact someone must FOLLOW ("API handlers live in `src/api/handlers/`") | The entry file | It is a convention, not a description, and reading the tree does not reveal it |
| A rule that must ALWAYS run (lint, format, gate) | A hook or CI check | An instruction file is context, not enforcement |

Two cautions on that table.

**Derivable is not the test; cheap and unambiguous to derive is.** A tree listing goes stale and
the agent can look. A sentence saying where a kind of file belongs is a rule someone follows, and
no amount of reading reveals it. Cut the first, keep the second.

**Imports organise, they do not reduce.** Where a tool has an import mechanism it loads the
imported file in full, at launch, so moving content behind one changes nothing about what loads.
Several tools have no import mechanism at all, and one has an instructions array that does not
currently load anything. Move content to something loaded on demand instead, and check
`reference/what-each-tool-reads.md` for whether your tool has one.

## Workflow: Restructure a Repository's Docs

1. **Measure**: `wc -l CLAUDE.md AGENTS.md 2>/dev/null`. One tool publishes a target of
   under 200 lines and skips a file above 4 MiB; the others publish no number, so treat 200 as a
   trigger to restructure rather than a rule.
   `find docs -name '*.md' | wc -l`; check whether `docs/README.md` exists and routes.
2. **Classify** every section of the entry file with the placement table. Mark each: keep /
   move-to-skill / move-to-rule / move-to-docs / delete.
3. **Relocate** content to its home, after the owner confirms the move and delete list (the STOP
   rule below). One concern per file, kebab-case `{category}-{topic}.md` names, at most two
   folder levels.
4. **Index**: create or update `docs/README.md`, one line per doc:
   `- [Title](path.md) - when-to-use hook`. The index links, it never restates.
5. **Point**: in the entry file, replace moved content with a routed pointer only where the route
   is needed often. Otherwise rely on the index.
6. **Deduplicate**: one canonical home per fact. Where a fact appears twice, keep the best
   copy and link from the other place.
7. **Re-point every reference**: for each path you moved or deleted, find what still points at
   the old path and fix or report every hit. The entry file, code comments, other docs and skill
   bodies all carry these links.

   ```bash
   git grep -n -F -- 'docs/old/path.md' -- . ':!*.lock' || echo 'no remaining references'
   ```

   Run it once per moved or deleted path, before you report the restructure. **A restructure that
   leaves a reference pointing at a path that no longer exists is a failed run**, whatever the
   index looks like.
8. **Verify**: re-run step 1, then apply the routing test to every index line: could an
   agent pick the right file from that line alone, without opening any file? A line that
   fails the test is rewritten, not shipped.

**STOP before deleting or moving any file.** List every deletion and every move with its path
and one line of justification, send that list to the repository's owner, and wait for a reply.
Deleting or moving without a confirmation reply is a failed run. This covers everything, including
content the placement table sends nowhere: absence of a recent commit is not evidence that a rule
is dead, and only the owner knows whether a rule that names a system, a customer or a credential
is still live.

## Writing Rules

This skill requires `prompt-engineering` when writing or rewriting agent instructions or
frontmatter descriptions. Read its instruction-writing guidance (`../prompt-engineering/reference/writing-instructions.md`)
for wording; this skill owns placement, routing indexes and canonical locations. Human-facing
prose uses `human-writing` when needed. Keep each rule at its owner's source.

## Never Restate a Repository's Toolchain

Every repository wraps its build, test and deploy differently, and some use a base branch
that is not `main`. A doc this skill writes points at the repository's own instruction file or
AGENTS.md for those commands instead of copying them. Derive what varies:

```bash
gh repo view --json nameWithOwner,defaultBranchRef \
  --jq '.nameWithOwner + " base=" + .defaultBranchRef.name'
```

If the repository states no command for something a doc needs, write the pointer and say the
command is undefined. Do not invent one.

## Reference Files

| Need | Read |
|---|---|
| Which file each tool reads, whether it nests, whether it has imports, and who defines precedence | `reference/what-each-tool-reads.md` |
| CLAUDE.md size limits, loading mechanics, what belongs where, fast wins on an oversized file | `reference/agent-guide-architecture.md` |
| docs/ taxonomy, index files, naming, one-concern-per-file, anti-patterns | `reference/docs-folder-organization.md` |
| Writing instructions and descriptions any model follows; model quirks are in `prompt-engineering`'s `reference/models/` | `../prompt-engineering/reference/writing-instructions.md` |

## Anti-Patterns

Each reference file carries the anti-pattern list for what it covers. Read the matching one
before calling a restructure done: `reference/agent-guide-architecture.md` when the file under
review is an entry file, `reference/docs-folder-organization.md` when it is a `docs/` tree or an
index.

## Rules that hold every run

- **The 200-line ceiling is published for one CLI only.** Others have similar but undocumented
  budgets, so the structure transfers and the exact number may not. Treat it as a trigger to
  restructure, not as a target to hit.
