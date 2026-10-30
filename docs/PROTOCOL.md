# gitmsg event protocol v1

Room = repository + branch. Every event is an immutable JSON file at `events/YYYY/MM/DD/<id>.json`. Its creation commit must contain the exact marker `gitmsg:event:v1\n` followed by compact event JSON in the commit description. An ordinary file edit without the marker will **not** appear in chat. Commit subjects must contain no secrets. Read with GitHub's commits API filtered to `path=events`, oldest first; validate with `src/lib/protocol.ts`.

```json
{"v":1,"id":"unique-uuid-here","kind":"message","actor":{"id":1,"login":"octocat"},"createdAt":"2026-10-30T12:00:00.000Z","text":"hello"}
```

Kinds: `message`, `edit`/`delete` (original author and `target` ID), `reaction` (`target`, supported `emoji`, explicit boolean `active`). Messages may have `replyTo`. Text limit: 4,000 UTF-16 code units. IDs: 8–80 ASCII letters/digits/underscore/hyphen. Actors are public repository-writer assertions, not verified signatures. The website replaces app-submitted actors with its authenticated identity. Materialize in canonical Git order; deduplicate by ID, never client timestamp. Deletion is only a UI tombstone.

Attachments: up to four metadata objects `{id,name,mime,size,sha256,iv?,duration?}` referring to a separately committed `media/<id>.bin`. At most 2 MiB before encryption (+16 byte tag); recordings at most 60 seconds. Images are locally rasterized to WebP before upload. Supported renderers are raster images, browser audio and Excalidraw JSON. Fetch only after a click; verify SHA-256 before rendering. Binary `.bin` is a storage container; metadata provides MIME/name. Failed uploads/events can leave orphan blobs, not rollback or erasure.

Board snapshots use `application/vnd.excalidraw+json`; each attachment stores a complete scene, limited to 2,000 elements, no embedded images. Versions are messages, not automatic CRDT merges. `savedFrom` contains original repo/message/optional SHA; Save to Git copies attachment bytes into the private Saved Messages repo rather than retaining a fragile cross-repo link.

Secure envelopes and AAD: [ENCRYPTION.md](ENCRYPTION.md). Plaintext read clients cannot materialize encrypted mutation kinds. Never send a key to GitHub or Actions.

## Three clients

- **Website:** room → Chat tools → Terminal / GitHub offers the downloadable Node 22 CLI and a GitHub-editor event generator.
- **Terminal:** `public/integrations/gitmsg.mjs`, no dependencies. Authenticate with `GITHUB_TOKEN` through an environment credential manager, optionally set `GITMSG_BRANCH`. Commands: `read`, `send "text"`, `propose "text"`. Secure rooms require `GITMSG_KEY_FILE` pointing to a private backup file (restrict permissions to its owner); never pass the secret in command arguments. Read currently prints the latest 100 **raw events**, not a fully materialized transcript or attachments.
- **GitHub:** create the generated JSON path and paste the exact marker+JSON into commit description; the web UI provides both. Plaintext editor posting is inappropriate in secure rooms. GitHub remains able to display ciphertext JSON in secure repos.

PR messages use `gitmsg-proposals/<id>` in the same repo. Merge with an actual **merge commit**, never squash/rebase, to preserve the event-bearing commit. GitHub branch protection still applies. Website review links open the real PR; encrypted proposal content is intentionally not displayed by GitHub.
