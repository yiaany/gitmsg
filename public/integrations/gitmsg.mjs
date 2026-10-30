#!/usr/bin/env node
// Node 22+, no dependencies. Usage: GITHUB_TOKEN=... node gitmsg.mjs owner/repo read|send|propose "message"
import { randomUUID, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const [repo, command = 'read', ...words] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN, branch = process.env.GITMSG_BRANCH || 'main';
const prefix = 'gitmsg:event:v1\n';
const b64 = bytes => Buffer.from(bytes).toString('base64url');
async function api(path, method = 'GET', data) {
  const r = await fetch(`https://api.github.com${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  if (r.status === 204) return null;
  const value = await r.json(); if (!r.ok) throw Object.assign(new Error(`GitHub HTTP ${r.status}: ${value.message}`), { status: r.status }); return value;
}
const aad = e => Buffer.from(JSON.stringify(['gitmsg:event:v1', repo.toLowerCase(), branch, e.id, e.actor.id, e.createdAt]));
async function loadKey() {
  const raw = process.env.GITMSG_KEY_FILE ? (await readFile(process.env.GITMSG_KEY_FILE, 'utf8')).trim() : process.env.GITMSG_KEY;
  if (!raw) return null;
  const value = raw.includes('#') ? new URLSearchParams(raw.split('#')[1]).get('key') : raw;
  const bytes = Buffer.from(value || '', 'base64url'); if (bytes.length !== 32) throw new Error('Invalid room key');
  return { key: await webcrypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']), id: Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex') };
}
(async () => {
  if (!token || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') || !['read', 'send', 'propose'].includes(command)) throw new Error('Usage: GITHUB_TOKEN=<token> node gitmsg.mjs owner/repo read|send|propose "message". Prefer an environment credential manager; never commit tokens.');
  const key = await loadKey();
  if (command === 'read') {
    const commits = await api(`/repos/${repo}/commits?${new URLSearchParams({ sha: branch, path: 'events', per_page: '100' })}`);
    for (const c of commits.reverse()) {
      const index = c.commit.message.indexOf(prefix); if (index < 0) continue;
      const outer = JSON.parse(c.commit.message.slice(index + prefix.length)); let e = outer;
      if (outer.sealed) {
        if (!key || key.id !== outer.sealed.keyId) { console.log(`${outer.actor.login}: [encrypted · room key required]`); continue; }
        e = JSON.parse(Buffer.from(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(outer.sealed.iv, 'base64url'), additionalData: aad(outer) }, key.key, Buffer.from(outer.sealed.ciphertext, 'base64url'))).toString());
        if (e.id !== outer.id || e.actor.id !== outer.actor.id || e.createdAt !== outer.createdAt) throw new Error('Event integrity mismatch');
      }
      console.log(`${e.createdAt} @${e.actor.login} [${e.kind}] ${e.text || ''}${e.attachments?.length ? ` [${e.attachments.length} attachment(s)]` : ''}`);
    }
    return;
  }
  const text = words.join(' '); if (!text.trim() || text.length > 4000) throw new Error('Send between 1 and 4,000 characters.');
  const user = await api('/user'); let policy;
  try { const file = await api(`/repos/${repo}/contents/gitmsg/security.json?ref=${encodeURIComponent(branch)}`); policy = JSON.parse(Buffer.from(file.content, 'base64').toString()); }
  catch (error) { if (error.status !== 404) throw error; }
  if (policy && (!key || key.id !== policy.keyId)) throw new Error('Secure room: supply the matching GITMSG_KEY_FILE or GITMSG_KEY. Refusing plaintext.');
  let event = { v: 1, id: randomUUID(), kind: 'message', actor: { id: user.id, login: user.login, avatar: user.avatar_url }, createdAt: new Date().toISOString(), text };
  if (key && policy) { const iv = webcrypto.getRandomValues(new Uint8Array(12)); const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(event) }, key.key, Buffer.from(JSON.stringify(event))); event = { v: 1, id: event.id, kind: 'message', actor: event.actor, createdAt: event.createdAt, sealed: { algorithm: 'AES-256-GCM', keyId: key.id, iv: b64(iv), ciphertext: b64(ciphertext) } }; }
  let target = branch;
  if (command === 'propose') { const ref = await api(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`); target = `gitmsg-proposals/${event.id}`; await api(`/repos/${repo}/git/refs`, 'POST', { ref: `refs/heads/${target}`, sha: ref.object.sha }); }
  const path = `events/${event.createdAt.slice(0, 10).replaceAll('-', '/')}/${event.id}.json`;
  const result = await api(`/repos/${repo}/contents/${path}`, 'PUT', { branch: target, message: `feat(chat): ${event.sealed ? 'encrypted event' : 'terminal message'}\n\n${prefix}${JSON.stringify(event)}`, content: Buffer.from(JSON.stringify(event, null, 2)).toString('base64') });
  if (command === 'propose') { const pr = await api(`/repos/${repo}/pulls`, 'POST', { head: target, base: branch, title: 'Chat proposal from terminal', body: 'Merge with a merge commit, not squash/rebase, to preserve the chat event.' }); console.log(pr.html_url); }
  else console.log(`Committed ${result.commit.sha.slice(0, 7)} to ${repo}.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
