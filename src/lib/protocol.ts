import { validCallSignal, type CallSignal } from "./call-protocol";

export const EVENT_PREFIX = "gitmsg:event:v1\n";
export const MAX_TEXT = 4000;
export const REACTIONS = ["🚀", "❤️", "😂", "👀", "🔥", "👍"] as const;
export type Reaction = typeof REACTIONS[number];
export type Actor = { id: number; login: string; avatar?: string };
export type Attachment = { id: string; name: string; mime: string; size: number; sha256: string; iv?: string; duration?: number; waveform?: number[]; sourceRepo?: string; sourceBranch?: string };
export const MEDIA_TYPES = ["image/webp", "image/png", "image/jpeg", "image/gif", "audio/webm", "audio/ogg", "audio/mp4", "application/vnd.excalidraw+json", "application/octet-stream"];
export const MAX_MEDIA = 2 * 1024 * 1024;
export type SealedContent = { algorithm: "AES-256-GCM"; iv: string; ciphertext: string; keyId: string };
export type ChatEvent = {
  v: 1;
  id: string;
  kind: "message" | "edit" | "delete" | "reaction" | "call";
  call?: CallSignal;
  actor: Actor;
  createdAt: string;
  text?: string;
  target?: string;
  replyTo?: string;
  emoji?: Reaction;
  active?: boolean;
  sha?: string;
  url?: string;
  attachments?: Attachment[];
  sealed?: SealedContent;
  locked?: boolean;
  encrypted?: boolean;
  savedFrom?: { repo: string; id: string; sha?: string };
  bot?: { command: "roll" | "standup"; value?: number };
};
export type Message = {
  id: string;
  actor: Actor;
  text: string;
  createdAt: string;
  replyTo?: string;
  edited: boolean;
  deleted: boolean;
  sha?: string;
  url?: string;
  reactions: Partial<Record<Reaction, Actor[]>>;
  attachments?: Attachment[];
  locked?: boolean;
  encrypted?: boolean;
  savedFrom?: ChatEvent["savedFrom"];
  bot?: ChatEvent["bot"];
};
export type Room = { id: string; name: string; description: string; branch: string; private?: boolean; kind?: "chat" | "channel"; canWrite?: boolean; avatar?: string; color?: string; peer?: Actor };
export function validAttachment(value: unknown): value is Attachment {
  const a = value as Attachment;
  if (a?.waveform !== undefined && (!Array.isArray(a.waveform) || !a.waveform.length || a.waveform.length > 64 || !a.waveform.every(value => Number.isInteger(value) && value >= 0 && value <= 31))) return false;
  return !!a && /^[a-zA-Z0-9_-]{8,80}$/.test(a.id) && typeof a.name === "string" && a.name.length <= 160 && MEDIA_TYPES.includes(a.mime) && Number.isInteger(a.size) && a.size > 0 && a.size <= MAX_MEDIA + 16 && /^[a-f0-9]{64}$/.test(a.sha256) && (a.iv === undefined || /^[A-Za-z0-9_-]{16}$/.test(a.iv)) && (a.duration === undefined || (Number.isFinite(a.duration) && a.duration > 0 && a.duration <= 60)) && (a.sourceRepo === undefined || validRepo(a.sourceRepo)) && (a.sourceBranch === undefined || (typeof a.sourceBranch === "string" && a.sourceBranch.length <= 200));
}

export function validRepo(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value) && !value.endsWith("/.") && !value.endsWith("/..");
}

export function validEvent(value: unknown): value is ChatEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as ChatEvent;
  if (e.v !== 1 || typeof e.id !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(e.id) || !e.actor || !Number.isSafeInteger(e.actor.id) || e.actor.id < 1 || typeof e.actor.login !== "string" || !/^[a-zA-Z0-9-]{1,39}$/.test(e.actor.login) || typeof e.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(e.createdAt) || !Number.isFinite(Date.parse(e.createdAt))) return false;
  if (e.sealed) return ["message", "call"].includes(e.kind) && e.call === undefined && e.text === undefined && e.attachments === undefined && e.target === undefined && e.replyTo === undefined && e.bot === undefined && e.savedFrom === undefined && e.sealed.algorithm === "AES-256-GCM" && /^[A-Za-z0-9_-]{16}$/.test(e.sealed.iv) && /^[a-f0-9]{64}$/.test(e.sealed.keyId) && typeof e.sealed.ciphertext === "string" && /^[A-Za-z0-9_-]{20,32000}$/.test(e.sealed.ciphertext);
  if (e.kind === "call") return validCallSignal(e.call) && e.call.to !== e.actor.id && e.text === undefined && e.target === undefined && e.attachments === undefined && e.replyTo === undefined && e.bot === undefined && e.savedFrom === undefined;
  if (e.call !== undefined) return false;
  if (e.attachments !== undefined && (!Array.isArray(e.attachments) || e.attachments.length > 4 || !e.attachments.every(validAttachment))) return false;
  if (e.savedFrom !== undefined && (!e.savedFrom || typeof e.savedFrom.repo !== "string" || !validRepo(e.savedFrom.repo) || typeof e.savedFrom.id !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(e.savedFrom.id) || (e.savedFrom.sha !== undefined && !/^[a-f0-9]{7,40}$/.test(e.savedFrom.sha)))) return false;
  if (e.bot !== undefined && (!e.bot || !["roll", "standup"].includes(e.bot.command) || (e.bot.command === "roll" && (!Number.isInteger(e.bot.value) || e.bot.value! < 1 || e.bot.value! > 6)))) return false;
  if (e.kind === "message" || e.kind === "edit") {
    if (typeof e.text !== "string" || (!e.text.trim() && !e.attachments?.length) || e.text.length > MAX_TEXT) return false;
  }
  if (e.kind !== "message" && (typeof e.target !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(e.target))) return false;
  if (e.replyTo !== undefined && (typeof e.replyTo !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(e.replyTo))) return false;
  if (e.kind === "reaction" && (!REACTIONS.includes(e.emoji as Reaction) || typeof e.active !== "boolean")) return false;
  return ["message", "edit", "delete", "reaction"].includes(e.kind);
}

export function eventPath(event: ChatEvent): string {
  return `events/${event.createdAt.slice(0, 10).replaceAll("-", "/")}/${event.id}.json`;
}

export function parseCommit(message: string, sha: string, url: string): ChatEvent | null {
  const index = message.indexOf(EVENT_PREFIX);
  if (index < 0) return null;
  try {
    const e = JSON.parse(message.slice(index + EVENT_PREFIX.length));
    return validEvent(e) ? { ...e, sha, url } : null;
  } catch { return null; }
}

// Input order is Git order, oldest first. Client clocks never determine mutations.
export function materialize(events: ChatEvent[]): Message[] {
  const messages = new Map<string, Message>();
  const unique = new Set<string>();
  for (const event of events) {
    if (unique.has(event.id)) continue;
    unique.add(event.id);
    if (event.kind === "message") messages.set(event.id, {
      id: event.id, actor: event.actor, text: event.text!, createdAt: event.createdAt,
      replyTo: event.replyTo, edited: false, deleted: false, sha: event.sha, url: event.url, reactions: {},
      attachments: event.attachments, locked: event.locked, savedFrom: event.savedFrom, bot: event.bot,
      encrypted: event.encrypted,
    });
  }
  unique.clear();
  for (const e of events) {
    if (unique.has(e.id)) continue;
    unique.add(e.id);
    if (e.kind === "message" || e.kind === "call") continue;
    const m = messages.get(e.target!);
    if (!m) continue;
    if (e.kind === "edit" && m.actor.id === e.actor.id && !m.deleted) { m.text = e.text!; m.edited = true; }
    if (e.kind === "delete" && m.actor.id === e.actor.id) { m.deleted = true; m.text = "This message was reverted. Git remembers."; m.reactions = {}; m.attachments = undefined; }
    if (e.kind === "reaction" && !m.deleted) {
      const actors = (m.reactions[e.emoji!] ?? []).filter(a => a.id !== e.actor.id);
      m.reactions[e.emoji!] = e.active ? [...actors, e.actor] : actors;
    }
  }
  return [...messages.values()];
}

export function mergeEvents(existing: ChatEvent[], incoming: ChatEvent[]): ChatEvent[] {
  const result = new Map(existing.map(e => [e.id, e]));
  for (const event of incoming) result.set(event.id, { ...result.get(event.id), ...event });
  return [...result.values()];
}

// A sync batch carries canonical Git order; preserve older loaded history and
// locally confirmed sends that are not visible in the fetched snapshot yet.
export function reconcileEvents(existing: ChatEvent[], incoming: ChatEvent[]): ChatEvent[] {
  if (!incoming.length) return existing;
  const incomingIds = new Set(incoming.map(e => e.id));
  const firstMatch = existing.findIndex(e => incomingIds.has(e.id));
  if (firstMatch < 0) return mergeEvents(existing, incoming);
  const before = existing.slice(0, firstMatch);
  const unmatchedTail = existing.slice(firstMatch).filter(e => !incomingIds.has(e.id));
  return mergeEvents(mergeEvents(before, incoming), unmatchedTail);
}

export function commitSubject(event: ChatEvent): string {
  if (event.sealed) return "feat(chat): encrypted event";
  return ({ message: "feat(chat): ship a thought", edit: "fix(chat): rewrite that thought", delete: "revert(chat): plausible deniability", reaction: "chore(chat): emotional support emoji", call: "feat(call): audio signaling" })[event.kind];
}
