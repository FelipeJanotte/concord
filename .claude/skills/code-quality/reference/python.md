# Python decisions

Read only for Python in scope; first inspect the configured Python version, type checker and
nearby module conventions. Use supported syntax and existing project checks.

- Prefer a function/module for a cohesive operation; add a class when it owns state, invariants
  or a meaningful protocol. A dataclass used as a transport record needs no invented behaviour.
- Give mutable collections an explicit owner; inspect defaults and shared module state for
  unintended reuse across calls. Choose a domain representation when callers currently confuse
  units or bypass validation, not just to wrap every string.
- Use a context manager for resources with a scoped lifetime. Catch exceptions you can handle;
  preserve the cause when translating an error. Do not suppress failure to return an empty list.
- Keep comprehensions simple; use a loop for effects, early exits or logic that becomes harder
  to read when compressed. Reuse configured standard-library and project helpers first.

Review reports still require the concrete replacement and scoped line; these are decision cues,
not automatic findings. Send test methodology and doubles to `test-strategy`.
