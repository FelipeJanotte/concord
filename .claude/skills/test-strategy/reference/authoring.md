# Writing tests from a behavior contract

For a ticket strategist, this is authorship guidance inside `reference/strategist.md`; its
confirmations, independent role, commits, artifacts and held-out rules still apply. A focused test request, including one from a spec-based ticket, uses the procedure and report
below without manufacturing independent-test artifacts. Apply `reference/proportionality.md`
first; `no-new-tests` returns its decision report without entering authorship.

## Procedure

1. Record the contract source and public seam. For a regression, require both a reproduction
   and the intended result; a failing observation alone is not an oracle. If either is unknown,
   return the gap to `wise-dev`. Read the repository's test conventions, commands and an existing
   style sample. Place tests at its existing seam, not a new directory invented for this task.
2. Before broad behavior work, make a short map from each changed requirement to its material
   risk, public seam/test, and contract-derived oracle. For a material risk, add a compact case
   note before writing tests. In the ticket protocol, put only visible-case notes in the existing
   visible artifact; keep reviewer-only case notes in the existing private artifact after the
   protocol split. For standalone authorship, put the compact note under the existing `tests:`
   field in the authorship report. Record the precondition, evidence that setup reached the
   scenario, action, independently expected outcome, and the concrete wrong implementation it
   excludes. Add a bounded completion or cleanup condition when the case can block or allocate
   resources. Use `reference/edge-cases.md` for relevant cases, not an exhaustive matrix for
   prose or trivial edits. For each test name a plausible wrong implementation it excludes; if
   the test would pass that implementation, strengthen the oracle.
   Derive expected results independently of production code. Do not call the implementation to
   manufacture its own expected value. Keep inapplicable fields out of simple cases.
3. Choose the method with `reference/methodology.md`. When isolation needs a substitute, use
   `reference/test-doubles.md` and record what that substitution leaves unproven. Use the
   installed runner and repository's idioms; do not add a framework for a familiar syntax.
4. Write deterministic tests through the public seam. Keep one logical behavior per test;
   several assertions may be needed to prove its result and contractual effects. Assert exact
   results when the contract fixes the whole result; assert a property or subset only when
   that is the contract, explaining what remains unconstrained.
   An existing test the change turns red is decided, never loosened: the behavior was removed,
   so the test is deleted with that reason, or the behavior changed, so the test is rewritten
   from the contract with a new expected value. Equality to containment, a literal to not-None,
   a skip or an expected-failure marker is TH6 and goes in `removed:` as a defect, not a fix.
5. Run the relevant test command and record the observed result and exit status. A regression
   test must fail for the established bug, rather than an unrelated fixture or environment
   error. New behavior should fail at the assertion; a missing public seam may initially fail
   to import, explicitly recorded as such. Do not edit production code to turn it green.
6. A test of already satisfied behavior may pass immediately. Label it characterization or
   additional coverage, never a RED proof; show the specific incorrect behavior it would reject
   where feasible. Characterization records observed compatibility, not proof that a disputed
   behavior is correct. Stop if approval of the behavior itself is missing.
7. Report the scope and evidence below. Commit only when the caller's workflow requests it.
   For a focused-test handoff to implementation, the executor requests a test commit before
   implementation starts; return its exact SHA and the authored paths in this report. If that
   commit cannot be produced, report the blocker rather than presenting an uncommitted tree
   as a pinned handoff.

## Standalone authorship report

```
contract: <source and expected behavior>
seam: <public interface and existing test location>
tests: <paths and excluded implementations; append each material case note here, after its test>
revision: <commit containing the authored tests; or uncommitted when no committed handoff was requested>
method: <choice and reason>
doubles: <boundary, reason and remaining integration check | none>
evidence: <command, exit status, observed failure or pass; baseline revision>
removed: <existing tests deleted or rewritten, each with its reason | none, searched: <scope>>
mutants: <one line per mutant, `<mutant> | <test> | <command> | <first red line>` | not selected, <reason>>
unproven: <missing checks or behaviors | none>
```

## Standalone review

Read the behavior contract independently, then inspect the tests and diff. A `no-new-tests`
decision does not skip review: check its cited existing evidence and material gaps without
requiring new test artifacts. A mutation claim anywhere on the change, in the report, a pull
request body or a review reply, counts only as the `mutants:` lines that carry a test name, a
command and an observed red line; a claim without them is a TH21 finding, and the reviewer
records the mutation as not run. Recompute worked
expected values from that contract. Check substitutions against `reference/test-doubles.md`
and scan `reference/theatre-catalogue.md`. A characterization test honestly reported as already
passing is not TH4; claiming it supplied a pre-change RED proof is. Run the declared commands;
report unavailable reproduction or execution as unproven. Use `reference/mutation.md` only
when selected under `reference/proportionality.md` and a committed baseline is available; there is no invented
held-out requirement for a standalone request.

Report each finding as `| file:line | claim | why it is wrong | severity | how to check it |`.
With no findings say so, then give the commands and outcomes and any checks that could not run.
Do not claim the ticket gate passed when reviewing outside that protocol.
