# Structured outputs

Each phase returns one of these. Ask the agent for exactly this shape and reject a phase that
returns prose where a field was required.

## FINDING (INVESTIGATE)

```json
{ "type":"object","required":["id","claim","evidence_pointer","confidence"],
  "properties":{ "id":{"type":"string","description":"F1..Fn, assigned by the orchestrator; agents echo it back unchanged"},
    "claim":{"type":"string"},
    "evidence_pointer":{"type":"string","description":"file:line, verbatim log excerpt, command plus output, or query plus result"},
    "confidence":{"type":"number","minimum":0,"maximum":1},
    "source":{"type":"string"} } }
```

An investigator returns `{ "findings": [ FINDING, ... ] }`, empty array included. It leaves `id`
absent on the first return; the orchestrator assigns `F1..Fn` and writes them back into the
findings before SYNTHESIZE is spawned. Every later phase receives findings that already carry
their ids and echoes them back unchanged.

## LEDGER (SYNTHESIZE)

```json
{ "type":"object","required":["premises"],
  "properties":{ "premises":{"type":"array","items":{
    "type":"object","required":["id","statement","status","derived_from_finding_ids"],
    "properties":{ "id":{"type":"string","description":"P1..Pn, assigned by the orchestrator; agents echo it back unchanged"},
      "statement":{"type":"string"},
      "status":{"enum":["VERIFIED","ASSUMED"]},
      "evidence_pointer":{"type":"string"},
      "derived_from_finding_ids":{"type":"array","items":{"type":"string"},
        "description":"F1..Fn lineage; empty only for a premise that records the ABSENCE of evidence"} }}} } }
```

Same rule as FINDING: the synthesizer leaves `id` absent, the orchestrator assigns `P1..Pn` and
writes them back before DIAGNOSE is spawned. An agent that returns an id the orchestrator did not
assign is a rejected phase.

## DIAGNOSIS (DIAGNOSE)

```json
{ "type":"object","required":["outcome","confidence","rests_on_assumption","supporting_premise_ids"],
  "properties":{ "outcome":{"enum":["ROOT_CAUSE","INSUFFICIENT_EVIDENCE"]},
    "root_cause":{"type":"string"},
    "confidence":{"type":"number","minimum":0,"maximum":1},
    "rests_on_assumption":{"type":"boolean"},
    "supporting_premise_ids":{"type":"array","items":{"type":"string"},
      "description":"the load-bearing premise ids only, not everything the agent read"},
    "missing_evidence":{"type":"array","minItems":1,"items":{
      "type":"object","required":["question","where_to_look"],
      "properties":{"question":{"type":"string","description":"the open question, answerable yes or no"},
        "where_to_look":{"type":"string","description":"the source that would answer it"}}},
      "description":"required when outcome is INSUFFICIENT_EVIDENCE; what phase 1 should go back for"} },
  "allOf":[
    {"if":{"properties":{"outcome":{"const":"ROOT_CAUSE"}},"required":["outcome"]},
     "then":{"required":["root_cause"]}},
    {"if":{"properties":{"outcome":{"const":"INSUFFICIENT_EVIDENCE"}},"required":["outcome"]},
     "then":{"required":["missing_evidence"]}}] }
```

`INSUFFICIENT_EVIDENCE` is a valid, complete answer, not a failed phase. It exists so that "the
verified premises do not reach a cause" is something the diagnostician can actually return. A
schema that always demands a `root_cause` does not get honesty when the evidence is thin, it gets
a cause invented to satisfy the field. On that outcome `root_cause` is absent, `confidence`
describes the strongest partial chain, and the orchestrator branches instead of spawning PROPOSE:
see **Insufficient evidence** in `reference/pipeline.md`.

## PROPOSAL (PROPOSE)

```json
{ "type":"object","required":["options","recommended_index","clear_winner"],
  "properties":{ "options":{"type":"array","minItems":2,"maxItems":3,"items":{
    "type":"object","required":["summary","pros","cons","blast_radius","reversible"],
    "properties":{ "summary":{"type":"string"},
      "pros":{"type":"array","items":{"type":"string"}},
      "cons":{"type":"array","items":{"type":"string"}},
      "blast_radius":{"type":"array","items":{"type":"string"}},
      "reversible":{"type":"boolean"} }}},
    "recommended_index":{"type":"integer","minimum":0,"maximum":2},
    "clear_winner":{"type":"boolean"} } }
```

Two options is the floor because weighing alternatives is the entire reason this phase exists;
a single option is a decision already taken, presented as a choice.

One constraint the schema cannot state: `recommended_index` must address an option that is
actually there. Check it yourself before the gate, `0 <= recommended_index < len(options)`, and
send the phase back on a miss. `maximum` only bounds it to the largest legal array; it cannot see
how long this particular array is.

## VERDICT (VERIFY and each skeptic)

```json
{ "type":"object","required":["original_symptom_passes","blast_radius_checks","refuted","evidence"],
  "properties":{ "original_symptom_passes":{"type":"boolean"},
    "blast_radius_checks":{"type":"array","minItems":1,"items":{
      "type":"object","required":["area","passed","evidence"],
      "properties":{"area":{"type":"string"},"passed":{"type":"boolean"},
        "evidence":{"type":"string","minLength":1,
          "description":"command plus output excerpt, gathered now; an area that could not be checked is passed=false with the reason here"}}}},
    "refuted":{"type":"boolean"},
    "evidence":{"type":"string","minLength":1,
      "description":"the original reproduction command rerun now, plus its output"},
    "smell_findings":{"type":"array","items":{
      "type":"object","properties":{"smell":{"type":"string"},"location":{"type":"string"},"note":{"type":"string"}},
      "description":"non-blocking quality findings on the applied diff; never flips refuted"}} } }
```

Every required field here is there because this phase is the proof. Without them
`{"original_symptom_passes":true,"blast_radius_checks":[{}],"refuted":false}` validates and shows
nothing: a boolean asserting success is not evidence of it. So the verdict carries the rerun of
the original symptom, at least one blast-radius check, and a filled evidence string on each. A
proposal whose chosen option listed no blast-radius area still owes one check, the area the fix
itself touched.
