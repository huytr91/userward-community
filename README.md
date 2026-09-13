# Userward Local — Community Edition

AI software should stand with the person who pays for tokens and lives with the answers — not with the model vendor.

> **AI that answers to you.**  
> *Context, because tokens are yours.*

You run Userward on your own machine. There is no Userward cloud account. You describe the work. **If a material fact is missing, Userward asks first — it does not invent your intent, destinations, schedules, or file contents just to finish a reply.** After you confirm, it packs the smallest honest context and calls a model. It does not silently upgrade a free route to a paid one. It does not write files until you approve. Token and cost figures are measured when the provider sends them, or estimated from the text when it does not.

The **Minimum Context Engine** and **User Interest Constitution** encode that stance: tool before model, least-expensive qualified routing, minimum necessary context, no unapproved side effect, and no completion claim without evidence. Replies can include an inspectable execution receipt.

## Clarify before generate

Most assistants fill gaps silently. Userward treats unknown business facts as a hard stop for work products:

1. **Detect work intent** — eight families (build, analyze, transform, compare, automate, write, decide, research), with domain packs for coding, data/Excel, and business ops.
2. **Interview first** — short choice cards plus a free-text answer under each question.
3. **Model interview only when local templates are thin** — that call may ask questions; it must not ship a tutorial, script, or “done” answer.
4. **Generate only after slots are clear** — vague answers (“ok”, “no special requirement”) trigger follow-ups instead of a fake completion.

### Personal suggestions on this device

Optional **Remember choices on this device** stores answers you use often in a private suggestion pack in the browser (local only). After the same clear answer appears often enough, later interviews can offer it as a suggestion so you repeat yourself less. Defaults are never locked — you can always pick another option or write your own.

- Nothing from this pack is sent to a Userward server.
- It is not used to train a model.
- You can turn it off or **Clear personal memory** anytime in Settings. Clearing all local data also removes it.

Ordinary chat still gets a direct answer. Folder writes still need your approval. An inspectable execution receipt can show what was measured versus assumed.

The interface detects the browser/operating-system language on first launch, remembers manual language changes, and currently provides core navigation in English, Vietnamese, Spanish, French, German, Japanese, Korean, and Chinese. Unsupported locales fall back to English.

This local Community Edition contains **chat, file analysis, and folder-scoped coding**. It has no Userward cloud account, database, analytics, or telemetry. Desktop automation (Power Automate, Outlook UI), terminal runtimes, media generation, email, deploy, and other private connectors are **not** in this public repository.

## Start on Windows

Double-click `START-USERWARD.cmd`. On the first run it prepares dependencies and builds the app, then opens:

```text
http://127.0.0.1:3001
```

Port **3000** is reserved for **AI agent RPA tools**. Closing the launcher window stops Userward. The server binds to loopback only and is not exposed to the LAN or Internet.

**Stable use:** keep `START-USERWARD` open — no kill is needed. After you change code, close that window and start again (or let a rebuild stop the old process only while replacing `dist`). Auto-kill exists for rebuild safety; it is not required for everyday localhost use.

## Current status

Early preview. Do not treat the app as a security boundary or use it for production automation without an independent review.

Working capabilities:

- Clarify-before-generate gate: missing business facts are asked, not invented.
- Optional on-device personal suggestions for frequent interview answers (off/clear anytime; never uploaded or used for training).
- Bring your own API key for OpenRouter, OpenAI, Anthropic, Google, DeepSeek, Qwen, or Kimi; or connect to local models through Ollama without an API key.
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
