# PHP decisions

Read only for PHP in scope; inspect Composer's runtime constraints, framework conventions and
static-analysis configuration. Do not introduce syntax beyond supported PHP versions.

- Use supported parameter, return and property types where they express the contract. Check
  coercion and the project's strict-types policy rather than assuming declarations validate
  external payloads. Validate inputs at the boundary that receives them.
- Keep transport arrays/DTOs simple; introduce a domain object when it centralizes an invariant
  or prevents a concrete invalid state. Avoid service classes that only forward calls.
- Keep domain rules independent of request objects and persistence internals through the
  repository's existing boundaries. Do not replace framework conventions with a new architecture
  during a scoped implementation.
- Handle exceptions where recovery or translation is defined; retain their cause. Treat failed
  persistence or remote calls differently from legitimate absence, and release owned resources
  along error paths as well as the happy path.

Review reports still require the concrete replacement and scoped line. Send test methodology
and doubles to [`test-strategy`](../../test-strategy/README.md).
