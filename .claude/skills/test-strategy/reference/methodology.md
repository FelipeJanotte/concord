# Choosing the test method

First apply `reference/proportionality.md`; this file selects a method only when tests are needed.
Choose from the behavior and failure risk, before implementation details. Start with the
repository's existing facilities; a different language does not by itself justify another runner.

| Contract or risk | Method | Evidence required |
|---|---|---|
| Specific business rule or regression | Example-based test with an independently derived expected result | The incorrect result or effect the example rejects |
| Same rule across meaningful combinations | Parameterized cases or table-driven tests | Why each partition or boundary differs; avoid a cartesian product without distinct risks |
| Invariant over a broad input domain | Property-based tests using existing tooling | Contract-derived property, generator reaching valid behavior and reproducible failing input; round-trip alone can preserve paired bugs |
| State-dependent behavior | Sequence or state-transition tests | Initial state, operations and allowed final state or rejected transition |
| Persistence, serialization or protocol compatibility | Integration or contract tests against the real adapter/dependency | Observable contract shared with any fake, including failures relevant to the change |
| Legacy behavior that must remain compatible | Characterization tests | Which observed behavior is accepted and which is disputed; a snapshot requires review of its content |
| Behavior spanning components | Focused end-to-end test | The user-visible outcome that smaller tests cannot establish alone |

Combine methods when they exclude different failures. Keep pure-rule tests small; exercise real
integration where that is the claim. Replace clock access, randomness or network only through
the boundary policy in `reference/test-doubles.md`. Isolate mutable fixtures and clean resources
through the repository's fixture lifecycle. For concurrent failure paths, state the completion
bound for every participant, including the participant that encounters the failure, and verify
cleanup on success and failure; a broken implementation must terminate within that bound rather
than leave a competing actor blocked. Use synchronization or controllable time instead of
arbitrary sleeps, and retain seeds or minimized failing inputs when the runner supplies them.
Check the installed language and runner versions before using their APIs.

Coverage shows execution, not strength of assertions. Use a discriminating wrong implementation
or, when selected under `reference/proportionality.md`, the mutation procedure to assess detection. CRAP and complexity interpretation
belong to `code-quality`; do not introduce a second metric policy here.
