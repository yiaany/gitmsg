# Run your own gitmsg

The website is one Next.js app. Chat data lives in separate GitHub repositories.
There is no message database to provision and no realtime service to subscribe to.

## Local development

Use Node.js 22:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure the variables below. `/setup` gives you the exact callback URL and a
browser-only session-secret generator. An unconfigured deployment builds normally
but cannot sign in. No credentials are needed at build time.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Exact site origin, no path; `http://localhost:3000` locally |
| `SESSION_SECRET` | Cryptographically random secret, at least 32 characters |
| `GITHUB_AUTH_MODE` | `app` or `oauth` |
| `GITHUB_CLIENT_ID` | GitHub App/OAuth client ID, not the numeric App ID |
| `GITHUB_CLIENT_SECRET` | Server-only client secret |
| `GITHUB_APP_INSTALL_URL` | Optional installation link in App mode |

Keep `.env.local` private. Never prefix a secret with `NEXT_PUBLIC_`.

## GitHub App — scoped repository access

Recommended when opening your deployment to other people.

1. Create a GitHub App and enable user authorization.
2. Set callback URL to `https://YOUR-DOMAIN/api/auth/callback`.
3. Request **Contents: read and write**, **Metadata: read**.
4. Optional integrations require **Pull requests: read and write** for reviewing
   proposals and **Actions: read and write** for dispatch. Workflow installation
   remains manual; the website does not request Workflows or Checks permissions.
5. Disable webhooks; the current app uses conditional polling.
6. Configure the environment variables and set `GITHUB_AUTH_MODE=app`.
7. Each participant authorizes the App. The owner installs it on the selected
   chat repositories. Organization administrators may need to approve it.

This uses **user access tokens**, not installation tokens: access is the
intersection of the user's permissions and the App's installation. Create a
private repository first, include it in the installation, then use **Connect
Repository**. Creating repositories through the App may require additional GitHub
account/administration permissions. New repos must be included in its selection.

Reauthorize/reapprove after changing permissions. Expiring user tokens work until
expiry (typically eight hours); reconnect when prompted. Refresh tokens are
deliberately not persisted.

## OAuth App — faster setup, broader access

1. Register an OAuth App in GitHub Developer Settings.
2. Homepage URL: the site origin.
3. Callback URL: `https://YOUR-DOMAIN/api/auth/callback`.
4. Set `GITHUB_AUTH_MODE=oauth` and the other required environment variables.

Locally, use `http://localhost:3000/api/auth/callback` and a separate OAuth App
if necessary. The requested scopes are `repo read:user`. **The `repo` scope
includes broad access to private repositories.** Prefer App mode for scoped access.

Sessions are AES-256-GCM-encrypted HttpOnly, SameSite=Lax cookies; production
cookies are Secure. Tokens are not returned to the browser. Logout clears the
session; revoke authorization in GitHub settings when needed.

## Deploy on Vercel

1. Import this repository as a Next.js project; Root Directory is `./`.
2. Use Node.js 22. `vercel.json` selects the install/build commands. Leave the
   Output Directory at the framework default.
3. Add environment variables in project settings. `APP_URL` must be the stable
   production HTTPS origin, not a temporary preview URL.
4. Redeploy after changing environment variables, then open `/setup` to verify.
5. Sign in with two accounts, create a dedicated private chat, accept the
   invitation and verify messages/media/encryption in both directions.

**The website repository and chat repositories should be different.** Do not
connect chat repositories to deployment hooks or run Actions on every message.
Turning “lol” into a build pipeline gets expensive fast.

`.env*` (except the empty example), `.vercel`, dependencies, build outputs and
private key files are ignored by Git. Do not put production secrets in commits.
Linux compiler/CSS dependencies are pinned in the lockfile; builds do not rely
on a developer's Mac binaries.

## Delivery and costs — no hand-waving

- Active chat: approximately every 2 seconds when focused, 60 seconds unfocused.
- Other saved chats: one at a time, at most once per 5 seconds focused or 60
  seconds unfocused. More rooms mean longer per-room cycles.
- Hidden/offline tabs stop polling. Requests back off after errors, honor GitHub
  cooldowns and use conditional ETags. Each poller has at most one in-flight task.
- Authenticated GitHub `304` responses can save primary rate budget, **not** Vercel
  invocations or every secondary limit. There is no always-on WebSocket or closed-site push.
- Focused active-room polling alone can make about 1,800 requests/hour, plus up to
  720 inactive-room checks. Catch-up pagination and attachments add requests.
- 100 focused tabs for eight hours/day already mean about 43.2 million monthly
  active-room invocations alone. That is not a million-invocation free plan.
- Write/read token buckets are per-instance best-effort controls, not a global
  distributed rate limiter. Configure platform firewall rules and usage alerts
  before a public launch. Check current GitHub/Vercel limits and plan terms.

GitHub enforces primary, secondary and content-creation limits. More tokens,
GraphQL, SSH and unique filenames are not loopholes. Vercel Hobby is for personal
noncommercial use. This is a working experiment, not infinite free infrastructure.

## Checks

```sh
npm run check:secrets
npm test
npm run build
```

Set `TEST_BASE_URL` to a running instance to include HTTP smoke tests. The secret
scanner examines current publishable files and reachable local history, reporting
paths/rules only. It is a best-effort pattern scan, **not a security audit**.

The optional `tests/fixtures/messenger-server.mjs` is an isolated, loopback-only
browser test server. All API writes stay in memory. It is never imported into the
application or offered as an anonymous production demo.
