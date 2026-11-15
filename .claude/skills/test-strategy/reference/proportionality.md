# Choose evidence before tests

Apply this decision before allocating a test author or creating test artifacts. Protect the
application's intended outcomes, including operational properties that matter to those outcomes.
A changed file, a spec, a language or a tool name is not by itself a reason to add tests.

## Decision

1. Name the changed outcome and a plausible failure with a material consequence. Inspect existing
   checks and their assertions or documented guarantees; do not infer coverage from a filename.
2. Choose the least costly evidence that distinguishes that failure: existing tests, native
   validation or build, a focused manual check, or a new behavior test. Record what it establishes
   and any material gap. A check not run is pending, never a pass.
3. Add or change tests only for a concrete gap. Each proposed test must name the wrong behavior it
   rejects and why existing evidence does not reject it. Prefer the existing test seam and runner.
   Do not duplicate a configuration literal in an assertion, retest dependency internals, or
   create a framework merely because a file changed. A configuration check is useful when it
   verifies an independently stated product property, rather than restating its current contents.
4. If existing evidence suffices, return `no-new-tests` with the evidence and reason. Do not create
   visible/held-out artifacts, seek test-seam approval or manufacture a failing test for this result.
   If behavior or evidence is unknown, return `blocked` with the exact gap rather than declaring
   tests unnecessary. Preserve explicitly required repository and user gates; changing those
   requirements needs a separate authorized change, not a silent omission.

## Examples of scope

| Change | Evidence choice |
|---|---|
| Routine Terraform or Compose wiring, with no uncovered product risk | Use applicable native validation and review; do not write tests for the tool's parsing or duplicate the configuration values. |
| Application must reach its database through the configured services | Reuse a check that observes that connection; add a focused integration check only if this property is otherwise unproven. |
| Access policy or data retention changes | Verify the required access or preservation property. Syntax validation or compilation alone does not establish it. |
| Discount, permission or data transformation rule changes | Exercise the changed outcome and relevant failure boundary through the existing application seam. |
| Refactor with unchanged behavior already covered | Run affected existing checks; do not add tests just to mirror the new structure. |

Infrastructure is neither automatically exempt nor automatically deserving a separate suite.
Decide from the application's contract and the risk introduced by our own decisions.

## Optional assurance

Ordinary test authorship uses `reference/authoring.md`, including for spec-based tickets.
Use the independent visible/held-out protocol in `reference/strategist.md` only when explicitly
required by the user or repository, or when a documented material risk needs an independent oracle
that ordinary tests plus review cannot provide. Record that reason before allocating the roles.
Preserve its isolation and confirmation rules once selected; a spec alone does not select it.

Mutation is a separate decision, never implied by choosing held-out tests. Use
`reference/mutation.md` when explicitly requested/required, or for a named consequential rule
whose assertions may accept a specific wrong implementation. Bound the selected rules and the
run using the caller's limits before starting; do not mutate every changed line by default.
Availability of a mutation runner does not make it mandatory.

## Return to the caller

One line per field, at most two sentences per field; link detailed evidence if needed.

```text
decision: no-new-tests | focused-tests | independent-tests | blocked
outcome/risk: <changed behavior; plausible failure and consequence>
evidence: <existing check/source and what it proves; observed result or pending>
gap: <uncovered behavior requiring tests; exact unknown; or none>
action: <checks to run; tests to add/change with reason; or no new tests because ...>
assurance: <held-out and mutation selections with reason and scope; or neither>
```

Return this decision before authorship. It selects a route, not a completion verdict: the caller
still needs the declared checks' actual results and must report any unresolved material gap.
