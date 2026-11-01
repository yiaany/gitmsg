import { terminalText } from "./safety";

/** Repository IDs are storage details, not conversation names. */
export function conversationName(title?: string, peer?: string): string {
  if (peer) return `@${terminalText(peer, 39)}`;
  const value = terminalText(title ?? "", 80).trim();
  if (!value || /^(?:gitmsg[-_])?(?:chat|room|conversation|dm)(?:[-_ ]+[a-z0-9]+)*$/i.test(value) || /^gitmsg[-_]/i.test(value)) return "Conversation";
  return value;
}

export const MOTION_MS = 180;
export function easeOut(progress: number): number { return 1 - (1 - Math.min(1, Math.max(0, progress))) ** 3; }
export function blend(from: string, to: string, progress: number): string {
  const t = Math.min(1, Math.max(0, progress));
  const channels = [1, 3, 5].map(i => Math.round(parseInt(from.slice(i, i + 2), 16) * (1 - t) + parseInt(to.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}
