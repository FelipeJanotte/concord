---
name: wise-dev
description: Investigate a reported bug, failure or regression through independent evidence, diagnosis and proposal phases. Fix only when requested, with the risk gate and original-symptom proof. Uses evidence-based-diagnosis for causal reasoning. Planned work belongs to task-executor; explicit assessment of an existing causal claim belongs to evidence-based-diagnosis.
---

# Wise Dev

Category: procedure. This skill requires `evidence-based-diagnosis` for causal reasoning.
Read its method in FRAME and supply it to evidence and diagnosis phases without changing their
role boundaries or the output schemas owned here.

A phased debugging procedure. It gathers evidence before forming a belief, marks every belief
VERIFIED or ASSUMED, diagnoses only on VERIFIED ones, weighs fix options by blast radius, and
proves the fix on the original symptom before declaring it done.

It requires the `code-quality` skill: the verifier names quality findings from that skill's
vocabulary, so the two install together.

## When to use

- A bug, a test failure, a failed job, a regression, an error in a deployed environment.
- A previous fix that did not hold.
- Before committing a fix whose cause you inferred rather than observed.

When a previous correction failed, load `../evidence-based-diagnosis/reference/hypothesis-reset.md` in FRAME before another
proposal. Pass its attempt record and next evidence question to INVESTIGATE. A failing test
expected during RED is not a failed correction.

Do not use it for features, refactors or migrations planned in advance. Unsettled requirements
go to `spec-driven`; one agreed task goes to `task-executor`; a published epic with sub-issues
goes to `epic-run`. Report the matching handoff rather than executing planned work through these
diagnostic phases or inventing an epic. A diagnosis delegated by an executor returns to that
same caller with evidence and unchanged scope, not a new execution workflow.

Do not build a prototype inside an investigation. An investigation establishes facts about a
system that already exists; a prototype is constructed evidence and cannot prove a root cause. If
the cause is VERIFIED but the *desired replacement behaviour* is still an open design question,
close the investigation and hand that question off.

## Mandate: were you asked to explain, or to change

Being asked *why* something is broken is not being asked to change it. The triggers that select
this skill include plain questions, so the request itself decides how far the run goes. Establish
the mandate in FRAME, from the words of the request, and write it into the report:

- **Fix mandate**: the request says to fix, repair, correct, unbreak, make it pass, make it work,
  or the human approves an option at the gate.
- **Diagnosis mandate**: an explanation request without a request to change, or ambiguous intent.
  Classify by the requested action, not punctuation: "can you fix this?" is a fix request;
  "why did this fail?" is diagnosis only.

Under a diagnosis mandate the run ends after PROPOSE. Report the root cause and the options,
leave the working tree untouched, and ask whether to implement. **Refuse to enter IMPLEMENT
without a fix mandate.** A high confidence score and a false risk flag do not substitute for one:
they say the fix would be safe, never that the human wanted one. Editing the tree of someone who
asked a question is the failure this rule exists to prevent, and it is not softened by the fix
being correct.

Auto-advance past the gate is legitimate only under a fix mandate.

## Before phase 1: derive the repository

Nothing about the caller's repository may be assumed. Derive it, every run:

```bash
git rev-parse --show-toplevel                                  # the repo root; all work is confined here
gh repo view --json nameWithOwner --jq .nameWithOwner           # the repository
gh repo view --json defaultBranchRef --jq .defaultBranchRef.name  # the base branch; it is not always main
```

Then read the caller's own `CLAUDE.md` and `AGENTS.md` before running anything: the root guide
and the nearest guide above each file the work touches. The nearest guide wins for the paths it
covers; where it is silent, the root applies. A nested guide is loaded by the tool only when work
happens in that subtree, so read it deliberately rather than assuming it was injected. **Never
emit a build, test, lint or deploy command of your own.** Every repository here wraps its toolchain
differently and some wrap it in a script that exists nowhere else. Use the command that
repository states. If neither file states one, stop and ask the human for it rather than
guessing at a test runner.

## The phases

Eight phases, run in order, a fresh subagent for each, with one conditional gate between
PROPOSE and IMPLEMENT. A phase reads only what the previous phase returned. The barrier
between phases is what keeps the reviewer from being the author.

| # | Phase | Agents | Output |
|---|---|---|---|
| 0 | FRAME | you, inline | Repo derived, intensity chosen, evidence playbook loaded, risk flag set. Abort immediately if the problem statement is empty rather than investigating a vacuum |
| 1 | INVESTIGATE | 1 per evidence source | `findings[]`, each with a concrete evidence pointer |
| 2 | SYNTHESIZE | 1 | Premise ledger: every belief VERIFIED or ASSUMED |
| 3 | DIAGNOSE | 1 | Root cause, confidence, whether it rests on an assumption. Or INSUFFICIENT_EVIDENCE and what is missing, which does not advance to PROPOSE |
| 4 | PROPOSE | 1 | 2 or 3 options with pros, cons, blast radius, reversibility |
| - | GATE | conditional | Stop and ask the human, or proceed |
| 5 | IMPLEMENT | 1 | Fix mandate required. The approved option only, red proof before green proof |
| 6 | VERIFY | 1, plus skeptics on ultra | Original symptom rerun, blast radius checked |
| 7 | COMPOUND | 1 | One lesson, and where it should be written down |

Every agent prompt you send carries a REPOSITORY block naming the repo root you derived in
FRAME and instructing the agent to confine every read, grep and command to it. A phase spawned
without that block is a rejected phase.

Inspect the host's available delegation schema before dispatch. Put the role, authority and
output contract in supported instruction fields; when only a task/prompt field exists, include
them there. Do not invent a system-message parameter. A host without fresh subagents may use
fresh non-interactive CLI sessions with the same restricted evidence. If neither is available,
stop with an independence-capability gap; never present self-review as independent verification.

Each phase's full agent prompt is in `reference/agents/`. Load a prompt when you reach that
phase, not before. VERIFY needs one thing more: read the `code-quality` skill's
`reference/smells.md` yourself and paste it into the verifier's prompt. The verifier is confined
to the target repository and a skill is installed outside it, so a path is the one thing it
cannot follow. Sent no vocabulary, it reports no smell and the run looks normal. The structured outputs each phase returns are in `reference/schemas.md`; the
per-phase contract detail this table does not carry is in `reference/pipeline.md`.

Assign ids yourself, never the agents: `F1..Fn` to findings after INVESTIGATE, `P1..Pn` to
premises after SYNTHESIZE. Parallel investigators cannot collide that way, and the lineage from
a diagnosis back to the log line that produced it stays intact.

Assigning is not enough: write the ids back into the payload. Before spawning SYNTHESIZE,
rewrite each finding with its `id`. Before spawning DIAGNOSE, rewrite each premise with its
`id`. An agent cannot cite a lineage it was never shown, and an agent that returns an id you did
not assign is a rejected phase.

## Intensity

`lite`, `full` or `ultra`. Choose it mechanically in FRAME:

- **lite** when all three hold: the symptom reproduces with a single command the caller's
  `CLAUDE.md` or `AGENTS.md`, root or nearest, already states, the likely change is one module, and the risk flag
  below is false. One investigator, no skeptic panel.
- **full** when any of those fails, and whenever you cannot tell. Fan out INVESTIGATE, one agent
  per evidence source.
- **ultra** only on request, or after a fix already failed once. Full, plus three independent
  skeptics in VERIFY. Two or three refutations kill the claim and send it back to PROPOSE. One
  refutation out of three does not kill the claim and is never discarded: report it verbatim
  under UNRESOLVED REFUTATION and hand it to the human with the closing question. See
  `reference/pipeline.md`.

## The gate

Stop and hand the proposal to a human, before IMPLEMENT, if **any** holds:

- the mandate is diagnosis, not fix. This one is a full stop, not a question: there is no
  answer to the closing question that turns it into an approval, only a new request from the
  human saying to fix it;
- the risk flag is true;
- diagnosis confidence is below 0.8;
- the diagnosis rests on an ASSUMED premise;
- two or more options are genuinely comparable and there is no clear winner.

Otherwise proceed. Set the risk flag in FRAME when any holds:

- the fix would touch deploy, migration, schema or state-mutating code;
- the problem statement or the proposed change contains any of: deploy, migration, migrate,
  prod, production, drop, delete, truncate, billing, auth, secret, credential;
- gathering the evidence would require running a command the caller's `CLAUDE.md` or `AGENTS.md`,
  root or nearest, marks as touching production. Never run one to gather evidence. Record it as skipped and let
  that force the gate.

The gate is a stop, not a note. Do not implement past it, and do not soften a low confidence
score to avoid it.

Resuming after approval: recheck `git rev-parse HEAD`. If it moved since the proposal was
written, say so and get explicit confirmation or restart at INVESTIGATE. The proposal was
written against code that no longer exists.

## What counts as proof

- **Red before green.** The implementer writes or identifies a test that reproduces the symptom
  and records it failing, *before* the fix. A test that never went red proves nothing. If a red
  proof is impossible, that goes in DEVIATIONS in words, never faked.
- **Fresh execution.** The verifier reruns the original reproduction command now, in the current
  state, and quotes the output. Reasoning from the diff is not verification.
- **Zero checks is not approval.** If any part of the proof leans on CI, derive whether the repo
  has any: `gh workflow list` or `ls .github/workflows`. Some repositories here have none. When
  there are none, say plainly that this repository runs no checks and that the entire proof is
  the local run. Never report an absent CI as green, and never wait on it.
- **Refuted by default.** The verifier starts from "not fixed" and flips only on evidence. A
  check that could not be run is a refutation, not a gap.

## Close the loop

Under a diagnosis mandate there is nothing to close: report the cause and the options, and ask
whether they want it fixed. The rest of this section applies to a run that implemented something.

At the end of every run that changed the tree, ask the human one question, in plain words,
never in the vocabulary of this skill. Show them first, in one sentence each: what changed, the
proof it works, and the proof it is that change that works. Then ask:

> Did this land? good / partly / no / not sure

If an ultra run carried an UNRESOLVED REFUTATION, show it verbatim before that question.

And only when the answer is not "good": *what was missing, in one sentence?*

You do the interpreting. Their sentence tells you which phase went wrong first: the evidence you
did not gather, the premise you marked VERIFIED too easily, the diagnosis, the option, the
implementation, or the verification. Say which one, in your own report. That is the whole
compounding step now that the ledger did not come along: a wrong run that nobody localises to a
phase teaches nothing.

## Reference

| Need | Read |
|---|---|
| The phase contract in full | `reference/pipeline.md` |
| A correction failed or the investigation repeats the same explanation | `../evidence-based-diagnosis/reference/hypothesis-reset.md` |
| The structured output of each phase | `reference/schemas.md` |
| The prompt for the phase you are on | `reference/agents/{investigator,synthesizer,diagnostician,proposer,implementer,verifier,skeptic,compounder}.md` |
| Where evidence lives in Concord | `reference/evidence-concord.md` |
| No playbook fits, discover the sources | `reference/evidence-discovery.md` |
