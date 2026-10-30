# Contributing

Use Node 22. Install with `npm ci --include=dev --include=optional`, then run
`npm test`, `npm run typecheck`, and `npm run build`.
Use `TEST_BASE_URL` to include HTTP smoke tests against your local server.

Keep the UI English, monochrome, keyboard-accessible and built with the existing
Kokonut UI components and Base UI primitives. Keep reduced-motion support and
source/license attribution. Do not add analytics, external fonts, arbitrary HTML,
paid infrastructure, secrets or token/key logging. Live features must use real
GitHub operations; simulations must be explicitly labeled demo-only.

## Plugin pull requests

1. Read [plugin contracts](docs/PLUGINS.md), [protocol](docs/PROTOCOL.md),
   and [encryption boundaries](docs/ENCRYPTION.md).
2. Copy `templates/plugin/` to `plugins/<your-id>/`. Include a manifest,
   handler, README, dry-run example and tests. See `plugins/coinflip/`.
3. Request the smallest permissions. No implicit execution on every message,
   dynamic remote code loading, arbitrary shell commands or hidden network calls.
4. Test success, invalid input, permission denial, retries and secure-room refusal.
   Document limits, cost/quota, install paths and uninstall behavior.
5. Open a PR using `.github/PULL_REQUEST_TEMPLATE/plugin.md`. Maintainers review
   code, security, UI and dependencies before adding a curated registration or
   downloadable installer. A merged source contribution is not automatic install
   or consent to execute it in every user's repo.

This repository may be private. External contributors need repository access,
or the maintainer must publish the source/integration kit first. Never copy
private conversations into a public issue or PR. Report security issues privately
to the maintainer before publishing exploit details; there is no audited security
program or guaranteed response SLA.
