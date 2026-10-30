# Secure conversations

Open **Room security** (shield) in a live private room. Only repository administrators can enable enforcement. Acknowledge history/key-loss limits, enable, then download the backup. Share the **secret key QR/link** privately and compare the SHA-256 fingerprint out of band. A regular room QR contains only an address. Neither QR grants GitHub access: invite/accept the collaborator separately.

## Cryptographic format

- Web Crypto generates a random 256-bit AES key. No password, room name, commit SHA or hash is used as a secret key.
- Each encryption uses a fresh random 96-bit IV and a 128-bit AES-GCM authentication tag, appended to the ciphertext. Base64url encodes binary fields without padding.
- Event additional authenticated data is UTF-8 JSON of `["gitmsg:event:v1", lowercaseRepo, baseBranch, eventId, actorId, createdAt]`. The complete inner event, including mutation kind/target, text, replies, attachment metadata and saved-source fields, is encrypted.
- The outer event is always `kind: "message"`; `sealed` contains `algorithm`, `iv`, `ciphertext`, and the SHA-256 digest of the raw key as `keyId`. Actor, date and ID remain public. PR envelopes bind to their destination/base branch, so decrypt after a merge commit into that branch.
- Media AAD is `gitmsg:media:<lowercaseRepo>:<attachmentId>`. The encrypted bytes go to `media/<id>.bin`; IV and SHA-256 digest of stored bytes are inside the encrypted event. Verification happens before decryption/rendering.
- `gitmsg/security.json` contains only public policy and fingerprint. App writes reject plaintext after enablement. An `encrypted` media flag is a declaration, not server verification of AES output; the server has no key. Trusted clients must actually encrypt.

## Keys and recovery

Keys are stored as CryptoKey objects in IndexedDB, extractable to support explicit backup/QR export. The origin's JavaScript can access them: IndexedDB is not a hardware vault. Secure drafts are kept in memory, not localStorage; live decrypted timelines are not persisted by the app. Export/download/clipboard operations deliberately expose plaintext or secret keys to the destination device.

Secret invitations carry `#key=...` in the URL fragment, never a query parameter. The app strips the fragment before OAuth/navigation and temporarily stores pending imports in sessionStorage in that tab, then removes them after import/rejection. Fragments are not sent in HTTP requests; browser history, extensions, clipboard sync and screenshots are still threats. Paste a backup or raw base64url key into **Import room key** on every new device. Check the fingerprint. Wrong keys are rejected.

There is no password reset, escrow, key rotation UI or key recovery server. Clearing site data can permanently lose access. Saved Messages has a **separate key**; open its security panel and back it up too. Saving from a secure room automatically enables destination encryption if needed, but does not retroactively encrypt its earlier saves.

## Honest boundaries

GitHub/Microsoft and the app server receive ciphertext for correctly encrypted new content, but see repo membership, authors, timestamps, commit counts, approximate sizes and public fingerprints. Old plaintext stays in all Git history and clones. Shared-key holders can read and forge content; actors are not signed identities. Removing a member does not revoke their key or old history. Create a new room/key to exclude a former member from future content.

A malicious website update, XSS, compromised device or extension can steal keys/plaintext. The website serves the encryption code, so this is not protection against an actively malicious app host. No forward secrecy, independent security audit or high-assurance messaging claim. Direct GitHub writes can bypass/remove policy; dedicated repos and trusted collaborators are mandatory. Actions bots intentionally refuse secure rooms and receive no room key.
