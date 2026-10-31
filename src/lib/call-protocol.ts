import type { Actor, ChatEvent, Room } from "./protocol";

export const CALL_TTL_MS = 90000;
export const ICE_BATCH_MS = 2500;
export const MAX_SDP = 14000;
export type CallSignal = {
  id: string; to: number; phase: "offer" | "answer" | "end";
  expiresAt: string; sdp?: string; reason?: "hangup" | "declined" | "busy" | "timeout" | "failed";
};
export function validCallSignal(value: unknown): value is CallSignal {
  if (!value || typeof value !== "object") return false;
  const c = value as CallSignal;
  if (Object.keys(c).some(key => !["id", "to", "phase", "expiresAt", "sdp", "reason"].includes(key))) return false;
  if (typeof c.id !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(c.id) || !Number.isSafeInteger(c.to) || c.to < 1 || typeof c.expiresAt !== "string" || !Number.isFinite(Date.parse(c.expiresAt))) return false;
  if (c.phase === "end") return c.sdp === undefined && ["hangup", "declined", "busy", "timeout", "failed"].includes(c.reason || "");
  return ["offer", "answer"].includes(c.phase) && c.reason === undefined && typeof c.sdp === "string" && c.sdp.length <= MAX_SDP && /^[\x09\x0a\x0d\x20-\x7e]+$/.test(c.sdp) && c.sdp.startsWith("v=0\r\n") && c.sdp.split(/\r?\n/).filter(line => line.startsWith("m=")).length === 1 && /\r\nm=audio /.test(c.sdp) && /\r\na=fingerprint:sha-256 /.test(c.sdp) && /\r\na=ice-ufrag:/.test(c.sdp) && /\r\na=ice-pwd:/.test(c.sdp);
}
export function callableRoom(room: Room, actor: Actor): boolean {
  return room.private === true && room.kind === "chat" && room.canWrite === true && !!room.peer && room.peer.id !== actor.id;
}
export function freshCall(event: ChatEvent, now = Date.now()): boolean {
  return event.kind === "call" && !!event.call && validCallSignal(event.call) && Date.parse(event.createdAt) <= now + 10000 && Date.parse(event.createdAt) >= now - CALL_TTL_MS && Date.parse(event.call.expiresAt) > now && Date.parse(event.call.expiresAt) <= Date.parse(event.createdAt) + CALL_TTL_MS;
}
