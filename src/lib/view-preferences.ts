import type { Message } from "./protocol";

export type LocalProfile = { name: string; bio: string; color: string };
export const DEFAULT_PROFILE: LocalProfile = { name: "", bio: "", color: "#6c61df" };
export type MessagePins = Record<string, string[]>;

export function parseMutedRooms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(id)).map(id => id.toLowerCase()))].slice(-1000);
}

export function parseProfile(value: unknown): LocalProfile {
  const profile = value as Partial<LocalProfile> | null;
  return {
    name: typeof profile?.name === "string" ? profile.name.trim().slice(0, 64) : "",
    bio: typeof profile?.bio === "string" ? profile.bio.trim().slice(0, 160) : "",
    color: typeof profile?.color === "string" && /^#[a-f0-9]{6}$/i.test(profile.color) ? profile.color : DEFAULT_PROFILE.color,
  };
}

/** Only IDs are persisted: never create a second plaintext copy of pinned content. */
export function parsePins(value: unknown): MessagePins {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(-1000).filter(([, ids]) => Array.isArray(ids)).map(([room, ids]) => [room, [...new Set((ids as unknown[]).filter((id): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id)))].slice(-100)]));
}

export function toggleMessagePin(pins: MessagePins, room: string, id: string): MessagePins {
  const ids = pins[room] || [];
  return { ...pins, [room]: ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id].slice(-100) };
}

export function pinnedMessages(messages: Message[], ids: string[] = []): Message[] {
  const pinned = new Set(ids);
  return messages.filter(message => pinned.has(message.id) && !message.deleted && !message.locked);
}
