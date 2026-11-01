import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { parseRoomDocument, ROOM_DOCUMENT_PATH } from "../../src/lib/room-document";
import { commitSubject, eventPath, EVENT_PREFIX, materialize, parseCommit, validAttachment, validEvent, type Attachment, type Actor, type ChatEvent, type Message, type Room } from "../../src/lib/protocol";
import { freshCall } from "../../src/lib/call-protocol";
import { decryptBytes, decryptEvent, digest, encryptBytes, encryptEvent, exportKey, importKey, keyFingerprint } from "../../src/lib/room-crypto";
import { MediaStorageError, readGitMedia } from "../../src/lib/git-media";
import { imageMime, type LocalImage } from "./images";
import { GitHub } from "./github";
import { ClientError, containsCredential, parseRepo } from "./safety";
import { memoryVoice, type LocalVoice } from "./voice-data";

export type TerminalRoom = { id: string; branch: string; title: string; private: true; canWrite: boolean; participants?: string[] };
type Repository = { full_name: string; default_branch: string; private: boolean; archived?: boolean; disabled?: boolean; permissions?: { push?: boolean; admin?: boolean } };
type Contents = { type: string; encoding: string; content: string; size: number };
type Commit = { sha: string; html_url: string; commit: { message: string } };
export type History = { events: ChatEvent[]; messages: Message[]; etag?: string; truncated: boolean; encrypted: boolean };
export type Invitation = { id: number; repo: string; from: string };

function contentJson(file: Contents): unknown {
  if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string" || file.content.length > 600000 || file.size > 400000) throw new ClientError("Room metadata is unreadable. No write was made.");
  try { return JSON.parse(Buffer.from(file.content, "base64").toString("utf8")); } catch { throw new ClientError("Room metadata is invalid. No write was made."); }
}
export async function loadRoomKey(path: string | undefined): Promise<CryptoKey | null> {
  if (!path) return null;
  try {
    if (!isAbsolute(path)) throw new Error();
    if (process.platform === "win32" && (await lstat(path)).isSymbolicLink()) throw new Error();
    const file = await open(path, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW));
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 4096 || (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) throw new Error();
      const buffer = Buffer.alloc(4097);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 4096) throw new Error();
      const raw = buffer.subarray(0, bytesRead).toString("utf8").trim();
      const key = raw.includes("#") ? new URLSearchParams(raw.split("#")[1]).get("key") : raw;
      return await importKey(key ?? "");
    } finally { await file.close(); }
  } catch { throw new ClientError("Could not load the room-key backup. Use an absolute path to a small, owner-only private file, not a symlink. The key was not logged."); }
}

export class Rooms {
  private pending = new Map<string, { text: string; attachments: string; replyTo?: string; event: ChatEvent }>();
  private pendingUpload: { room: string; original: string; bytes: Uint8Array<ArrayBuffer>; attachment: Attachment } | null = null;
  private sending = false;
  private keys = new Map<string, CryptoKey | null>();
  private encryptedRooms = new Set<string>();
  private keyLoader?: (room: TerminalRoom) => Promise<CryptoKey | null>;
  constructor(readonly github: GitHub, private readonly key: CryptoKey | null = null) {}
  setKeyLoader(loader: (room: TerminalRoom) => Promise<CryptoKey | null>) { this.keyLoader = loader; }
  setRoomKey(room: TerminalRoom, key: CryptoKey) { this.keys.set(`${room.id.toLowerCase()}:${room.branch}`, key); }
  private async keyFor(room: TerminalRoom) {
    const id = `${room.id.toLowerCase()}:${room.branch}`;
    if (this.keys.has(id)) return this.keys.get(id)!;
    const key = await this.keyLoader?.(room) ?? this.key;
    this.keys.set(id, key);
    return key;
  }
  async roomKey(room: TerminalRoom) { return this.keyFor(room); }
  async callRoom(room: TerminalRoom, actor: Actor): Promise<Room> {
    const fresh = await this.open(room.id);
    if (!fresh.canWrite || fresh.branch !== room.branch || !fresh.participants?.some(login => login.toLowerCase() === actor.login.toLowerCase()) || /\/gitmsg-channel-/i.test(fresh.id)) throw new ClientError("Calls need a writable private direct chat with two verified participants.");
    const login = fresh.participants.find(login => login.toLowerCase() !== actor.login.toLowerCase())!;
    const peer = await this.github.json<Actor>(`/users/${encodeURIComponent(login)}`);
    if (!Number.isSafeInteger(peer.id) || peer.id < 1 || peer.id === actor.id || typeof peer.login !== "string" || peer.login.toLowerCase() !== login.toLowerCase()) throw new ClientError("The call partner could not be verified with GitHub.");
    return { id: fresh.id, branch: fresh.branch, name: fresh.title, description: "", private: true, kind: "chat", canWrite: true, peer: { id: peer.id, login: peer.login } };
  }
  async sendCall(room: TerminalRoom, actor: Actor, event: ChatEvent, history?: History): Promise<void> {
    if (!validEvent(event) || !freshCall(event) || event.sealed || event.actor.id !== actor.id || event.actor.login !== actor.login) throw new ClientError("Invalid or expired call signal. No write was made.");
    const fresh = await this.callRoom(room, actor);
    if (event.call!.to !== fresh.peer!.id) throw new ClientError("The call recipient does not match this direct chat.");
    const key = await this.keyFor(room), policy = await this.policy(room);
    if (!policy.enabled && (key || history?.encrypted || this.encryptedRooms.has(`${room.id.toLowerCase()}:${room.branch}`))) throw new ClientError("Call encryption policy is missing. Refusing plaintext signaling.");
    if (policy.enabled && (!key || await keyFingerprint(key) !== policy.keyId)) throw new ClientError("Import the matching room key before calling. Plaintext signaling was not sent.");
    const wire = policy.enabled ? await encryptEvent(key!, room.id, room.branch, event) : event;
    await this.github.json(`/repos/${room.id}/contents/${eventPath(wire)}`, { method: "PUT", data: { branch: room.branch, message: `${commitSubject(wire)}\n\n${EVENT_PREFIX}${JSON.stringify(wire)}`, content: Buffer.from(JSON.stringify(wire)).toString("base64") } });
  }
  async callEvents(room: TerminalRoom, events: ChatEvent[]): Promise<ChatEvent[]> {
    const key = await this.keyFor(room), policy = await this.policy(room);
    const secured = policy.enabled || !!key || this.encryptedRooms.has(`${room.id.toLowerCase()}:${room.branch}`);
    if (secured && (!policy.enabled || !key || await keyFingerprint(key) !== policy.keyId)) throw new ClientError("Call encryption policy or matching room key is unavailable.");
    // Old plaintext history stays readable, but must never act as fresh call
    // signaling after encryption has been enabled.
    return events.filter(event => freshCall(event) && !event.locked && !event.sealed && (!secured || event.encrypted === true));
  }
  async secure(room: TerminalRoom, key: CryptoKey, confirmed: boolean): Promise<void> {
    if (!confirmed) throw new ClientError("Enabling encryption requires confirmation.");
    const fresh = await this.open(room.id), repo = await this.repository(room.id);
    if (!repo.permissions?.admin || !fresh.canWrite || fresh.branch !== room.branch) throw new ClientError("Only a private chat administrator can enable encryption.");
    const policy = await this.policy(fresh), keyId = await keyFingerprint(key);
    if (policy.enabled && policy.keyId !== keyId) throw new ClientError("This chat already has a different key. Import its existing key instead.");
    // Remember before writing: an ambiguous policy response must not lose its key.
    this.setRoomKey(room, key);
    if (!policy.enabled) await this.github.request(`/repos/${room.id}/contents/gitmsg/security.json`, { method: "PUT", data: { branch: room.branch, message: "feat(security): require encrypted events", content: Buffer.from(JSON.stringify({ version: 1, enabled: true, algorithm: "AES-256-GCM", keyId })).toString("base64") } });
  }

  async user(): Promise<Actor> {
    const user = await this.github.json<{ id: number; login: string }>("/user");
    if (!Number.isSafeInteger(user.id) || user.id < 1 || !/^[A-Za-z0-9-]{1,39}$/.test(user.login)) throw new ClientError("GitHub returned an invalid account identity.");
    return { id: user.id, login: user.login };
  }
  async list(): Promise<string[]> {
    const values = await this.github.json<Repository[]>("/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member");
    if (!Array.isArray(values)) throw new ClientError("GitHub returned an invalid repository list.");
    return values.filter(r => r.private && r.permissions?.push && !r.archived && !r.disabled && /^gitmsg-/.test(r.full_name.split("/")[1] ?? "") && !/\/(?:gitmsg-profile|gitmsg-settings|gitmsg-saved)$/.test(r.full_name)).map(r => parseRepo(r.full_name));
  }
  async invitations(): Promise<Invitation[]> {
    const values = await this.github.json<any[]>("/user/repository_invitations?per_page=100");
    if (!Array.isArray(values)) throw new ClientError("GitHub returned an invalid invitation list.");
    return values.filter(v => Number.isSafeInteger(v.id) && v.id > 0 && v.repository?.private === true && typeof v.repository?.full_name === "string" && /^gitmsg-/.test(v.repository.full_name.split("/")[1] ?? "") && !/\/(?:gitmsg-profile|gitmsg-settings|gitmsg-saved)$/.test(v.repository.full_name))
      .map(v => ({ id: v.id, repo: parseRepo(v.repository.full_name), from: typeof v.inviter?.login === "string" ? v.inviter.login : "GitHub" }));
  }
  async accept(invitation: Invitation, confirmed: boolean): Promise<TerminalRoom> {
    if (!confirmed) throw new ClientError("Accepting an invitation requires confirmation.");
    const current = (await this.invitations()).find(i => i.id === invitation.id && i.repo.toLowerCase() === invitation.repo.toLowerCase());
    if (!current) throw new ClientError("This invitation is no longer pending. Refresh your inbox.");
    await this.github.request(`/user/repository_invitations/${current.id}`, { method: "PATCH" });
    return this.open(current.repo);
  }
  async invite(room: TerminalRoom, login: string, confirmed: boolean): Promise<{ alreadyMember: boolean; url: string }> {
    if (!confirmed) throw new ClientError("Inviting a collaborator requires confirmation.");
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login)) throw new ClientError("Enter a GitHub username, without spaces or a URL.");
    await this.open(room.id); // Refuse unmarked/source or public repositories before any write.
    const repository = await this.repository(room.id);
    if (!repository.permissions?.admin) throw new ClientError("Only a repository administrator can invite friends.");
    const viewer = await this.user();
    if (viewer.login.toLowerCase() === login.toLowerCase()) throw new ClientError("You are already in this chat.");
    const response = await this.github.request(`/repos/${parseRepo(room.id)}/collaborators/${encodeURIComponent(login)}`, { method: "PUT", data: { permission: "push" } });
    if (response.status !== 201 && response.status !== 204) throw new ClientError("GitHub did not confirm the invitation. Check collaborators before retrying.");
    return { alreadyMember: response.status === 204, url: `https://github.com/${room.id}/invitations` };
  }
  private async repository(input: string): Promise<Repository> {
    const id = parseRepo(input);
    const repo = await this.github.json<Repository>(`/repos/${id}`);
    if (repo.full_name?.toLowerCase() !== id.toLowerCase() || repo.private !== true || repo.archived || repo.disabled || typeof repo.default_branch !== "string" || !repo.default_branch || repo.default_branch.length > 200) throw new ClientError("This alpha only opens active private chat repositories. Public/source repositories are refused.");
    return repo;
  }
  async open(input: string): Promise<TerminalRoom> {
    const repo = await this.repository(input);
    const document = parseRoomDocument(contentJson(await this.github.json<Contents>(`/repos/${repo.full_name}/contents/${ROOM_DOCUMENT_PATH}?${new URLSearchParams({ ref: repo.default_branch })}`)));
    if (!document || /\/(?:gitmsg-profile|gitmsg-settings)$/.test(repo.full_name)) throw new ClientError("This is not a marked gitmsg chat. Nothing was initialized or overwritten.");
    return { id: repo.full_name, branch: repo.default_branch, title: document.title, private: true, canWrite: repo.permissions?.push === true, ...(document.participants ? { participants: document.participants } : {}) };
  }
  async create(name: string, confirmed: boolean): Promise<{ room: TerminalRoom; warning?: string }> {
    if (!confirmed) throw new ClientError("Creating a private repository requires explicit confirmation.");
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/.test(name) || /^(?:profile|settings|saved|channel(?:-|$))/i.test(name)) throw new ClientError("Use 2–40 letters, numbers or hyphens; account and channel names are reserved.");
    const repo = await this.github.json<Repository>("/user/repos", { method: "POST", data: { name: `gitmsg-${name}`, private: true, auto_init: true, description: "Messages are commits. Made with gitmsg." } });
    if (repo.private !== true || !repo.full_name || !repo.default_branch) throw new ClientError("GitHub did not confirm a private repository. Check your repositories before retrying creation.");
    const id = parseRepo(repo.full_name);
    const room: TerminalRoom = { id, branch: repo.default_branch, title: name, private: true, canWrite: true };
    try {
      await this.github.json(`/repos/${id}/contents/${ROOM_DOCUMENT_PATH}`, { method: "PUT", data: { branch: room.branch, message: "gitmsg: initialize terminal chat", content: Buffer.from(JSON.stringify({ schema: "gitmsg-room-v1", title: name })).toString("base64") } });
    } catch { return { room, warning: "Private repository created, but room initialization failed. Do not create it again. No message was sent; repair its room metadata before joining." }; }
    return { room };
  }
  async policy(room: TerminalRoom): Promise<{ enabled: boolean; keyId?: string }> {
    try {
      const value = contentJson(await this.github.json<Contents>(`/repos/${parseRepo(room.id)}/contents/gitmsg/security.json?${new URLSearchParams({ ref: room.branch })}`)) as { enabled?: unknown; keyId?: unknown };
      if (value?.enabled !== true || typeof value.keyId !== "string" || !/^[a-f0-9]{64}$/.test(value.keyId)) throw new ClientError("The room's encryption policy is invalid. Refusing to send plaintext.");
      return { enabled: true, keyId: value.keyId };
    } catch (error) { if (error instanceof ClientError && error.status === 404) return { enabled: false }; throw error; }
  }
  async history(room: TerminalRoom, previous?: History, signal?: AbortSignal): Promise<History> {
    const key = await this.keyFor(room);
    const newest: Commit[] = [];
    let etag: string | undefined, truncated = false;
    for (let page = 1; page <= 3; page++) {
      const response = await this.github.request(`/repos/${parseRepo(room.id)}/commits?${new URLSearchParams({ sha: room.branch, path: "events", per_page: "100", page: String(page) })}`, { signal, ...(page === 1 && previous?.etag ? { etag: previous.etag } : {}) });
      if (response.status === 304 && previous) return previous;
      if (page === 1) etag = response.headers.get("etag") ?? undefined;
      const commits: Commit[] = await response.json();
      if (!Array.isArray(commits)) throw new ClientError("GitHub returned an invalid history response.");
      newest.push(...commits);
      if (commits.length < 100) break;
      if (page === 3) truncated = true;
    }
    const events: ChatEvent[] = [];
    let encrypted = false;
    for (const commit of newest.reverse()) {
      if (typeof commit.commit?.message !== "string" || typeof commit.sha !== "string") continue;
      let event = parseCommit(commit.commit.message, commit.sha, commit.html_url);
      if (!event) continue;
      // These flags are local verification results, never assertions supplied by
      // an untrusted plaintext commit.
      event = { ...event, encrypted: false, locked: false };
      if (event.sealed) {
        encrypted = true;
        this.encryptedRooms.add(`${room.id.toLowerCase()}:${room.branch}`);
        try { if (!key) throw new Error(); event = await decryptEvent(key, room.id, room.branch, event); }
        catch { event = { ...event, text: "Encrypted message · matching room-key backup required", locked: true }; }
      }
      events.push(event);
    }
    return { events, messages: materialize(events), etag, truncated, encrypted };
  }
  async image(room: TerminalRoom, attachment: Attachment, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    if (!validAttachment(attachment) || !attachment.mime.startsWith("image/")) throw new ClientError("Unsupported image attachment.");
    const bytes = await this.media(room, attachment, signal);
    if (imageMime(bytes) !== attachment.mime) throw new ClientError("Image format does not match its metadata.");
    return bytes;
  }
  async voice(room: TerminalRoom, attachment: Attachment, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    if (!validAttachment(attachment) || !["audio/wav", "audio/webm", "audio/ogg", "audio/mp4"].includes(attachment.mime)) throw new ClientError("Unsupported voice attachment.");
    const bytes = await this.media(room, attachment, signal);
    if (attachment.mime === "audio/wav") memoryVoice(bytes);
    return bytes;
  }
  private async media(room: TerminalRoom, attachment: Attachment, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    const key = await this.keyFor(room);
    const repo = parseRepo(attachment.sourceRepo ?? room.id), branch = attachment.sourceBranch ?? room.branch;
    await this.open(repo);
    try {
      let bytes = await readGitMedia(path => this.github.json(path, { signal }), repo, branch, attachment.id);
      if (bytes.length !== attachment.size || await digest(bytes) !== attachment.sha256) throw new ClientError("Attachment integrity verification failed.");
      if (attachment.iv) {
        if (!key || repo.toLowerCase() !== room.id.toLowerCase()) throw new ClientError("This attachment needs the original room key.");
        bytes = await decryptBytes(key, bytes, attachment.iv, `gitmsg:media:${repo.toLowerCase()}:${attachment.id}`);
      }
      return bytes;
    } catch (error) {
      if (error instanceof ClientError) throw error;
      if (error instanceof MediaStorageError) throw new ClientError("Attachment storage verification failed.");
      throw new ClientError("Could not decrypt or load this attachment.");
    }
  }
  async uploadImage(room: TerminalRoom, image: LocalImage, confirmed: boolean, history?: History): Promise<Attachment> {
    if (!confirmed) throw new ClientError("Sending an image requires confirmation.");
    if (image.bytes.length > 2 * 1024 * 1024 || imageMime(image.bytes) !== image.mime || !/^[a-zA-Z0-9_-]{8,80}$/.test(image.id)) throw new ClientError("Invalid image upload.");
    return this.uploadMedia(room, image, history);
  }
  async uploadVoice(room: TerminalRoom, voice: LocalVoice, confirmed: boolean, history?: History): Promise<Attachment> {
    if (!confirmed) throw new ClientError("Sending a voice message requires confirmation.");
    const checked = memoryVoice(voice.bytes);
    if (voice.mime !== "audio/wav" || !/^[a-zA-Z0-9_-]{8,80}$/.test(voice.id)) throw new ClientError("Invalid voice upload.");
    return this.uploadMedia(room, { ...checked, id: voice.id }, history);
  }
  private async uploadMedia(room: TerminalRoom, image: LocalImage & { duration?: number; waveform?: number[] }, history?: History): Promise<Attachment> {
    const key = await this.keyFor(room);
    const contentText = Buffer.from(image.bytes).toString("latin1");
    if (containsCredential(contentText) || containsCredential(image.name) || this.github.containsActiveCredential(contentText) || this.github.containsActiveCredential(image.name)) throw new ClientError("This attachment appears to contain a credential.");
    for (const secret of new Set([key, this.key, ...this.keys.values()])) if (secret && contentText.includes(await exportKey(secret))) throw new ClientError("This attachment appears to contain a room key.");
    const fresh = await this.open(room.id), policy = await this.policy(fresh);
    if (!fresh.canWrite || fresh.branch !== room.branch) throw new ClientError("Reopen this chat before uploading.");
    if (!policy.enabled && (history?.encrypted || key)) throw new ClientError("Encrypted history or a room key exists but its policy is missing. Refusing plaintext upload.");
    if (policy.enabled && (!key || await keyFingerprint(key) !== policy.keyId)) throw new ClientError("Import the matching room key before uploading.");
    const original = await digest(image.bytes);
    let pending = this.pendingUpload;
    if (!pending || pending.room !== `${room.id}:${room.branch}` || pending.attachment.id !== image.id || pending.original !== original) {
      const sealed = policy.enabled ? await encryptBytes(key!, image.bytes, `gitmsg:media:${room.id.toLowerCase()}:${image.id}`) : null;
      const bytes = sealed?.bytes ?? image.bytes;
      const attachment: Attachment = { id: image.id, name: image.name, mime: image.mime, size: bytes.length, sha256: await digest(bytes), ...(sealed ? { iv: sealed.iv } : {}), ...(image.duration ? { duration: image.duration, waveform: image.waveform } : {}) };
      pending = { room: `${room.id}:${room.branch}`, original, bytes, attachment }; this.pendingUpload = pending;
    }
    if (!!pending.attachment.iv !== policy.enabled) throw new ClientError("Encryption policy changed. Reattach the image.");
    try {
      // A retry first checks the same path; it never creates another attachment ID.
      const existing = await readGitMedia(path => this.github.json(path), room.id, room.branch, image.id);
      if (await digest(existing) !== pending.attachment.sha256) throw new ClientError("This attachment ID already contains different data.");
      return pending.attachment;
    } catch (error) { if (!(error instanceof ClientError && error.status === 404)) throw error; }
    await this.github.request(`/repos/${room.id}/contents/media/${image.id}.bin`, { method: "PUT", data: { branch: room.branch, message: "feat(media): store attachment", content: Buffer.from(pending.bytes).toString("base64") } });
    return pending.attachment;
  }
  async send(room: TerminalRoom, actor: Actor, text: string, history?: History, attachments: Attachment[] = [], replyTo?: string): Promise<{ sha: string; event: ChatEvent }> {
    if (this.sending) throw new ClientError("A message is already being sent. Wait for its result.");
    if ((!text.trim() && !attachments.length) || text.length > 4000 || attachments.length > 4 || !attachments.every(validAttachment)) throw new ClientError("Send up to 4,000 characters or four valid attachments.");
    if (replyTo !== undefined && (!/^[a-zA-Z0-9_-]{8,80}$/.test(replyTo) || !history?.messages.some(message => message.id === replyTo && !message.deleted && !message.locked))) throw new ClientError("Reply target is unavailable in this conversation. Cancel the reply or refresh.");
    if (containsCredential(text) || this.github.containsActiveCredential(text)) throw new ClientError("This message looks like it contains a credential or room key. Refusing to commit it.");
    this.sending = true;
    try {
      const key = await this.keyFor(room);
      for (const secret of new Set([key, this.key, ...this.keys.values()])) if (secret && text.includes(await exportKey(secret))) throw new ClientError("This message looks like it contains a credential or room key. Refusing to commit it.");
      const fresh = await this.open(room.id);
      if (!fresh.canWrite || fresh.branch !== room.branch) throw new ClientError("Write access or the default branch changed. Reopen the room before sending.");
      const policy = await this.policy(fresh);
      if (!policy.enabled && (history?.encrypted || key)) throw new ClientError("Encrypted history or a room key exists but its policy is missing. Refusing plaintext until the policy is repaired.");
      if (policy.enabled && (!key || await keyFingerprint(key) !== policy.keyId)) throw new ClientError("Secure room: import the matching key with /secure import. Plaintext was not sent.");
      if (attachments.some(a => !!a.iv !== policy.enabled || a.sourceRepo || a.sourceBranch)) throw new ClientError("Attachment encryption or source does not match this room.");
      // Preserve the event ID across an ambiguous write so an explicit retry cannot duplicate it.
      let event: ChatEvent;
      const pendingKey = `${room.id}:${room.branch}`, pending = this.pending.get(pendingKey);
      if (pending?.text === text && pending.attachments === JSON.stringify(attachments) && pending.replyTo === replyTo) {
        event = pending.event;
        try {
          const stored = contentJson(await this.github.json<Contents>(`/repos/${room.id}/contents/${eventPath(event)}?${new URLSearchParams({ ref: room.branch })}`));
          if (!validEvent(stored) || JSON.stringify(stored) !== JSON.stringify(event)) throw new ClientError("The pending event path already contains different data. Nothing was overwritten.");
          this.pending.delete(pendingKey);
          return { sha: "already-confirmed", event };
        } catch (error) { if (!(error instanceof ClientError && error.status === 404)) throw error; }
      } else {
        event = { v: 1, id: randomUUID(), kind: "message", actor, createdAt: new Date().toISOString(), text, ...(attachments.length ? { attachments } : {}), ...(replyTo ? { replyTo } : {}) };
        if (policy.enabled) event = await encryptEvent(key!, room.id, room.branch, event);
        this.pending.set(pendingKey, { text, attachments: JSON.stringify(attachments), replyTo, event });
      }
      if (policy.enabled !== !!event.sealed || (policy.enabled && event.sealed?.keyId !== policy.keyId)) throw new ClientError("Encryption changed during a pending send. Reopen the room; nothing was resent.");
      const result = await this.github.json<{ commit: { sha: string } }>(`/repos/${room.id}/contents/${eventPath(event)}`, { method: "PUT", data: { branch: room.branch, message: `${commitSubject(event)}\n\n${EVENT_PREFIX}${JSON.stringify(event)}`, content: Buffer.from(JSON.stringify(event, null, 2)).toString("base64") } });
      if (!/^[a-f0-9]{40,64}$/.test(result.commit?.sha)) throw new ClientError("GitHub did not return a commit confirmation. Refresh before retrying.");
      this.pending.delete(pendingKey);
      return { sha: result.commit.sha, event };
    } finally { this.sending = false; }
  }
}
