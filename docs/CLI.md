# gitmsg in your terminal

Real messages are Git commits. Calls are WebRTC. The ASCII voice diagram is driven
by your microphone, not an especially confident random-number generator.

## Install and launch

**Available on npm:** `@yiaany/gitmsg@0.1.0-alpha.0`, using the `alpha` tag.
`gitmsg` on npm is an unrelated package; do not install it for this application.

Install [Node.js >=26.4](https://nodejs.org/) and npm, then:

```sh
npm install --global @yiaany/gitmsg@alpha
gitmsg
```

Subsequent launches need only `gitmsg`. `git message` is an alias for the same
launcher, not a Git configuration change. npm installs the pinned Bun binary for
your OS/CPU; the application does not download executables when you launch it.
Keep optional dependencies enabled. macOS/Linux arm64/x64 and Windows arm64/x64
have runtime mappings; native WebRTC currently has **no Windows arm64 binary**.
Cross-platform mappings do not constitute a real-device audio test on every OS.

Update with the same install command. `gitmsg --help` shows launcher options;
`gitmsg owner/repo` opens an existing marked private chat. Avoid `sudo` installs;
use a user-owned Node installation/npm prefix if global installs are denied.

## First conversation

1. Choose **Continue with GitHub**. Open the displayed GitHub device-login link,
   enter the one-time code and verify the app name and requested permissions.
2. Pick an existing private gitmsg conversation, or `/new chat-name` and confirm
   creating a new private repository. Signing in alone creates no repository.
3. `/invite @friend` → review → confirm. Your friend accepts the GitHub repository
   invitation, then opens the chat using `/join owner/repo` or its invitation link.
4. Type a message and press Enter. Shift+Enter (or Ctrl+J) inserts a newline.

No source-directory uploads, automatic local Git commits or hidden invitations.
Private repository access and room encryption keys are separate permissions.

## Your own GitHub connection

The default path is **your GitHub account using the bundled public OAuth Client
ID**. Users need no developer setup. A Client ID identifies an application; it is
not a password, client secret, API token or access grant. GitHub approval is still
required. OAuth asks for **`repo read:user`**: `repo` grants broad private-repository
access, not access restricted to a single room. Review and revoke it in GitHub's
Settings → Applications when appropriate.

Two optional paths:

- **Your own OAuth app:** enable Device Flow in your GitHub OAuth App and choose
  **Use a different OAuth App**, or set `GITMSG_CLIENT_ID` to its public Client ID.
  Never supply its client secret; the terminal flow does not use one.
- **Your own GitHub API token:** have your credential manager supply
  `GITMSG_TOKEN` in the process environment, then launch `gitmsg`. The token is
  session-only and is not automatically saved. It needs access to the private
  chat repositories and the operations you perform. Creating repositories and
  inviting collaborators require their corresponding permissions. Fine-grained
  tokens may need repository selection and cannot be assumed to support every
  feature. Do not put token literals in shell history, command arguments, `.env`
  files inside the source tree, screenshots or issues.

The CLI uses GitHub.com's fixed HTTPS endpoints. It does not silently import `gh`
credentials, read `GITHUB_TOKEN`, accept arbitrary API origins, or currently
support GitHub Enterprise Server. It is an online messenger, not offline chat.

OAuth credentials use the OS credential store (macOS Keychain, Linux secret
service, Windows Credential Manager). If secure storage is unavailable, the app
reports it and keeps the session in memory; **no plaintext credential fallback**.
`gitmsg auth logout` removes this client's saved OAuth credential. Uninstalling
the npm package does not revoke GitHub authorization or erase separate key backups.

## Commands worth remembering

| Command | What it does |
| --- | --- |
| `/chats`, `/join owner/repo` | Pick or join a conversation; drafts stay per chat |
| `/new [name]`, `/invite @username`, `/inbox` | Explicitly confirmed creation/invitations |
| `/call`, `/hangup` | Start/end a WebRTC audio call |
| `/voice` | Record up to 60 seconds; listen/cancel before explicitly sending |
| `/attach /absolute/image.png` | Local image preview, then confirm upload (2 MiB max) |
| `/secure` | Enable encryption after durable key storage and confirmation |
| `/secure import /absolute/key-file` | Import a separately shared owner-only room key |
| `/themes` | Mono, Violet, Tokyo Night, Catppuccin Mocha, Paper |
| `/refresh`, `/help`, `/logout` | Refresh, all commands, sign out |

Type `/` for completion. Hover a message for Copy / Reply. Ctrl+K opens chats.
Esc steps back; Ctrl+C without a selection exits. Removing a sidebar conversation
hides it locally after confirmation: it does not delete its GitHub repository.
For full keyboard, clipboard, image and accessibility details, see the
[terminal manual](../cli/MANUAL.md).

## Calling from a terminal. Actually.

Open a writable private chat with **exactly two participants in its room metadata**.
The partner is verified against GitHub; the app will not guess from message
authors or repository names. Legacy rooms without that metadata cannot call yet.

`/call` defaults to Cancel. An incoming call leaves the microphone off until
**A / Answer**. **M** mutes; **H** hangs up/declines. Esc hides the active panel
without hanging up; click Call to return. Connection states and elapsed connected
time are real; waveform levels are measured RMS. No audio is committed to GitHub.

Both clients must stay open and online. Incoming discovery currently follows the
open conversation, not every repository in the account. GitHub stores bounded
offer/answer/end signals; media is direct WebRTC DTLS-SRTP. There is **no TURN**,
so NAT/firewalls can block calls. Native audio uses the local computer; SSH refuses
remote-host microphone/speaker access. Use headphones: native capture does not
promise browser-grade echo cancellation. Device permissions remain necessary.

Automated tests cover synthetic native WebRTC audio and interface/cleanup paths,
not real microphone quality or a completed website-to-terminal call. Those remain
explicit live release acceptance checks, not marketing claims.

## Privacy, encryption and costs

Standard messages and signaling are readable by GitHub and repository readers.
SDP can expose network addresses. `/secure` encrypts **new** content, attachments
and call signaling with AES-256-GCM; room keys remain outside GitHub. Share keys
separately, preserve your backup, and never paste them into chat. Missing keys or
lost encryption policy fail closed. This does not erase earlier plaintext Git
history, conceal metadata, or secure a compromised endpoint. [Threat model](ENCRYPTION.md).

The Bill Gates line is a joke. No subscription to gitmsg is required by this
client, but GitHub quotas/storage limits and your host/network costs apply. It
does not promise unlimited free infrastructure. [Operating limits](SETUP.md#delivery-and-costs--no-hand-waving).

## Troubleshooting

- **Runtime missing:** reinstall with optional dependencies enabled; source
  developers can provide Bun >=1.4.4 on PATH. Nothing is downloaded on launch.
- **Sign-in unavailable:** check connectivity, GitHub status and whether the OAuth
  app has Device Flow enabled. Never paste a client secret to fix it.
- **Keychain unavailable:** unlock/install the OS keyring, or sign in for a
  memory-only session. Never work around it by writing an auth JSON file.
- **Call cannot connect:** allow microphone access, check the two-person marker,
  matching secure-room key, local audio devices and direct-network reachability.
- **Rate limited:** wait for the displayed cooldown. Do not automate rapid retries.

Report bugs with OS, architecture, Node/runtime version and synthetic reproduction
steps. Never attach tokens, keys, real chats or unredacted network traces.
[Contribute](../CONTRIBUTING.md#terminal-client) · [Security reporting](../SECURITY.md).
