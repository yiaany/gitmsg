import { ClientError, parseRepo } from "./safety";

export const HELP = [
  ["/chats", "Switch conversations; drafts stay with each chat"],
  ["/new [name]", "Create a private chat, after confirmation"],
  ["/join owner/repo", "Join a chat or paste its invitation link"],
  ["/invite @username", "Invite a GitHub friend to this chat"],
  ["/inbox", "Review and accept incoming GitHub invitations"],
  ["/attach /absolute/image.png", "Preview an image, then confirm sending (2 MiB max)"],
  ["/voice", "Record a voice message; listen before sending (60 seconds max)"],
  ["/call", "Start a WebRTC audio call with this direct chat's verified partner"],
  ["/hangup", "End the active audio call and release the microphone"],
  ["/secure [import /absolute/key-file]", "Enable AES-256-GCM or import an existing room key"],
  ["/refresh", "Refresh this conversation"],
  ["/themes", "Choose a color theme with live preview"],
  ["/logout", "Remove this client's saved sign-in"],
  ["/help", "Show this panel"],
] as const;
export function commandSuggestions(value: string) {
  if (!/^\/[a-z]*$/i.test(value)) return [];
  return HELP.filter(([usage]) => usage.split(" ")[0].startsWith(value.toLowerCase()));
}
export function command(value: string): { name: string; argument: string } | null {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  const [, name, argument = ""] = value.trim().match(/^(\S+)(?:\s+([\s\S]*))?$/)!;
  if (!HELP.some(([usage]) => usage.split(" ")[0] === name)) throw new ClientError("Unknown command. Type /help. To send a leading slash, start with //.");
  return { name: name.slice(1), argument };
}
export function roomLink(value: string): string {
  // Invitation URLs grant no access; actual acceptance is a separate confirmation.
  return parseRepo(value.trim().replace(/^(https:\/\/github\.com\/[^/]+\/[^/?#]+)\/invitations\/?$/, "$1"));
}
