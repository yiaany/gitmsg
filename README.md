# gitmsg

A GitHub-backed messenger. Messages are Git commits; conversations are repositories.

## What works

- Minimal English chat UI with real MIT-licensed Kokonut UI source components, accessible Base UI primitives, a monochrome dark palette and self-hosted Geist / Geist Mono typography. See [component provenance](src/components/kokonutui/README.md).
- Zero-setup local demo with three seeded rooms, simulated bot replies, local persistence, and same-browser cross-tab updates.
- GitHub OAuth with state + PKCE; first sign-in creates or reuses a private `gitmsg-inbox`. Create separate private chats or connect an existing writable repository.
- Invite collaborators by GitHub username inside the chat; recipients must accept their invitation on GitHub.
- Real messages, replies, edits, deletions/tombstones, and reactions persisted as individual files and commits.
- Voice notes (record, preview, discard, send; 60 seconds), locally resized pictures and attachment downloads. Files are real Git blobs, at most 2 MiB each.
- Saved Messages in your private `gitmsg-saved` repo; saving copies attachments, and secure sources require encrypted destinations.
- Opt-in browser encryption, real room/key QR codes, key backups/import and SHA-256 fingerprint comparison. See [encryption](docs/ENCRYPTION.md).
- Real pull-request messages, a dependency-free [Node CLI](public/integrations/gitmsg.mjs), and GitHub-editor posting instructions. See [protocol](docs/PROTOCOL.md).
- Owner-installed Actions participant: animated dice results, 24-hour standup and explicitly configured deployment requests. See [installation](docs/BOTS.md).
- Paginated history, loaded-message search, commit inspection, JSON export, live-repository clone commands, drafts, keyboard shortcuts, and optional sound.
- `/ship`, `/fortune`, `/shrug`, `/panic`, `/sudo`, `/help`, and a suspiciously familiar secret key sequence.

**Demo mode is explicitly a simulation.** Its SHAs are not real, its bots are not people, and its rooms are not shared across different browsers. No API calls occur during ordinary anonymous demo use. Connecting GitHub unlocks actual shared repository-backed conversations.

## Local development

Use Node.js 22 or newer. Install dependencies with `npm install`, then start with `npm run dev`. The unconfigured site is a complete local demo. No external database, paid account, or realtime service is needed.

Available scripts: `dev`, `build`, `start`, `typecheck`, `test`. `TEST_BASE_URL` optionally enables HTTP smoke tests against a running instance; protocol tests run without a server.

## Deploy on Vercel Hobby

1. In Vercel, choose **Add New → Project**, import `yiaany/gitmsg`, and leave **Root Directory** at the repository root (`./`). The committed `vercel.json` selects Next.js, `npm ci --include=dev --include=optional`, and `npm run build`; `package.json` pins Node.js 22. Leave Output Directory at its framework default. **No environment variables are needed for the initial demo deployment.**
2. Deploy and open your production URL. The demo is local to each browser; shared GitHub chats remain unavailable until OAuth is configured. Use a stable production domain for the following setup, not a temporary preview URL.
3. Add the environment variables from `.env.example` in Vercel project settings. Generate a cryptographically random `SESSION_SECRET` of at least 32 characters using your password manager. Set `APP_URL` to the exact HTTPS origin, **without a path**, for example `https://gitmsg.vercel.app`.
4. Redeploy after changing environment variables.
5. Open `/setup` for exact OAuth settings and a browser-only session-secret generator. Sign in, open the automatically created inbox, invite a collaborator, and share the room link after they accept on GitHub.

Keep the Vercel project private configuration separate from this source repository. `.env.local`, `.vercel/`, access tokens, and build artifacts are gitignored. Never add GitHub OAuth secrets as `NEXT_PUBLIC_` variables. The build does not contact GitHub and does not require credentials. Linux CSS/compiler binaries are pinned in the lockfile so deployment does not depend on binaries left in a developer's Mac `node_modules`.

The repository hosting the website and the repositories storing chats should be **different repositories**. Do not connect chat repositories to Vercel deployment hooks or run Actions on every message. That would convert “lol” into a build pipeline.

### Option A: GitHub App (recommended for scoped repository access)

Create a GitHub App with these settings:

- Callback URL: `https://YOUR-DOMAIN/api/auth/callback`.
- Enable user authorization. This app uses **user access tokens**, not installation tokens, so GitHub enforces the intersection of the user's access and the App's permissions.
- Baseline repository permissions: **Contents: read and write**, **Metadata: read**. Optional PR messages require **Pull requests: read and write**; bot dispatch requires **Actions: read and write**. Workflow installation stays manual; Workflows and Checks are not requested by the website. Reauthorize/reapprove an installation after permission changes.
- Disable webhooks: this version uses adaptive conditional polling and does not require a webhook endpoint.
- Set `GITHUB_AUTH_MODE=app`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and optional `GITHUB_APP_INSTALL_URL` to your App's installation URL. The client ID is not the numeric App ID.
- Each participant authorizes the app. The repository owner installs the App on the selected chat repo. For an organization repo, its administrator may need to approve installation.
- Create a private repo in GitHub first, install the App on it, and use **Connect repo**. Creating repos through the app may need additional GitHub account/administration permissions; repository connection does not. New repos must be included in the installation selection.

Expiring user tokens are supported until their expiry (typically 8 hours); reconnect when prompted. Refresh tokens are deliberately not persisted. Disabling token expiry is an administrator policy decision, not required by this app.

### Option B: OAuth App (quick setup, broader permissions)

Register an OAuth App in GitHub Developer Settings:

- Homepage URL: your site origin.
- Authorization callback URL: `https://YOUR-DOMAIN/api/auth/callback`.
- Set `GITHUB_AUTH_MODE=oauth`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, and `APP_URL`.
- The app requests `repo read:user`. **The `repo` scope grants broad access to private repositories.** This is disclosed before login. Prefer GitHub App mode when inviting the public.
- Local development callback: `http://localhost:3000/api/auth/callback` with `APP_URL=http://localhost:3000`. Use a separate OAuth app for local development if needed.

Sessions are AES-256-GCM-encrypted HttpOnly, SameSite=Lax cookies; production cookies are Secure. GitHub tokens are never returned to the client. Logging out clears the local session; revoke access in GitHub settings if needed.

## How messages really work

```text
Browser → authenticated Next.js route → GitHub Contents API
                                      ↓
                         events/YYYY/MM/DD/<uuid>.json
                         one event = one actual commit
```

A Contents API PUT creates the JSON file and commit in one request. The structured event is also included in the commit body, so reading a page of up to 100 events requires one commit-history request, not 100 file reads. In standard mode this is plaintext. Secure mode stores an authenticated encrypted envelope in both places; never put a secret key in the repository or commit subject.

The protocol is append-only: `message`, `edit`, `delete`, `reaction`. Materialization follows Git history order rather than client timestamps. Edits/deletions only affect the original author's messages in the UI. Reactions use explicit active/inactive events, not ambiguous toggles.

Unique event IDs and stable retry payloads prevent duplicate sends after a lost response. Non-fast-forward conflicts receive bounded retries with jitter. History is paginated with commit cursors. Live sync reconciles optimistic sends against canonical Git order and catches up across missed pages (bounded to 1,000 commits per sync). Very large gaps require reconnecting the room and loading older history.

There is **no persistent message database**. Live history is kept in memory for the tab's lifetime; opening a room fetches its newest page. Drafts and demo history are local browser storage. Search and JSON export cover loaded history, not an unbounded server-side full-text index. Use a Git clone for the complete repository history.

## The free-tier survival strategy

The design optimizes for **many people looking at the demo**, not an unlimited global public chatroom:

- `/` is statically prerendered and CDN-served. Anonymous demo users do not call server routes unless they choose to connect GitHub.
- No paid database, separate storage service, LFS, always-on websocket, or third-party realtime subscription. Attachments use GitHub blobs. Optional Actions jobs use the repository owner's quota, not a dedicated always-on runner.
- GitHub credentials and API budgets belong to each authenticated user. There is no shared personal token bottleneck for every visitor. GitHub App user tokens still use the user's rate-limit budget; they are not installation-token quotas.
- Only the selected live room syncs: roughly every 2 seconds in a focused, visible tab, or every 60 seconds in a visible but unfocused window. Hidden/offline pages make no polling requests. Returning to the tab triggers a prompt check; closing/switching rooms cancels pending work. Slow requests never overlap, and errors back off exponentially up to 5 minutes. Focus changes cannot bypass a GitHub cooldown.
- Conditional ETag requests avoid downloading unchanged history. Authenticated GitHub `304` responses generally do not count against the primary rate limit, but still incur network/server invocations and can count toward secondary limits.
- One event write per action; attachments add a separate blob commit. 4,000-character messages, 2 MiB attachments, bounded request bodies, no typing-indicator commits. Repositories grow permanently; this is deliberately not a large-media service.
- Cooldown honors GitHub `Retry-After` / reset headers. Composer text is preserved after failures.
- Server-side per-instance token buckets limit writes and reads. **These are best-effort abuse controls, not a global distributed rate limiter.** Configure Vercel Firewall rules for `/api/*` before a public launch; a determined attacker can otherwise exhaust free invocations. Use the controls available on your plan.

At 2-second sync, a continuously focused chat tab makes up to roughly 1,800 requests/hour. Conditional `304` responses save GitHub primary-rate budget and payload bytes, **not Vercel invocations** or all GitHub processing. An unfocused visible window drops to roughly 60 requests/hour; hidden tabs stop entirely. 100 continuously focused tabs polling 8 hours/day would still generate roughly 43.2 million invocations/month. That does **not** fit a million-invocation allowance. Delivery also waits for GitHub to create and expose the commit: a two-second poll is not a guaranteed two-second end-to-end delivery SLA. If live usage grows, upgrade the infrastructure; do not promise infinite free messaging.

GitHub enforces primary **and secondary** rate limits, including content-creation limits. SSH, GraphQL, multiple tokens, or unique filenames are not loopholes. Hobby is for personal noncommercial use, and Vercel/GitHub may pause or restrict usage. Check current platform limits and terms before launch.

## Security and honest limitations

- **Standard mode is not encrypted.** Secure mode encrypts future event content and media in the browser using AES-256-GCM; SHA-256 is a public fingerprint/integrity check, not a password or encryption key. See [trust model and key recovery](docs/ENCRYPTION.md). No independent audit, forward secrecy, verified author signatures or server-compromise resistance is claimed.
- **Deleting a message is not erasure.** Its text remains in older commits and downloaded clones. Deletions are UI tombstones, not actual `git revert` operations.
- GitHub repository access is the permission boundary. Private repos require accepted collaborator invitations. Public repos are public, even if their chat UI has a login screen.
- Removing a collaborator cannot revoke already downloaded history.
- Direct repository collaborators can forge protocol JSON and commit authors, alter files, rewrite branches, or insert spoofed events. The event log is **not** a cryptographically authenticated identity system. App-created events use the server session's identity, but the renderer cannot establish that every raw Git commit came through this server. Use only trusted collaborators.
- Never connect a production code repository. Force pushes and direct edits of protocol commits are unsupported; create a fresh dedicated chat repo.
- The public demo has no real online/read receipts. Live participant lists show authors in loaded history, not presence.
- The app only accesses GitHub through fixed API paths, authenticates requests with each user's token, bounds JSON bodies, validates protocol input, checks mutation origins, and does not render arbitrary HTML from chat text.
- The CSP permits inline scripts for statically generated Next.js hydration. It is not a strict nonce-based CSP. No third-party analytics or executable user HTML is included.

Live OAuth, repository creation, and collaborator invitations require the deployment's real GitHub credentials. Automated protocol/session tests do not substitute for a live two-account end-to-end test.

See `THIRD_PARTY_NOTICES.md` for coss UI attribution and font licensing.

## Contribute integrations / plugins

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [plugin contracts](docs/PLUGINS.md), and [the working starter](plugins/coinflip/README.md). Submit source, a manifest, documentation and tests using the [plugin PR template](.github/PULL_REQUEST_TEMPLATE/plugin.md). Extensions are reviewed source, not remotely loaded JavaScript. This release provides the protocol integration kit; an automatic plugin marketplace/runtime is a future step, not a hidden permission grant.
