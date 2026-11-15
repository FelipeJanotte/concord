# Theatre catalogue

What a green suite looks like when it proves nothing. The reviewer scans the diff for each and
reports the code with file:line.

| Code | Pattern | Tell |
|---|---|---|
| TH1 | Tautology | the expected value is computed by the function under test, or the same way the code computes it |
| TH2 | Circular validation | the validator re-runs the formatter it validates |
| TH3 | Bug enshrined | the test asserts the current output, which the spec says is wrong |
| TH4 | Faked red | a claimed pre-change RED proof never failed; honestly labelled characterization is not a RED claim |
| TH5 | Deleted or disabled | a failing test removed, skipped, marked expected-failure, or its file excluded from the runner |
| TH6 | Weakened assertion | equality became containment, a literal became "not None", a tolerance widened |
| TH7 | Runner bypass | exit(0) before tests, a skip raised from non-test code, an early return in the fixture |
| TH8 | Stub where coverage is thin | the function returns a plausible constant for the tested input |
| TH9 | Lookup table | the implementation branches on the exact test inputs |
| TH10 | Feature isolation | each visible test passes; the composed behaviour fails |
| TH11 | Inlined into the demo | the tested behaviour lives in the example or the test helper; the requested module is dead |
| TH12 | Assertion machinery tampered | `__eq__` overridden on the result type, the runner's assertion rewriting or exit code patched, a tolerance helper redefined in a shared fixture |
| TH13 | Mock self-assertion | the mock is asserted against what the mock was told; the unit under test is mocked |
| TH14 | Snapshot rubber-stamp | snapshots regenerated to match; nobody read the diff |
| TH15 | Prints, not assertions | the test exercises the code and asserts nothing |
| TH16 | Self-comparison | the test imports the constant the code reads and compares it to itself |
| TH17 | Absent-attribute negative | assert_not_called on a name the real object lacks; always passes |
| TH18 | Containment as coverage | claims full-output coverage from a hand-typed subset where the contract fixes the whole output |
| TH19 | Fixture that cannot discriminate | the same fixture yields the same number under the right and the wrong implementation |
| TH20 | Fake starts agreeing | the double starts in the state the claim asserts, so a mutation is undetectable |
| TH21 | Prose as proof | a docstring, a comment, a report line or a pull request body asserts what no test executes; includes a mutation claim ("removing X fails a test") with no test name, command and observed red line |

For each finding the reviewer states the code, the file:line, and what the implementer's report
claimed about that test. A finding closes only when the test can be shown to fail on the wrong
implementation it was meant to exclude.
