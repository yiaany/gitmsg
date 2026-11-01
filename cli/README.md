<h1 align="center">gitmsg</h1>

<p align="center">
  <strong>Your DMs. Their version control. Our questionable judgment.</strong><br />
  A GitHub messenger in your terminal. Yes, every “lol” is a commit.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@yiaany/gitmsg"><img src="https://img.shields.io/npm/v/%40yiaany%2Fgitmsg/alpha?style=flat-square&color=8774e1&label=alpha" alt="npm alpha" /></a>
  <img src="https://img.shields.io/badge/database-literally_GitHub-8774e1?style=flat-square&logo=github&logoColor=white" alt="Storage: GitHub" />
  <img src="https://img.shields.io/badge/productivity-debatable-eac54f?style=flat-square" alt="Productivity: debatable" />
  <a href="https://github.com/yiaany/gitmsg/blob/feat/terminal-client/LICENSE"><img src="https://img.shields.io/badge/license-MIT-6c936c?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="#-fine-how-do-i-get-it">Get it</a> ·
  <a href="https://www.gitmsg.fun/">Browser version</a> ·
  <a href="https://github.com/yiaany/gitmsg/tree/feat/terminal-client">GitHub</a> ·
  <a href="https://github.com/yiaany/gitmsg/blob/feat/terminal-client/docs/CLI.md">Help, I'm lost</a>
</p>

---

## 💬 Wait, this actually works?

**Chats are repositories. Messages are commits.** “I never said that” now comes with a `git log`.

No browser tab required. Chat, send a photo, leave a voice note, call a friend.
All from the place where you usually pretend to be busy.

> 🌱 **Actual commit farming.** One message = one commit. Your team lead thinks you're shipping like a machine. You're arguing about pizza.
>
> <sub>Real commits, not guaranteed green squares: GitHub's contribution-graph rules still apply.</sub>

## 📦 Fine. How do I get it?

**[Node.js 26.4+](https://nodejs.org/en/download)** and npm. Then:

```sh
npm install --global @yiaany/gitmsg@alpha
gitmsg
```

That's the installation. You may now close the other twelve tutorials.

1. **Continue with GitHub** → approve the code in your browser. No token-pasting ritual.
2. **Create a private chat** and invite a friend, or join an existing gitmsg room.
3. **Send “hey”.** Congratulations. You have weaponized version control.

Next time, just **`gitmsg`**. Any directory. It does not commit your project.
**`git message`** opens the same app. Finally, a Git command your friends might answer.

> [!NOTE]
> Install **`@yiaany/gitmsg`**, not `gitmsg`. That npm name belongs to someone else.
> Bun comes with the package; no separate installation. Keep npm's optional dependencies enabled.

## ✨ A messenger. With a deeply unnecessary storage choice.

| You get | Git gets |
| --- | --- |
| 💬 Private chats & replies | A wildly unexpected career change |
| 📸 Images & voice notes | Actual blobs. Not a metaphor. |
| ☎️ One-to-one audio calls | Signaling only. **We do not commit your breathing.** |
| 🗝️ Optional `/secure` encryption | Ciphertext instead of your lore |
| 🎨 Five themes | Absolutely no say in your aesthetic choices |
| 📝 Per-chat drafts | Nothing. You haven't sent it yet. |

**Real messages. No fake online status.** Keyboard navigation, image previews and Copy / Reply included. Your mouse is welcome. Your terminal superiority complex is optional.

### Enough commands to be dangerous

| Type | Do the thing |
| --- | --- |
| `/new` | Start a private chat |
| `/invite @friend` | Give someone repository write access. Friendship has permissions. |
| `/inbox` | Accept a chat invitation |
| `/join owner/repo` | Open an existing private gitmsg room |
| `/voice` · `/call` | Use your actual voice. Brave. |
| `/themes` | Procrastinate in five color palettes |
| `/help` | The instructions you skipped |

**Enter** sends. **Ctrl+K** picks a chat. **/** shows commands. That's enough to start trouble.

## 🧯 Tiny print. Normal-sized consequences.

**This is an alpha, not an audited Signal replacement.** GitHub login asks for broad `repo` access, including private repositories. Read the permissions before approving.

Standard messages are readable by GitHub and repository readers. Deleting is not history erasure. `/secure` protects new content, not old commits or metadata. Calls are best-effort; some networks won't connect. Real cross-device calls and other-platform installs still need live acceptance testing.

**[Setup, permissions & known limits →](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/docs/CLI.md)** · **[Full manual →](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/cli/MANUAL.md)** · **[Encryption boundaries →](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/docs/ENCRYPTION.md)**

<details>
<summary><strong>🔄 Update it. Remove it. We won't make it weird.</strong></summary>

Update:

```sh
npm install --global @yiaany/gitmsg@alpha
```

Uninstall:

```sh
npm uninstall --global @yiaany/gitmsg
```

`gitmsg auth logout` removes this client's saved login. Revoke access separately in GitHub **Settings → Applications**. Uninstalling does not delete chat repositories.

</details>

<details>
<summary><strong>🤝 Make this bad idea better.</strong></summary>

Small PRs, tests, accessibility fixes and docs welcome. **[Start here →](https://github.com/yiaany/gitmsg/blob/feat/terminal-client/CONTRIBUTING.md#terminal-client)**

Found a bug? [Tell us](https://github.com/yiaany/gitmsg/issues). No tokens, room keys or real chats in issues, please. We already have enough questionable decisions.

</details>

---

<p align="center"><strong>No pitch deck. No blockchain. Just “holy shit, it works.”</strong></p>

<p align="center">
  <sub>MIT · <a href="https://github.com/yiaany/gitmsg/blob/feat/terminal-client/cli/THIRD_PARTY_NOTICES.md">Third-party credits</a><br />
  Not affiliated with GitHub or Microsoft. Especially not their incident response teams.<br />
  GitHub quotas, storage and network limits still apply. The jokes are free; infrastructure isn't infinite.</sub>
</p>
