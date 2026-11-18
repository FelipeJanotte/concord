# Test Strategy

Use to plan or write tests from a spec or explicit behavior contract, author a regression test from an established reproduction, or review whether tests prove their claims. Routes to strategy, authorship, methodology and test doubles as needed. Selects proportional evidence before authorship; independent tests are conditional. Does not implement production code, diagnose failures or invent missing behavior.

Inputs: the requested role, a spec or explicit behavior contract, and the repository's
verification conventions and evidence. For planning/authorship start with
`reference/proportionality.md`; require test commands and seams only for a selected test route.
For review, assess the requested tests and evidence through the reviewer route.
Infer the role from the request; stop and name any
missing behavior or execution input rather than inventing it. The ticket strategist has the
additional inputs and seam-confirmation procedure in `reference/strategist.md`.

## Boundaries

| Situation | Owner or action |
|---|---|
| Neither a spec nor an explicit expected behavior | Stop and name the missing contract; `spec-driven` owns planned requirements. |
| An unexplained failure or uncertain bug cause | [`wise-dev`](../wise-dev/README.md) investigates; return here to author tests once behavior and reproduction are established. |
| Production implementation or general coding design | [`code-quality`](../code-quality/README.md) guides decisions; this skill writes no production code. |
| Planned ticket execution | `task-executor` consumes the evidence decision before implementation and dispatches the selected roles, including tickets delegated by `epic-run`. |
| Standalone test request with an explicit contract or established bug reproduction and expected behavior | Author tests through the standalone route; no epic is required. |

## Roles and selective reading

For planning or authorship, return the evidence decision first; `no-new-tests` ends authorship.
Review requests still complete the selected review procedure, using the recorded evidence decision
where available. Load only the selected role's references. Authorship loads the methodology or doubles reference
at the decision that needs it; do not preload every reference.

| Role | May see | Must not see | Writes and reads |
|---|---|---|---|
| Ticket strategist, fresh context | spec, cited `R<n>`/`C<n>`, public interface, test conventions and one style sample | implementation or implementer's branch | visible and held-out tests and artifacts; `reference/strategist.md`, then its step-specific references |
| Focused test author (standalone or ticket) | explicit behavior contract or established reproduction with expected behavior, public interface and test conventions | implementation internals used to derive expected answers | tests and authorship report; `reference/authoring.md` |
| Implementer | contract and selected evidence; focused test paths/revision/report or independent visible artifact | held-out directory, path, artifact, tests or reviewer gate | production code only; receives the caller's route-specific handoff, no references here |
| Test-honesty reviewer, fresh context | diff, contract, tests; both artifacts only for `independent-tests` | implementer's conversation | findings; `reference/reviewer-gate.md` for `independent-tests`; `reference/authoring.md` review otherwise, including declared existing evidence |

## Procedure

1. Identify the role and confirm its inputs from the caller's contract block or repository
   instructions. Report `TODO` values rather than guessing commands, paths or interfaces.
2. For planning/authorship apply `reference/proportionality.md`; review requests proceed to
   their review route without an authorship stop. Use authorship for focused tests, even with a spec;
   use the strategist protocol only when independent tests are selected. A blocked decision
   returns the exact gap without writes. Honor the selected protocol's isolation and gates.
3. Follow the selected procedure. Consult `reference/methodology.md` when choosing test form
   and `reference/test-doubles.md` when replacing a dependency or reviewing that choice.
4. Return the selected report. Missing inputs produce a stop naming those inputs and no writes.

## Reports

- Evidence selection: the fixed decision block in `reference/proportionality.md`;
  `no-new-tests` is valid and names supporting evidence, while missing evidence is blocked.
- Ticket strategist: the fixed `seams`, `artifact`, `commit`, `visible`, `held-out`, `untested`
  block in `reference/strategist.md`. Preserve its schema and physical split.
- Standalone author: the fixed authorship block in `reference/authoring.md`.
- Reviewer: findings table and execution evidence defined by the selected review procedure.
