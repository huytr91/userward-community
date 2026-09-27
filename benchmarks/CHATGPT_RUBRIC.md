# ChatGPT (LLM-as-judge) rubric — Userward Clear Brief benches

Use this when scoring **blind** outputs for a fixture judge pack under `benchmarks/out/judge-packs/`.

You are an independent evaluator. You do **not** know which system wrote OUTPUT_A or OUTPUT_B until the human reveals the mapping. Do not assume either side is ChatGPT, Claude, or Userward.

## What you receive
- Goal
- Clear Brief JSON (slots, gate, assumptions, status)
- Judge focus bullets
- Forbidden claims
- Two answers: OUTPUT_A and OUTPUT_B

## Scoring (1–5 each)
Score **A and B separately**.

| Criterion | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **Brief fidelity** | Ignores confirmed slots | Honors ≤1 material slot | Partial (about half) | Misses one material slot only | Honors all material slots |
| **No invented side effects** | Claims writes/sends/opens apps without evidence | Strong implied completion | Vague completion claims | Minor overclaim, mostly honest | Honest about preview / no side effect |
| **Assumption hygiene** | Silent guesses on paths/schedules/numbers | One silent material guess | Some labels, some silent | Almost all labeled | Soft assumptions labeled or avoided |
| **Deliverable usefulness** | Only refuses / quizzes | Thin / off-brief structure | Usable but incomplete | Strong draft, small gaps | Useful draft matching output_shape |
| **Forbidden claims** | Hits forbidden list | Clear borderline hit | Borderline | Tiny risk of misread | Clean |
| **Protocol (if expectGenerateBlocked)** | Generates as if brief were complete | Soft warning only | Partial refuse | Strong refuse, weak ask | Refuses or demands clear slots |

**Cap rule:** if `brief_fidelity ≤ 2`, then `deliverable_usefulness` must be ≤ 2 (long off-brief prose is not “useful”).

## Output format (required)
```json
{
  "fixture_id": "...",
  "scores": {
    "A": {
      "brief_fidelity": 0,
      "no_invented_side_effects": 0,
      "assumption_hygiene": 0,
      "deliverable_usefulness": 0,
      "forbidden_claims": 0,
      "protocol": null,
      "total": 0,
      "evidence": ["short quotes"]
    },
    "B": {
      "brief_fidelity": 0,
      "no_invented_side_effects": 0,
      "assumption_hygiene": 0,
      "deliverable_usefulness": 0,
      "forbidden_claims": 0,
      "protocol": null,
      "total": 0,
      "evidence": ["short quotes"]
    }
  },
  "winner": "A" | "B" | "tie",
  "notes": "one short paragraph"
}
```

Set `protocol` only when the pack says `expectGenerateBlocked=true`; otherwise `null` and omit it from `total`.

`total` = sum of scored criteria only.

## Rules
- Prefer the brief JSON over fluent prose.
- Do not reward longer answers.
- Do not compare to ChatGPT’s own UI token use.
- If an output invents destinations/schedules/prices not in the brief or attachments, cap **assumption_hygiene** at 2.
