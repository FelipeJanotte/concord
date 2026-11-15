# Running the gate

Use this gate only for the independent-test route selected under `reference/proportionality.md`.
Other routes use the authorship review or review the declared existing evidence.

Read `reference/gate-contract.md` for the checks, output labels and report shape.
Read `reference/test-doubles.md` when the diff substitutes a dependency. This is how each is run so
that no check depends on the implementer's goodwill.

| Check | How |
|---|---|
| artifact leaks the held-out set | Same run, and it reports before every other check, including on an artifact with no visible table. An `artifact-mentions-held-out:` line names the offending line verbatim. It fires on two things only: a line carrying the held-out directory in any of three written forms, as the gate was handed it, absolute, and as the path from the repository root, which starts with `..` when the directory sits outside the tree, and the kept-back table's own shape, a header with both a `covers` and an `angle` column, spelled in lower case and matched exactly, plus the rows under it. A sentence that names the held-out set in prose is caught by nothing, so the reviewer still reads the artifact for one. |
| re-derivation of a worked expected value | Before the gate runs, read the visible table's `rederive` column. For every row marked `yes: <value>`, recompute that value from the spec text alone, no production code, no test helpers, and no look at the cell you are checking. Write one line per such row into `<scratch dir>/<ticket>/held-out/rederive.md`, `<test> | <value> | <derivation>`, and no verdict word: the gate compares the two values byte for byte and computes match or mismatch itself, so there is no verdict of yours for it to believe. Then run the gate. `rederive-column-missing:`, `rederive-row-width:`, `rederive-cell-empty:`, `rederive-cell-malformed:`, `rederive-source-malformed:`, `rederive-not-marked:`, `rederive-missing-fresh:` and `rederive-mismatch: <test> \| artifact: <v> \| fresh: <v>` are the findings. A value carrying a literal pipe is written `\|` on both sides and compared whole. The file's `.md` suffix is load-bearing: the gate copies and runs every non-markdown file in that directory, so a `rederive.txt` is run as a held-out test and counted in `held-out=<n>`. |
| strategist file in diff | Run this skill's `scripts/gate.sh <visible-tests sha> <ticket head sha> <artifact path> <scratch dir>/<ticket>/held-out <one-file command>` from the review worktree with the ticket head checked out. A `strategist-file-in-diff:` line is the finding; the implementer's `deviated` line says whether it was declared. |
| red line mismatch | Same run. The script compares the artifact's cell with the first line the one-file command prints for the test on the visible-tests commit, so the wrapper must print the assertion there. A `red-line-mismatch:` line is the finding. An `import:` red is expected to become an assertion red on the ticket head; the script does not check that, so run the test once at head yourself. |
| held-out failure | Same run. A `held-out-failed:` line is the finding; the script removes its copy of the held-out files on every exit path. Never from the session that implemented. If the contract's scratch-directory line is `TODO`, stop and report it. |
| self-comparison | Read the implementer's `self-compare` line; then grep the tests for imports of the modules under test and check each imported name against what it is compared to. |
| mutation survivor | `reference/mutation.md`, only when selected under `reference/proportionality.md`; otherwise record not selected. Runs after the selected tests are green. |
| theatre pattern | Walk `reference/theatre-catalogue.md` against the diff, tests included. Name the code and the file:line. |

The script's stdout is pasted into the review as evidence. Exit 1 is a finding, named by the
line it prints. Exit 2 means the gate could not run (wrong tree, missing artifact, a wrapper
that is not runnable; stderr says which) and is reported as that, never as a pass. Only
`gate: ok | visible=<n> | held-out=<n> | sha=<sha>` counts as the mechanical checks passing.

## What the re-derivation check proves, and what it does not

It does not prove the value was re-derived. `task-executor` dispatches you into a fresh detached
worktree and a context that never saw the implementer's conversation, so the fresh context
exists. The gate checks that the work product of that context is present and that it matches.
Nothing binds the one to the other: no file, hash or timestamp separates a value you derived
from one you copied out of the artifact, so a reviewer who copies defeats the check completely.

What it does buy is worth having. The step cannot be skipped in silence, because a `yes` row
with no recorded line is a finding. The match verdict is computed rather than asserted by the
agent being checked. And the derivation is durable, so a later reader can re-check the
arithmetic against the spec at any time.

## Two findings that go back to the strategist, not the implementer

Most findings in this gate are against the diff, and the fix round sends them to the
implementer. These two are not, and a reviewer meeting either for the first time will otherwise
send it to the wrong person.

- Any `rederive-` line is against the strategist's artifact: a missing column, a malformed cell,
  a citation with no token, an unmarked worked value, a value the re-derivation did not
  reproduce. The remediation is the strategist re-issuing the artifact, and where the value is
  the thing that was wrong, the visible test that carries it too. How such a re-issue lands, and
  why it moves the visible sha where an amendment must not, is the last paragraph below.
- `strategist-file-in-diff:` on the artifact alone, where the implementer's `deviated` line
  declares the amending sha, is the case the section below describes.

## When the strategist amends the visible artifact mid-ticket

It happens: the rule the artifact states and the cases it lists drift apart, and leaving them
disagreeing is worse than the amendment. The gate then reports
`strategist-file-in-diff: <artifact>`, and it is right to: a strategist file is in the diff and
nothing in the diff says whose commit put it there.

The way out is a declaration, not a different invocation. The implementer names the amending sha
on its `deviated` line, and the reviewer opens that commit and confirms it changes prose only and
touches no test. If it touches a test, it is a finding and the ticket goes back.

Moving the visible sha forward to the amending commit is not the way out. Every red line the
artifact records was observed on the visible-tests commit, and at any later commit the
implementer's work has already turned those tests green. The gate then reports a red-line
mismatch for every row, which reads as the implementer having weakened the tests, and check 2,
whose whole point is that a red line only means anything at the commit it was recorded on, has
been destroyed to silence check 1.

The diff check is the guard that holds on every host. A host-level write deny on the
strategist's files, where the host has one, is configured by the task executor
(or the coordinator dispatching the implementer); it is a convenience on top of the diff, never a replacement for it.

A `rederive-mismatch` is the other kind of re-issue, and one question separates the two: did the
re-issue change a test? A mismatch means one of the two values is wrong, and which one is decided
by reading, not by preferring either: the strategist's arithmetic is written out in the `worked `
cell the citation rule requires, so put it beside your own derivation and find the step where
they diverge. If the reviewer's derivation is the wrong one, they redo it and nothing else moves. If the strategist's is, the
visible test asserts a wrong expected value, so the test changes and its recorded red line
changes with it. That is not the amendment above, which is prose only: there the red line still
holds at the original visible commit and the sha must not move, while here the strategist commits
the corrected test and the corrected artifact together, with the new expected value, the newly
recorded red line and the corrected cell, that commit supersedes the visible-tests commit, and
the gate is run with the new visible sha, because that is where the red line was re-recorded.
Moving the sha is correct here for exactly the reason it is wrong there. A rederive re-issue also
reopens the ticket for the implementer, whose code was built to match the wrong value, so the fix
round follows the re-issue rather than replacing it.
