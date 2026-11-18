# Code Quality

Use for authorized implementation, including an already authorized refactor, without a more-specific domain owner, or when explicitly requested as a quality companion or diff reviewer. Guide boundaries, contracts and language idioms; report concrete defects. Does not plan, diagnose, author tests or turn review into edits; use spec-driven, wise-dev and test-strategy.

Inputs: an authorized implementation task with target paths, an authorized refactor with scope
and a goal as `reference/refactoring.md` defines one, or a diff/named paths to review. Stop and
name the missing input when none is available. A review request authorizes a report,
not edits. Required siblings: [`wise-dev`](../wise-dev/README.md) and [`test-strategy`](../test-strategy/README.md) for their handoffs below.

## Roles and selective loading

Read only the row for the current role, then the language files for code actually involved.
Do not preload the other mode, all languages or metrics.

| Role | Reads | Produces |
|---|---|---|
| Implementer of an authorized task; when no test covers the scope, the legacy section of `reference/refactoring.md` runs first as a prelude, then this role resumes | `reference/implementation.md` | scoped change and implementation report |
| Implementer of an authorized refactor: the request says refactor, clean up, or names a smell; or the refactor step of RED/GREEN | `reference/refactoring.md` and `reference/smells.md` for the assessment, then `reference/implementation.md` for each step | one named refactoring per step and the refactor report |
| Reviewer or fix verifier | `reference/review.md`, `reference/smells.md`; the smell-to-refactoring map in `reference/refactoring.md` only to name a replacement | findings with file:line and replacement; no edits unless requested |
| Either role, when interpreting requested or existing complexity/coverage measurements | `reference/metrics.md` in addition to its role | per-function evidence and measurement status |

Language routing: Python → `reference/python.md`; Go → `reference/go.md`;
PHP → `reference/php.md`; TypeScript → `reference/typescript.md`;
JavaScript → `reference/javascript.md`; C# → `reference/csharp.md`.
For another language, derive conventions from the repository and its versioned official docs.

## Boundaries

| Not this skill | Owner |
|---|---|
| planning a feature, refactor or migration | `spec-driven` |
| Task acceptance and execution coordination | `task-executor`; `epic-run` owns epic scope and ordering |
| test strategy, writing tests, doubles and honesty audit | [`test-strategy`](../test-strategy/README.md) |
| finding the cause of a failure, including repeated unsuccessful fixes | [`wise-dev`](../wise-dev/README.md) |
| deciding where repository guidance belongs | [`semantic-docs`](../semantic-docs/README.md) |
| preserving lessons after the work | `compound` |

## Procedure

1. Establish the authorized scope and role from the request. A request to refactor or clean up
   is the refactor role even when it also says implement. For implementation with a more-specific
   domain owner, route to that owner; use this guidance alongside it only when explicitly requested.
   A quality review may assess that code but must retain the applicable package or dialect rules.
   In an existing workflow, keep its
   assigned implementer and reviewer; this skill does not start a competing implementation.
2. Read the caller's agent guide, relevant manifests, compiler/runtime settings and nearby code.
   Derive tool versions, conventions and verification commands there. Do not introduce a language
   feature merely because the latest documentation offers it.
3. Load the role reference and affected language references from the table. Follow that procedure;
   load metrics only on its stated trigger. When a failure needs investigation, hand it to
   [`wise-dev`](../wise-dev/README.md); when tests need authoring or audit, hand that portion to [`test-strategy`](../test-strategy/README.md).
4. Return the role's report below. Unless the caller supplies another format, retain its field
   labels so the receiving workflow can identify decisions and verification separately. State
   unavailable evidence rather than inventing a result.

## Report

Implementation:

```
change: <paths and resulting behaviour>
decisions: <boundary or representation changed and concrete reason; none when unnecessary>
removed: <obsolete code, tests and doc lines deleted, each with its reason | none, searched: <names and scope>>
verification: <checks run and results; unavailable evidence and why>
```

Refactor: the shape in `reference/refactoring.md`.
Review: use the table, search evidence and `outside` line in `reference/review.md`.
Metrics, when loaded: append the record defined in `reference/metrics.md`.
