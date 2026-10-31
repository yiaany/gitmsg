import { parseGitHubProfile, validLogin } from "./github-models";
import { parseRoomDocument, ROOM_DOCUMENT_PATH } from "./room-document";
import type { Actor, Room } from "./protocol";

type IdentitySource = { request: (path: string) => Promise<Response | null>; profile: (login: string) => Promise<unknown> };

/** Read-only decoration. Never infer a recipient from message authors or repo names. */
export async function resolveRoomIdentity(viewer: Actor, room: Room, source: IdentitySource): Promise<Room> {
  const response = await source.request(`/repos/${room.id}/contents/${ROOM_DOCUMENT_PATH}?${new URLSearchParams({ ref: room.branch })}`);
  if (!response) return room;
  const file = await response.json();
  if (file.encoding !== "base64" || typeof file.content !== "string" || file.content.length > 550000) return room;
  let document;
  try { document = parseRoomDocument(JSON.parse(Buffer.from(file.content, "base64").toString("utf8"))); }
  catch { return room; }
  if (!document) return room;
  const decorated = { ...room, name: document.title, description: document.description ?? room.description, ...(document.avatar ? { avatar: document.avatar } : {}) };
  const participants = document.participants;
  if (room.kind === "channel" || !room.private || !participants?.some(login => login.toLowerCase() === viewer.login.toLowerCase())) return decorated;
  const login = participants.find(login => login.toLowerCase() !== viewer.login.toLowerCase())!;
  const userResponse = await source.request(`/users/${login}`);
  if (!userResponse) return decorated;
  const githubUser = await userResponse.json();
  if (!Number.isSafeInteger(githubUser.id) || githubUser.id < 1 || !validLogin(githubUser.login) || githubUser.login.toLowerCase() !== login.toLowerCase()) return decorated;
  const peer: Actor = { id: githubUser.id, login: githubUser.login, ...(typeof githubUser.avatar_url === "string" && githubUser.avatar_url.startsWith("https://avatars.githubusercontent.com/") ? { avatar: githubUser.avatar_url } : {}) };
  const account = await source.profile(peer.login);
  const profile = parseGitHubProfile((account as { profile?: unknown } | null)?.profile);
  return { ...decorated, peer, name: profile.name || peer.login, description: profile.bio, avatar: profile.avatar || peer.avatar, color: profile.color };
}
