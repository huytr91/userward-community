# Userward — Community Edition

Userward is a user-aligned AI manager for long-running chats and coding projects. Users describe the outcome they want; Userward clarifies material ambiguity, chooses an appropriate method, protects approvals and privacy, keeps project history searchable, and reports measured token/cost usage.

> **AI that answers to you.**

Userward serves the user rather than a model provider. The underlying **Minimum Context Engine** selects only the context needed for the current goal, while the product layer governs tools, model usage, cost, permissions, and execution evidence.

Its binding differentiator is the **User Interest Constitution**: tool before model, least-expensive-qualified routing, minimum necessary context, no silent paid upgrade, no unapproved side effect, and no completion claim without evidence. Real responses can include an inspectable Execution Receipt.

The interface detects the browser/operating-system language on first launch, remembers manual language changes, and currently provides core navigation in English, Vietnamese, Spanish, French, German, Japanese, Korean, and Chinese. Unsupported locales fall back to English.

This public Community Edition contains **chat, file analysis, and folder-scoped coding**. Media generation, email/calendar actions, deployment, RPA, Power BI/Desktop control, and other private connectors are not included.

## Current status

Early preview. Do not treat the app as a security boundary or use it for production automation without an independent review.

Working capabilities:

- Bring your own API key for OpenRouter, OpenAI, Anthropic, Google, DeepSeek, Qwen, or Kimi.
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
- The 256 MB picker limit is not a guarantee that a model/provider or hosting layer accepts a request of that size.
- Provider keys pass through the app server proxy for the duration of a request. Review your hosting environment before use.
- Browser `localStorage` is used for project history. It is not encrypted storage.

## Requirements

- Node.js 22.13 or newer
- npm
- A supported provider API key
- Chrome or Edge desktop for File System Access folder features

## Run locally

```bash
npm ci
npm run dev
```

Open the URL printed by the development server.

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
