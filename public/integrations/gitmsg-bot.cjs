// Install in .github/scripts/gitmsg-bot.cjs. Node 20+, no dependencies.
const { randomInt, randomUUID } = require('node:crypto');
const repo = process.env.GITMSG_REPO, branch = process.env.GITMSG_BRANCH || 'main';
const command = process.env.GITMSG_COMMAND;
async function api(path, method = 'GET', data) {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { method, headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  if (r.status === 204) return null;
  const value = await r.json(); if (!r.ok) throw new Error(`GitHub HTTP ${r.status}: ${value.message}`); return value;
}
(async () => {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') || !['roll', 'standup', 'deploy'].includes(command)) throw new Error('Invalid bot configuration');
  const policyResponse = await fetch(`https://api.github.com/repos/${repo}/contents/gitmsg/security.json?ref=${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' } });
  if (policyResponse.ok) throw new Error('Secure room: this bot intentionally has no room key and will not write plaintext.');
  if (policyResponse.status !== 404) throw new Error(`Could not check room security: ${policyResponse.status}`);
  let text, bot;
  if (command === 'roll') { const value = randomInt(1, 7); text = `Rolled a ${value}. Cryptographically random, emotionally devastating.`; bot = { command, value }; }
  if (command === 'standup') {
    const commits = await api(`/commits?${new URLSearchParams({ sha: branch, path: 'events', per_page: '100' })}`);
    const counts = new Map();
    for (const commit of commits) { const prefix = 'gitmsg:event:v1\n'; const start = commit.commit.message.indexOf(prefix); if (start < 0) continue; try { const e = JSON.parse(commit.commit.message.slice(start + prefix.length)); if (e.kind === 'message' && !e.sealed && Date.now() - Date.parse(e.createdAt) < 86400000) counts.set(e.actor.login, (counts.get(e.actor.login) || 0) + 1); } catch {} }
    text = `Standup · messages in the last 24 hours (latest 100 event commits)\n${[...counts].map(([name, count]) => `@${name}: ${count}`).join('\n') || 'No updates yet.'}`; bot = { command };
  }
  if (command === 'deploy') {
    const requester = process.env.GITMSG_REQUESTER;
    if (!/^[A-Za-z0-9-]{1,39}$/.test(requester || '')) throw new Error('A verified triggering account is required for deployment.');
    const permission = await api(`/collaborators/${encodeURIComponent(requester)}/permission`);
    if (permission.permission !== 'admin') throw new Error('Only a repository administrator may request deployment.');
    const file = await api(`/contents/gitmsg/bot.json?ref=${encodeURIComponent(branch)}`);
    const config = JSON.parse(Buffer.from(file.content, 'base64').toString());
    if (!/^[a-zA-Z0-9_-]+\.ya?ml$/.test(config.deployWorkflow || '') || config.deployWorkflow === 'gitmsg-bot.yml') throw new Error('Set an explicit deployWorkflow filename in gitmsg/bot.json');
    await api(`/actions/workflows/${encodeURIComponent(config.deployWorkflow)}/dispatches`, 'POST', { ref: branch });
    text = `Deploy requested: ${config.deployWorkflow}. Check Actions for the final outcome; a dispatch is not a successful deployment.`;
  }
  const event = { v: 1, id: randomUUID(), kind: 'message', actor: { id: 41898282, login: 'github-actions' }, createdAt: new Date().toISOString(), text, ...(bot ? { bot } : {}) };
  const path = `events/${event.createdAt.slice(0, 10).replaceAll('-', '/')}/${event.id}.json`;
  await api(`/contents/${path}`, 'PUT', { branch, message: `chore(bot): ${command}\n\ngitmsg:event:v1\n${JSON.stringify(event)}`, content: Buffer.from(JSON.stringify(event, null, 2)).toString('base64') });
  console.log(`Posted ${command} result to ${repo}.`);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
