# Decisions while implementing

Use within an already authorized task. This reference does not authorize a new refactor or
replace the workflow's acceptance criteria, test author or reviewer. A task that is a refactor,
the refactor step of RED/GREEN, or code with no covering test starts in `refactoring.md`, which
sets the steps and the report; this file governs the decisions inside each step.

1. Identify the behaviour and invariant the change must preserve. Before any edit, establish
   whether a test covers the scope with the coverage moves in step 1 of `refactoring.md`;
   when none does, run its legacy section as a prelude and return here. Search in order: the version-compatible
   standard library, dependencies already in the manifest, then the repository's helper inventory
   before adding a helper or dependency. Compare contracts, not just names; retain the candidate and search
   evidence needed to explain a reuse decision.
2. Group code by reasons to change. Separate unrelated rules or effects when that hides knowledge
   from callers. Keep a cohesive operation together even if it is long. Before extracting, name
   the responsibility, its inputs/result and the detail callers no longer need to know. Reject
   extra layers that only forward arguments without protecting a contract.
3. At a boundary, keep business rules independent of transport and persistence details. Follow
   the repository's architecture; introduce an interface where a consumer needs a distinct
   contract, not for every class. Check imports and dependency direction in the affected area.
   If multiple implementations exist, preserve their accepted inputs, promised results and error
   semantics; do not force consumers to depend on operations they never use.
4. Represent valid states explicitly when this prevents a concrete invalid combination or unit
   mix-up. Keep simple DTOs and transport shapes simple. Validate untrusted data at the boundary;
   a type declaration alone need not validate runtime input. Apply the affected language file.
5. Give each resource and side effect an owner and lifetime. Preserve errors with useful context;
   translate them only at a boundary that owns the public contract. Never convert an unexplained
   failure into empty data or success. For retries, establish the operation's repeatability and
   existing policy before adding one. An unexplained failure belongs to `wise-dev`.
6. For test creation or changes, hand off to `test-strategy`, preserving any independent-author
   requirement of the active workflow. Within its required RED/GREEN process, make the smallest
   passing implementation, then run the refactor step under `refactoring.md` with the goal
   that step owns: remove the duplication or mixed responsibility the GREEN step introduced,
   within scope. Append its whole report, every line, under `decisions` of the implementation
   report. When GREEN introduced neither, record `refactor: none` under `decisions` and skip
   the step.
   Do not weaken tests to accommodate a refactor.
   For work that requires no new test, run the repository checks appropriate to the change.
7. Inspect the resulting diff for accidental scope growth and needless indirection. Comments
   explain why, never narrate what code does; apply any narrower caller policy.
8. Remove what the change made obsolete, within the touched modules and the behavior the change
   replaced: a symbol whose last caller the diff removed, a test of behavior the change deleted,
   a document, docstring or guide line that still describes the old behavior, a name kept on a
   test or a message after the thing it named was renamed. Search the repository for each removed
   or renamed name before declaring nothing left; check dynamic and public entry points before
   calling code unused. Use the repository's unused-code tool when it has one; inspection counts
   when it has none. Report the result in `removed:`; `none, searched: <names and scope>` is a
   valid answer, an absent line is not. No deletion quota: a test still excluding a live wrong
   implementation stays, and a deletion on shared failure detection alone is a defect.
9. Report the changed behaviour, material decisions, removals and actual verification in the
   entrypoint's shape.
