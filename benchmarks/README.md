# Userward benchmarks (fixtures + independent judge)

This folder supports **self A/B proof** for Clear Brief + minimum context — not a ChatGPT UI bake-off.

## What is here
- `fixtures/` — fixed multi-domain tasks (goal, interview answers, expected gate). Cursor/agents must **not** improvise new goals when measuring.
- `CHATGPT_RUBRIC.md` — paste into ChatGPT (or another judge) with a judge pack.
- `out/` — generated locally by the runner (gitignored): briefs, summary, judge packs.

## Public paste packs + results
- `public/PASTE_*.md` — copy into ChatGPT/Claude/Gemini as independent judges
- `public/RESULTS.md` — aggregated scores (easy case filled; near-miss pending your runs)
- Rubric includes 1–5 anchors and a usefulness cap when brief fidelity is low

## Offline run (no API key)
```bash
npm run bench:fixtures
```
Writes:
- `out/summary.json` — protocol checks + estimated packed vs free-format tokens
- `out/briefs/*.json` — Clear Brief artifacts
- `out/judge-packs/*.md` — blind A/B templates for ChatGPT

Negative fixture `hard-missing-destination` must **fail** generate validation (`expectGenerateBlocked`).

## How you use Cursor + ChatGPT
1. Keep fixtures fixed (edit JSON only when intentionally changing the suite).
2. Run Userward (or any baseline) on the same goal + brief; paste answers into the judge pack placeholders (`OUTPUT_A` / `OUTPUT_B`).
3. Paste `CHATGPT_RUBRIC.md` + one `judge-packs/*.md` into ChatGPT.
4. Reveal the A/B mapping only after scores are returned.
5. Optional live token measure (separate, needs your key): `node scripts/measure-token-savings.mjs`

## Claims you may make
- “Same fixtures, Userward packed prompt vs in-app free-format baseline (estimate).”
- “Independent LLM-as-judge (ChatGPT) on blind A/B with Clear Brief attached.”

## Claims to avoid
- “Beats ChatGPT UI on tokens” (not measured here).
- “Human-validated quality” (unless humans also scored).

## Privacy
Do not paste secrets, real mailbox contents, or customer PII into ChatGPT. Fixtures use synthetic extras only.
