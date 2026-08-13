# Contributing

## Development

```bash
npm ci
npm run dev
```

Before submitting a change:

```bash
npm run release:check
npm run lint
```

## Scope

Community contributions may cover chat, file parsing, project memory, search, clarification, policy evaluation, token/cost reporting, and folder-scoped coding.

Do not commit:

- API keys, access tokens, credentials, or private user data;
- personal/private connector implementations;
- production workflow definitions or internal endpoints;
- generated build archives or deployment output;
- copyrighted sample documents without redistribution rights.

Every external action or file write must expose capability limits and require appropriate user confirmation.
