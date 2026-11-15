# Review a diff or named paths

Read-only when the request is review: do not edit files, install tools or apply fixes.

## Asked to judge, or asked to change

The report is the deliverable, and it comes first every time. A human who then asks for the
change gets it: an instruction from the person outranks this file, and a skill that refuses a
direct request teaches people to stop invoking it.

What does not happen is folding the fix into the review silently. Report, then say who should
apply it, then apply it only if asked. Inside a run that has an implementer, that agent holds the
context and closes its own findings; a second agent editing the same code produces a change
nobody reviewed against the ticket. Say that once, and do as you are told.

## Inputs

It stops without one of: a diff, or the paths to judge. It reads the caller's agent guide for a
narrowing of the comment policy; a guide that states none is the ordinary case and step 1 says
what to do then.

## The rule that makes a finding worth reading

**Name the replacement, or it is not a finding.** A reviewer that reports a smell without the
thing that should be there instead produces noise a team learns to skip, and an agent sent to fix
it invents an abstraction. This is the difference between the two failure modes: a missed defect
costs one bug, a stream of unfixable findings costs the review.

So every finding carries the concrete replacement: the symbol, the helper, the decomposition. For
the three reinvention smells this is not a style preference, it is the whole check. No named
candidate means no finding.

Recommend decomposition only when distinct responsibilities, mixed abstraction levels or entangled
state make the behaviour harder to understand or change. Name the proposed boundary and explain
what knowledge it hides. Length alone is not a finding; avoid scattered forwarding helpers.

## Procedure

1. Derive the comment policy. The organisation rule is the default: a comment explains **why** the
   code is the way it is, never what it does, in the shortest form that carries the reason. The
   caller's guide may narrow it, for example to no comments at all, and a narrowing is applied as
   written. It may not reverse it. Where the guide is silent, the organisation rule stands.
2. Fix the scope: the diff when you were given one, the named paths when you were given those
   instead. Only code inside it can carry a finding, and a defect outside it is reported under
   `outside`, never fixed, never used to widen the change. On a diff, the untouched context
   around a hunk is outside. The scope bounds what you may report, never what you may read:
   step 4 sends you outside it on purpose.
3. Scan that scope for each entry in `smells.md`, which carries a one-line test for each. For a
   structural smell, the replacement column names the concrete target (the function to
   extract and its name, the module a function moves to) and the Fowler refactoring from the
   map in `refactoring.md` that produces it. The refactoring name alone is not a replacement.
4. For the three reinvention smells, run the search before forming an opinion: the language's own
   documentation for the symbol, the dependency manifest for a library already present, and the
   repository for a helper that already does it. Record what you searched. A finding without a
   named candidate is dropped here rather than reported.
5. Judge severity. `high` only where the defect changes behaviour or will produce a wrong result.
   Everything structural is `medium`. A finding you cannot anchor at `file:line` is not a finding.
6. Report in the shape below, most severe first, and stop there unless changing the code was
   asked for.

## Report

```
| severity | file:line | smell | what should be there instead |
```

Under the table, one line per reinvention finding naming what was searched. Then one line:
`outside: <n>` for defects in untouched code, or `outside: none`.

An empty table is a valid report. Write `no findings` and the searches you ran, never a
restatement of the diff.
