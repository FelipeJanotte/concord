# Go decisions

Read only for Go in scope; inspect the module's Go version, toolchain, package layout and lint
configuration before choosing features or commands.

- Keep packages cohesive with an explicit dependency direction. Prefer a small interface at the
  consumer's real boundary; do not create an interface for every struct or implementation.
- A struct with package functions or methods is ordinary design. Extract when a responsibility
  or invariant becomes clearer, not to imitate a class hierarchy or satisfy a length target.
- Handle returned errors at the layer that can act; preserve inspectable causes when wrapping.
  Distinguish a valid empty result from an error. Do not convert routine failures into panic.
- Establish ownership and termination for goroutines and resources. Use the project's context
  and cancellation conventions; check that early returns also release owned resources.
- Keep clear loops. Replacing iteration with a custom pipeline solely for a smell checklist
  adds an abstraction that needs its own justification.

Review reports still require the concrete replacement and scoped line. Send test methodology
and doubles to `test-strategy`.
