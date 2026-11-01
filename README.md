<h1 align="center">gitmsg</h1>

<p align="center">
  <strong>Your DMs. Their version control. Our questionable judgment.</strong><br />
   A real messenger built on GitHub. Now in your terminal. Yes, every “lol” is a commit.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-111111?style=flat-square&logo=nextdotjs" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-typed_chaos-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript: typed chaos" />
  <img src="https://img.shields.io/badge/Node.js-22-5fa04e?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22" />
  <br />
  <img src="https://img.shields.io/badge/database-literally_GitHub-8774e1?style=flat-square&logo=github&logoColor=white" alt="Storage: GitHub repositories" />
  <img src="https://img.shields.io/badge/audio-WebRTC-ff6b6b?style=flat-square&logo=webrtc&logoColor=white" alt="WebRTC audio calls" />
  <img src="https://img.shields.io/badge/encryption-opt--in-6c936c?style=flat-square&logo=letsencrypt&logoColor=white" alt="Optional encryption" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-eac54f?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://www.gitmsg.fun/"><img src="https://img.shields.io/badge/🚀_OPEN_GITMSG-SEND_SOMETHING_STUPID-8774e1?style=for-the-badge" alt="Open gitmsg — send something stupid" /></a>
  <br /><br />
  <strong>Get in before GitHub calls Microsoft and Microsoft calls SWAT. 🚨</strong><br />
  <sub>It's a joke. We hope.</sub>
</p>

<p align="center">
   <a href="#-wait-this-actually-works">The good stuff</a> ·
   <a href="#-fine-how-do-i-get-it">Get it</a> ·
  <a href="docs/SETUP.md">Self-host</a> ·
  <a href="CONTRIBUTING.md">Contribute</a> ·
  <a href="https://github.com/yiaany/gitmsg/issues/new/choose">Break something?</a>
</p>

---

## 💬 Wait, this actually works?

**Chats are repositories. Messages are commits.** “I never said that” now comes with a `git log`.

> 🌱 **Actual commit farming.** One message = one commit. An edit? Another commit. A reaction? You guessed it.
> Your team lead thinks you're shipping like a machine. You're arguing about pizza. **Git log doesn't snitch. The diffs do.**
>
> <sub>Real commits, not guaranteed green squares: GitHub's contribution-graph rules still apply.</sub>

| You get | Git gets |
| --- | --- |
| 🔒 Private chats & public channels | A wildly unexpected career change |
| 📸 Photos, files & voice notes | Actual blobs. Not a metaphor. |
| ☎️ One-to-one audio calls | Signaling only. **We do not commit your breathing.** |
| ↩️ Replies, edits & reactions | More commits. Obviously. |
| 🔎 Search, pins & Saved Messages | Your “I'll remember this” folder |
| 🗝️ Optional browser encryption | Ciphertext instead of your lore |

**Real people. Real messages. No fake online status.** Dark/light themes, mobile UI and keyboard shortcuts included. There's also `/shrug`. Essential infrastructure.

## 📦 Fine. How do I get it?

### Team terminal

**[Node.js 26.4+](https://nodejs.org/en/download)** and npm. Two lines. No side quest.

```sh
npm install --global @yiaany/gitmsg@alpha
gitmsg
```

Choose **Continue with GitHub** → approve the code in your browser → open a chat.
Next time? Just `gitmsg`. From any directory. Your actual project is safe from your pizza discourse.

**`git message` works too.** Finally, a Git command your friends might answer.

> Install **`@yiaany/gitmsg`**, not `gitmsg` — that npm name belongs to someone else.
> **Alpha:** expect rough edges. [Commands, setup & known limits →](docs/CLI.md)

### Team “I'm not installing another thing”

1. **[Open gitmsg](https://www.gitmsg.fun/)** → sign in with GitHub. Login creates no repositories.
2. **New Message** → pick a friend → start a chat. They accept the GitHub repository invitation.
3. **Send “hey”.** Congratulations. You have weaponized version control.

> [!IMPORTANT]
> **Git remembers.** Standard messages are readable by GitHub and repository readers; deleting hides them, not their history. Encryption is opt-in, not retroactive. Terminal login requests broad `repo` access. [Know the boundaries →](docs/ENCRYPTION.md) · [Terminal permissions →](docs/CLI.md)

<details>
<summary><strong>🧠 Open the hood. Disappoint a database engineer.</strong></summary>

`You → authenticated API → event file + Git commit → your friend's polling tab`

No persistent message database or separate realtime service. Audio travels directly over **WebRTC**, never into Git. Calls are best-effort: **no TURN**, some networks won't connect, both tabs must stay open. Unencrypted signaling can expose IP addresses in history. [Calls →](docs/CALLS.md)

GitHub quotas and hosting limits still apply. “Stored in Git” does not mean “infinite free infrastructure.” [Operating limits →](docs/SETUP.md#delivery-and-costs--no-hand-waving)

OAuth mode requests broad `repo` access; GitHub App mode supports scoped access. No independent security audit is claimed. Production uses Vercel Web Analytics with URL queries/fragments stripped and no message/account/call custom events.

</details>

<details>
<summary><strong>🛠️ Run your own questionable infrastructure.</strong></summary>

**Node.js 22**, then:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `/setup`; configure your own GitHub credentials and session secret. **Secrets stay in `.env.local` or Vercel, never Git.** [Full setup →](docs/SETUP.md)

Keep app source and chat repos separate. Otherwise “lol” triggers a deployment. Funny once.

</details>

<details>
<summary><strong>🤝 Make this bad idea better.</strong></summary>

Small PRs, tests, accessibility fixes and docs welcome. **[Start here →](CONTRIBUTING.md)**

[CLI & protocol](docs/PROTOCOL.md) · [Bots](docs/BOTS.md) · [Plugins](docs/PLUGINS.md) · [Roadmap](docs/ROADMAP.md)

Before shipping: `npm run check:secrets` · `npm test` · `npm run typecheck` · `npm run build`.

[Report vulnerabilities privately](SECURITY.md). No tokens, room keys or real chats in issues. [Be excellent to each other](CODE_OF_CONDUCT.md). Opening the source? [Publication checklist →](docs/PUBLISHING.md)

</details>

---

<p align="center"><strong>No pitch deck. No blockchain. Just “holy shit, it works.”</strong></p>

<p align="center">
  <sub>MIT · <a href="THIRD_PARTY_NOTICES.md">Third-party credits</a> · <a href="docs/TELEGRAM_DESIGN.md">Design provenance</a><br />
  Not affiliated with GitHub, Microsoft or Telegram. Especially not their SWAT departments.</sub>
</p>
