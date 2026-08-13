# Community Release Audit

Audit date: 2026-08-13

## Release checks that pass

- Community production build
- TypeScript type-check
- Server-render smoke tests
- Policy/RAG unit tests
- Tracked-source secret pattern scan
- Production dependency audit: 0 known vulnerabilities
- Community edition renders without the Personal Tool Registry
- Generated deployment archives are ignored by Git
- Community provider credentials are retained in `sessionStorage`, not persistent `localStorage`

## Important fixes completed during audit

- Replaced obsolete starter tests with product tests.
- Replaced the vulnerable `xlsx` dependency. Modern `.xlsx` remains supported through `read-excel-file`; legacy `.xls` is deliberately unsupported.
- Added a reproducible community build and a public-source guard.
- Added README, Apache-2.0 license, security policy, and contribution guidance.
- Added a GitHub CI workflow.

## Open findings before a production public service

### High priority

1. **API proxy abuse controls:** `/api/providers/chat` and `/api/providers/test` do not yet enforce per-user/IP rate limits or a strict server-side request-body ceiling.
2. **Large-file memory pressure:** the UI accepts up to 256 MB, while Office parsing and PDF/image base64 conversion happen in browser memory. Large requests can fail before reaching a provider. Implement streaming/object storage and chunked extraction before claiming reliable 256 MB processing.
3. **Monolithic client component:** `app/page.tsx` contains most UI and orchestration logic. ESLint currently reports legacy React-hook and accessibility findings. Build and type-check pass, but lint is not yet a release gate.

### Medium priority

4. **Encrypted secret storage:** Community only remembers keys for the current tab. Personal persistent-key storage should move to OS keychain/Local Companion rather than browser `localStorage`.
5. **Provider capability discovery:** file and modality support is not negotiated per selected model before sending.
6. **Internationalization:** core navigation now auto-detects and persists 8 languages with English fallback. Deep workflow, provider, safety, and legacy timeline copy still needs extraction into the translation catalog before claiming complete localization.
7. **Persistence and privacy:** project history is browser-local and unencrypted. There is no export/delete-all/privacy control surface yet.
8. **End-to-end coverage:** no browser E2E test currently exercises provider connection, file extraction, project switching, folder permission restoration, or patch approval.

## Release decision

The repository is suitable for a **public developer preview**, not a production hosted service. Keep the preview label visible and do not market Power BI, desktop automation, RPA, deployment, or 256 MB reliability as implemented capabilities.
