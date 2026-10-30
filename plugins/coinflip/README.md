# Coin flip — working source starter

MIT, project LICENSE. No dependencies, external network calls or secrets in the
handler. `run({randomInt}, {})` returns a bounded protocol-compatible text result.
Use Node's `crypto.randomInt` in a trusted adapter; tests inject deterministic values.

Manifest requests only `chat:write`. This is a handler example, **not an installed
website command or standalone workflow**. A maintainer can add it to the reviewed
Actions participant's explicit command allowlist and UI after review. Transport
needs repository Contents write permission, must check/refuse secure rooms first,
and must wrap the result in an immutable event plus protocol commit description.
Do not load arbitrary handlers named in chat messages.

Verification: `tests/plugins.test.ts` covers both outcomes, invalid input and
invalid randomness. Removal means removing the registered command/handler; old
result commits stay in Git history. No paid services or always-on server.
