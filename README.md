# Userward Local — Community Edition

> Most AI assistants apologize, then repeat the mistake.  
> **Userward fixes itself — and proves it.**

> **AI that answers to you.**  
> *Context, because tokens are yours.*

You run Userward on your own machine. There is no Userward cloud account. You describe the work. **If a material fact is missing, Userward asks first — it does not invent your intent, destinations, schedules, or file contents just to finish a reply.** After you confirm, it packs the smallest honest context and calls a model. It does not silently upgrade a free route to a paid one. It does not write files until you approve. Token and cost figures are measured when the provider sends them, or estimated from the text when it does not.

The **Minimum Context Engine** and **User Interest Constitution** encode that stance: tool before model, least-expensive qualified routing, minimum necessary context, no unapproved side effect, and no completion claim without evidence. Replies can include an inspectable execution receipt.

---

## Self-Repair — complain once, prove the fix

Every other assistant treats your complaint as the end of the conversation. Userward treats it as a bug report against itself.

**"Trả lời dài quá." → It answers short from then on, across sessions.**  
**"UI xấu quá, tự sửa đi." → It proposes a new interface you can preview, keep, or roll back.**  
**"Sao chậm thế?" → It looks for a real bottleneck and shows what changed.**

No “I’ll try harder next time.” A Tier‑2/3 fix only lands after you preview and approve — same rule as every other file patch. Preferences (Tier 1) stick on this device until you forget them.

### How it works: complain → clarify → patch → check

1. **Complain** — plain words. “Ngắn thôi.” “Xấu quá.” “Chậm quá.” Or open **Sửa app** (sparkle) and describe the fix.
2. **Clarify when unclear** — same idea as chat interview: the connected model asks a short question pack before guessing for minutes (ambiguous UI vs answer-style requests).
3. **Propose a patch** — Tier 2/3 runs in a local sandbox companion; you preview first. Nothing promotes silently.
4. **Keep or roll back** — Keep → Promote applies to the live app; Rollback undoes. Vague “vẫn chưa ưng” loops stop after a few rounds and ask what “better” means.

### Three tiers

**Tier 1 — It remembers.** On-device preferences across sessions (length, format, tone, your facts). Marked “Personalized: …”. Pause or forget in Settings. Context still respects the line between casual chat and formal deliverables.

**Tier 2 — It repairs process.** Repeated workflow/bug complaints become sandboxed code changes to how Userward works — not another apology. Guardrails: it must not drop its own verification to go faster, and it must not game its own tests.

**Tier 3 — It redesigns the product.** Ugly, slow, hard-to-read → UI/CSS candidates with preview and one-click rollback. Accessibility is not optional: redesigns must not trade readable contrast for “cleaner” looks.

BRD: [`docs/BRD-ADAPTIVE-SELF-IMPROVE.md`](docs/BRD-ADAPTIVE-SELF-IMPROVE.md). Companion: port **3003** (`npm run asi:companion`, also started by `START-USERWARD`). Preview sandbox: **3002**. Live app: **3001**. CLI: `npm run asi:improve -- --goal "…"`. Keys: the connected chat model (loopback to 3003 only) or `ASI_API_KEY` / `OPENROUTER_API_KEY`.

### What self-repair is not

- Not silent self-modification — Tier 2/3 need your Keep / Promote.
- Not a promise without a visible candidate — “I’ll do better” is not a fix.
- Not one user’s taste overwriting another’s setup — preferences stay on this device.
- Not unlimited blind redesign — vague complaints get honest attempts, then a question.

### Try it in 60 seconds

```text
Từ giờ trả lời tôi ngắn thôi, tối đa 3 câu, không dùng bullet nhé.
```

```text
UI của mày xấu và rối quá, tự sửa đi.
```

```text
Sao mày chạy chậm thế? Tự tìm nguyên nhân rồi tối ưu đi.
```

Open a new session for the first line. Use **Sửa app** for the UI/speed lines so the sandbox can run.

---

## Clarify before generate

Most assistants fill gaps silently. Userward treats unknown business facts as a hard stop when they change side effects or deliverable scope — and uses a **short clarify step** so questions match *your* request, not a generic form.

1. **Route the case** — ordinary chat answers directly; work goals enter clarify-before-generate.
2. **Model-first clarify** — the connected model reads your goal, compares it to requirement slots (scope, period, output, audience, evidence, destinations…), and generates a tailored 2–4 question pack. Quiz-style / subject-knowledge questions are filtered out. Coding/file questions are not asked unless the goal is actually software work.
3. **Local ontology is seed + fallback only** — offline templates hint which slots may matter; they are not the primary interview when the clarify model succeeds. If the model fails or returns unusable JSON, Userward falls back to a local pack so you are never stuck.
4. **Hard vs soft gate** — automation / compare / coding-ops still require material slots before generate; research / write / open analysis use a lighter meta brief (period, output, audience, constraints; GTM/viral also objective + channel).
5. **Passthrough last** — if clarify and local fallback still cannot produce a usable soft-gate brief, generate from the goal as written with labeled assumptions (still no invented destinations/schedules or fake side effects).
6. **CLEAR follow-ups** — vague answers (“ok”, “no special requirement”) trigger follow-ups instead of a fake completion.
7. **Deliver, don’t refuse** — after brief answers, the model must write a useful draft (assumptions labeled) or ask 1–2 more CLEAR questions. A thin “not enough data” reply reopens interview instead of ending the thread.
8. **Clear Brief protocol** — after interview, Userward stages a versioned JSON brief (draft). You audit/edit slots and soft assumptions, then **Generate from this brief**. Hard-gate missing slots block generate. The confirmed JSON is injected into the model prompt as the source of truth. Receipts can show brief summary plus estimated context savings vs an in-app free-format baseline.

Clarify adds a small token cost (~one short JSON round-trip) on work goals so questions stay relevant. Ordinary chat still skips that step entirely.

### Personal suggestions on this device

Optional **Remember choices on this device** stores answers you use often in a private suggestion pack in the browser (local only). After the same clear answer appears often enough, later interviews can offer it as a suggestion so you repeat yourself less. Defaults are never locked — you can always pick another option or write your own.

- Nothing from this pack is sent to a Userward server.
- It is not used to train a model.
- You can turn it off or **Clear saved suggestions** anytime in Settings. Clearing all local data also removes it.

Ordinary chat still gets a direct answer. Folder writes still need your approval. An inspectable execution receipt can show what was measured versus assumed.

The interface detects the browser/operating-system language on first launch, remembers manual language changes, and currently provides core navigation in English, Vietnamese, Spanish, French, German, Japanese, Korean, and Chinese. Unsupported locales fall back to English.

This local Community Edition contains **chat, file analysis, and folder-scoped coding**. It has no Userward cloud account, database, analytics, or telemetry. Desktop automation (Power Automate, Outlook UI), terminal runtimes, media generation, email, deploy, and other private connectors are **not** in this public repository.

## Start on Windows

Double-click `START-USERWARD.cmd`. On the first run it prepares dependencies and builds the app, then opens:

```text
http://127.0.0.1:3001
```

Clean build only (no server): `npm run build` or `.\scripts\build-userward.ps1`. Build then serve: `.\scripts\build-userward.ps1 -Start`. Add `-Verify` to run contract, i18n, core, policy and self-upgrade tests plus the UI audit before building.

Port **3000** is reserved for **AI agent RPA tools**. Closing the launcher window stops Userward. The server binds to loopback only and is not exposed to the LAN or Internet.

**Stable use:** keep `START-USERWARD` open — no kill is needed. After you change code, close that window and start again (or let a rebuild stop the old process only while replacing `dist`). Auto-kill exists for rebuild safety; it is not required for everyday localhost use.

## Current status

Early preview. Do not treat the app as a security boundary or use it for production automation without an independent review.

Working capabilities:

- **Self-Repair:** Tier 1 on-device preferences; Tier 2/3 sandboxed self-upgrade (clarify with the chat model when the goal is ambiguous, preview on 3002, Keep → Promote / Rollback).
- Clarify-before-generate with **model-first clarify**: tailored questions; local packs are seed/fallback only.
- Missing business facts are asked, not invented; interview clears the brief so work can proceed — it is not a refusal loop.
- Soft write/GTM briefs still cover objective and channel; thin “not enough data” replies reopen clarifying questions.
- Inspectable **Clear Brief** protocol: interview → draft JSON → user confirm → generate from confirmed brief; hard gate blocks incomplete briefs.
- Fixed **benchmark fixtures** under `benchmarks/` for self A/B token estimates and blind ChatGPT judging (see `benchmarks/README.md`).
- Execution receipt can show **estimated context savings** vs a free-format baseline in this app (not a ChatGPT/Claude UI comparison), alongside provider usage when available.
- Optional on-device personal suggestions for frequent interview answers (off/clear anytime; never uploaded or used for training).
- Bring your own API key for OpenRouter, OpenAI, Anthropic, Google, DeepSeek, Qwen, Kimi, MuseAI (Meta), or connect to local models through Ollama without an API key. **Custom** accepts any OpenAI-compatible base URL (Groq, Together, Fireworks, GitHub Models, Hugging Face, or your own `/v1` gateway).
- Searchable project/chat history stored in the browser.
- Optional browser-granted folder access for previewing file patches.
- User approval before writing a proposed patch.
- Local extraction for DOCX, XLSX, PPTX, OpenDocument, RTF, CSV/TSV, text, and common source files. Legacy binary `.xls` is intentionally excluded until a maintained parser is available.
- PDF/image forwarding through a compatible multimodal provider.
- Clarification, capability, legal-policy, and token/cost panels.

Known limitations:

- There is no Power BI, Office desktop, RPA, terminal, deployment, email, or calendar connector in this repository.
- A selected folder is not a connection to an application with the same name.
- PDF/image requests sent directly through OpenRouter can require funded credits.
- The 10 MB per-file picker limit is not a guarantee that a model/provider accepts a request of that size.
- Provider keys pass only through the local app server for the request. They are not stored in project history. If you tick **Remember this connection**, the key stays in this browser’s local storage on the device; otherwise it lasts only for the tab.
- Browser `localStorage` is used for device-local project history. It is not encrypted storage; use **Delete all local data** before handing the device to someone else.
- Cloud-model requests still send the minimum selected context to that provider. Local-first is not the same as offline.
- Self-Repair Tier 2/3 needs the companion on **3003** and a connected model; red-zone / evaluator files stay forbidden.

## Requirements

- Node.js 22.13 or newer
- npm
- A supported provider API key, or Ollama with at least one local model installed
- Chrome or Edge desktop for File System Access folder features

## Run locally

```bash
npm ci
npm run dev
```

Open the URL printed by the development server.

## Use Qwen locally with Ollama

1. Install Ollama from [ollama.com/download](https://ollama.com/download).
2. Open Terminal or PowerShell and run `ollama run qwen3:8b`. On a lower-memory computer, use `ollama run qwen3:4b`.
3. Keep Ollama running. In Userward, open **Connect model**, choose **Ollama · Local models**, and select **Find models on this computer**.
4. Select an installed Qwen model and save the connection.

Userward connects only to `http://127.0.0.1:11434`. Local prompts do not require an API key and provider cost is recorded as zero. Model downloads, speed, context limits, and output quality depend on the selected model and the computer's available RAM/VRAM.

## Community release checks

```bash
npm run release:check
```

This command scans tracked files for common secret patterns, builds with `VITE_MINIMUM_EDITION=community`, runs server-render tests, and runs the policy tests.

To build only:

```bash
npm run build:community
```

## Security model

- The browser asks for folder permission; the app cannot access arbitrary folders.
- File writes require a visible patch preview and user confirmation.
- Common credential patterns are redacted from selected text context before provider calls.
- API keys must never be committed or pasted into project content.
- Community code does not contain private connector implementations.

See [SECURITY.md](SECURITY.md) before publishing or deploying your own instance.

## Repository editions

- `community`: public chat, file-reading, and coding surface.
- `personal`: private product configuration and connector catalog; implementation is maintained separately and is not licensed by this repository.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By contributing, you agree that your contribution is licensed under Apache-2.0.

## License

Community Edition source code is licensed under the [Apache License 2.0](LICENSE). Product names, private adapters, credentials, production workflows, and third-party trademarks are excluded unless explicitly stated.
