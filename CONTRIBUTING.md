# Contributing to gitmsg

Thanks for helping turn an objectively questionable idea into better software.
Small fixes, tests, docs, accessibility improvements and carefully scoped features
are welcome. You do not need to invent another transport protocol to fix a typo.

## Get running

1. Fork/clone the source repository and use **Node.js 22** (`.nvmrc`).
2. `npm ci --include=dev --include=optional`.
3. `cp .env.example .env.local` and `npm run dev`.
4. For real sign-in, configure your **own** GitHub OAuth/App credentials using
   [SETUP.md](docs/SETUP.md). Never request production credentials from maintainers.

The build and unit tests need no credentials. Browser fixtures live in
`tests/fixtures/`; all their API writes stay in memory and use synthetic accounts.
Real integration testing belongs in dedicated private test repositories, never
the website source repo or somebody's actual inbox.

## Before opening a PR

```sh
npm run check:secrets
npm test
npm run typecheck
npm run build
```

For HTTP smoke checks, start a production instance with its matching `APP_URL`
and run the suite with `TEST_BASE_URL` set to that origin. See
[SETUP.md](docs/SETUP.md#checks). Do not rebuild `.next` while a test server is
serving it. Call/browser verification and its limitations are in [CALLS.md](docs/CALLS.md).

Open an issue first for large UI, protocol, encryption or infrastructure changes.
Keep PRs focused; explain the user benefit, test results and known limitations.
Use synthetic screenshots and the PR checklist. Never attach tokens, cookies,
private chat exports, room keys, real invite links or full network captures.
Security bugs go through [SECURITY.md](SECURITY.md), not public issues.

## Terminal client

The OpenTUI application lives in **`cli/`**, with a separate npm manifest/lockfile.
It reuses the website's protocol, encryption and call state machine; do not fork
the wire format just to make a terminal feature easier. CLI dependencies do not
belong in the Next.js root package.

Use **Node >=26.4** (OpenTUI's declared engine). Optional npm dependencies provide
the pinned Bun runtime; no separate shell installer is needed:

```sh
cd cli
npm ci --include=dev --include=optional --ignore-scripts
npm run dev
```

`npm run dev` needs a real terminal. Read [CLI usage](docs/CLI.md) for sign-in;
contributors need no production token/client secret. For a separate OAuth app,
enable Device Flow and supply only its public Client ID. Unit/UI tests require no
credentials, microphone permission or real GitHub writes.

Before a CLI PR, from `cli/`:

```sh
npm run release:check
```

Also run the root website tests/typecheck/build for shared protocol changes. The
CI jobs are separate so CLI native dependencies do not enter a website build.

Useful paths:

| Path | Purpose |
| --- | --- |
| `cli/src/app.tsx`, `motion.tsx`, `themes.ts` | Terminal screens, input, animation and themes |
| `cli/src/rooms.ts`, `github.ts`, `device-flow.ts` | Validated GitHub operations and device login |
| `cli/src/credentials.ts`, `room-keys.ts` | OS credential and room-key storage boundaries |
| `cli/src/call-*.ts`, `call-view.tsx`, `calls.ts` | Audio devices, isolated Node WebRTC worker and ASCII UI |
| `cli/bin/`, `cli/scripts/` | Fixed-executable launcher, builds and publication allowlist |
| `cli/tests/` | Synthetic transport, rendering, native WebRTC and failure-path tests |

Preserve drafts, keyboard/mouse navigation, compact layouts, themes and reduced
motion. Microphone diagrams must use measured levels; no fake presence, connection
success or clipboard acknowledgement. Calls/recording never start on an incoming
event or while merely reading a chat. Keep audio queues bounded; stop devices and
workers after cancellation, denial, hangup, sign-out and exit. Never load the
native WebRTC module directly into Bun: it runs in the isolated Node worker.

Use synthetic screenshots. Real OAuth, invites, sends and calls require explicit
consent and private test accounts/rooms. Do not connect tests to somebody's inbox.
Publishing or promoting an npm tag is not a side effect of a PR or test run; follow
the [separate release gates](docs/CLI_RELEASE.md).

## Project guardrails

- Keep interface copy **English** and follow the current components, spacing and
  naming. Preserve keyboard access, screen-reader labels and reduced motion.
- Real people, real Git operations. No fabricated replies, online status, read
  receipts or anonymous production demo conversations. Fixtures stay test-only.
- Preserve existing history/protocol compatibility and encryption semantics.
  Validate untrusted inputs; test failure, conflict, retry and permission paths.
- Never log tokens/keys or expose them through `NEXT_PUBLIC_`, API responses,
  screenshots or analytics. Vercel page analytics is already configured to strip
  URL queries/fragments; do not add identity/message/call tracking without review.
- No new external scripts/fonts, remote executable loading, surprise repositories,
  silent permissions or paid infrastructure. Discuss new dependencies, destinations,
  quotas and operating costs before introducing them.
- Preserve MIT and third-party/font notices. Visual reference is not permission
  to copy GPL application code or branded assets into this MIT project.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/app/api/` | Authenticated GitHub-backed server operations |
| `src/lib/protocol.ts`, `room-crypto.ts` | Event validation, history and encryption |
| `src/lib/audio-call.ts` | Direct audio lifecycle and resource cleanup |
| `src/components/` | Messenger UI and browser integrations |
| `cli/` | Separately packaged OpenTUI messenger, native audio and tests |
| `tests/`, `scripts/check-secrets.mjs` | Regression checks and publication safety |
| `docs/`, `public/integrations/`, `plugins/` | Protocol, CLI and opt-in integrations |

## Plugin pull requests

1. Read [plugin contracts](docs/PLUGINS.md), [protocol](docs/PROTOCOL.md),
   and [encryption boundaries](docs/ENCRYPTION.md).
2. Copy `templates/plugin/` to `plugins/<your-id>/`. Include a manifest,
   handler, README, dry-run example and tests. See `plugins/coinflip/`.
3. Request the smallest permissions. No implicit execution on every message,
   arbitrary shell commands, remote code loading or hidden network calls.
4. Test success, invalid input, permission denial, retries and secure-room refusal.
   Document limits, cost/quota, install paths and uninstall behavior.
5. Use `.github/PULL_REQUEST_TEMPLATE/plugin.md`. Merging source is **not** consent
   to automatically install or run a plugin in users' repositories.

Be excellent to each other: [Code of Conduct](CODE_OF_CONDUCT.md). Contributions
are under this repository's [MIT license](LICENSE); keep attribution for code you reuse.
