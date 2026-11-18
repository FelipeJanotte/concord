# Executing an authorized refactor

Use within an already authorized refactor: a ticket, a review finding the caller asked to fix,
or the refactor step of a RED/GREEN cycle. An authorized change that is not a refactor and
touches code with no covering test runs only the legacy section below as a prelude, reports
its `legacy seams` and `blocked` lines, and returns to `implementation.md` for the change
itself. `implementation.md` governs every decision inside a step.

## Inputs

It stops without both: the scope (paths or a named finding) and the goal, stated as the smell
to remove or the change the code must become ready for. A goal such as "clean it up",
"improve", "modernize" or "simplify" is not a goal: it names no smell and no change, so any
edit made under it is the implementer's choice, not the caller's. On a missing goal, read
nothing else, edit nothing, and return the report with `goal: missing` and the rest `none`,
followed by one line asking for the smell or the change, and naming `spec-driven` when the goal
needs investigation rather than a sentence. Choosing a goal for the caller is the failure this
section exists to prevent.

## Two hats

A step either changes structure or changes behaviour, never both. When a behaviour change is
found necessary mid-refactor, finish the current step if its checks are green, revert it
otherwise, report it, and let the caller decide. Mixing the two hides which change broke a test.

## Procedure

1. **Baseline.** Run the repository's checks for the scope and record the result. A red
   baseline stops the refactor before any assessment or edit: return the report with
   `baseline: red, <check>` and `blocked: baseline red, hand to wise-dev`. Code with no test
   covering the scope goes through the legacy section below before any structural change.
   Establish coverage in two moves: search the test tree for each public symbol in scope and
   for the observable identifiers that reach it (a route, a command, a message, an interface
   it implements) to find candidate tests, then read each candidate to confirm it exercises
   the symbol, and record both in `baseline`. A symbol with no confirmed test after both
   searches is uncovered. A guide that names no test command is a missing input, not evidence
   of no coverage: stop with `blocked: no test command` before the legacy section, because
   [`test-strategy`](../../test-strategy/README.md) stops on the same absence. Where a coverage measurement is requested or already exists,
   `metrics.md` applies, and `not measured` is evidence of nothing.
2. **Assess.** List every candidate as a table: `smell | file:line | refactoring | why now |
   keep/skip`. `keep` only where the change serves the stated goal. A candidate outside the
   scope is listed and skipped. A candidate is structural when its smell is one of: Divergent
   Change, Shotgun Surgery, Feature Envy, Insider Trading, Middle Man, Large Class, Shallow
   module cluster. No other smell is, whatever refactoring it maps to. Structural candidates
   come first in the list, and a rename or a type tweak is never chosen over a structural
   candidate that serves the same goal.
3. **One refactoring per step.** Apply a single named refactoring, run the checks, and mark
   the step boundary before the next: a commit only when the request that dispatched you says
   the implementer commits (a dispatch rule or the caller's guide), otherwise a staged step,
   with the step name recorded in `steps`. Two refactorings that touch the same lines are
   still two steps: edit, check, then the next edit, and the `steps` line of the report
   carries one check result per refactoring. The map lists candidates in the order to try;
   one per step. A step that stays red is reverted, not patched forward.
4. **Verify.** Rerun the full checks for the scope. Diff the public interfaces before and
   after: signatures, error types, exported names. A changed interface is either in the goal
   or reverted.
5. **Report** in the shape below.

## Smell to refactoring

The reviewer names the smell; the implementer names the refactoring. Smell names are the ones
in `smells.md`. Each refactoring is a Fowler catalogue name, so reviewer and implementer match
without prose. The three reinvention smells have no row: their replacement is the named symbol,
helper or removed dependency.

| Smell | Refactorings, in the order to try | When that is wrong |
|---|---|---|
| Mysterious Name | Rename Variable; Rename Field; Change Function Declaration | no honest name exists: the design is the finding |
| Duplicated Code | Extract Function; Pull Up Method across siblings | the two copies encode different rules that only look alike today |
| Long Function | Extract Function; Replace Temp with Query; Decompose Conditional | the length is one cohesive operation with one abstraction level |
| Long Parameter List | Introduce Parameter Object; Preserve Whole Object; Replace Parameter with Query | callers genuinely vary the values independently |
| Global Data | Encapsulate Variable | a single owner already exists and the writes are local |
| Mutable Data | Split Variable; Change Reference to Value; Remove Setting Method | the mutation is local to one owner and one operation |
| Divergent Change | Split Phase; Extract Class | the module is small and the reasons to change are rare |
| Shotgun Surgery | Move Function; Move Field; Combine Functions into Class; Combine Functions into Transform; Inline Function | the spread follows a real boundary each side owns |
| Feature Envy | Move Function | the function is a deliberate mediator between two modules |
| Data Clumps | Extract Class; Introduce Parameter Object | the fields travel together in one call only |
| Primitive Obsession | Replace Primitive with Object; Replace Type Code with Subclasses | the value is a transport field with no invariant to protect |
| Repeated Switches | Replace Conditional with Polymorphism | one switch, or the cases never change together |
| Loops (vs pipeline) | Replace Loop with Pipeline | the loop exists for effects, early exit or the language idiom |
| Lazy Element | Inline Function; Inline Class; Collapse Hierarchy | the element is the boundary a test or caller depends on |
| Speculative Generality | Collapse Hierarchy; Inline Function; Remove Dead Code; Change Function Declaration | a second consumer is inside the authorized scope |
| Temporary Field | Extract Class; Introduce Special Case | the field is the object's state during its whole life |
| Message Chains | Hide Delegate; Extract Function; Move Function | the chain is a query over an immutable structure |
| Middle Man | Remove Middle Man; Inline Function | the forwarder protects a contract a caller must not bypass |
| Insider Trading | Move Function; Move Field; Hide Delegate; Replace Subclass with Delegate | the modules are one unit split by file size |
| Large Class | Extract Class; Extract Superclass; Replace Type Code with Subclasses | the fields are one aggregate with one invariant |
| Data Class | Move Function; Encapsulate Record; Remove Setting Method | it is a DTO, record or serialization shape |
| Refused Bequest | Push Down Method; Push Down Field; Replace Subclass with Delegate; Replace Superclass with Delegate | the unused surface is an interface contract the type must honour |
| Comments as Deodorant | Extract Function; Change Function Declaration; Introduce Assertion | the comment says why and the code cannot |
| Shallow module cluster | Inline Function; Combine Functions into Class | each file is a boundary a different owner ships |

## Structural first

Before a move, read every caller in the repository, not only the ones in the diff: a cross-file
smell is only visible from the callers.

## Legacy code: no test covers the scope (Feathers)

The refactor cannot start until behaviour is pinned. Before the first step, confirm that
[`test-strategy`](../../test-strategy/README.md) is installed next to this skill; when it is not, return the report with
`blocked: test-strategy not installed` and edit nothing. In order:

1. **Find the seam.** A seam is a place where behaviour can be altered without editing that
   place: a parameter, a constructor argument, a module import, an overridable method, a
   link-time or environment substitution. Prefer the seam nearest the scope with the fewest
   collaborators.
2. **Break the dependency at the seam** with the smallest change that makes the scope callable
   from a test: Parameterize Constructor, Extract Interface, Extract and Override Call,
   Subclass and Override Method, Introduce Instance Delegator. These are not the refactor;
   they are its precondition, and each is one step under the procedure above. A seam created
   here is a new seam. When the request came with a dispatch contract (assigned worktree,
   branch and base), stop before editing: return the report with the proposed seam and its
   technique under `legacy seams` and `blocked: awaiting seam confirmation`. When [`test-strategy`](../../test-strategy/README.md) selects independent tests, the confirmed seam goes to its strategist
   first; create the seam only in the implementer dispatch after the visible-test commit.
   For focused tests, break the dependency in the dispatch carrying the seam confirmation. Outside any dispatch contract, name the seam under
   `legacy seams` and continue.
3. **Request characterization tests** from [`test-strategy`](../../test-strategy/README.md) through the route the active
   workflow selects under [`test-strategy`](../../test-strategy/README.md)'s `reference/proportionality.md`: focused authorship
   unless independent tests are justified or required. A spec alone does not choose that route. Hand
   over only outputs the caller accepted as the current contract, with the seam and the
   command that runs the scope. A disputed output is not pinned: list it under `blocked` and
   stop, because the sibling stops on a behaviour nobody approved. The sibling defines what a
   characterization test may claim; do not restate it here. Continue when the tests come back
   green; when the sibling stops or refuses, return the report with
   `blocked: characterization tests, <its reason>`.
4. **New behaviour into legacy code** goes beside it, not inside it: Sprout Method or Sprout
   Class for a new operation, Wrap Method or Wrap Class for behaviour around an existing call.
   The untested body is not edited to add behaviour.
5. A scope where the techniques in step 2 cannot expose a seam without changing existing
   behaviour is reported as blocked, with the nearest seam found and what it would cost, and
   the refactor stops.

## Report

Every line is present, `none` where there is nothing to say.

```
goal: <smell removed or change the code is now ready for; or missing>
baseline: <checks run and result before the first step>
steps: <one line per refactoring applied: name, file:line, and the check run after that step alone; two refactorings in one edit is a defect>
interfaces: <public signatures, error types and exported names compared; changed ones and why they are in the goal, or none>
legacy seams: <one line per seam: technique, file:line, proposed | created, and confirmed by <who> | awaiting confirmation | no confirmation needed outside a dispatch contract; none when the legacy section did not run>
skipped: <candidates listed and not applied, with the reason>
removed: <obsolete code, tests and doc lines deleted, each with its reason | none, searched: <names and scope>>
verification: <final checks and result; unavailable evidence and why>
blocked: <one of: baseline red, hand to wise-dev | no test command | test-strategy not installed | awaiting seam confirmation | disputed output, <input and the two readings> | characterization tests, <reason> | no seam, <nearest seam and its cost> | behaviour change needed, <what and the caller's decision>; or none>
```
