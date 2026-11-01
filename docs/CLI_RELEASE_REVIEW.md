# Terminal alpha preparation review — 2026-11-01

**Candidate only. Nothing has been pushed or published by this review.**

## Identity and key handling

- Intended package: `@yiaany/gitmsg@0.1.0-alpha.0`, public access, `alpha` tag.
  npm-scope ownership and authenticated publication are still unverified gates.
- The existing terminal OAuth Client ID remains bundled. It is a public app
  identifier, not a client secret or GitHub token. Device Flow requires user
  approval; `repo read:user` is explicitly documented as broad access.
- The source/history scanner returned no findings in accessible reachable Git
  history, staged text and nonignored source. The package allowlist/content scan
  returned no secret findings. These are best-effort detectors, not proof that
  all possible secrets or personal data are absent.
- Credentials remain in the OS vault/session memory; room keys are not uploaded
  to GitHub or included in the package. No website environment export, npm login,
  client-secret rotation or source/chat repository visibility change was made.

## Checks actually performed

Environment: macOS arm64, **Node 26.13.0**, npm 11.20.0, **Bun 1.4.4**.
Node's public distribution was checked against the official SHA-256 sums; npm
runtime/native package archives retain registry integrity checks.

- CLI typecheck, **63 Node tests**, **54 UI tests / 381 assertions**, builds and
  explicit npm content check passed.
- The local tarball installed into an isolated temporary global prefix with
  install scripts disabled, using a warmed cache of public npm metadata/archives.
  It was not a registry install of an already published gitmsg package.
- No Bun executable was supplied through PATH. The installed package resolved its
  npm-provided platform Bun and created both `gitmsg` and `git-message` commands.
  Launcher help, non-TTY startup and loading/exiting the packaged Node WebRTC
  worker passed without opening audio devices or starting OAuth/GitHub writes.
- Standard `npm audit --omit=dev` could not complete because registry DNS was
  unavailable to the shell. An alternate request to the **official npm bulk
  advisory API** queried 42 production/runtime package names and their selected
  versions, including platform runtime/native packages; it returned HTTP 200 with
  **no advisories**. This is not a completed `npm audit` report, an upstream
  libwebrtc/Bun native-code audit, or a guarantee about future advisories.

## Reviewed artifact

```text
filename: yiaany-gitmsg-0.1.0-alpha.0.tgz
compressed bytes: 65770
unpacked bytes: 262848
entries: 8
integrity: sha512-smkbqWVa9HvcUCDcIgCoHK0v6dcyhozh5SmJ75qg+N4WrqsOQG2CaM/IUV72JjG1k2/0CnRAhk4wT0s8mL6PKQ==
```

The eight entries are the exact allowlist in [CLI_RELEASE.md](CLI_RELEASE.md).
The archive is stored outside the source repository and has not been attached to
a GitHub release. Source changes are still uncommitted; the final approved commit
and artifact must be bound together before publication. Any payload change or
rebuild with different bytes invalidates this recorded artifact identity.

## Still required before claiming a finished release

1. Maintainer review/approval of the source diff and final release artifact;
   explicit GitHub commit/push approval if requested.
2. npm login using the real browser/2FA flow, scope ownership confirmation and
   explicit authorization to publish this package/version/tag.
3. Live Device Flow and two-consenting-account/device acceptance, especially real
   microphone/speakers and website-to-native calls. Synthetic tests do not prove
   these. Keep the alpha limitations visible.
4. Other-platform clean install/audio acceptance, and a fresh registry install
   after an authorized publish. macOS arm64 checks do not validate every runtime
   mapping or the newly added CI workflow on GitHub-hosted runners.
5. Only after publication, update pending-publication copy and announce verified
   installation commands. Do not silently promote a prerelease to `latest`.
