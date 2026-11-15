# Choosing a dependency substitute

Repository ownership is not the boundary: an internal persistence adapter can be replaced
through its public contract, while mocking a private helper couples the test to implementation.
Identify what the test claims before choosing a substitute.

| Choice | Use when | Required limit or check |
|---|---|---|
| Real dependency | Its behavior is part of the claim and the repository provides a controlled instance | Isolate state and resources; identify environmental failures separately |
| Stub | A boundary must return a controlled value or failure | Exercise the real unit under test; do not claim the stub proves integration |
| Fake | Stateful interaction through an architectural interface is needed | Verify the relevant shared contract against the real adapter; report that gap if unavailable |
| Mock or spy | The interaction itself is contractual, such as requesting an external effect | Assert required arguments or ordering only; do not freeze incidental call counts or private choreography |

1. State the architectural boundary and why a real dependency is unsuitable for this test.
   Clock, randomness, network and persistence can qualify; same-repository placement neither
   permits nor forbids substitution.
2. Never replace the unit under test or private collaborators to make its result pass. Prefer
   outcome assertions; an interaction assertion needs a contract that requires the interaction.
3. Make the substitute discriminate: start it in the state opposite to the claimed effect,
   configure failures intentionally, and check that each required setup operation succeeds before
   recording the injected-failure marker or returning the intended error. A setup failure is a
   different result; never record the marker before the operation that should create the partial
   state has been attempted. Ensure an omitted or wrong call cannot satisfy the test. Match the
   semantic operation and its relevant arguments; do not select a failure by incidental call
   ordinal when the contract is about which operation fails. An assertion of the value just
   assigned to a mock proves no production behavior (TH13/TH20).
4. Name what remains unproven. A fake accepting a request does not prove the real adapter or
   service accepts it. Run the existing integration or contract check for the relevant boundary;
   if unavailable, record that gap rather than equating the substitute with the real system.
5. Follow the installed framework's documented substitute APIs and cleanup lifecycle. Keep
   substitutions scoped to a test and preserve real interface constraints where tooling supports
   them. Do not add a mocking library when the existing fixtures or a small contract fake suffice.
