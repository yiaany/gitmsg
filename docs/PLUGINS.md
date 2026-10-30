# Plugins: reviewed protocol integrations

## What ships now

The stable extension point is **protocol v1**, not arbitrary JavaScript inside
the messenger. CLI and owner-installed Actions scripts can publish the same
events as the website. This kit includes a source template, manifest contract,
working coin-flip handler, test and plugin PR template. There is **no automatic
marketplace, remote loader, sandbox or runtime permission enforcement** in this
release. A manifest documents requested capabilities; it does not itself grant
or enforce them.

## Manifest v1

```json
{
  "manifestVersion": 1,
  "id": "coinflip",
  "name": "Coin flip",
  "version": "1.0.0",
  "description": "A cryptographically random heads or tails.",
  "execution": "actions",
  "entry": "index.mjs",
  "capabilities": ["chat:write"],
  "secureMode": "disabled"
}
```

Entry is a local file, never a URL. Source handlers export
`async run(context, input) => {text}`. The provided example accepts injected
`context.randomInt`; pure tests need no credentials or GitHub requests. Text
must be a nonempty string at most 4,000 characters. A reviewed adapter adds the
actual actor, random UUID, timestamp and exact protocol commit body. Start from
the downloadable Actions participant for transport and policy checks.

Capabilities are review labels: `chat:read`, `chat:write`, `media:write`,
`workflow:dispatch`. Every capability needs justification. Workflow dispatch
requires a named existing workflow, administrator initiation and explicit consent;
never turn message text into shell commands or unbounded URLs. No capability
grants access to room keys, OAuth tokens or other repositories. An Actions
adapter must fail closed if `gitmsg/security.json` exists or cannot be checked.
Do not supply room keys to Actions. Client-side integrations needing decrypted
content require a separate reviewed UI change and visible user consent.

## Contribution review checklist

- [ ] Manifest, README, license, example and deterministic unit tests.
- [ ] Smallest GitHub token permissions and clearly documented network calls.
- [ ] Explicit user action only; no commit-triggered self-reply loops.
- [ ] Real GitHub files and protocol commit body, stable event IDs for retries.
- [ ] Bounded content/time/rate use, no arbitrary HTML or dynamic code.
- [ ] Secure rooms refused, no tokens/keys/plaintext in logs.
- [ ] Failure UX, quotas, installation/removal and security limitations explained.
- [ ] UI, if any, uses existing coss controls and English labels.

## Rollout after this kit

1. Merge reviewed integrations into a static registry built with the app.
2. Render a room-specific install/enable panel listing exact capabilities and
   files/permissions. Install stays opt-in; never auto-enable after a PR merge.
3. Add a common trusted dispatcher with per-command limits, stable request IDs
   and explicit workflow allowlists. Keep Actions and client-only plugins separate.
4. Only introduce third-party runtime installation after designing real
   isolation, signed/version-pinned bundles, revocation and security review.
   A JSON manifest or iframe alone is not a sufficient security boundary.

Because the current repository is private, open-source it (or publish a separate
public integration-kit repo) before asking strangers to contribute via PRs.
Publishing source is a separate owner decision; this update does not change visibility.
