# gitmsg event protocol v1

Room = repository + branch. Every event is an immutable JSON file at `events/YYYY/MM/DD/<id>.json`. Its creation commit must contain the exact marker `gitmsg:event:v1\n` followed by compact event JSON in the commit description. An ordinary file edit without the marker will **not** appear in chat. Commit subjects must contain no secrets. Read with GitHub's commits API filtered to `path=events`, oldest first; validate with `src/lib/protocol.ts`.

```json
{"v":1,"id":"unique-uuid-here","kind":"message","actor":{"id":1,"login":"octocat"},"createdAt":"2026-10-30T12:00:00.000Z","text":"hello"}
```

Kinds: `message`, `edit`/`delete` (original author and `target` ID), `reaction` (`target`, supported `emoji`, explicit boolean `active`). Messages may have `replyTo`. Text limit: 4,000 UTF-16 code units. IDs: 8–80 ASCII letters/digits/underscore/hyphen. Actors are public repository-writer assertions, not verified signatures. The website replaces app-submitted actors with its authenticated identity. Materialize in canonical Git order; deduplicate by ID, never client timestamp. Deletion is only a UI tombstone.

Attachments: up to four metadata objects `{id,name,mime,size,sha256,iv?,duration?}` referring to a separately committed `media/<id>.bin`. At most 2 MiB before encryption (+16 byte tag); recordings at most 60 seconds. Images are locally rasterized to WebP before upload. Supported previews are raster images and browser audio; other supported files are downloadable attachments. Fetch only after a click; verify SHA-256 before previewing or downloading. Binary `.bin` is a storage container; metadata provides MIME/name. Failed uploads/events can leave orphan blobs, not rollback or erasure.

Terminal voice recordings use `audio/wav`: 16 kHz, mono PCM16, at most 60 seconds.
Optional `waveform` contains 1–64 integer RMS bins in 0–31. Duration/waveform and
other attachment metadata are inside the sealed event in secure rooms; the blob
itself uses AES-256-GCM with the existing media context. Browser WebM/Ogg/MP4
recordings remain supported; native terminal playback currently decodes PCM WAV.

The whiteboard editor has been removed. Historical `application/vnd.excalidraw+json` attachments remain valid and downloadable (including in encrypted rooms); existing messages and Git history are unchanged. `savedFrom` contains original repo/message/optional SHA; Save to Git copies attachment bytes into the private Saved Messages repo rather than retaining a fragile cross-repo link.

Secure envelopes and AAD: [ENCRYPTION.md](ENCRYPTION.md). Plaintext read clients cannot materialize encrypted mutation kinds. Never send a key to GitHub or Actions.

`kind: "call"` is bounded audio signaling, never a message/mutation or unread item.
Its `call` object holds `{id,to,phase,expiresAt,sdp?,reason?}`. Offer/answer SDP is
ASCII, at most 14,000 characters, exactly one audio media section. End has no SDP
and a bounded reason. Secure calls keep the outer call kind but seal all parameters.
Freshness is checked at consumption, not historical parsing. See [CALLS.md](CALLS.md).

## Three clients

An additional **OpenTUI terminal alpha** is under development in [`cli/`](../cli/README.md),
with Device Flow and OS credential storage. It reuses the website protocol and
encryption modules. It is not published to npm; the existing `gitmsg` npm name
belongs to an unrelated package. The downloadable script below remains available.

- **Website:** room → Chat tools → Terminal / GitHub offers the downloadable Node 22 CLI and a GitHub-editor event generator.
- **Terminal:** `public/integrations/gitmsg.mjs`, no dependencies. Authenticate with `GITHUB_TOKEN` through an environment credential manager, optionally set `GITMSG_BRANCH`. Commands: `read`, `send "text"`, `propose "text"`. Secure rooms require `GITMSG_KEY_FILE` pointing to a private backup file (restrict permissions to its owner); never pass the secret in command arguments. Read currently prints the latest 100 **raw events**, not a fully materialized transcript or attachments.
- **GitHub:** create the generated JSON path and paste the exact marker+JSON into commit description; the web UI provides both. Plaintext editor posting is inappropriate in secure rooms. GitHub remains able to display ciphertext JSON in secure repos.

PR messages use `gitmsg-proposals/<id>` in the same repo. Merge with an actual **merge commit**, never squash/rebase, to preserve the event-bearing commit. GitHub branch protection still applies. Website review links open the real PR; encrypted proposal content is intentionally not displayed by GitHub.
