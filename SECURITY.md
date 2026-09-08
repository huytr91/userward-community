# Security Policy

## Supported version

Only the latest commit on the default branch receives security fixes while the project is in preview.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, personal data, or private files. Contact the repository owner privately through the security contact configured on the GitHub repository. Include affected commit, reproduction steps, impact, and a minimal proof of concept.

## Deployment warnings

- Use HTTPS only.
- Do not log request bodies or authorization headers on the proxy routes.
- Add rate limiting, request-size enforcement, abuse controls, and authentication before a public multi-user deployment.
- Treat browser storage as unencrypted and user-controlled. Remembered API keys live in `localStorage` only when the user opts in.
- The included policy engine is defense in depth, not a complete legal or content-safety system. User-facing copy must not expose policy IDs or scores.
- Provider keys are supplied by users and forwarded to providers by server routes. They must not be persisted by the server.
- File System Access handles remain browser-scoped but can grant write access after user permission. Preserve the patch approval gate.
- Large files can exhaust browser memory because Office extraction and binary encoding occur client-side.
- The included policy gate is defense in depth, not a complete legal or content-safety system.

## Before production

1. Complete a threat model and privacy impact assessment.
2. Add server-side rate limits and maximum request-body limits.
3. Add structured audit logs that exclude secrets and file contents.
4. Run dependency and source security scanning in CI.
5. Add automated authorization tests for every connector and write action.
6. Publish retention, privacy, and acceptable-use policies appropriate to the deployment jurisdiction.
