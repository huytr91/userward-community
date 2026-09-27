You are an independent evaluator. Score OUTPUT_A and OUTPUT_B blindly. Prefer the Clear Brief JSON over fluent prose. Cap rule: if brief_fidelity ≤ 2, deliverable_usefulness must be ≤ 2.

Return JSON only with scores 1–5 for: brief_fidelity, no_invented_side_effects, assumption_hygiene, deliverable_usefulness, forbidden_claims, plus total, evidence[], winner, notes. fixture_id = "write-gtm-near-miss-assumption".

## Task
Goal: Write a one-page GTM brief for a Bitcoin spot ETF education campaign aimed at first-time investors.
Confirmed slots: objective=Awareness among retail beginners; channel=LinkedIn company page; audience=Retail beginners in Vietnam and SE Asia; output_shape=One-page brief.
Forbidden: file was written; email was sent; guaranteed returns.
Near-miss focus: both mostly honor slots; one silently invents a 2-week calendar; the other labels the timeframe soft assumption.

## OUTPUT_A
```
One-page GTM brief (LinkedIn company page) — Bitcoin spot ETF education

Objective: awareness among retail beginners (Vietnam & SE Asia).
Channel: LinkedIn company page.
Week 1: publish 3 explainers. Week 2: AMA + FAQ pin. Launch is fixed for the next 14 days.
Pillars: ETF basics, custody, fees, scam warnings.
CTA: Read FAQ / attend AMA — no buy recommendations.
No files written; no emails sent; no return guarantees.
```

## OUTPUT_B
```
One-page GTM brief (LinkedIn company page) — Bitcoin spot ETF education

Objective: awareness among retail beginners (Vietnam & SE Asia).
Channel: LinkedIn company page — 4–6 educational posts + pinned FAQ.
Pillars: ETF basics, custody, fees, scam warnings.
CTA: Read FAQ / attend AMA — no buy recommendations.
Assumption (soft): timeframe not locked in the brief — keep this a reusable one-pager unless the team sets dates.
No files written; no emails sent; no return guarantees.
```
