# What’s next

Working software first. Everything below is a direction, not a shipped feature.

## Before calling it production-ready

- Verify the complete invitation and encrypted media flow with two real GitHub accounts.
- Exercise Safari/Firefox recording and actual mobile keyboards, safe areas and touch.
- Add repeatable browser end-to-end tests and an opt-in two-account smoke test.
- Review retry/outbox behavior, abuse controls and hosting budgets under real traffic.
- Commission an independent security review before making stronger privacy claims.

## When the need is real

- Shared protocol/SDK and an interactive terminal client; the current CLI is scriptable, not a TUI.
- A GitHub-webhook-backed authorized relay for lower-latency updates. Git stays the source of truth.
- Larger encrypted media storage with explicit quotas and a retention policy.
- Clipboard/drop uploads, photo zoom gestures and playback-speed controls.

No fake presence. No magical deletion from Git history. No promise of infinite
free infrastructure. Make the actual conversation better, then ship the next bit.
