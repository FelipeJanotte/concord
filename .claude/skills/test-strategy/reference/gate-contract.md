# The gate the reviewer runs

Applies only to the selected independent-test protocol. Mutation remains conditional under
`reference/proportionality.md`; not selected is not a failed or missing gate.

The checks below, in the order the gate reports them. Any one fails the ticket and goes back as a
finding, never fixed by editing a test. `reference/reviewer-gate.md` says how each is run, and which go back to the strategist
rather than the implementer.

Every check down to the held-out failure is mechanical and runs as one script, this skill's
`scripts/gate.sh`, so they cannot be skipped or misreported:

```bash
bash scripts/gate.sh <visible-tests sha> <ticket head sha> <artifact path> <held-out dir> <one-file test command>
```

Its stdout is pasted into the review as evidence. Exit 1 is a finding, named by the line it
prints. Exit 2 means the gate could not run (stderr says why) and is reported as that, never
as a pass.

- **artifact leaks the held-out set** (`artifact-mentions-held-out: <line>`): the visible
  artifact carries the held-out directory, in any of the three ways it is written, or copies the
  kept-back table's own shape, a header with both a `covers` and an `angle` column. It reports
  before every other check, on an artifact with no visible table included. Prose that names the
  held-out set without either is caught by nothing and stays the strategist's to avoid.
- **the re-derivation of a worked expected value** (`rederive-column-missing: <artifact>`,
  `rederive-row-width: <test> | cells: <n> | header: <n>`, `rederive-cell-empty: <test> |
  <column>`, `rederive-cell-malformed: <test> | <cell>`, `rederive-source-malformed: <test> |
  <cell>`, `rederive-not-marked: <test>`, `rederive-missing-fresh: <test>`,
  `rederive-mismatch: <test> | artifact: <v> | fresh: <v>`): the visible table carries no
  `rederive` column; a row is not the width its header declares, which is what an unescaped `|`
  in a value does; a required cell is empty; a cell is neither `no` nor `yes: <value>`; an
  `expected from` cell opens with neither `quoted ` nor `worked `; a `worked ` value is marked
  `no`; or a `yes` row has no line, or a line whose value differs, in the `rederive.md` the
  reviewer recorded. A wrong expected value the implementer coded to is the
  hole this closes, and the reviewer is the only fresh context in the loop, so the re-derivation
  runs there and not in the strategist's prompt. What it cannot prove is that the recorded value
  was derived rather than copied; `reference/reviewer-gate.md` names that residual. Every one of
  these goes back to the strategist.
- **strategist file in diff** (`strategist-file-in-diff: <path>`): a file the strategist
  authored appears in the implementer's commits. A needed change is a `deviated` line in the
  implementer's report; the strategist re-issues the test.
- **red line mismatch** (`red-line-mismatch: <test> | artifact: <line> | observed: <line>`): a
  visible test's recorded red line differs from the first line the one-file command prints
  for it on the pre-implementation commit.
- **held-out failure** (`held-out-failed: <test>`): a held-out test fails while the visible set
  is green. Report the held-out test and the visible test that covers the same requirement, as
  one finding. Naming it sends it to the implementer in the fix round, so that test is spent
  for the ticket and is not reused on another; the strategist writes a fresh one.
- **self-comparison**: the implementer's `self-compare` line is not `none`, or TH16 is present.
- **mutation survivor**: mutation on the lines the diff touched leaves a survivor the reviewer
  cannot argue equivalent (`reference/mutation.md`).
- **theatre pattern**: a pattern from `reference/theatre-catalogue.md` is present, named by code
  with file:line.

Each finding is one row, `| file:line | claim | why it is wrong | severity | how to check it |`.
A gate that finds nothing is one sentence saying so, with the pre-implementation sha, the
held-out count run, and the mutants tried or mutation not selected with its reason.
