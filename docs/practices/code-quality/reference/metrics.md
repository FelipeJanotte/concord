# Interpret complexity and CRAP

Load when measurement is requested or the repository already supplies a relevant gate. Do not
install a metric tool, add a CI gate or refactor unrelated code merely because this reference
is available. Derive commands and approved tooling from the caller's guide and configuration.
When asked to select or configure a collector, read `reference/metric-tooling.md`; existing
measurements do not require loading the tooling catalogue.

1. Identify the unit: function/method, source path and revision, exclusions, generated code and
   how coverage is mapped back to source. Record tool versions, complexity definition, coverage
   unit (lines, branches, instructions or paths) and test command. For languages compiled or
   transpiled before measurement, verify the mapping instead of assigning file coverage to every
   function. Check nested functions and executable code absent from the report.
2. Compute only with matched per-function inputs. Conventional CRAP is
   `CC² × (1 − coverage)³ + CC`, where CC is cyclomatic complexity and coverage is a fraction
   from 0 to 1 ([formula](https://www.artima.com/weblogs/viewpost.jsp?thread=215899)). Do not
   substitute cognitive complexity under the same metric name. Missing coverage, collection
   failure or unmatched symbols mean `not measured`, never zero coverage or a passing score.
3. Compare against a baseline produced with the same definitions, tool configuration and test
   scope. If these changed, report the break in comparability before drawing a trend. Do not
   rank languages or tools as equivalent merely because both call their result CRAP.
4. Report new hotspots and per-function regressions against the repository's agreed policy;
   without one, provide observations rather than inventing a blocking threshold. Do not hide
   hotspots in an average or split a cohesive function only to lower its number. A proposed
   decomposition must name the responsibility it separates.
5. Keep cyclomatic complexity, cognitive complexity, CRAP, architecture and mutation results
   distinct. Coverage does not establish assertion quality; send test honesty and mutation
   interpretation to [`test-strategy`](../../test-strategy/README.md). Even total coverage leaves CRAP equal to CC.

Append to the role report:

```
measurement: <measured | not measured, reason>
provenance: <revision; tools/versions; commands; complexity definition; coverage unit; exclusions/mapping>
| function at file:line | CC | coverage fraction | CRAP | comparable baseline/delta | action under repository policy |
```

For an unavailable input, write `not measured` in its cell and dependent cells; retain any
independently measured inputs. An empty report or failed command cannot establish a clean gate.
