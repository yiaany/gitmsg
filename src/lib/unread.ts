import { materialize, validRepo, type ChatEvent } from "./protocol";

// Device-local IDs only: never persist message text, decrypted content or keys.
export type ReadState = { seen: string[]; unread: string[] };
export type InboxReads = Record<string, ReadState>;
const LIMIT = 2000;
const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id)))].slice(-LIMIT) : [];
export function parseInboxReads(value: unknown): InboxReads {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([repo, state]) => validRepo(repo) && state && typeof state === "object").slice(0, 500).map(([repo, state]) => [repo.toLowerCase(), { seen: ids(state.seen), unread: ids(state.unread) }]));
}

export function observeMessages(previous: ReadState | undefined, events: ChatEvent[], actorId: number, reading: boolean): ReadState {
  const messages = materialize(events);
  const current = messages.map(message => message.id);
  // First sync establishes a baseline, not a fabricated badge for old history.
  if (!previous) return { seen: current.slice(-LIMIT), unread: [] };
  const known = new Set(previous.seen);
  const firstKnown = messages.findIndex(message => known.has(message.id));
  const unread = new Set(previous.unread);
  messages.forEach((message, index) => {
    if (message.deleted || message.actor.id === actorId) unread.delete(message.id);
    else if (!known.has(message.id) && (firstKnown < 0 || index >= firstKnown)) unread.add(message.id);
  });
  return { seen: [...new Set([...previous.seen, ...current])].slice(-LIMIT), unread: reading ? [] : [...unread].slice(-LIMIT) };
}
