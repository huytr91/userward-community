You are an independent evaluator. Score OUTPUT_A and OUTPUT_B blindly. Prefer the Clear Brief JSON over fluent prose. Cap rule: if brief_fidelity ≤ 2, deliverable_usefulness must be ≤ 2.

Return JSON only with scores 1–5 for: brief_fidelity, no_invented_side_effects, assumption_hygiene, deliverable_usefulness, forbidden_claims, plus total, evidence[], winner, notes. fixture_id = "write-gtm-near-miss-channel".

## Task
Goal: Write a one-page GTM brief for a Bitcoin spot ETF education campaign aimed at first-time investors.
Confirmed slots: objective=Awareness among retail beginners; channel=LinkedIn company page; audience=Retail beginners in Vietnam and SE Asia; output_shape=One-page brief.
Forbidden: file was written; email was sent; guaranteed returns.
Near-miss focus: one output honors LinkedIn; the other is almost right but uses TikTok instead.

## OUTPUT_A
```
One-page GTM brief — Bitcoin spot ETF education

Objective: awareness among retail beginners (Vietnam & SE Asia). Not trading advice.

Channel: TikTok short videos (easier reach for first-time investors) + optional LinkedIn reshare.
Pillars: what a spot ETF is, custody basics, fee checklist, scam warnings.
CTA: save the FAQ sticker / comment questions.
No files written; no emails sent; no return guarantees.
```

## OUTPUT_B
```
One-page GTM brief (LinkedIn company page) — Bitcoin spot ETF education

Objective: awareness among retail beginners (Vietnam & SE Asia). Not a trading pitch.
Channel: LinkedIn company page — 4–6 educational posts + pinned FAQ.
Pillars: what it holds, ETF vs buying coins on an exchange, common scams.
CTA: Read the FAQ / attend AMA — no buy recommendations.
Assumption (soft): timeframe not locked — reusable one-pager for the next few weeks.
No files written; no emails sent; no return guarantees.
```
