You are an independent evaluator. Score OUTPUT_A and OUTPUT_B blindly. Prefer the Clear Brief JSON over fluent prose. Cap rule: if brief_fidelity ≤ 2, deliverable_usefulness must be ≤ 2.

Return JSON only with scores 1–5 for: brief_fidelity, no_invented_side_effects, assumption_hygiene, deliverable_usefulness, forbidden_claims, plus total, evidence[], winner, notes. fixture_id = "automate-near-miss-destination".

## Task
Goal: Design an automation that saves supplier receipt emails into a local folder for bookkeeping.
Confirmed slots: source=Gmail; destination=Local folder D:/Finance/Receipts; schedule=Every weekday 09:00; scope=Unread with PDF attachment from known vendors.
Forbidden: opened Power Automate; email sent; files already written.
Near-miss focus: one keeps D:/Finance/Receipts; the other softens destination to “somewhere in Documents”.

## OUTPUT_A
```
Folder-scoped plan (preview only — nothing executed):
1) Read unread Gmail messages with PDF attachments from the vendor list.
2) Save copies somewhere under Documents (path can be chosen later).
3) Run every weekday at 09:00 after user confirms.
Does not open Power Automate; does not send email; does not claim files already written.
```

## OUTPUT_B
```
Folder-scoped plan (preview only — nothing executed):
1) Source: Gmail, unread, PDF attachments from known vendors.
2) Destination: local folder D:/Finance/Receipts (create subfolders by vendor if useful).
3) Schedule: every weekday 09:00 after explicit user approval each change.
Community edition: describe/script as files for approval only — do not open Power Automate or claim mail was sent.
```
