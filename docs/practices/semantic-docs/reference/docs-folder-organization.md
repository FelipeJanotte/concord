# Organizing `docs/` for Agent Retrieval

How to structure a documentation folder so an agent finds the right file by reading an index, and loads ONE file that fully answers the question.

> **This repository's instantiation lives in `docs/AGENTS.md`** and wins over the names used below:
> the index is `docs/AGENTS.md` (not `docs/README.md`, which must not be created), decisions are in
> `decisions/` (not `adr/`), and per-area reference is in `areas/`. Everything else here applies as written.

## The Three-Tier Model (copy from Agent Skills)

Anthropic's Agent Skills architecture is the canonical shape ([source](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)):

| Tier | What loads | Repo equivalent |
|------|-----------|-----------------|
| 1. Metadata | name + one-line description only | `docs/README.md` index (one line per doc) |
| 2. Core content | the single relevant file | one leaf doc, self-contained |
| 3. Deep references | linked files, only if needed | sub-references linked from the leaf doc |

Consequence: total documentation size is effectively unbounded - the agent never reads all of it. What matters is the routing quality of tier 1.

## Rules

The tier model above is sourced. The rules below are **our conventions**, chosen because they make
that model work in a repository: the vendor pages establish that routing metadata should be small
and that names carry meaning, not that an index file is required, that a folder should be at most
two levels deep, or that a doc must answer its question without a second read. Treat them as a
house standard that a team can change deliberately, not as findings.

### 1. Every docs/ folder has an index
`docs/README.md` = table of contents. One line per doc: `- [Title](path.md) - when-to-use hook`. The index LINKS, it never RESTATES content. An agent must be able to pick the right file from the index alone.

### 2. One concern per file, self-contained
A leaf doc answers one question completely - no chasing cross-references to assemble an answer. If a doc covers two concerns, split it. If two docs must always be read together, merge them.

### 3. Write descriptions as trigger conditions, not topic labels
The description is the ONLY thing the agent sees when routing. Say *when to use it*, with words a task request would contain.

- Bad: `postgres.md - Postgres documentation`
- Good: `postgres.md - Grants, connection budget, and schema layout. Read before any DDL or permission change on Redshift.`

### 4. Filenames and paths are routing signal
Anthropic: "A file named `test_utils.py` in a `tests` folder implies a different purpose than the same name in `src/core_logic/`" ([context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). So:
- kebab-case, specific: `aws-lambda-deployment.md`, not `lambda.md` or `notes.md`
- folder = category, filename = topic; together they disambiguate without opening the file
- max depth ~2 levels under `docs/` - deeper nesting hides files from discovery

Filenames route harder than indexes for grep-first agents. In one internal run on 2026-08-13, in
another repository, Opus, Sonnet and Haiku all navigated a 20-file skill by tree names plus grep and
never opened the router. That is one internal observation on one skill, not a published result, so
take the direction and not the certainty: name files so the tree alone answers "where would X be?",
and keep the index anyway for the agent that does read it.

### 5. One canonical home per fact
Duplicated truth rots: copies drift, and the agent may load the stale one. Index files and CLAUDE.md link to the canonical doc; they never paste its content. When you find duplication, keep the best copy, delete the rest, fix the links.

One deliberate exception: a small hot-facts ledger (versions, statuses, pins) that duplicates high-value facts and points at their canonical files. In the same 2026-08-13 measurement it was the fastest retrieval path for every model tier. Keep it short and keep the pointer on every line, so a stale entry is one hop from the truth.

### 6. Separate WHAT from HOW
- `docs/` (or `docs/project/`) - durable truth: architecture, contracts, runbooks, ADRs
- process artifacts (plans, meeting notes, task state) live elsewhere (`tasks/`, `meetings/`) - they are transitory and should not pollute the durable index

## Suggested Taxonomy

Adapt, do not cargo-cult. A shape that has held up in data and infrastructure repositories:

```
docs/
├── README.md          # index - one routed line per doc
├── adr/               # decisions: why things are the way they are
├── ai/                # agent-facing guides (testing methodology, terminology)
├── infrastructure/    # per-service runbooks (nginx-proxy.md, postgres.md)
├── libs/              # per-technology guides (sqlmesh/, bigtime/)
└── solutions/         # {category}-{problem}.md - solved recurring problems
```

## Anti-Patterns

| Anti-pattern | Why it fails | Fix |
|---|---|---|
| Monolithic doc (500+ lines, many concerns) | Loads whole file for one answer; instructions get ignored | Split by concern; add index |
| Vague filename (`misc.md`, `notes.md`, `v2.md`) | Forces opening the file to learn what it is | Rename to `{category}-{topic}` |
| Index that restates content | Duplicated truth + bloated tier 1 | Index links only |
| Deep nesting (3+ levels) | Path stops being signal; discovery misses files | Flatten to category/topic |
| Same fact in CLAUDE.md, README, and a doc | Copies drift; agent loads stale one | One canonical home; others link |
| Stale docs kept "for reference" | Agent can't tell live from dead | Delete or move to an `archive/` excluded from index |

## Why This Matters: Context Rot

Long context degrades retrieval - "a performance gradient rather than a hard cliff": attention spreads across n² pairwise token relationships, and models are trained mostly on shorter sequences ([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). Every irrelevant doc pre-loaded doesn't just cost tokens - it actively degrades the agent's precision on the relevant ones. The goal is the *smallest set of high-signal tokens*, retrieved just-in-time.
