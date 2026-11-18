# Mutation as the reviewer's sensor

Mutation answers one question: would this suite notice if the code were wrong in this line?
It is a sensor of suite quality when the code is assumed correct. It does not find bugs, and a
high score on a wrong implementation means nothing. Run only when selected under `reference/proportionality.md`, after the relevant tests are green.
Record the selected rules, the assertion-quality gap, and the caller-derived run limit first.
A missing limit blocks the mutation run, not unrelated verification. At the limit stop and
report incomplete evidence; do not expand to the rest of the diff.

## What to mutate

- Mutate only the selected rules to discriminate the named wrong implementation. Do not
  exhaustively mutate touched conditions, constants or dependency calls. List every mutant
  tried as `<mutant> | <test that failed> | <command> | <first red line>`. A mutant reported
  without those four cells is prose, not evidence (TH21): the reviewer treats it as not run.
- One mutation at a time: flip a condition, drop a branch, swap an operator, remove a call,
  change a constant by one, return early.
- The repository's contract block names a mutation runner or `none`. With a runner, use it.
  With `none`, apply each mutant by hand on a committed baseline, run the one-file command,
  and restore from the commit; never from an uncommitted tree, and verify the file is pristine
  before the next patch.
- Stop at the first survivor with no equivalence argument and report it. The ticket reopens
  there; the remaining lines are mutated on the fix round.

## What a survivor means

- Killed: at least one test failed. Say which, with the command and the first red line.
- Survived with an equivalence argument: the mutant behaves identically for every input the
  contract allows. Disclose it with the argument; do not contort a test to kill it.
- Survived without one: report the affected contract and missing assertion. Strengthen the
  focused test, or return to the strategist when independent tests were selected. Do not
  introduce held-out tests just because mutation was used. An unresolved required behavior
  remains a blocker; do not weaken acceptance to make the mutant disappear.

## What a kill against a double proves

A mutant that completes against a recording fake proves the fake accepted it, never that the
real dependency would. A double that starts agreeing with the claim makes the mutant
undetectable by construction (the boundary policy in `reference/test-doubles.md`, TH20 in the catalogue). Prefer the
real dependency at the seam when the repository provides one.
