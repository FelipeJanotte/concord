# JavaScript decisions

Read only for JavaScript in scope; inspect the actual runtime/browser support, module format,
build settings and configured checks. Do not assume the newest language feature is deployed.

- Validate external payloads before domain use; make missing, null and invalid values distinct
  where the contract distinguishes them. Reuse existing schemas or boundary checks.
- Prefer cohesive functions/modules; introduce objects for owned state or a meaningful contract.
  Plain data objects are valid transport shapes. Avoid classes that only wrap another call.
- Track promise ownership: return or await work whose completion the caller depends on, and
  handle rejection where recovery or translation is defined. Inspect early-return and cleanup
  paths; a detached operation needs an explicit lifecycle and failure policy.
- Choose explicit loops for ordered effects and early exits; use transformations when they
  clarify a data transformation. Do not hide asynchronous sequencing inside a cosmetic rewrite.
- Keep shared mutable state and effects behind the boundary that owns their lifetime. Preserve
  useful error information rather than converting failure into a default successful value.

Review reports still require the concrete replacement and scoped line. Send test methodology
and doubles to `test-strategy`.
