# Choose a collector for the repository

Read only when asked to select or configure measurement. Inspect the existing runner, reports
and dependency versions first. Evaluate a compatible existing collector before writing a parser
or installing another dependency. These are candidates to verify, not required tools.

| Language | Candidate inputs or collector | Check before adopting |
|---|---|---|
| Python | Radon complexity with coverage.py JSON | Requires a verified per-function join; check nested functions and whether the collector uses line or branch coverage |
| Go | gocyclo complexity with the Go coverage profile | Requires a verified per-function join; check package/build-tag scope, generated code and coverage of subprocesses used by integration tests |
| PHP | PHPUnit and php-code-coverage provide CRAP reporting | Runtime/driver compatibility, included source and coverage mode |
| TypeScript | The npm package `@danibram/crap4ts` with a supported coverage report | Source maps, anonymous/nested functions, compiler version and cyclomatic mode |
| JavaScript | The npm package `@danibram/crap4ts` with a supported coverage report | Module/runtime syntax, transformed source mapping and async callback boundaries |
| C# | ReportGenerator with a compatible coverage report | The input format actually supplies complexity and method coverage needed for CRAP hotspots |

Check the chosen project's current primary documentation and implementation against the
installed version. A report format supported for displaying coverage may still lack the inputs
needed for CRAP. Do not infer collector compatibility from a tool's name or a package existing.

Before making it a gate, exercise small fixtures with known complexity, covered and uncovered
branches, missing coverage, nested functions and failed collection. Confirm the per-function
join, exclusions and failure status. Record versions and definitions using `reference/metrics.md`.
Use the repository's agreed threshold and baseline policy; adopting a collector does not authorize
a new blocking policy or cleanup of existing hotspots.
