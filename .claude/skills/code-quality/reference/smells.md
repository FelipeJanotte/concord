# Code smells (Fowler, Refactoring)

Reviewers scan the supplied scope for each and report by name with file:line and a concrete
replacement. Untouched code belongs under `outside`, not in the findings table. Consider the
language idiom and the object's role before applying a smell.

| Smell | One-line test |
|-------|---------------|
| Mysterious Name | You must read the body to know what the name means. |
| Duplicated Code | Same shape in 2+ places; a change must be repeated. |
| Long Function | Distinct responsibilities or mixed abstraction levels obscure behaviour; name a cohesive extraction, not a line-count target. |
| Long Parameter List | Callers assemble ritual arguments; some travel together always. |
| Global Data | Mutable state reachable from anywhere. |
| Mutable Data | A value changed from afar breaks a distant reader. |
| Divergent Change | One module edited for many unrelated reasons. |
| Shotgun Surgery | One reason forces edits across many modules. |
| Feature Envy | A function talks to another object's data more than its own. |
| Data Clumps | The same field trio keeps traveling together unnamed. |
| Primitive Obsession | Bare values let callers mix units or bypass domain invariants; name the representation that prevents the observed error. Simple transport fields need no wrapper by default. |
| Repeated Switches | The same switch/if-chain over a type code appears in multiple places. |
| Loops (vs pipeline) | Index bookkeeping obscures intent and a language-idiomatic replacement improves clarity; explicit loops for effects, early exit or clear Go iteration are valid. |
| Lazy Element | A class/function that no longer earns its existence. |
| Speculative Generality | Hooks and parameters for a future that never came. |
| Temporary Field | A field meaningful only during one operation. |
| Message Chains | `a.b().c().d()` — navigation coupled to structure. |
| Middle Man | A class that only forwards. |
| Insider Trading | Modules whispering through internals instead of interfaces. |
| Large Class | Too many fields; unrelated responsibilities cohabiting. |
| Data Class | Domain invariants scattered across callers of a data holder; DTOs, records, serialization shapes and Go structs with package functions are not defects merely for holding data. |
| Refused Bequest | Subclass ignores or stubs most of what it inherits. |
| Comments as Deodorant | A comment explaining code that should be rewritten to not need it. |

## Three the catalogue names itself

Each of these checks requires a search and a named candidate, as defined in `review.md`.
Do not infer that an existing helper or library fits from its name alone; compare its contract.

| Smell | One-line test |
|-------|---------------|
| Reinvented Wheel | A block whose whole behaviour is one call in the language's own library, or in a dependency the repository already has. Name the symbol, or drop the finding. |
| Unearned Dependency | A new entry in the dependency manifest for behaviour that is a few lines here. Name the lines it replaces, and say what the dependency costs to keep. |
| Unsearched Helper | A helper written where the repository already has one. Name the existing helper and its path, or drop the finding. |

A repository that states its own reuse doctrine narrows these. Where its guide names an inventory
of canonical helpers, that inventory is what "already has one" means, and the search starts there.

**Architecture-level companion (Ousterhout):** prefer **deep modules** — small interface, lots of functionality behind it. A cluster of shallow pass-through files with test boundaries around every tiny function is itself a finding: name it "shallow module cluster", suggest the deep boundary.
