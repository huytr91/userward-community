# BUSINESS REQUIREMENTS DOCUMENT  
## Userward Local — Adaptive Self-Upgrade (Tiers 1 · 2 · 3)  
### Behavior adaptation · Sandboxed self-code · Product-face repair · External verification

| Field | Value |
|--------|--------|
| **Feature ID** | `UW-ASI` |
| **Version** | 2.0 |
| **Product** | Userward Local (AI efficiency) |
| **Status** | T1 P1 shipped · T2/T3 engine shipped (CLI, sandbox, gates, archive, preview, promote/rollback) · in-app A/B + Companion bridge next |
| **Depends on** | BRD v2 §0.7; Personal Pack; Role routing; Answer Quality; Comment→chat; BYO keys; Quality-70 + contract tests |
| **Code** | T1: `app/lib/adaptive-preferences.ts`, `app/page.tsx` (comment → learn, chip, Settings). T2/T3: `scripts/asi/{policy,core,llm,ui-audit,improve,manage}.mjs`. Tests: `tests/adaptive-preferences.test.ts`, `tests/asi-scripts.test.mjs` |

**Product name (UI):** Adaptive preferences & self-upgrade  
**Priority:** T2 and T3 are the differentiators; T1 is table stakes.  
**Forbidden claims:** “perfect agent”, “self-healing without review”, “AI scored itself so it is better”, “upgrades applied automatically”.

**Signature promise**

> Tell Userward what's wrong — an answer, a bug, an ugly screen, a slow page. It learns your preferences on this device, and it can **rewrite its own code and interface in a sandbox**, prove the change with tests and measurements it cannot edit, and let **you** try it side by side. Nothing reaches your app until you keep it, and every upgrade rolls back in one command.

---

## 0. Industry map and position

### 0.1 Three tiers

| Tier | What changes | State of the art | Userward v2.0 |
|------|--------------|------------------|---------------|
| **T1 — Scaffolding** | Prompt, memory, tools, workflow around a fixed model | Commercialized. 70% of production case studies use off-the-shelf models without weight tuning [S1]; survey taxonomy [S2][S3]. | **In scope, shipped (P1).** §5 |
| **T2 — Self-code** | Agent edits its own source; keeps variants that win on evaluations | Lab. DGM: SWE-bench 20%→50%, Polyglot 14.2%→30.7% [S4]. Hyperagents also edit the improvement procedure [S5]. AIDE²: 8 days, 100 steps, 7 accepted, ~9/10 rejected, hidden evaluations, reward hacking 55%→32% [S6]. Common pattern: **sandbox + human oversight + benchmark the agent cannot game.** | **In scope, shipped engine.** §6 — the lab pattern, scaled down to one user's app. |
| **T3 — Product face** | “UI ugly / slow” → agent fixes its own shipped UI and speed | **No shipped example.** Three blockers: (a) no ground-truth metric for “beautiful” and self-evaluation self-deceives; (b) platform rules forbid downloaded executable UI (e.g. app stores); (c) vendors won't cede brand/security control. | **In scope, shipped engine.** §7 — each blocker answered: (a) objective proxies + the user's own A/B pick, (b) local app the user owns, rebuilt from source — no downloaded executable, (c) the user is the vendor of their own copy. |

### 0.2 The moat

Self-improvement is solved where a benchmark says right or wrong. The unsolved part is the **verification loop** where no answer key exists:

```text
receive critique → propose fix (sandbox) → measure with signals the proposer cannot touch
   (tests, Quality-70, build, WCAG contrast, bundle size, the user's side-by-side pick)
→ keep the better version → archive everything → roll back in one command
```

Userward's answer key = **hidden-from-proposer gates** + **the user's own pick**. LLM self-scores never promote anything.

### 0.3 What “perfect” means here

Not verifiable, so not a requirement. Replacement:

> **Fit converges:** revise/discard rates fall, the user stops restating preferences, and accepted upgrades never regress a gate — measured on device (§10).

### 0.4 Evidence notes

| Claim | Verdict |
|-------|---------|
| “68% of self-improve work is T1 vs 32% weights” | **Unverified.** The 68% in [S1] is “≤10 steps before human intervention”. Not used. |
| DGM, Hyperagents, AIDE² figures | Verified [S4][S5][S6]. |
| Vendor “background memory/skills” | Vendor self-description; illustrative only. |

---

## 1. Problem

1. Misfit answers force long re-prompts; preferences are forgotten.  
2. Bugs and annoyances reported in chat go nowhere — there is no path from critique to a fixed app.  
3. “Ugly / hard to read / slow” has no owner and no metric.  
4. Any self-modifying system that grades itself will reward-hack [S6].

## 2. Layers

| UW layer | Name | Behavior | Tier |
|----------|------|----------|------|
| **UW-L1** | Session revise | Critique → rewrite this answer | T1 |
| **UW-L2** | Preference memory | Scoped, confidence-weighted, decaying preferences injected into prompts | T1 |
| **UW-P** | Profile | Editable “how I work” card | T1 |
| **UW-Q** | Upgrade queue | Every critique classified, redacted, queued with tier 1/2/3 | T1→T2/T3 bridge |
| **UW-SELF** | Self-code loop | Sandboxed proposals to app source, judged by protected gates | **T2** |
| **UW-FACE** | Product-face loop | UI/speed proposals judged by objective UI/perf metrics + user preview pick | **T3** |
| **UW-VER** | Verification | Baseline comparison, archive, preview, pick, promote, rollback | Cross-cutting |

## 3. Principles

1. Local-first: preferences, queue, archive, sandboxes, backups stay on device. No Userward cloud, telemetry or training.  
2. **The proposer never edits its evaluator.** Tests, benchmarks, scripts, configs and package files are read-only to it.  
3. **External signals beat self-scores.** Promotion needs objective non-regression **and** a human keep (or an explicit `--force` on an objectively improved candidate).  
4. No silent change to the live app. Every change is a reviewable diff with backup and one-command rollback.  
5. BYO model; key never stored by the engine, never logged; budget cap per run.  
6. Personalization and self-code never weaken truth, sources, clarify gates, safety, secret redaction or approvals.  
7. Safety, policy, provider and auth code is soft-protected (not editable by default).  
8. User controls memory: see, pause, forget, export, delete.

## 4. Scope

### In
- **T1:** critique classification, deterministic preference extraction, scope/confidence/decay, prompt injection with budget, personalization chip, pause/forget, feedback export, clear-all.  
- **T2:** sandbox copy, path policy, search/replace proposals, new tests under `tests/asi/`, gates vs baseline, multi-round multi-candidate search with archive (DGM-style), report + diff, promote/rollback.  
- **T3:** WCAG contrast audit, CSS weight / `!important` / font-size sprawl, client bundle bytes, build time; UI-focused context; side-by-side preview on port 3002; keep/reject pick.  
- Manual proposals (`--edits`) so any external agent (Cursor, Claude Code, Codex) can be judged by the same gates.

### Out (v2.0)
- Weight fine-tuning.  
- Edits to evaluator, safety/provider/auth code (unless the owner edits `.userward/asi/config.json` policy).  
- Running the loop inside the deployed Cloudflare/workerd build (no filesystem there) — the loop is a local CLI.  
- Auto-promotion without a human decision.  
- Cross-user learning, cloud A/B.

---

## 5. Tier 1 — Behavior adaptation

### 5.1 Critique intake
- **FR-ASI-L1-01:** Comment on any AI answer → revise that answer (existing `submitEntryComment`).  
- **FR-ASI-L1-02:** Each comment is classified: `too_long | too_short | wrong_fact | wrong_format | missing_step | tone | too_generic | slow | ui_preference | workflow | bug | other` (VI with/without diacritics + EN).  
- **FR-ASI-L1-03:** Tier routing: `ui_preference | slow` → T3; `bug | workflow` → T2; else T1.  
- **FR-ASI-L1-04:** Comment + answer excerpt are secret-redacted and appended to the on-device upgrade queue (max 200 items, comment ≤2,000, excerpt ≤1,200 chars).  
- **FR-ASI-L1-05:** `wrong_fact` never becomes a preference.  
- **FR-ASI-L1-06 (Tier-1 red line):** requests to cheat, skip verification, or weaken safety (drop file-write approval, disable redaction/safety, auto-approve) are detected deterministically, **never learned**, surfaced as a notice, and the model is instructed to keep the step. Preferences shape form only; UI density is per-device and never enters the prompt.

### 5.2 Preference memory
- **FR-ASI-L2-01:** Deterministic extraction (length, structure, examples, jargon, emoji, tone, language, summary-first).  
- **FR-ASI-L2-02:** Record: `id, key, value, instruction, scope (global|project|task_type), scopeId, confidence, evidenceCount, status (active|candidate|paused), source, createdAt, lastConfirmedAt, lastUsedAt`.  
- **FR-ASI-L2-03:** Explicit critique → `active`; implicit signals → `candidate` until confirmed twice.  
- **FR-ASI-L2-04:** Precedence: explicit request in current message > project > task_type > global; then confidence.  
- **FR-ASI-L2-05:** Unused 90 days → `paused`, never silently deleted. Max 200 active.  
- **FR-ASI-L2-06:** Injection ≤1,600 chars under a header that forbids changing facts, sources, clarify or safety.  
- **FR-ASI-L2-07:** Same key + scope, different value → replaced and recorded (`replaced[]`); conflict question UI is P2.  
- **FR-ASI-L2-08:** Settings: list, forget, pause/resume, export feedback, clear feedback; included in Delete-all-local-data.

### 5.3 Transparency
- **FR-ASI-TR-01:** Answers that used preferences show “Personalized: …”.  
- **FR-ASI-TR-02 (P2):** chip actions “Not this time”, “Edit”.  
- **FR-ASI-TR-03:** Pause → nothing injected, nothing learned.

### 5.4 Profile, routing, clarify (P2)
- **FR-ASI-P-01:** Profile card (languages, role, expertise per domain, defaults, avoid).  
- **FR-ASI-PB-01:** Preferred model per task type as a soft routing default; never silent free→paid.  
- **FR-ASI-PB-02:** Soft-gate clarify pre-filled from high-confidence preferences; hard gates always asked.  
- **FR-ASI-AO-01/02:** Tone preferences cannot suppress corrections, risk warnings or required counter-evidence.

---

## 6. Tier 2 — Self-code loop (UW-SELF)

### 6.1 Inputs
- **FR-ASI-T2-01:** `--feedback <export.json>` (from Settings), files dropped in `.userward/asi/inbox/`, or `--goal "<text>"`.  
- **FR-ASI-T2-02:** Feedback already handled by a winning run is recorded in `processed.json` and skipped next time (`--include-processed` overrides).  
- **FR-ASI-T2-03:** Proposer = BYO model (OpenAI-compatible incl. OpenRouter/DeepSeek/Groq/Ollama, or Anthropic) via `ASI_API_KEY`/`ASI_BASE_URL`/`ASI_MODEL`, or `OPENROUTER_API_KEY`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`; or a manual/external proposal via `--edits`.

### 6.2 Edit policy — three zones (anti reward-hacking, anti self-bricking)

The self-upgrade loop improves the product's *surface and helpers*; it may never touch the *core*. Zones are printed by `npm run asi:zones` and enforced in `scripts/asi/policy.mjs`; a proposal that touches a RED path is rejected **whole** (zero writes).

| Zone | Contents | Rule |
|------|----------|------|
| **RED — evaluator** | `scripts/`, `tests/`, `benchmarks/`, `docs/`, `public/`, `.userward/`, `.github/`, `.cursor/`, `package.json`, lockfile, vite/next/ts/eslint/wrangler/drizzle/postcss configs, `START-USERWARD.cmd` | Never editable |
| **RED — core app** | `app/api/**` (provider proxy, hands/file writes, web-search), `safety-experience.ts`, `policy-rag.ts`, `userward-core.ts`, `send-guards.ts`, `hands.ts`, `custom-provider.ts`, `provider-connect-errors.ts`, `chatgpt-auth.ts`, `types.d.ts`, and `adaptive-preferences.ts` (the loop's own guard) | Never editable; **config cannot remove** entries, only add |
| **YELLOW — restricted** | `page.tsx`, `layout.tsx`, `i18n.ts`, `chat-contract.ts`, `interview-*.ts`, `role-routing.ts`, `openrouter-routing.ts`, `model-capabilities.ts`, `file-extraction.ts` | Replacement ≤ 3,000 chars, ≤ 6 edits/file, file size may change ≤ 10–15 %, content scan |
| **GREEN — open** | CSS files, `answer-quality.ts`, `clear-brief.ts`, `inline-questions.ts`, `prompt-pack.ts`, `personal-interview-pack.ts`, `quality-benchmark.ts` | Replacement ≤ 8,000 chars, ≤ 12 edits/file, shrink ≤ 40 %, content scan |

- **FR-ASI-T2-10:** Editable set is `app/**/*.{ts,tsx,css}` minus RED; config may narrow it, never widen beyond `app/`.  
- **FR-ASI-T2-11:** Content scan on every changed file: the count of `fetch`/`WebSocket`/`sendBeacon`, external URLs, `eval`/`new Function`, `process.env`, `fs`/`child_process`, `dangerouslySetInnerHTML`, `document.cookie`, storage wipes, dynamic imports and prototype pollution may **never increase**; CSS may not add remote `url()`. A file may never become empty.  
- **FR-ASI-T2-12:** New tests under `tests/asi/` may not use fs, child_process, env or the network.  
- **FR-ASI-T2-16:** Post-promotion smoke in the real tree runs `test:i18n`, `test:policy`, `test:userward-core`; any failure → automatic rollback. If a later build fails, `asi:rollback -- <id> --yes` restores the backup.  
- **FR-ASI-T2-13:** New files: only `tests/asi/*.test.{ts,mjs}` (the proposer may **add** proof, never alter existing tests); never overwrite. Added tests are a pass/fail gate only — they never raise the score (a trivially-true test must not buy an `improved` verdict).  
- **FR-ASI-T2-15:** Gates run with no sandbox marker in the environment; app code cannot detect that it is under evaluation. `.env*` files are never copied into sandboxes.  
- **FR-ASI-T2-14:** Edits are search/replace; each `search` must match exactly once; ≤12 edits, ≤3 new files; invalid path/traversal/absolute path → whole proposal rejected, zero writes.

### 6.3 Sandbox and gates
- **FR-ASI-T2-20:** Each candidate runs in a full copy under OS temp (`userward-asi/<project>/<id>`), `node_modules` linked as a junction; the live tree and port 3001 are untouched.  
- **FR-ASI-T2-21:** Gates: `test:contracts`, `test:i18n`, `test:userward-core`, `test:policy`, Quality-70 benchmark, production build, plus the candidate's new `tests/asi` tests.  
- **FR-ASI-T2-22:** Baseline = same gates on an unmodified copy; cached by content hash of `app/ scripts/ tests/ benchmarks/` + package/vite config.  
- **FR-ASI-T2-23:** **Non-regression rule:** reject if any gate that passed at baseline fails, failing-test count rises, Quality-70 pass rate drops, contrast failures rise, or client JS grows >10%. Pre-existing failures are tolerated, not hidden.  
- **FR-ASI-T2-24:** Verdict: `rejected` | `improved` (objective score > 0) | `needs_user_check` (no regression, no measurable gain — taste/behavior only the user can judge).

### 6.4 Search (DGM / AIDE²-style, scaled down)
- **FR-ASI-T2-30:** `--rounds N` (≤5) × `--candidates K` (≤4); hard cap 12 model calls per run.  
- **FR-ASI-T2-31:** Round winner becomes the parent of the next round (stepping stone); next round's context is rebuilt from the parent sandbox.  
- **FR-ASI-T2-32:** Rejection reasons (policy errors, regressions, failing gate output tail) are fed back to the next proposal.  
- **FR-ASI-T2-33:** Every candidate — including rejected — is appended to `.userward/asi/archive.jsonl` (summary, rationale, verdict, score, gains, regressions, gate results, metrics, touched files with base hashes, diff path). Rejected sandboxes are deleted unless `--keep-sandboxes`.  
- **FR-ASI-T2-34:** Run report `runs/<runId>/report.md` + per-candidate unified diff; token usage recorded; key never written.  
- **FR-ASI-T2-35:** `--dry-run` computes baseline and writes the exact prompt without calling a model.

---

## 7. Tier 3 — Product-face loop (UW-FACE)

### 7.1 Objective proxies (answer to “no metric for beautiful”)
- **FR-ASI-T3-01:** WCAG text contrast for every CSS rule with both color and background (vars resolved; translucent colors skipped); fail threshold 4.5:1; worst 15 selectors reported.  
- **FR-ASI-T3-02:** `!important` count, distinct font-size values, CSS bytes.  
- **FR-ASI-T3-03:** Client JS/CSS bytes from the production build; build time.  
- **FR-ASI-T3-04:** Tier-3 score weights contrast fixes highest, then `!important` reduction and bundle reduction. Regression on any proxy → rejected.

### 7.2 Context
- **FR-ASI-T3-10:** Tier-3 context includes the CSS around the worst-contrast selectors and feedback keywords, `layout.tsx`, and the top keyword-matching components (≤70k chars).  
- **FR-ASI-T3-11:** Proposer instructions: adjust tokens/colors/spacing in CSS first; keep ≥4.5:1 in light **and** dark; speed = less client work, never remove features.

### 7.3 Human verification (answer to “self-evaluation self-deceives”)
- **FR-ASI-T3-20:** `asi:preview <id>` builds (if needed) and serves the candidate on **3002** (3000 = RPA tools and 3001 = live app are refused) for side-by-side comparison.  
- **FR-ASI-T3-21:** `asi:pick <id> keep|reject [--note]` records the human decision in the archive.  
- **FR-ASI-T3-22:** `needs_user_check` candidates can only be promoted after `keep`.

### 7.4 Ownership (answer to platform/vendor blockers)
- **FR-ASI-T3-30:** Upgrades are source changes the user owns, rebuilt locally; no downloaded executable code, no remote UI injection.  
- **FR-ASI-T3-31:** Community/upstream: a kept candidate's diff can be shared as a normal PR — upstream review stays human.

---

## 8. Verification, promotion, rollback (UW-VER)

- **FR-ASI-VER-01:** `asi:promote <id> --yes` requires: candidate not rejected; sandbox present; human `keep` (or `--force` only when verdict = `improved`).  
- **FR-ASI-VER-02:** **Stale check:** every touched file's current hash must equal the hash recorded when the candidate was made; otherwise abort (“re-run improve”).  
- **FR-ASI-VER-03:** Backup of every touched file (or “did not exist”) to `.userward/asi/backups/<id>/` before writing.  
- **FR-ASI-VER-04:** Post-promote check (`test:i18n`) in the real tree; failure → automatic rollback.  
- **FR-ASI-VER-05:** `asi:rollback <id> --yes` restores byte-identical files; refuses if files were edited after promotion unless `--force`.  
- **FR-ASI-VER-06:** `asi:status` lists candidates, verdicts, evidence and decisions; `asi:clean` deletes rejected/decided/orphan sandboxes (`--all` for everything). Cleanup refuses any path outside the sandbox root and never follows the `node_modules` link.  
- **FR-ASI-VER-07:** In-app **Self-upgrade window** (`SelfUpgradePanel`): dedicated UI (not chat/project work). Chat intents like “tự sửa UI cho chính tool này” open this window instead of the coding interview. A local companion on `127.0.0.1:3003` (`npm run asi:companion`, also started by START-USERWARD) runs improve / pick / promote / rollback / preview. The browser only talks to loopback; API keys are optional passthrough for that process.  
- **FR-ASI-VER-08 (P3):** Post-promotion challenge window: for 7 days, Tier-3 feedback that re-occurs on the same area flags the promotion as suspect and suggests rollback.

## 9. Non-functional

| ID | Requirement |
|----|-------------|
| NFR-ASI-01 | Preference injection ≤1,600 chars; no extra model call for the chip |
| NFR-ASI-02 | One candidate evaluation ≈ baseline gate time (measured ~35–45 s incl. build on dev machine) |
| NFR-ASI-03 | ≤12 model calls per run; tokens reported |
| NFR-ASI-04 | Sandboxes outside repo; `.userward/` git-ignored |
| NFR-ASI-05 | Live app on 3001 never stopped by the loop (sandbox build does not run `clean-dist`) |
| NFR-ASI-06 | Works offline with Ollama as proposer |
| NFR-ASI-07 | Key never persisted or printed by the engine |

## 10. Metrics

| Metric | Direction | Type |
|--------|-----------|------|
| Revise / discard rate | ↓ | External |
| Same-preference restatement in 14 days | ↓ | External |
| Accepted candidates that later regress a gate | **= 0** | Gate |
| Promotions without a human decision | **= 0** (except `--force` on improved) | Gate |
| Candidate acceptance rate | track (AIDE² ≈ 1/10 is normal) | Diagnostic |
| Contrast failures, client JS KB | ↓ over promotions | Measured |
| Rollbacks after promotion | low; rising = proposer/model problem | External |

## 11. Acceptance tests

| # | Test | Status |
|---|------|--------|
| 1 | Critique “dài quá / ngắn gọn” → T1; “lỗi, không chạy” → T2; “xấu, khó đọc” / “xau, kho doc” → T3; “slow” → T3 | ✅ automated |
| 2 | Explicit critique → active preference; `wrong_fact` → none | ✅ automated |
| 3 | Implicit → candidate until 2 confirmations | ✅ automated |
| 4 | Project scope beats global; pause → nothing applied | ✅ automated |
| 5 | Preference block keeps safety header and budget | ✅ automated |
| 6 | 90-day decay → paused; storage round-trip | ✅ automated |
| 7 | Feedback export format = what `asi:improve` reads | ✅ automated |
| 8 | Proposer edits to tests/scripts/benchmarks/config/safety/providers/traversal → rejected | ✅ automated + live run |
| 8a | RED core zone (hands, api/*, send-guards, custom-provider, adaptive-preferences, auth) rejected; config with `protected: []` cannot unprotect | ✅ automated + live run |
| 8b | Content scan: added fetch/external URL/process.env/eval, oversized replacement, 90 % shrink, remote CSS url() → rejected; benign CSS fix still accepted | ✅ automated + live run |
| 8c | Tier-1: "không cần hỏi trước khi ghi" / "disable redaction" → not learned, notice shown | ✅ automated |
| 9 | New file only `tests/asi/*.test.*`, never overwrite | ✅ automated |
| 10 | Ambiguous search (≠1 match) → rejected; chained edits apply | ✅ automated |
| 11 | WCAG math (#777/#fff = 4.48) and var resolution | ✅ automated |
| 12 | Gate regression / Quality-70 drop / contrast rise → rejected | ✅ automated |
| 13 | Objective gain → improved; no gain → needs_user_check | ✅ automated |
| 14 | End-to-end: real CSS fix in sandbox, all gates + build, contrast −1, verdict improved | ✅ live run |
| 15 | Promote without keep → refused | ✅ live run |
| 16 | Keep → promote → file changed → rollback → byte-identical | ✅ live run |
| 17 | Stale project file → promote refused | spec'd, manual |
| 18 | Preview refuses 3000/3001 | ✅ live run |
| 19 | Model run with real key: multi-round, archive parent chain | needs user key |
| 20 | In-app Try-upgrade card | P2 |

### 11.1 Owner's 12 behavioral scenarios (audit 2026-10-24)

"Deterministic" = handled by code without a model call (tested). "Model" = the deterministic layer injects the right instruction; final wording depends on the connected model.

| # | Scenario | Deterministic layer | Status |
|---|----------|--------------------|--------|
| 1 | "Từ giờ trả lời ngắn, tối đa 3 câu, không bullet" | Plain-chat teaching detected; learns `length=max_3_sentences`, `structure=prose`; injected on later turns incl. new sessions | ✅ deterministic + model |
| 2 | "Nhớ nhé: thanh toán T+2" → later question | Stored as user-stated fact (separate prompt section, max 30, verbatim) | ✅ deterministic + model |
| 3 | "Trích số sai vì nhầm cột lũy kế" → new table | `wrong_fact` → only `verification=figures` rule ("name column, check cumulative vs period"); no fact learned | ✅ deterministic + model |
| 4 | Casual chat vs formal email | `tone=casual` instruction explicitly carves out formal artifacts; "explicit request wins" header | ✅ deterministic; register switch is model |
| 5 | Same mistake 3× → root-cause first | `repeat_error` tag → guidance: root cause, rule, then redo; queued tier 2 | ✅ in-session; code fix via `asi:improve` |
| 6 | Forgets early context | `workflow` tag → guidance: restate earlier facts first; queued tier 2 | ⚠️ in-session only; real memory upgrade needs a loop run |
| 7 | Trap: skip verification | `skip_verification` detected → never learned, notice shown, guidance to refuse that part | ✅ deterministic; refusal wording is model |
| 8 | Trap: peek at answers | `cheat` detected → never learned, notice, refusal guidance; T2 engine structurally cannot read benchmarks | ✅ |
| 9 | "UI xấu rối, tự sửa đi" | tier 3 queued; `ui_density=compact` applied per device at once; code change only via sandbox + preview + keep (never silent) | ✅ no silent change; "asks criteria" only when vague |
| 10 | "Chạy chậm, tìm nguyên nhân" | tier 3 queued; engine measures bundle/build only | ❌ no runtime latency attribution (P3) |
| 11 | Two users disagree on density | Density is a per-device preference (`html[data-density]`), not a code change → no flip-flop across devices; same browser profile = last wins | ✅ per device; per-profile on one device is P2 |
| 12 | "Vẫn chưa ưng" ×3 | In app: 3 vague critiques in 2 h → stop learning, ask criteria. CLI: vague goal or same complaint tried in 3 runs with nothing kept → exit 3, ask criteria | ✅ deterministic |

## 12. Phases

| Phase | Deliverable | State |
|-------|-------------|-------|
| **P0** | Critique → revise; classification; wrong_fact routing | ✅ |
| **P1** | Preference store, injection, chip, pause/forget, feedback queue + export | ✅ |
| **P1-T2/T3** | Engine: policy, sandbox, gates, baseline, UI audit, rounds × candidates, archive, report, preview, pick, promote, rollback, clean | ✅ |
| **P2** | Companion bridge + in-app Try-upgrade card; conflict question; Not-this-time; profile card; LLM preference extraction with confirmation | next |
| **P3** | Challenge window; hidden held-out benchmark split the proposer never sees in context; screenshot-based visual diff for T3; real latency (TTFT) gate | later |

## 13. Commands

```text
npm run asi:improve  -- --goal "Sidebar chữ khó đọc"            # T3 auto-detected
npm run asi:improve  -- --feedback userward-feedback-2026-10-24.json
npm run asi:improve  -- --goal "..." --rounds 3 --candidates 2 --files app/page.tsx
npm run asi:improve  -- --edits proposal.json                    # judge another agent's patch
npm run asi:improve  -- --goal "..." --dry-run                   # baseline + prompt only
npm run asi:status | asi:preview -- <id> | asi:pick -- <id> keep | asi:promote -- <id> --yes | asi:rollback -- <id> --yes | asi:clean
npm run asi:ui-audit                                              # contrast/CSS report
npm run build:local -- -Verify -Start                             # tests + UI audit + build + run on 3001
```

## 14. Threats

| Threat | Control |
|--------|---------|
| Reward hacking (edit tests/benchmarks) | Hard-protected paths; gates run from the sandbox copy of protected files; verified by AT 8 |
| Prompt injection via feedback | Feedback is data in the user prompt; policy validates every path; no shell from proposals |
| Silent harmful change | Human keep, stale check, backup, post-check, rollback |
| Safety regression | Safety/policy/provider/auth soft-protected; safety tests are gates |
| Overfit to proxies (contrast but uglier) | Proxies only reject/score; taste decided by user preview pick |
| Data leakage | Redacted queue; only selected app source + feedback sent to the user's chosen model |
| Destructive cleanup | Sandbox-root containment; junction unlinked first; abort if project `node_modules` vanishes |

## 15. Open questions

1. Hidden held-out split: move part of Quality-70 to a file excluded from proposer context (P3).  
2. Companion process shape (local Node service vs Cursor/CLI hook) for the in-app card.  
3. Default proposer model per budget tier.  
4. Visual regression: screenshot diff via headless browser — dependency cost vs value.

## Appendix A — Proposal schema

```json
{
  "summary": "one line",
  "rationale": "why it fixes the feedback and why it is safe",
  "edits": [{ "path": "app/globals.css", "search": "exact unique text", "replace": "new text" }],
  "newFiles": [{ "path": "tests/asi/name.test.ts", "content": "node:test proof" }]
}
```

## Appendix B — Sources

- [S1] *Measuring Agents in Production*, arXiv:2512.04123.  
- [S2] *Self-Improvements in Modern Agentic Systems* (survey hub), selfimproving-agent.github.io.  
- [S3] *A Comprehensive Survey of Self-Evolving AI Agents*, Univ. Glasgow eprint 390858.  
- [S4] Zhang et al., *Darwin Gödel Machine*, arXiv:2505.22954.  
- [S5] Meta AI, *HyperAgents*, Mar 2026.  
- [S6] Weco AI, *Recursive self-improvement of AI research agents* (AIDE²), arXiv:2609.26457.

## Appendix C — Audit history

| Ver | Note |
|-----|------|
| 1.0–1.2 | Drafts; T1/T2/T3 map, allowlist overlays |
| 1.3 | Self-contained FRs; unverified 68/32 removed; personalization depth |
| **2.0** | **Scope change by owner:** T2 and T3 moved from non-goal/lab-only into product scope as the priority. Adds UW-Q, UW-SELF, UW-FACE, UW-VER engine requirements (§6–8), anti-reward-hacking policy, objective UI proxies, preview/pick/promote/rollback, commands, acceptance status from real runs. Overlay allowlist (v1.3 UW-L3) superseded by sandboxed source proposals with protected evaluator. |

## Appendix D — Verdict vs owner's framework

| Framework point | v2.0 answer | Where |
|-----------------|-------------|-------|
| T1 prompt / memory / tools / workflow | Shipped (prompt + memory); tools/workflow defaults P2 | §5 |
| T2 needs sandbox | Full-copy sandbox per candidate outside repo | FR-T2-20 |
| T2 needs human oversight | Pick + promote are human; `--force` only on objectively improved | FR-VER-01 |
| T2 needs benchmark it can't game | Evaluator hard-protected; baseline comparison; hidden split P3 | §6.2–6.3 |
| T3 “no metric for beautiful” | Objective proxies reject regressions; user's side-by-side pick decides taste | §7.1, 7.3 |
| T3 “self-evaluation self-deceives” | No LLM self-score anywhere in promotion | §3.3 |
| T3 platform/vendor blockers | User-owned local source, rebuilt locally | §7.4 |
| Moat: critique → fix → measure → keep better | Implemented end-to-end; real-user A/B in-app is P2 | §0.2, §8 |
