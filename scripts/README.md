# Scripts — public vs private

## Public (Community · Apache-2.0)

Ship in [userward-community](https://github.com/huytr91/userward-community):

| Path | Role |
|------|------|
| `asi/` | Self-Repair Tier 2/3: sandbox improve, companion `:3003`, promote/rollback, UI audit |
| `build-userward.ps1` | Clean local production build (`npm run build:local`) |
| `start-userward.ps1` | START-USERWARD launcher (app `:3001` + companion `:3003`) |
| `open-userward.ps1` | Open browser to local app |
| `clean-dist.mjs` | Wipe `dist` before build |
| `build-community.mjs` / `export-community.mjs` / `check-public.mjs` | Community release guards |
| `measure-latency.mjs` / `measure-token-savings.mjs` | Local measurement helpers |
| `run-benchmark-fixtures.mjs` / `run-quality-70.mjs` | Benchmark runners |
| `smoke-model-first-interview.mjs` | Interview smoke |
| `userward-port.mjs` | Port helper |

## Private (Personal only)

Keep on [userward-personal](https://github.com/huytr91/userward-personal) — `export-community` strips these:

| Path | Why private |
|------|-------------|
| `debug-ssr.mjs` | Dev SSR dump — not a product surface |
| `debug-stream.mjs` | Dev stream dump — not a product surface |

Also private (not under `scripts/`): `BUSINESS REQUIREMENTS DOCUMENT v2.md`, personal connectors / RPA / `.env` — see [`docs/PERSONAL.md`](../docs/PERSONAL.md).

The Self-upgrade **companion** (`asi/companion.mjs` on loopback `:3003`) is **public** Community tooling. It is not the Personal “Local Companion” desktop/RPA product.
