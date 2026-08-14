# Userward Local — privacy model

Userward is distributed as a local application and binds only to `127.0.0.1`. It has no Userward-operated cloud database, account system, analytics endpoint, or telemetry collector.

## What remains on the device

- Project and chat history: browser storage on this device.
- Approved folder handles: browser IndexedDB on this device.
- UI preferences: browser storage on this device.
- Provider API key: session storage only; removed when the browser session ends.

The **Delete all local data** control clears project history, preferences, provider credentials, and remembered folder handles.

## What may leave the device

Userward itself stores nothing remotely. When the user submits a request to a cloud model, the minimum compiled context and selected attachments are sent from the local server to that provider. The provider's privacy, retention, billing, and regional policies apply.

“Local-first” never means that a cloud-model request stays offline.

## Network boundary

- UI/API bind: `127.0.0.1:3000` only.
- Provider API routes reject non-loopback hosts.
- No LAN binding and no public deployment configuration.
- Folder writes remain scoped to the user-selected folder and require patch approval.
