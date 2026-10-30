# GitHub Actions participant

Open **Chat tools → Actions participant**. Download the two installation files and place them in the dedicated chat repository:

- `public/integrations/gitmsg-bot.yml` → `.github/workflows/gitmsg-bot.yml`
- `public/integrations/gitmsg-bot.cjs` → `.github/scripts/gitmsg-bot.cjs`

Commit on the **default branch**, enable Actions for the repo, then Check installation. Installation is manual and requires GitHub workflow permissions; the website does not request OAuth `workflow` scope. Website dispatch requires the authenticated user/token to have Actions write access. OAuth `repo` scope covers dispatch for accessible private repos; scoped GitHub Apps need explicit Actions permissions.

Roll and standup queue real workflows that write protocol event files/commit messages. Dice uses Node's cryptographic `randomInt`; clients animate the resulting event. Standup counts messages in the last 24 hours within the newest 100 event commits; it is not a full-history analytics service. Jobs may wait for GitHub runners and consume your Actions quota. Nothing runs continuously, and messages never become shell commands.

Deploy is **opt-in twice**: install the bot and add `gitmsg/bot.json` with `{"deployWorkflow":"deploy.yml"}` naming your existing trusted workflow in the same repo. Configure that workflow with `workflow_dispatch`. Website requests require repository admin access, and the bot verifies the triggering account is an admin before deploy dispatch. A queued dispatch is not proof of a successful deployment. Review the target workflow, its secrets, branch protections and GitHub Environments approval gates yourself. This kit does not invent a deployment pipeline or install secrets.

Secure rooms fail closed: the bot checks `gitmsg/security.json` and refuses to post plaintext or receive a key. It also stops when policy cannot be checked. Direct repository writers can change scripts/policy; install only in dedicated repos with trusted collaborators.

The integration intentionally grants the bot `contents: write` and `actions: write` for its explicit operations. The checkout action is pinned; review updates. Do not install on a production code repo or add push triggers: each chat message is a commit.
