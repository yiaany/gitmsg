# gitmsg / terminal manual

Detailed setup, controls, authentication, media and security reference.
For the short version, see the [README](README.md) or [quick start](../docs/CLI.md).

## Install once. Launch whenever.

**Alpha channel:** `@yiaany/gitmsg@0.1.0-alpha.0`. Experimental, not independently
audited; read the call/network and encryption boundaries below before use.

```sh
npm install --global @yiaany/gitmsg@alpha
gitmsg
```

Requires **Node.js >=26.4** and npm. npm installs a pinned platform-specific Bun
runtime as an optional dependency; no separate Bun setup or launch-time download.
Do not omit optional dependencies. `git message` launches the same app. To update,
repeat the install command. To uninstall, use `npm uninstall --global @yiaany/gitmsg`;
sign out/revoke access separately if desired.

The npm name **`gitmsg` is an unrelated package**. Do not run `npx gitmsg` expecting
this client. The package name is **`@yiaany/gitmsg`**; the installed commands are
**`gitmsg`** and **`git message`**. [Release gates](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/docs/CLI_RELEASE.md).

This package is separate from the Next.js website. It does not change Vercel's
runtime, dependencies, OAuth callback or production environment variables.

## Development

Use **Node.js >=26.4** (matching OpenTUI's declared requirement). The pinned
**Bun 1.4.4** dependency renders the UI through native FFI; Node runs the launcher,
isolated WebRTC worker and unit tests. Native audio calls also require the optional
`@roamhq/wrtc` binary for your platform (macOS/Linux arm64/x64, Windows x64).
Windows arm64 native calls are not supported by this dependency.

```sh
cd cli
npm ci --include=dev --include=optional --ignore-scripts
npm test
npm run typecheck
npm run test:ui
npm run build
node bin/gitmsg.mjs
```

After an npm install puts the binaries on PATH, `gitmsg` and
**`git message`** open the same interface. No Git alias or Git configuration is
written. Start in any project: the launcher switches to its own package directory,
disables Bun's automatic `.env` loading, and never shells out to Git.

## Your GitHub, without copying a token

1. Choose **Continue with GitHub**. The separate terminal OAuth App's public ID is
   bundled; users do not need to register their own app. Device Flow uses no
   callback listener and **no client secret**. Review the app name before approving.
2. To use your own app, choose **Use a different OAuth App**, or supply its public
   ID via `GITMSG_CLIENT_ID`. Enable Device Flow in that app's GitHub settings.
3. The UI shows `https://github.com/login/device` and an eight-character code.
   Click the link (or press Enter) to open your browser. Verify the app
   name/permissions in GitHub, enter the code and authorize. Only the fixed GitHub
   URL is opened; codes/tokens are never put in it. SSH never opens a remote browser.
4. The CLI polls at GitHub's interval, honors `slow_down`, expires/cancels cleanly,
   verifies `/user`, then saves the token to the **OS credential store**.

OAuth requests `repo read:user`: `repo` is broad access to private repositories,
**not** room-specific permission. No `workflow`, organization administration or
Actions scopes are requested. GitHub App least-privilege onboarding is a later,
separate flow; this alpha does not pretend OAuth is narrowly scoped.

The bundled **OAuth Client ID is intentionally public**, not an API token or
client secret. It cannot log in as you without GitHub authorization. Keep your
OAuth application's Device Flow enabled; users verify the app and permissions on
GitHub. Public IDs can still be copied/abused, so do not treat branding as proof
that a login request is trustworthy. The CLI contains no website client secret.

Credentials use Bun's experimental Secrets API: macOS Keychain, Linux libsecret
(an unlocked secret-service daemon is required), or Windows Credential Manager
with device-local persistence. **There is no plaintext fallback.** If saving fails,
the UI says so and the token stays in memory for that session only. A credential
manager can optionally supply `GITMSG_TOKEN` for a session; it is not saved.
The CLI never imports `gh` credentials or silently reads `GITHUB_TOKEN`.

`gitmsg auth logout` removes only this client's local vault entry. Revoke actual
authorization in GitHub **Settings → Applications**. Expired tokens require a new
Device Flow; refresh tokens are deliberately not retained in this alpha.

## Choose a room

Hover a chat in the sidebar for **×**, or select it and press **X / Delete**.
After confirmation it is hidden from this device's list, **not deleted from
GitHub**: history, repository and membership remain unchanged. `/join owner/repo`
restores it, including its session draft. Hidden IDs are scoped to the account
and saved in the system credential store; if unavailable they last this session.

- **Join existing:** paste `owner/repo` or a plain GitHub repository URL. The CLI
  requires an active **private** repo with a valid `.gitmsg/room.json`. It never
  initializes or overwrites an unmarked repo. Public channels are not supported yet.
- **Create private:** enter a name, review `OWNER/gitmsg-NAME`, then explicitly
  confirm. Cancel is selected by default. Only a new private repo, its initial
  commit and the compatible room marker are created — no local project upload.
- **Invite a friend:** click **+ Invite** or type `/invite @username`. Review and
  confirm granting repository **write access**. Only administrators can invite.
- **Accept invitations:** `/inbox` shows pending private gitmsg invitations. Accept
  explicitly; the room marker is checked before opening. `/join` also accepts a
  GitHub `/invitations` link and offers the matching pending invitation.
  Sharing a URL alone grants **no access**. Encryption keys must be shared separately.

## Clean UI and commands

`/help` contains the full command list, keyboard controls and privacy notes. There
are no permanent navigation banners. `Ctrl+K` opens the chat picker. Sidebar rows
show friendly titles (or `Conversation N` for generated IDs), latest loaded text
and unsent-draft indicators. Explicit two-person room metadata supplies peer names;
message authors are never guessed to be recipients.

Sidebar: **↑↓** highlight, **Enter** open, **→** open directly in the composer.
History: **←** sidebar, **↑↓** scroll, **→ / Enter** compose. Composer: **↑** history,
**←** sidebar when empty or at the start; ordinary text-cursor arrows are preserved
inside a draft. **Alt+←** opens
the sidebar even while drafting. **Ctrl+G** invites from anywhere in the chat.
`Tab` / `Shift+Tab` cycle sidebar, history, Invite and composer. `Esc` steps back;
on narrow terminals, sidebar navigation opens the picker. Drafts and recent history stay separate for each
chat **in memory**; they are cleared on exit/sign-out. Previously validated room
metadata and loaded history display immediately while messages refresh in the
background. Switching does not disable typing or wait for that refresh; stale
responses cannot replace the selected chat. Writes still revalidate access,
repository privacy, branch and encryption policy against GitHub.

Short 180 ms eased transitions run on OpenTUI's shared animation clock at a target
of **60 FPS**, pausing on completion rather than continuously redrawing the app.
Real frame rate depends on terminal/PTY throughput. Set `GITMSG_REDUCED_MOTION=1`
to disable motion. No animations trigger GitHub calls.

### Appearance and commands

The two-row `gitmsg` wordmark uses OpenTUI's built-in **ASCIIFont `tiny`**, as
documented in [ASCIIFont](https://opentui.com/docs/components/ascii-font/),
not hand-drawn glyphs or a web font. A separate header leaves clear space above
the sidebar. The messenger
uses quiet split surfaces instead of nested cards: a chat rail, a clear
conversation, and a compact composer with a thin rounded outline and bottom breathing room. Sidebar cards
have inset padding; opened rooms use a quiet fill and keyboard focus a brighter
fill plus a small chevron. Chat cards and messages use subtle rounded outlines;
sidebar action labels are vertically centered in their highlights. Messages have a two-row gap,
and only message bodies participate in text selection. New messages fade in;
pending text sends have an indeterminate signal that disappears on
success or failure. It is not a delivery/read receipt or upload percentage.

The composer soft-wraps long drafts, grows upwards to five text rows (three in
short terminals), then scrolls internally while keeping its bottom edge fixed.
**Enter** sends; **Shift+Enter** inserts a newline where supported; **Ctrl+J** is
the newline fallback. The 4,000-character limit also applies to pasted text.
Up moves through wrapped rows and opens history only from the first row.
Already running terminal processes keep their old UI until restarted; rebuilding
does not hot-reload authenticated sessions or discard their in-memory drafts.

Hover a message for **Copy / Reply** underneath; the action row reserves space so
messages do not jump. Copy preserves line breaks. Select terminal text and use
**Ctrl+C** (copies instead of quitting when selected), **Ctrl+Shift+C**, or **⌘C**
in the browser preview. Holding **Shift** while dragging bypasses terminal mouse
handling for the browser/terminal's own text selection. With no selection, plain
Ctrl+C still quits; copy-only shortcuts never quit. Native local clipboard writes
fall back to terminal OSC52; SSH never writes the remote host clipboard. The
browser bridge copies through the browser clipboard API and reports denial.

Copy shows progress and a short **✓ Copied** beside that message, only after a
confirmed clipboard write. No extra banner or second confirmation button. The
preview writes during the original Copy click, before a PTY round trip loses
user activation; the native CLI writes to the OS clipboard. OSC52-only terminals
can report a request, not a verified write.

**Reply** opens a cancellable quote above the composer, preserves the draft and
stores its target separately per chat. Only Enter/Send Image sends it. Replies
use the shared `replyTo` protocol (encrypted inside secure-room events). Click a
reply's quote to jump to a loaded original. Deleted/locked messages cannot be
copied or selected as reply targets. **Esc / ×** cancels a pending reply.

Type **/** in the composer or chat picker to see **every slash command**. Keep
typing to filter; **↑↓** select; **Tab** or **Enter** completes. Enter on an exact
command runs it. Argument-taking commands complete with a trailing space.
**Esc** hides suggestions without changing your draft. `//` stays literal text.

**/themes** opens live previews of **Mono** (default, entirely grayscale),
**Violet**, **Tokyo Night**, **Catppuccin Mocha**, and **Paper** (light).
**↑↓** or a click previews, **Enter** applies, **Esc** restores the previous theme.
All surfaces, inputs, focus rings, image status text and help share semantic
colors. Themes last for the session; `GITMSG_THEME=paper` selects a startup theme
without writing any preference, credential or chat file.

Design references: [OpenTUI examples](https://opentui.com/packages/opentui-examples/),
[animation clock](https://opentui.com/docs/application-apis/animation),
[Tokyo Night](https://github.com/folke/tokyonight.nvim),
[Catppuccin palette](https://github.com/catppuccin/palette).
The latter two contribute color references, not copied application layouts.

Invitations have a dedicated result panel with **Copy invitation link** and
**Invite another friend**. Clipboard support depends on terminal OSC52 permissions;
if unavailable, select the displayed link. All access grants still need confirmation.

Commands: `/chats`, `/new [name]`, `/join owner/repo`, `/invite @username`, `/inbox`,
`/attach /absolute/image.png`, `/voice`, `/secure`, `/call`, `/hangup`, `/themes`, `/refresh`, `/logout`, `/help`. Commands never become
chat commits. Unknown commands are refused. Use `//` for a literal leading slash.

**Paste images:** in a native local terminal, **Ctrl+V** explicitly reads an image
from the OS clipboard, without shell commands or temporary files. A single pasted
absolute image path (including quoted paths or local `file://` URLs) also opens a
preview; ordinary text paste is unchanged. The local browser PTY preview supports
image paste and file drop by transferring bytes over its authenticated bridge,
not by injecting file data into terminal text. SSH and bridge sessions never read
the server's clipboard. Terminal/clipboard support varies; `/attach` is the
fallback. No clipboard polling or automatic upload.

`/attach` and image paste open a local preview, with **Send Image first and selected**.
**Enter** explicitly confirms; **↓ → Enter** selects Cancel; **Esc** cancels.
Pasting preserves the existing draft. Only the
explicitly confirmed image is uploaded, never a folder or other project files.
PNG, JPEG, GIF (still preview) and WebP are supported, up to 2 MiB. Remote images
are loaded from authenticated GitHub blobs, size/hash checked, then decrypted if
necessary. The latest four images load automatically. Click any image or its
filename (including an unloaded older image) to open a large, centered preview
with a rounded frame, filename, dimensions and size. **Esc**, **Enter** or **× Close**
returns to the same conversation and draft. Viewing is read-only, reuses verified
cached bytes and cancels pending reads when closed.
Previews are limited to 16 megapixels and downscaled in memory; terminal cell/pixel
geometry preserves aspect ratio. Verified image bytes have a bounded in-memory
cache (eight images/eight MiB per session). Native Kitty/Sixel
terminals show graphics; other terminals get color-block previews, not fake URLs.

Reading/opening a room creates nothing. Only submitting a nonempty message writes
an event. New event files use unique IDs; existing messages are not overwritten.
No auto-retry of writes: an explicit retry of an ambiguous send checks the same
event path before sending, avoiding a duplicate while the process remains open.
If initialization fails after repository creation, the UI reports that the repo
already exists; it neither recreates nor deletes it.

## What works, and what does not (yet)

### Voice messages

Click **● Voice** or run `/voice`. Recording starts only after this action and
device permission. The five-row cell waveform grows with measured RMS loudness;
there is no fake audio animation. Native recording uses OpenTUI `Audio.openCapture`
at 16 kHz mono; the browser PTY uses the browser microphone, never the server's.
Both produce bounded PCM16 WAV in memory (60 seconds, under 2 MiB). No `ffmpeg`,
shell process, project-file upload or plaintext recording file is used.

**Enter** stops recording; the preview starts on **Cancel**. Select **Listen** or
**Send Voice** with arrows/Enter or the mouse. Esc cancels and releases the input.
Drafts are preserved. Click **▶ Play / ■ Stop** on a received voice to listen
inside the terminal. Native playback supports these PCM WAV recordings; the
browser bridge also plays the website's WebM/Ogg/MP4 attachments. Unsupported
devices/codecs and denied permissions show an error, never a pretend success.

### `/secure`

Open a chat and type `/secure`, then explicitly confirm. The administrator enables
the shared `gitmsg/security.json` policy. New text, reply targets and attachment
metadata use **AES-256-GCM** with a cryptographically random 256-bit room key;
image and voice bytes are separately authenticated/encrypted before upload.
GitHub receives only ciphertext and a key fingerprint, **never the secret key**.

Save the key to the system credential store, or explicitly choose **Enable +
create private key backup** on macOS/Linux. This alternative displays its exact
home-directory path before confirmation, creates a new owner-only `0600` file,
verifies it and never overwrites an existing file or follows a symlink. It is an
**unencrypted private backup**, not an OS keychain substitute; protect your disk.
If durable storage fails, no policy is written. An ambiguous GitHub response
retains the same saved key so an explicit retry does not generate a different one.

Use `/secure import /absolute/key-file` or `GITMSG_KEY_FILE` to load a separately
shared owner-only backup. Never paste the raw key into a message or store it in
the chat repository. `/secure` offers an explicit **Copy secret key** action for
sharing through another trusted channel. Missing/wrong keys and policy loss fail
closed instead of sending plaintext. Keys are scoped to account, chat and branch.

This protects **new content**, not earlier plaintext commits, sender identities,
timestamps, ciphertext sizes, a leaked key or a compromised endpoint. A hash
alone is not encryption. Losing every key copy makes content unrecoverable.

### WebRTC audio calls

Click **◉ Call** or run `/call` in a writable private direct chat. Its room marker
must name exactly two participants, including you; the partner is verified through
GitHub, never guessed from a repository name or message author. The confirmation
defaults to **Cancel**. An incoming offer does not open the microphone: **A / Answer**
accepts it, **H / Decline** refuses it. Incoming discovery currently follows the
open conversation, not a background inbox of every repository.

The CLI reuses the website's `AudioCall` engine and bounded **offer / answer / end**
protocol. Only signaling is committed to GitHub; `/secure` also encrypts that SDP.
Live audio uses **WebRTC DTLS-SRTP**, with the website's STUN servers and **no TURN
relay**. Restrictive NAT/firewalls may prevent a direct connection. Standard-mode
SDP can expose network addresses to GitHub and the peer; encryption does not hide
call metadata. Your partner must keep a compatible gitmsg client open.

The themed ASCII panel shows preparing/ringing/connecting/connected/ended states,
a connection spinner, elapsed connected time, and local/remote **measured RMS**
levels. Only connection animation is decorative; the voice diagram is never
randomized. **M** mutes, **H** hangs up, `/hangup` ends the call from chat. **Esc**
hides an active panel without hanging up; click Call to return. Drafts survive.
Hangup, sign-out, exit and device failures release audio resources. Voice-message
recording is blocked during calls.

Native calls capture/play 48 kHz mono PCM through OpenTUI and isolate pinned
`@roamhq/wrtc@0.10.0` in Node (the native module is not loaded into Bun). PCM queues
are bounded and no recording is saved. Use headphones: this native capture path
does not promise browser-grade echo cancellation. SSH refuses server audio. The
local browser preview instead uses browser WebRTC, microphone and speakers over
authenticated local control IPC; it never opens server audio devices.

Automated tests include decoded non-silent synthetic WebRTC audio between two
isolated workers, signaling encryption, cancellation and UI/level rendering.
They do **not** establish real microphone/speaker quality or a tested cross-device
website-to-terminal call; those need two consenting accounts and devices.

- Keyboard-driven room selection, themed split-pane chat, narrow-terminal
  layout, scrolling and a controlled message composer.
- Real text sends; loaded history materializes edits, deletes and reactions from
  other clients. **A commit is not a read receipt.** No invented presence/messages.
- Latest **300 event commits**, canonical Git order, ETags, one read at a time,
  5-second polling (60 seconds unfocused) and rate-limit/error backoff.
- Existing secure rooms: optionally supply `GITMSG_KEY_FILE` with an absolute path to an
  owner-only room-key backup **outside the source repository**. Keys never go in
  arguments, config, GitHub requests or diagnostics. Missing/wrong keys, malformed
  policies or encrypted-history downgrades refuse plaintext sends.
- Terminal control/OSC/bidi sequences are stripped from rendered remote data.
  Recognizable tokens, private keys and room-key links are blocked in drafts.
  This is best-effort accident prevention, **not** a complete DLP/security audit.
- Image viewing/uploading, voice messages, WebRTC audio calls, secure-mode setup and invitations are
  implemented. Video calls, search, pagination beyond the recent window and
  composing edits/reactions are not implemented.

Standard chat is GitHub-readable. Deletion is a tombstone, not Git-history erasure.
Encryption protects content, not metadata or a compromised device. Quotas and
hosting limits still apply. See [security boundaries](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/docs/ENCRYPTION.md).

## Distribution safety

`npm run build` bundles only application code and shared protocol logic; OpenTUI
React and the BSD-2-Clause `@roamhq/wrtc` native dependency remain normal npm
dependencies with their own licenses/notices. `npm run pack:check` previews the explicit
package allowlist: launcher, built entry point, Node WebRTC worker, README, MIT license and package
metadata. No source maps, chat exports, `.env`, key backups or local config.

Do not publish, force-push, change repository visibility or enable an OAuth App
on somebody's behalf as a side effect of development. Before any release, settle
the npm name, verify the bundled public OAuth App and its permissions, run the secret
scanner and package-content checks, audit dependencies and test real Device Flow
and two consenting accounts in a dedicated private test room. Unit/UI tests use
only synthetic, in-memory GitHub responses; they do not prove live OAuth works.

Maintainers: [CLI release checklist](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/docs/CLI_RELEASE.md). Contributors:
[terminal development guide](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/CONTRIBUTING.md#terminal-client).

MIT. Dependencies retain their own [licenses and notices](THIRD_PARTY_NOTICES.md).
