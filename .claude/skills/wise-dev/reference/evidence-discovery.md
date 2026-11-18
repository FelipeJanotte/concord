# Discovering evidence sources when no playbook fits

Enumerate the sources from the repository itself before forming any belief. One investigator per
source.

1. **The error in full.** Read the complete error and stack trace, and any log the failure
   wrote. Never infer a cause from the message alone.
2. **Reproduction.** Find and run the exact command that triggers the failure, using the command
   the caller's `CLAUDE.md` or `AGENTS.md` states. If it cannot be reproduced, gather more
   evidence. Do not guess.
3. **Recent changes.** `git log --oneline -20` and the diff of the touched area. What changed
   immediately before the symptom appeared. Derive the base branch before diffing against it.
4. **Backwards trace.** Follow the bad value to its origin. Where is it first introduced, and
   what was it before that.
5. **Tests.** Locate the relevant subset and run it with the repository's stated command.
6. **CI.** `gh workflow list` and the most recent failing run. Zero workflows is a real answer
   and means the local run is the only proof available.
7. **Connected tools.** List the connected MCP servers. If one exposes the failing system, a
   database, a deployment or an observability stack, query it rather than assuming its contents.

Every finding returns `{claim, evidence_pointer, confidence}`. The pointer is a `file:line`, a
verbatim log excerpt, a command with its output, or a query with its result. It is never a
sentence beginning with "I think".
