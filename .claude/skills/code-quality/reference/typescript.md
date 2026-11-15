# TypeScript decisions

Read only for TypeScript in scope; inspect the installed compiler, target, strictness settings,
runtime and framework conventions. Do not change compiler policy as an incidental cleanup.

- Narrow untrusted values at the boundary. Prefer a checked representation to assertions or
  `any` that merely hide uncertainty; reuse the repository's validation mechanism.
- Use a discriminated union when states have different valid fields. Narrow by the discriminant
  and handle all contract variants rather than adding unrelated optional fields everywhere.
- Keep small structural interfaces tied to consumer needs; a type or DTO need not gain methods
  to pass a class-oriented smell check. Separate effects where doing so protects a real contract.
- Make asynchronous ownership explicit: await or return work whose failure matters to the
  caller. Follow repository cancellation and cleanup patterns; do not silence rejected work.
- Choose array transformations for clear transformations and loops for ordered effects or
  early exits. Preserve runtime behaviour when changing a type annotation or representation.

Review reports still require the concrete replacement and scoped line. Send test methodology
and doubles to `test-strategy`.
