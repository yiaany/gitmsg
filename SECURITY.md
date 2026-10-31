# Security

gitmsg is an experiment, not an independently audited secure messenger. The
[threat model](docs/ENCRYPTION.md) is part of the product, not the fine print.
Security fixes target the latest `main`; older snapshots have no support guarantee.

## Reporting a vulnerability

**Do not open a public issue with exploit details, credentials or private chats.**
Use this repository's **Security → Report a vulnerability** when private reporting
is enabled. Otherwise contact the maintainer privately through a contact channel
on their GitHub profile. If none is available, open a minimal issue asking for a
private reporting channel, with no vulnerability details. There is no guaranteed
response time or paid bug bounty.

Include the affected commit/deployment, browser/runtime, impact and minimal steps
using synthetic accounts and a throwaway repository. Redact tokens, cookies,
OAuth codes, room keys, collaborator details and network captures. Do not test
against other users or production chat repositories without permission.

## If a secret was exposed

1. Revoke/rotate it at its issuer first. Removing a line is not revocation.
2. Update the affected deployment's environment variables and redeploy.
   Rotating `SESSION_SECRET` invalidates current sessions; users must sign in again.
3. A leaked room key exposes that room's protected history. Use a new room/key
   for future messages; changing a Git commit cannot undo downloaded copies.
4. Coordinate any history cleanup privately. Do not force-push or delete other
   contributors' work as an automatic response.

## Boundaries worth knowing

- Standard messages and call signaling are readable by GitHub/repository readers.
- Optional room encryption protects new content, not old Git history. Shared-key
  holders and direct repository writers are trusted; actors are not signatures.
- The website serves the encryption code. A compromised host, browser or device
  can expose keys. IndexedDB is not a hardware vault.
- Direct WebRTC media is encrypted in transit, but no TURN relay means some
  networks cannot connect. Standard SDP can disclose IP addresses in Git history.
- Public profiles/channels are public. Never make chat/settings/Saved Messages
  repositories public when opening this **source-code** repository.

See [safe publication](docs/PUBLISHING.md) for the release checklist. Secret
scanners reduce accidents; they cannot prove the absence of all sensitive data.
