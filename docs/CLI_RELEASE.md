# Terminal alpha release checklist

Target: **`@yiaany/gitmsg@0.1.0-alpha.0`**, public npm access, **`alpha`** dist-tag.
The first alpha is published; see the dated review for verification and tag status.
The website root package remains private. Publish only the `cli/` package.

The [dated preparation review](CLI_RELEASE_REVIEW.md) records checks that actually
ran, the reviewed archive identity, network limitations and remaining gates.

## 1. Identity, consent and secrets

- Confirm the authenticated npm account owns or may publish under `@yiaany`.
  GitHub username ownership does not establish npm ownership. A registry 404 does
  not reserve a name. If the scope is unavailable, agree another name and update
  package.json, lockfile, launcher help, docs and tests together.
- Do not publish the unrelated unscoped `gitmsg` package or request its ownership.
- Keep the bundled terminal OAuth **Client ID** public; it is not a secret. Verify
  the maintainer controls that app, Device Flow is enabled and the approval page
  shows the intended app/scopes. No client secret belongs in this package.
- No access/refresh tokens, npm credentials, room keys, `.env`, `.npmrc`, chat
  events, media, local key backups or machine paths in source/history/tarballs.
- Run `npm run check:secrets` from the repository root, plus a maintained redacted
  scanner on source. The source scanner covers reachable Git history and staged
  content; neither scanner proves the absence of all secrets. Ignored build-cache
  keys are not source-publication artifacts; never include `.next` or `.vercel`.
- Follow [the source-publication checklist](PUBLISHING.md) for GitHub refs,
  attachments, logs, visibility, push protection and keeping chat repos private.
  Do not change Vercel secrets, OAuth callbacks or repository visibility as a side
  effect. Do not push/commit/publish without the maintainer's separate approval.

## 2. Reproducible local gates

Use Node >=26.4 (the OpenTUI requirement); npm installs pinned Bun 1.4.4 via optional
platform packages. No project-owned install/postinstall downloader or launch-time
network installer. Keep optional dependencies enabled.

```sh
cd cli
npm ci --include=dev --include=optional --ignore-scripts
npm run release:check
npm audit --omit=dev
npm pack --pack-destination /an/explicit/private/release-directory
```

`release:check` runs the root secret scan, CLI typecheck, Node tests, UI tests,
build and package-content scan. It does not publish. `prepack` rebuilds; the
`prepublishOnly` gate runs local checks before a normal directory publication.
Publishing an existing `.tgz` does **not** replace reviewing/testing that exact
artifact. Do not bypass gates with `--ignore-scripts` when publishing.

Record a real online advisory audit separately. A failed/unreachable audit is
**not** a passing audit. Review runtime/native transitive dependencies and license
notices; absence of advisories is not a security audit of this application.

The npm payload must contain exactly:

```text
LICENSE
README.md
THIRD_PARTY_NOTICES.md
bin/gitmsg.mjs
bin/runtime.mjs
dist/call-worker.js
dist/main.js
package.json
```

No source maps, dependencies copied into the archive, fixtures, screenshots,
private configs or chat exports. npm installs external dependencies separately.
Review tar entries, size, SHA-512 integrity and the source commit for the exact
archive approved for release. Rebuilding after approval requires a new review.

## 3. Acceptance before first publication

- In a fresh user-owned npm prefix, install the **exact local tarball**, not the
  source directory. With no Bun on PATH, confirm npm-installed runtime resolution,
  `gitmsg --help`, interactive startup, `git message`, update and uninstall.
  `npm run test:package -- /absolute/path/to/archive.tgz` automates isolated npm
  installation, runtime resolution, both installed command links, non-TTY startup
  and device-free Node WebRTC loading. It downloads public dependencies from npm
  unless `GITMSG_PACKAGE_TEST_OFFLINE=1` requests a previously warmed public cache.
  This smoke check does not substitute for interactive/live acceptance.
- Test clean installs on macOS/Linux x64/arm64 and Windows x64 as available. Musl
  has a runtime mapping, but mapping is not proof of a tested microphone/device.
  Windows arm64 has a terminal runtime but no native WebRTC dependency binary.
- Use two consenting accounts/devices and a dedicated private test chat: Device
  Flow, secure storage fallback, invite/join, message, Copy/Reply, image and voice,
  `/secure`, native-to-native and website-to-native calls, mute, hangup and cleanup.
- Verify no microphone before explicit Start/Answer; no upload before Send; no
  plaintext signaling fallback when keys/policy are unavailable.
- Synthetic tests are required but **do not satisfy** real-device audio, live OAuth
  or website-to-terminal acceptance. Record untested platforms honestly; keep the
  alpha label and current limitations in the user docs.

CI checks source in isolated jobs and has **no publishing credentials**, npm login,
write permissions or automatic release step. A green workflow is not publication.

## 4. Authorized npm release (maintainer action)

Only after explicit approval, use the npm CLI's real browser/2FA authorization
flow. Never paste an npm token or one-time password into a public chat, source,
workflow or command arguments. No npm credentials are needed to prepare an archive.
For the reviewed artifact, public access and the alpha tag must be explicit:

```sh
npm publish /path/to/reviewed-yiaany-gitmsg-0.1.0-alpha.0.tgz --access public --tag alpha
```

This document is an instruction for a later authorized release, not permission
for an agent or CI to run that command now. Do not claim provenance for a local
publish unless it was actually produced and verified. Prefer npm trusted
publishing for a separately reviewed future release workflow; never add a
long-lived npm token to an untrusted PR job.

After publication, verify registry metadata/integrity and the alpha tag, perform
one fresh registry install, and only then change “pending publication” notices to
“available.” Update the GitHub release/changelog with limitations and checks that
actually ran. Promotion to `latest` is a separate maintainer decision.
