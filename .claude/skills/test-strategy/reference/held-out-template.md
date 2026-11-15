# Held-out artifact

One per ticket, at `<scratch dir>/<ticket>/held-out/strategy.md`, next to the held-out tests.
Written by the strategist, read by the reviewer. The implementer is given the visible artifact
path and never this one. The gate's diff check compares two commits, so it covers the visible
tests and the visible artifact and cannot see this file, which lives outside the branch.
The repository's contract block states that the scratch directory sits outside the test runner's
paths without saying what else it holds, and the gate refuses a visible artifact that names the
directory or copies the table below. What is left is the strategist's own discipline over the
prose of the visible artifact, and "What the gate checks, and what it does not" below says
exactly how much that is.

```markdown
# Held-out tests: <ticket id> <goal>

Visible artifact: <spec path without .md>-tests.md @ <sha of the visible-tests commit>

| # | test | covers | angle |
|---|---|---|---|
| H1 | tests/test_coupon_held.py::test_percent_then_fixed_compose | R1+R2 | composition the visible set never exercises |
| H2 | tests/test_coupon_held.py::test_percent_random_orders_never_exceed_total | R1 | structured random on the success path: valid orders, line count drawn from [1,4], amounts drawn in the accepted range, the invariant checked on every draw. seed 20260909; `SEED=<n>` replays another draw. Smallest failing input recorded here when one is found |
```

Rules

- `covers` names the requirements the row reaches from an angle no visible row took: a
  composition, a boundary value the visible set skipped, a property over random inputs. A row
  that repeats a visible row's angle proves nothing the visible set did not.
- `test` is `<path>::<case>`, with the path relative to the repository root. The gate runs
  whole files and prints one `held-out-failed: <path>` per file, never a case, so the `::<case>`
  part is for the reviewer's reading, and a failure in a shared file names every row of it.
- A requirement whose input domain is larger than the examples the spec enumerates gets a row
  with structured random inputs that reach the success path, and its `angle` records the seed so
  the reviewer replays the same draw. Random bytes are not that row: they stop at the input
  rejection path and pin nothing about the behaviour the requirement describes.

## Layout of the held-out directory

The gate copies every regular file under `<scratch dir>/<ticket>/held-out/` whose name does not
end in `.md`, in either letter case, into the tree at its path relative to that directory, runs
it with the one-file test command, and removes the copy when it exits, is interrupted or is
terminated. A SIGKILL leaves the copies behind, because no trap catches it. So the layout
mirrors the repository: `held-out/tests/test_x.py` lands at `tests/test_x.py`, where the
runner's own discovery and configuration find it. A symlink in the directory is refused, and the
gate exits 2 naming it, so put the file itself there. A symlink whose name ends in `.md` is the
one exception: the markdown filter runs first, so it is skipped in silence like any markdown.
A held-out directory with no runnable file, `strategy.md` alone included, reports
`held-out=0` and is not an error.

One file in the directory is the reviewer's, not the strategist's: `rederive.md`, one line per
row whose `rederive` cell reads `yes: <value>`. It sits here because the reviewer already holds
this path and hands it to the gate, which therefore needs no sixth argument to find the file. Its suffix is what keeps it out of
`held-out=<n>`, so it is never renamed: the markdown filter above is the only thing standing
between that file and being copied into the tree and run as a test.

## What the gate checks, and what it does not

One rule became mechanical, the leak, and only in two of its forms. Before the gate parses the
visible artifact's table it prints `artifact-mentions-held-out: <the line>` for every line that
carries the held-out directory in any of three written forms, as the gate was handed it, absolute,
and as the path from the repository root, which starts with `..` for the recommended layout where
the directory sits outside the tree. It also prints for a table whose header has both a `covers`
and an `angle` column, this file's own shape, together
with every data row under it, indented or flush left. The two column names are matched exactly
and in lower case, so a header that capitalises them is not the shape and is not caught. Either
one exits 1.

The bare directory name is deliberately not a fourth form. A name is a phrase, not a path, and
the phrase clause was rejected because `held-out` fires on the titles and `test` cells of
artifacts already merged. Adding the basename brings that clause back under another name
whenever the directory is called what the convention calls it.

The path clause reads the whole line and exempts no cell, the `red line` one included. A visible
test whose recorded output legitimately contains the held-out directory therefore cannot be
recorded at all, and that is a decision, not a defect: a cell the scan skipped would be the cell
a leak goes in. Such a test belongs in the held-out set, or its wrapper should not print a
scratch path.

A sentence such as "two more tests cover composition" carries neither the path nor the shape and
is caught by nothing. So is any other prose naming what was kept back. That is a rule the
strategist holds, and the reviewer reading the visible artifact is the only thing behind it.

Rules the strategist holds, because the gate does not check them:

- Every file in the directory except `strategy.md` is a test, run on its own with the one-file
  command. The gate reads only the command's exit status, so a fixture file (json, csv, a
  helper module) is not caught as a non-test: it passes when the command exits 0 and fails
  otherwise, and either way the gate's count is wrong. A held-out test therefore carries its
  data inline, generates it from its seed, or reuses a fixture already committed on the
  visible-tests commit. A mechanical check of this rule is a later change.
- A held-out file name never begins with a dash. The gate hands the name to the caller's own
  one-file test command, an arbitrary wrapper it cannot pass an option terminator to without
  breaking a wrapper of the shape `exec bash "$1"`, so such a name reaches that command as an
  option. Nothing checks this: the gate copies and removes the file safely, and the run ends in
  a `held-out-failed` line for a test that is fine.
- A held-out test lives in its own file, never appended to a visible test file. The gate refuses a
  target path that already exists, a dangling symlink included, and one that is a symlink or
  sits under a symlinked directory, because a copy through one lands outside the repository
  where `git status` cannot see it.
- A held-out test named in a review finding has reached the implementer through the fix round
  and is spent for that ticket. It is never reused on another ticket; the strategist writes a
  fresh one.
