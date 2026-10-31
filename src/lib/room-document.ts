import { validLogin, validProfileAvatar } from "./github-models";

export const ROOM_DOCUMENT_PATH = ".gitmsg/room.json";
export type RoomDocument = { schema: "gitmsg-room-v1"; title: string; description?: string; avatar?: string; participants?: string[] };
export function parseRoomDocument(value: unknown): RoomDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const doc = value as Partial<RoomDocument>;
  if (doc.schema !== "gitmsg-room-v1" || typeof doc.title !== "string" || !doc.title.trim() || doc.title.length > 100) return null;
  if (doc.avatar !== undefined && !validProfileAvatar(doc.avatar)) return null;
  if (doc.participants !== undefined && (!Array.isArray(doc.participants) || doc.participants.length !== 2 || !doc.participants.every(validLogin) || new Set(doc.participants.map(login => login.toLowerCase())).size !== 2)) return null;
  return { schema: "gitmsg-room-v1", title: doc.title.trim(), ...(typeof doc.description === "string" ? { description: doc.description.slice(0, 250) } : {}), ...(doc.avatar ? { avatar: doc.avatar } : {}), ...(doc.participants ? { participants: doc.participants } : {}) };
}

/** Display titles need not obey GitHub's repository-name restrictions. */
export function roomRepositoryName(title: string, suffix: string): string {
  if (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,39}$/.test(title)) return title;
  const base = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  return `${base || "conversation"}-${suffix.slice(0, 6)}`;
}
