## Plugin summary

Name / ID / version:
What does the user gain? Include a screenshot or short recording if UI changes.

## Files and contract

- Manifest: `plugins/<id>/manifest.json`
- Source / local entry:
- README, install/uninstall instructions and license:
- Example output and protocol version:

## Permissions and trust

- Requested capabilities and why each is necessary:
- GitHub token permissions, external hosts, quotas and dependencies:
- How secure rooms are refused (or explicitly consented client-only processing):
- Deployment or other side effects and consent UI:
- Retry/idempotency strategy, failure behavior and rate limits:

## Verification

- [ ] Unit tests added, including invalid input and permission/security failures.
- [ ] `npm test`, `npm run typecheck`, `npm run build` pass.
- [ ] Tested against an isolated chat repository, not production code/history.
- [ ] No secrets, room keys, user chat data or arbitrary shell execution.
- [ ] No remote executable loading, auto-installation or message-trigger loops.
- [ ] Docs distinguish real operations from demo behavior and future work.

Test results / known limitations:
