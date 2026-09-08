# Userward Local — privacy model

Userward is distributed as a local application and binds only to `127.0.0.1:3001` (port **3000** is reserved for AI agent RPA tools). It has no Userward-operated cloud database, account system, analytics endpoint, or telemetry collector.

## What remains on the device

- Project and chat history: browser storage on this device.
- Approved folder handles: browser IndexedDB on this device.
- UI preferences: browser storage on this device.
- Provider API key: kept in this browser on the device if you choose **Remember this connection**; otherwise session storage only, removed when the tab ends.

The **Delete all local data** control clears project history, preferences, provider credentials, and remembered folder handles.

## What may leave the device

Userward itself stores nothing remotely. When the user submits a request to a cloud model, the minimum compiled context and selected attachments are sent from the local server to that provider. The provider's privacy, retention, billing, and regional policies apply.

“Local-first” never means that a cloud-model request stays offline.

## Local safety check

Userward may append a short post-answer warning when a **local keyword policy check** finds a sensitive pattern. That check is not vector RAG, does not block generation in Community, and never shows policy IDs or “SECURITY GATE” chrome in the UI.
