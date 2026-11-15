# Planning and authoring a ticket’s tests

Enter only after `reference/proportionality.md` selects `independent-tests` and records why.
A spec-based ticket alone does not require this protocol.
Read `reference/authoring.md` before writing either set. The ticket protocol below adds
role isolation, confirmation and artifact requirements; it is not replaced by standalone authorship.

Inputs the strategist needs in its prompt, and stops without: the spec path and sha, the `R<n>`
and `C<n>` lines the ticket cites, the ticket worktree path, and
from the repository's contract block the test command, the one-file test command and the scratch
directory. A `TODO` in any of
those is reported back, not guessed. The ticket's `Test seam` line is read when the ticket has
one, and is not on that list: a ticket without it is the ordinary case step 1 routes to the
single stop in step 3, after the held-out table exists.

The strategist does not read production code beyond the interface it tests through. Reading it
is how a test learns to assert what the code already does (TH1 and TH3 in
`reference/theatre-catalogue.md`).

## Procedure

1. **Seams first, against the ticket.** List the public boundaries at which the ticket's
   behaviour is observable. A seam is an interface a caller uses, never a private function, a
   database row read behind the interface's back, or incidental collaborator choreography.
   A required boundary interaction may be observable under `reference/test-doubles.md`.
   Compare your list with the ticket's `Test seam` line. Every seam already named there is
   confirmed by the ticket: carry on, and the report says `seams: from ticket`. A seam the line
   does not name, a ticket with no `Test seam` line, or any doubt over whether a seam is named,
   goes to the stop in step 3. Silence on a seam is not agreement to it.
2. **Enumerate before writing.** Apply `reference/authoring.md` Procedure step 2 to every
   `R<n>` the ticket cites. Keep the requirement-to-case mapping in the strategy artifact.
3. **Split.** Visible tests are the ones the implementer works against, one per behaviour, in
   the order the implementer should take them. Held-out tests cover the same requirements from
   a different angle: composed behaviours, boundary values the visible set did not use, and
   structured random inputs reaching the success path for a requirement whose input domain is
   larger than the examples the spec enumerates. Write them under
   `<private scratch dir>/<ticket>/held-out/`, at the location supplied by the task executor
   (or the coordinator dispatching this strategist). That coordinator verifies the location is
   outside the implementer's worktree and context, and never on the branch. Put their table in `held-out/strategy.md`
   (`reference/held-out-template.md`, which also fixes the directory layout the gate copies
   from). Only the reviewer runs them. The visible artifact never mentions them: not a count,
   not a name. The split is physical, two files, and the implementer is given one path.

   **Stop here, once, before either set is written.** Present in one message the held-out table
   (test, covers, angle), your `untested` line, and the seams from step 1 the ticket does not
   name, if any. This is the cheapest point at which the ticket can still change, so anything
   above your line is raised here rather than carried; a human who edits the held-out table is
   the only author in this loop who did not read the spec the way you did. Whoever dispatched
   you re-dispatches with `held-out confirmed by <who>`, and with `seams confirmed by <who>`
   as well when a seam was new. Write held-out tests only once the prompt carries the first
   string, and no test at a seam the second string was needed for until that string is there
   too. If you cannot ask,
   return that message as your whole report and stop.
4. **Write them, red on purpose.** Commit the visible tests as their own commit on the ticket
   branch, before the implementer is dispatched. Run each with the one-file test command and
   copy the first line it prints into the artifact; that line is the implementer's target, and
   the gate later compares it with the first line the one-file command prints on the same commit. The red must
   be the assertion. The one exception is a seam that does not exist yet: then the red is the
   import error, and the artifact's `red line` column says `import: <error>` so the reviewer
   knows to expect the assertion-level red on the second run. A test that passes before
   implementation is one of two things: tautological, so rewrite it until it fails or delete
   it; or the requirement is already met, so move it to "Not tested, and why" as a change
   detector and cite the existing test that covers it.
5. **Hand off** both artifacts and stop: the visible one beside the spec
   (`reference/strategy-template.md`) and the held-out one in the scratch directory
   (`reference/held-out-template.md`). The report names both paths; whoever dispatches the
   implementer passes on the first only.

## Artifact rules

- Apply the assertion policy in `reference/authoring.md`; a subset never proves a contract
  that fixes the whole output.
- An expected value is a literal from the spec or a worked example, never computed the way the
  code would compute it. Cite which of the two it is with the `quoted ` or `worked ` word the
  `expected from` cell opens with, and mark a `worked ` row `rederive: yes: <value>` so the
  reviewer recomputes it (`reference/strategy-template.md`).
- The gate is the protection; the prompt to the implementer is a courtesy.


## Report

Fixed shape, delivered to whoever dispatched you before you finish:

```
seams:      from ticket | <the ones it did not name>, confirmed by <who> | UNCONFIRMED, stopped here
artifact:   <path of the visible artifact; the only path the implementer receives>
commit:     <sha of the visible-tests commit on the ticket branch>
visible:    <count>; work order and red lines are in the artifact
held-out:   confirmed by <who>; <scratch dir>/<ticket>/held-out/strategy.md, <count> tests; reviewer only
untested:   <R<n> with no test and why, one per line, or "none">
```
