# gitmsg

<p align="center">
  <a href="https://www.gitmsg.fun/">Open gitmsg</a> ·
  <a href="#the-weird-part-is-real">How it works</a> ·
  <a href="docs/SETUP.md">Run your own</a> ·
  <a href="docs/ENCRYPTION.md">Encryption</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-111111?style=flat-square" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5b7db1?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/storage-GitHub-8774e1?style=flat-square" alt="Stored on GitHub" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6c936c?style=flat-square" alt="MIT licensed" /></a>
</p>

## Some things should exist just for the fun of it.

We turned GitHub into a messenger. Chats are repositories. Messages are commits.
“I never said that” now comes with a `git log`.

Not because the world needed another chat app. **Because we wanted to see if it
would work.** No pitch deck. No grand plan to reinvent human connection. Just a
weird idea, a familiar interface, and the unreasonable satisfaction of making
them fit.

Bring your GitHub account. Invite a friend. Talk about something stupid.
**Real people. Real messages. A little Git underneath.**

## It’s a messenger. Use it like one.

| The familiar stuff | The slightly unhinged part |
| --- | --- |
| Private chats and public channels | Each conversation lives in its own repository |
| Replies, edits, reactions and Saved Messages | Every action is an append-only Git event |
| Photos with a preview, caption and full-size viewer | Media is a real Git blob, verified before display |
| Voice notes with waveforms and pause/resume | Record, listen, send. No fake audio bars |
| Search, pins, unread badges and keyboard shortcuts | Previews sync from actual commits; unread IDs stay local |
| Profile photo, display name, bio and a music link | GitHub is your identity; publishing a profile is explicit |
| Optional browser encryption | Your keys stay on your devices, not in the repo |
| A tiny CLI and opt-in GitHub Actions integrations | The browser is not the only way to join the conversation |

Dark and light themes. Mobile navigation. Reduced-motion support. An English
getting-started channel after sign-in. No fake people, simulated replies, Telegram
account access, typing-indicator commits or surprise repositories on login.

## Take it for a spin

1. **Sign in with GitHub.** Read the permissions first. The sign-in itself creates nothing.
2. **Start a chat.** Pencil → **New Message** → find a GitHub username → **Start chat**.
3. **Bring your friend.** They accept the repository invitation on GitHub. Share the
   chat link or QR from **⋮ → GitHub tools → Add members**. A link alone is not access.
4. **Send something.** A photo. A voice note. An extremely important “lol”. It lands in Git.
5. **Want encryption?** Open **Room security**, back up the key and share it separately.

> The linked site may be running an earlier deployment. This repository is the
> source of truth; local checks are not proof of a deployed release.

## The weird part is real

```text
  You                     gitmsg                          GitHub
   │                         │                               │
   ├─ send a message ────────►│                               │
   │                         ├─ authenticate + validate ─────►│
   │                         │                               ├─ events/…/<id>.json
   │                         │◄──────── commit SHA ──────────┤
   │◄── confirmed in Git ─────┤                               │
   │                         │                               │
   └─ other participants pick up the commit through polling ──┘
```

One event file, one actual commit. The structured event is also in the commit
body, so a page of history doesn’t require reading every file individually.
`message`, `edit`, `delete`, `reaction` — materialized in **Git order**, not whoever
set their laptop clock to 2099. Encryption seals event content and media before upload.

No persistent message database. No separate realtime subscription. No claim that
GitHub somehow became a free, infinitely scalable chat backend.

### What gets created — and when

| Repository | Created by |
| --- | --- |
| Private chat with `.gitmsg/room.json` | Explicitly starting a conversation |
| Public `gitmsg-channel-*` | Explicitly publishing a channel |
| Private `gitmsg-settings` | Saving a chat list or channel subscription |
| Public `gitmsg-profile` | Saving a profile **with publication consent** |
| Private `gitmsg-saved` | Opening/using Saved Messages |

Existing unmarked or incorrectly public/private account repositories are not
overwritten. Display titles can be Unicode; repository slugs remain separate.
Search and exports cover **loaded** history. Clone a chat repo for its complete history.

## Run your own

**Node.js 22 · Next.js 16 · React 19 · TypeScript**

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Then open `/setup`. You’ll need GitHub App or OAuth credentials and a random
session secret for working sign-in; the build itself needs no credentials.

**[Full setup & deployment guide →](docs/SETUP.md)**

Keep the website and chat repositories separate. Otherwise “lol” becomes a
deployment pipeline. Funny once. Expensive after that.

## No magic privacy claims.

- **GitHub can read standard messages.** Public channels and published profiles are public.
- **Encryption is opt-in.** Browser AES-256-GCM protects future content, not old commits.
  Back up your keys. There is no “forgot my key” escape hatch.
- **Delete does not mean erase.** The chat hides the message. Git history and other
  people’s clones can still contain it. Git remembers.
- **A check means committed, not read.** Unread badges and pins are browser-local,
  not synchronized read receipts. No fabricated online status.
- **Trust your collaborators.** Direct repo writers can rewrite history and forge
  protocol events. This is not a cryptographically verified identity system.
- **Polling is not push.** Open tabs sync; closed tabs don’t. More saved chats mean
  longer inactive-room cycles. GitHub quotas and hosting costs still apply.

OAuth mode requests broad `repo` access; GitHub App mode can scope repository
access. Sessions use encrypted HttpOnly cookies. No token is sent back to the UI.
No independent cryptographic audit, forward secrecy or server-compromise resistance
is claimed. Read the [threat model](docs/ENCRYPTION.md) and [operating limits](docs/SETUP.md#delivery-and-costs--no-hand-waving).

## Build something weird with it

- [Protocol & scriptable CLI](docs/PROTOCOL.md) — send/read from the terminal.
- [Actions participant](docs/BOTS.md) — explicitly installed, never silently enabled.
- [Integration contracts](docs/PLUGINS.md) · [starter](plugins/coinflip/) · [contributing](CONTRIBUTING.md).
- [What’s next](docs/ROADMAP.md) — directions, not imaginary shipped features.

There’s also `/shrug`. Obviously.

## Check before shipping

```sh
npm run check:secrets
npm test
npm run build
```

The offline secret check scans publishable files and reachable local Git history
without printing matched values. HTTP smoke tests also run when `TEST_BASE_URL`
points to a running instance. Browser fixtures are isolated test tools, not product
demo conversations. Two-account OAuth/invitation and physical-device checks still
need a configured deployment; unit tests aren’t a substitute.

## Ours, with credit where it’s due

MIT. Original app logic, original wallpaper, no bundled Telegram application
source. The interface takes visual cues from Telegram Web A; Base UI, coss UI,
Kokonut UI and self-hosted fonts retain their respective notices.
See [third-party licenses](THIRD_PARTY_NOTICES.md) and [design provenance](docs/TELEGRAM_DESIGN.md).

**Not everything needs to become the next big thing. Sometimes “holy shit, it
works” is enough.**
