# Phase contract

The phase list, its agents and its outputs live in one place only: the table in `README.md`. This
file carries the per-phase detail that table does not, and nothing else. If the two ever say the
same thing twice, delete it here.

One subagent per phase, spawned fresh. Between phases there is a barrier: the next phase starts
only when the previous one has returned, and it receives that return value, not the transcript.
Within a phase, parallelise freely.

## Per-phase detail

- **1 INVESTIGATE.** Each agent owns exactly ONE evidence source and returns facts only. No
  theorising, no fixes. On `full` and `ultra` that is one agent per source; on `lite` it is one
  agent total.
- **3 DIAGNOSE.** The diagnosis names the load-bearing premise ids and no others. It has two
  representable outcomes and you must branch on which one came back. See **Insufficient
  evidence** below.
- **5 IMPLEMENT.** Red proof, then the fix, then green proof. The implementer self-reports
  DEVIATIONS and LEAST-CONFIDENT.
- **6 VERIFY.** The verifier starts at the implementer's LEAST-CONFIDENT item, reruns the
  original symptom, then checks each blast-radius area.
- **7 COMPOUND.** One lesson, plus the file in the caller's repo where it belongs.

## Ids

You assign them, not the agents. `F1..Fn` to findings once INVESTIGATE has returned, `P1..Pn` to
premises once SYNTHESIZE has returned. Agents that mint their own ids collide when they run in
parallel, and the lineage from a diagnosis back to the evidence is what lets a bad run be
localised later.

Write them back into the payload before the next phase runs. Before spawning SYNTHESIZE, rewrite
each finding with its `id`. Before spawning DIAGNOSE, rewrite each premise with its `id`. An
agent that returns an id you did not assign is a rejected phase.

## Cross-checks you run, not the agents

- If any premise id in `diagnosis.supporting_premise_ids` is ASSUMED in the ledger, force
  `rests_on_assumption` to true regardless of what the diagnostician returned.
- If `diagnosis.supporting_premise_ids` names an id that is not in the ledger, send the phase
  back rather than proceeding on a premise nobody wrote.

## Insufficient evidence

`ROOT_CAUSE` is not the only valid DIAGNOSE outcome. `INSUFFICIENT_EVIDENCE` says the verified
premises do not reach a cause, and it carries `missing_evidence`: the open questions and where
each would be answered. It is a correct result, not a failed phase, and it is what the phase
returns instead of a cause invented to fill the required field.

On `INSUFFICIENT_EVIDENCE`, never spawn PROPOSE. Branch instead:

- **Collect discriminating evidence.** Use the required `evidence-based-diagnosis` skill's failed-correction reference to select a bounded,
  authorized step addressing `missing_evidence`. Re-run INVESTIGATE for that question, then
  SYNTHESIZE and DIAGNOSE with the new observations. No additional proposal while the causal gap
  remains unsupported.
- **Hand back a concrete blocker.** When no discriminating step is available within the mandate,
  access or agreed budget, report the ledger and the specific evidence or decision needed. State
  that the cause is not established. The reset reference defines the progress and stopping test;
  the number of inconclusive diagnoses alone does not establish an external blocker.

## Skeptic refutations on ultra

Count the skeptics, and act on the count:

- **Two or three refutations** kill the claim. Send it back to PROPOSE with the refutations
  attached.
- **One refutation out of three** does not kill the claim and is never discarded. Report it
  verbatim under the heading `UNRESOLVED REFUTATION`, naming the skeptic's specific failure mode,
  and hand it to the human alongside the closing question in **Close the loop**. A run reaches
  ultra because a fix already failed once, so a single dissent is the last place to drop
  evidence.
- **Zero refutations** is the only state in which the fix is reported as verified with nothing
  outstanding.

## When the approved option is too big

A proposal option that spans several modules and needs its own plan is not a surgical fix. Stop
at the gate and say so. There is nowhere to forward it: planned work starts from a published
epic with sub-issues, which does not exist yet. Report the diagnosis, the option and its shape,
and tell the human that cutting that epic is the next step. Do not open one yourself, and do not
force the option through IMPLEMENT, which produces a change nobody can verify against the
original symptom.
