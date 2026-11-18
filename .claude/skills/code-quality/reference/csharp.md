# C# decisions

Read only for C# in scope; inspect target frameworks, language version, nullable settings,
analyzers and the repository's dependency-injection conventions before choosing features.

- Use a record or DTO for a data contract when appropriate; require behaviour only where an
  object owns domain invariants. Respect configured nullability instead of suppressing warnings
  that expose an unclear contract.
- Keep interfaces aligned with consumer operations. Check implementations preserve accepted
  inputs, results and exceptions; avoid a generic repository or service layer without a concrete
  boundary it protects.
- Make resource ownership explicit. Use scoped disposal for resources owned here; do not dispose
  borrowed dependencies just because they implement a disposal interface. Follow existing
  asynchronous disposal patterns when the target supports them.
- Await asynchronous work required by the operation and carry cancellation through existing
  contracts. Do not block asynchronous code merely to fit a synchronous forwarding helper.
- Use LINQ when it clarifies a transformation; use loops for clearer effects or control flow.
  Preserve exception causes and distinguish a valid absence from an operation that failed.

Review reports still require the concrete replacement and scoped line. Send test methodology
and doubles to `test-strategy`.
