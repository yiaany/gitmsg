# Terminal alpha preparation review — 2026-11-01

**GitHub source pushed; final npm alpha prepared and authorized, not yet published.**

## Identity and key handling

- Intended package: `@yiaany/gitmsg@0.1.0-alpha.0`, public access, `alpha` tag.
  Official registry `whoami` confirmed npm account `yiaany` after the maintainer
  completed official browser login. Publication is explicitly authorized.
- The existing terminal OAuth Client ID remains bundled. It is a public app
  identifier, not a client secret or GitHub token. Device Flow requires user
  approval; `repo read:user` is explicitly documented as broad access.
- The source/history scanner returned no findings in accessible reachable Git
  history, staged text and nonignored source. The package allowlist/content scan
  returned no secret findings. These are best-effort detectors, not proof that
  all possible secrets or personal data are absent.
- Credentials remain in the OS vault/session memory; room keys are not uploaded
  to GitHub or included in the package. npm's own user configuration stores the
  release credential outside the repository, owner-only; it was never printed.
  No website environment export, client-secret rotation or repository visibility
  change was made.

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
compressed bytes: 59234
unpacked bytes: 246667
entries: 8
sha1: 7f679e9eea128c9a7456072579a7b11b9aa1c9b9
integrity: sha512-ka1bHpnOsbptqs9ALV1K6QcXZiylpD6kWAEvy6kmUPrvdTEVVRwUvrLlnfWc4We7xX6hOIEE3/6Tq6zYaLsfSQ==
```

The eight entries are the exact allowlist in [CLI_RELEASE.md](CLI_RELEASE.md).
The archive is stored outside the source repository and has not been attached to
a GitHub release. The final payload uses the rewritten npm README; the full manual
is source-only. Local release checks, exact allowlist/content scan and a fresh
isolated archive install were repeated successfully. The publication metadata
must bind these bytes to the final source commit on `feat/terminal-client`.
Any payload change invalidates this recorded artifact identity.

## Remaining verification and alpha limitations

1. Official registry publication response, version/tag/integrity verification and
   fresh registry installation. No successful publication is claimed yet.
2. Live Device Flow and two-consenting-account/device acceptance, especially real
   microphone/speakers and website-to-native calls. Synthetic tests do not prove
   these. Keep the alpha limitations visible.
3. Other-platform clean install/audio acceptance. macOS arm64 checks do not validate every runtime
   mapping or the newly added CI workflow on GitHub-hosted runners.
4. Only after publication, update pending-publication copy and announce verified
   installation commands. Do not silently promote a prerelease to `latest`.
