# Open the source, not the inbox

Publishing **the website source repository** does not require changing its
Vercel environment variables, OAuth configuration, chat repositories or room keys.
No new service or paid plan is needed just to publish source.

## Keep Vercel working

- Keep the same Vercel project, Git integration, production branch and domain.
  Do not delete/reimport the project just to change GitHub visibility.
- Keep `GITHUB_CLIENT_SECRET` and `SESSION_SECRET` in **Vercel → Project Settings
  → Environment Variables**, server-side only. They must not have `NEXT_PUBLIC_`
  names or appear in `next.config.ts`'s `env` option.
- Retain the current `APP_URL`, `GITHUB_CLIENT_ID`, `GITHUB_AUTH_MODE` and optional
  installation URL. Public client IDs/origins are configuration, not passwords;
  this repository still uses an empty `.env.example` for reproducibility.
- Keep OAuth callback `https://YOUR-DOMAIN/api/auth/callback` registered with
  GitHub. A visibility change does not require rotating credentials or signing
  everyone out. Rotate only if exposed or as a separate planned operation.
- Build uses Node 22 and `npm ci --include=dev --include=optional`; no build-time
  production credentials are required. Do not add a step that downloads secrets
  into the workspace or uploads `.env` / `.vercel` as an artifact.
- Keep production secrets out of untrusted fork/preview deployments. Review
  Vercel's fork-deployment authorization and environment scopes before opening PRs.
  Our PR workflow uses no production secrets and no `pull_request_target` execution.
- Vercel Web Analytics is optional: enable it in the existing project's Analytics
  tab if desired. Disabling analytics must not break sign-in or messaging.

We cannot inspect hidden Vercel environment values from source, and do not need
to export them to check in the app. Never paste those values into a PR or chat.

## Before changing visibility

1. Fetch every branch/tag you intend to publish. Review those refs, commit
   messages, GitHub releases, attachments, issues, PRs, Actions logs/artifacts and
   screenshots. Local Git scans do not inspect GitHub-hosted attachments or
   unreachable objects, and do not cover other repositories.
2. Run `npm run check:secrets`. It scans current tracked/nonignored files, staged
   content, every reachable text blob, commit/tag text and historical paths. It
   blocks env files, key containers, local credentials, archives/database files
   and root chat storage paths. It reports locations/rules, never matched values.
   Binary assets are skipped by text detection; inspect their provenance separately.
3. Optionally run a maintained independent scanner such as Gitleaks with full
   history and redaction. No detector guarantees that all secret formats,
   encoded credentials or personal information will be found.
4. Run `npm test`, `npm run typecheck`, `npm run build` and an online `npm audit`.
   Do not claim an audit succeeded if its network request failed. Test a fresh
   instance with matching `APP_URL` / `TEST_BASE_URL` for HTTP smoke checks.
5. Review [LICENSE](../LICENSE), [third-party notices](../THIRD_PARTY_NOTICES.md),
   [CONTRIBUTING](../CONTRIBUTING.md), [SECURITY](../SECURITY.md) and issue/PR templates.
6. Publish **only** the application source repo. Keep private chat repositories,
   `gitmsg-settings` and `gitmsg-saved` private. Public profiles/channels are
   separate, explicitly public products, not source-code publication targets.
7. In GitHub repository settings, deliberately confirm the visibility change.
   Enable secret scanning/push protection, private vulnerability reporting and
   dependency alerts where available. These are account settings, not features
   a Markdown file or CI workflow can silently turn on.
8. Protect `main` with PR review and the CI check where your GitHub plan supports
   it. Review dependency PRs; Dependabot is configured, **not** auto-merge.
9. Confirm the existing Vercel deployment is healthy: login, a message in a
   dedicated test room, attachment access, encryption, profile and optional calls.
   Use two consenting accounts. Unit tests do not prove a real conversation.

The included publication scanner is offline and best effort. It deliberately
does not read ignored local secret files, browser profiles or a Vercel account.
It cannot revoke credentials. If anything leaks, follow [SECURITY.md](../SECURITY.md)
before publishing; do not assume deleting the file or making the repo private
again removes existing copies.
