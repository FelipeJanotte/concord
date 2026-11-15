# Strategy artifact

One per ticket, beside the spec as `<spec path without .md>-tests.md`. Written before any
production code; read by the implementer and the reviewer. It carries the visible tests only.
The held-out table lives in a second artifact at `<scratch dir>/<ticket>/held-out/strategy.md`
(`reference/held-out-template.md`), a path the implementer's prompt never carries: what this
file does not contain, the implementer is not handed.

```markdown
# Test strategy: <ticket id> <goal>

Spec: <path> @ <sha>      Requirements: R2, R3      Checks: C2, C3
Seams (confirmed by <who>, <date>):
- <interface or entry point>, observed through <what a caller sees>

## Visible tests, in work order
| # | test | seam | R | excludes this wrong implementation | expected from | rederive | red line |
|---|---|---|---|---|---|---|---|
| 1 | tests/test_coupon.py::test_percent_coupon_halves_total | apply_coupon() | R1 | ignoring `type` and always subtracting `value` | quoted spec example C1 | no | AssertionError: assert 2 == 3 |

## Not tested, and why
- R9 (no coupon is a no-op) is covered by the existing test_total; adding one would be a change detector.
```

For a material risk, add a short case note outside the fixed table before authoring its test.
Record the precondition, setup evidence, action, independent expected outcome, and concrete wrong
implementation it excludes. Add a bounded completion or cleanup condition when relevant; omit
inapplicable detail for a simple pure rule.

Rules

- `excludes` is the reason the row exists. It names a plausible wrong implementation, not "the
  feature is broken". If two rows exclude the same wrong implementation, one is redundant.
- `expected from` cites where the value came from, and opens with one of two words. `quoted `
  for a literal taken from the spec, a worked example the spec prints, or a domain fact.
  `worked ` for a value you computed yourself, with the arithmetic in the cell. A cell opening
  with neither is a gate finding: no parser can tell one from the other in free prose, so the
  vocabulary is what makes the `rederive` rule enforceable at all. Computing the value the way
  the code computes it stays forbidden either way.
- `rederive` is `no`, or `yes: <value>` carrying the value itself, because a comparison needs
  something to compare. The two columns answer different questions: the token says where the
  value came from, the mark says whether it must be re-derived. `worked ` forces `yes`, and the
  two written together are a gate finding, because a value you computed is exactly the row the
  reviewer must recompute. `quoted ` permits either. Mark a quotation `yes` whenever the row
  still turns on arithmetic you did, most often a spec literal the test asserts in another unit
  or format: the cell is a quotation and the conversion is the thing worth checking. The mark
  costs one re-derivation the rule did not require, which is the price of it, and cheap against
  the alternative of writing `worked ` on a cell whose honest content is a citation.
- A literal `|` in a value is written `\|`, the markdown escape. Unescaped it is the table's own
  separator, so it splits the row, and the gate reports `rederive-row-width` against the row
  rather than reading a value out of the wrong cell. The re-derivation comparison unescapes both
  sides, so a value carrying a pipe is compared whole. The red-line comparison does not yet, so a
  row that needs the escape has its `red line` cell read one cell over; until the two readers of
  this table are consolidated, prefer a row whose values carry no pipe.
- No required cell is left empty. `test`, `expected from` and `rederive` each have a reading the
  gate depends on, and an empty one is `rederive-cell-empty` rather than a row quietly skipped.
- `red line` is copied from the runner's output on the pre-implementation commit; `import:
  <error>` only for a seam that does not exist yet.
- Work order goes from the simplest behaviour to the composed ones; the implementer takes
  them in this order and reports each red.
- Nothing about the other set goes here: no count, no name, no "see also". A line like "two
  more tests cover composition" tells the implementer what to special-case.
