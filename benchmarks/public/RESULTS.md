# Benchmark results (public)

Self A/B + LLM-as-judge for Userward Clear Brief. **Not** a ChatGPT UI token comparison.

## Suite
- Fixtures: `benchmarks/fixtures/*.json` (14+ including near-miss and hard-block)
- Rubric: `benchmarks/CHATGPT_RUBRIC.md` (1–5 anchors + usefulness cap)
- Paste packs: `benchmarks/public/PASTE_*.md`
- Offline token estimate: `npm run bench:fixtures` → `benchmarks/out/summary.json` (local only)

## Easy contrast — `write-gtm-bitcoin` / `PASTE_easy-write-gtm.md`

| Judge | Winner | A total | B total | Notes |
|---|---|---:|---:|---|
| Claude | B | 6 | 25 | A hits forbidden claims + fake price; B honors brief |
| Gemini | B | 5 | 25 | Same direction; A usefulness=1 |

**Mapping (revealed after scoring):** OUTPUT_A = naive · OUTPUT_B = userward-like

**Verdict:** Rubric sanity-check **pass**. Easy case closed.

## Near-miss packs (discrimination)

Paste into an independent judge (ChatGPT / Claude / Gemini). Fill scores below after runs.

| Fixture | Paste file | Expected stronger side | Judge scores (fill in) |
|---|---|---|---|
| wrong channel | `PASTE_near-miss-channel.md` | B (LinkedIn) over A (TikTok) | _pending_ |
| unlabeled assumption | `PASTE_near-miss-assumption.md` | B (labeled) over A (silent 14-day plan) | _pending_ |
| softened destination | `PASTE_near-miss-destination.md` | B (`D:/Finance/Receipts`) over A (Documents TBD) | _pending_ |

**Private mapping for near-miss packs:** in each file, A is the near-miss weaker variant; B is the Clear-Brief-faithful variant. Reveal only after the judge returns JSON.

## How to reproduce
1. Open a `benchmarks/public/PASTE_*.md`, copy all, paste into the judge model.
2. Record the JSON scores in a PR / issue or update this table.
3. Optional: `npm run bench:fixtures` for in-app packed vs free-format token estimates.

## Claims allowed
- Independent judges agree on easy Clear Brief contrast.
- Fixture harness + paste packs are public and replayable.

## Claims avoided
- “Beats ChatGPT UI on tokens.”
- “Human panel validated” (unless humans also scored).
