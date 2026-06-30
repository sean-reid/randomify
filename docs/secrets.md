# Secrets and API keys

Where every secret randomify depends on lives, what it is for, and how to rotate
it. There is intentionally no keyed third-party music API: Deezer's public API,
the MusicBrainz data dumps, and the Cover Art Archive are all keyless.

Keep this list current. When a workflow, binding, or job stops using a secret,
delete the secret too so nothing stale lingers in a store.

## GitHub Actions secrets (repo level)

| Name | Used by | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `deploy.yml` (dev, staging, production) | Lets `wrangler` deploy the API Worker and the web Pages project. Scope it to Workers Scripts edit, Pages edit, and the account's Hyperdrive, nothing broader. |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy.yml` (dev, staging, production) | Target Cloudflare account for `wrangler`. Not strictly secret, but kept here so the deploy env is self-contained. |

No environment-scoped GitHub secrets exist. `ci.yml`, `e2e.yml`, and
`release.yml` use no secrets beyond the automatic `GITHUB_TOKEN`.

Rotate: create a new Cloudflare API token, update the secret with
`gh secret set CLOUDFLARE_API_TOKEN`, then revoke the old token in Cloudflare.

## Cloudflare

| Item | Where | Purpose |
| --- | --- | --- |
| Hyperdrive config (one per environment) | Cloudflare dashboard; ids bound as `HYPERDRIVE` in `apps/api/wrangler.toml` | Holds the Neon Postgres connection string for that environment's corpus branch. The Hyperdrive id is not secret; the connection string it wraps is, and never leaves Cloudflare. |
| `production` deploy gate | GitHub environment `production` | Required-reviewer approval before a production deploy runs. |

Rotate the corpus credentials by rotating the Neon role password and updating
the connection string stored in the matching Hyperdrive config.

## Local cron config (`data/musicbrainz/<env>.env`, gitignored)

Used only on the Mac that runs the incremental load jobs. Never committed; see
`scripts/env.example` for the template.

| Variable | Secret? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string for this environment's corpus. |
| `CANDIDATE_LIMIT`, `RESOLVE_LIMIT` | no | Corpus-size and per-run tuning. |
| `HEALTHCHECK_URL` (and `_REFRESH` / `_RESOLVE` / `_WEIGHTS`) | treat as secret | healthchecks.io dead-man's-switch ping URLs; anyone with the URL can ping them. |
| `NTFY_TOPIC` | yes | ntfy push topic for failure alerts; security is the topic being unguessable. |

## Third-party APIs (no keys)

- **Deezer** public API resolves preview URLs at play time. No key, no account.
- **MusicBrainz** ships public data dumps; the loader downloads them anonymously.
- **Cover Art Archive** serves art over public HTTP.

If a keyed API is ever added, record the key here (location and rotation only,
never the value) and wire it through a GitHub or Cloudflare secret rather than a
committed file.
