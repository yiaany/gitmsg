import { validRepo, type Room } from "./protocol";
import { parseProfile, type LocalProfile } from "./view-preferences";

export const CHANNEL_MARKER = "[gitmsg:channel:v1]";
export const CHANNEL_TITLE_MARKER = "[gitmsg:title:v1]";
export const PROFILE_MARKER = "[gitmsg:profile:v1]";
export const LIBRARY_MARKER = "[gitmsg:settings:v1]";
export type RepositoryInfo = { full_name: string; name: string; description?: string | null; default_branch?: string; private: boolean; permissions?: { push?: boolean; admin?: boolean }; owner?: { login: string } };
export function repositoryRoom(repo: RepositoryInfo): Room {
  const channel = repo.name.startsWith("gitmsg-channel-") && repo.description?.includes(CHANNEL_MARKER) === true && !repo.private;
  const publishedTitle = channel && repo.description?.includes(CHANNEL_TITLE_MARKER) ? repo.description.split(CHANNEL_TITLE_MARKER)[1]?.trim().slice(0, 100) : undefined;
  return { id: repo.full_name, name: publishedTitle || repo.name.replace(channel ? /^gitmsg-channel-/ : /^gitmsg-/, ""), description: publishedTitle ? "" : (repo.description || "").replace(CHANNEL_MARKER, "").trim(), branch: repo.default_branch || "main", private: repo.private, kind: channel ? "channel" : "chat", canWrite: !!repo.permissions?.push };
}
export function validLogin(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value); }
export function validDiscoveryQuery(value: string): boolean { return /^[\p{L}\p{N}][\p{L}\p{N} -]{1,63}$/u.test(value); }
export function libraryRooms(value: unknown): Room[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, Room>();
  for (const room of value) if (room && typeof room.id === "string" && validRepo(room.id) && !room.demo && typeof room.name === "string" && typeof room.branch === "string" && room.branch.length > 0 && room.branch.length <= 200) unique.set(room.id.toLowerCase(), { id: room.id, name: room.name.slice(0, 100), description: typeof room.description === "string" ? room.description.slice(0, 500) : "", branch: room.branch, private: room.private === true, kind: room.kind === "channel" ? "channel" : "chat", canWrite: room.canWrite === true, ...(validProfileAvatar(room.avatar) || (typeof room.avatar === "string" && /^https:\/\/avatars\.githubusercontent\.com\//.test(room.avatar)) ? { avatar: room.avatar } : {}), ...(typeof room.color === "string" && /^#[a-f0-9]{6}$/i.test(room.color) ? { color: room.color } : {}), ...(room.peer && Number.isSafeInteger(room.peer.id) && room.peer.id > 0 && validLogin(room.peer.login) ? { peer: { id: room.peer.id, login: room.peer.login, ...(typeof room.peer.avatar === "string" && room.peer.avatar.startsWith("https://avatars.githubusercontent.com/") ? { avatar: room.peer.avatar } : {}) } } : {}) });
  return [...unique.values()].slice(-500);
}
export type ProfileMusic = { title: string; artist: string; url: string };
export type GitHubProfile = LocalProfile & { avatar?: string; music?: ProfileMusic };
export function parseProfileMusic(value: unknown): ProfileMusic | undefined {
  if (!value || typeof value !== "object") return;
  const music = value as Partial<ProfileMusic>;
  if (typeof music.title !== "string" || !music.title.trim() || typeof music.url !== "string" || music.url.length > 2000) return;
  try { const url = new URL(music.url); if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return; } catch { return; }
  return { title: music.title.trim().slice(0, 100), artist: typeof music.artist === "string" ? music.artist.trim().slice(0, 100) : "", url: music.url };
}
export function validProfileAvatar(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 350000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  // Check file signatures, not just a client-supplied media type. SVG/HTML are never accepted.
  let raw: string;
  try { raw = atob(value.split(",")[1]); } catch { return false; }
  if (raw.length > 256 * 1024) return false;
  if (value.startsWith("data:image/png")) return raw.startsWith("\x89PNG\r\n\x1a\n");
  if (value.startsWith("data:image/jpeg")) return raw.startsWith("\xff\xd8\xff");
  return raw.startsWith("RIFF") && raw.slice(8, 12) === "WEBP";
}
export function parseGitHubProfile(value: unknown): GitHubProfile {
  const profile = value as { avatar?: unknown; music?: unknown } | null;
  const music = parseProfileMusic(profile?.music);
  return { ...parseProfile(value), ...(validProfileAvatar(profile?.avatar) ? { avatar: profile.avatar } : {}), ...(music ? { music } : {}) };
}
