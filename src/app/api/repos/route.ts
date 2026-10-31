import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { validRepo } from "@/lib/protocol";
import { CHANNEL_MARKER, CHANNEL_TITLE_MARKER, repositoryRoom, validLogin, validProfileAvatar } from "@/lib/github-models";
import { ROOM_DOCUMENT_PATH, type RoomDocument } from "@/lib/room-document";
import { roomIdentity } from "@/lib/room-store";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const name = request.nextUrl.searchParams.get("repo");
    if (name) {
      if (!validRepo(name)) throw new HttpError(400, "Use owner/repository, for example octocat/gitmsg-after-hours.");
      const repo = await (await github(session, `/repos/${name}`)).json();
      const room = repositoryRoom(repo);
      if (!room.canWrite && (room.kind !== "channel" || room.private)) throw new HttpError(403, "You need write access to this repository to chat. Ask the owner for a collaborator invitation.");
      return json({ room: await roomIdentity(session, room) });
    }
    const repos = await (await github(session, "/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member")).json();
    return json({ rooms: repos.filter((r: { name: string; permissions?: { push?: boolean } }) => r.name.startsWith("gitmsg-") && !["gitmsg-profile", "gitmsg-settings"].includes(r.name) && r.permissions?.push).map(repositoryRoom) });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const session = await getSession();
    throttle(`create:${session.user.id}`, 3, 3600000);
    const input = await body<{ name: string; title?: string; avatar?: string; peer?: string; kind?: "chat" | "channel"; description?: string; public?: boolean }>(request, 400000);
    if (typeof input.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{1,39}$/.test(input.name)) throw new HttpError(400, "Pick a name with 2–40 letters, numbers, or hyphens.");
    const channel = input.kind === "channel";
    if (input.kind !== undefined && !["chat", "channel"].includes(input.kind)) throw new HttpError(400, "Choose a private chat or a public channel.");
    if (!channel && ["profile", "settings"].includes(input.name.toLowerCase())) throw new HttpError(400, "That repository name is reserved for your gitmsg account. Choose another chat name.");
    if (channel && input.public !== true) throw new HttpError(400, "Confirm that channel posts will be public on GitHub.");
    if (input.title !== undefined && (typeof input.title !== "string" || !input.title.trim() || input.title.length > 100 || /[\x00-\x1f]/.test(input.title))) throw new HttpError(400, "Choose a conversation name of 1–100 characters on one line.");
    if (input.avatar !== undefined && !validProfileAvatar(input.avatar)) throw new HttpError(400, "Choose a PNG, JPEG or WebP conversation photo under 256 KiB.");
    if (input.peer !== undefined && (channel || !validLogin(input.peer) || input.peer.toLowerCase() === session.user.login.toLowerCase())) throw new HttpError(400, "Choose another GitHub user for a private conversation.");
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 250) : "";
    const repo = await (await github(session, "/user/repos", { method: "POST", body: JSON.stringify({ name: channel ? `gitmsg-channel-${input.name}` : `gitmsg-${input.name}`, description: channel ? `${CHANNEL_MARKER} ${CHANNEL_TITLE_MARKER} ${input.title?.trim() || input.name}` : description || "Messages are commits. Made with gitmsg.", private: !channel, auto_init: true }) })).json();
    const room = repositoryRoom({ ...repo, permissions: { push: true, admin: true } });
    const document: RoomDocument = { schema: "gitmsg-room-v1", title: input.title?.trim() || room.name, description, ...(input.avatar ? { avatar: input.avatar } : {}), ...(input.peer ? { participants: [session.user.login, input.peer] } : {}) };
    try {
      await github(session, `/repos/${room.id}/contents/${ROOM_DOCUMENT_PATH}`, { method: "PUT", body: JSON.stringify({ message: "gitmsg: set conversation identity", branch: room.branch, content: Buffer.from(JSON.stringify(document)).toString("base64") }) });
    } catch {
      // Creation already succeeded. Never invite the client to retry and create another repo.
      return json({ room, warning: "Repository created, but its name/photo metadata could not be saved. You can use it now; do not create it again." }, 201);
    }
    return json({ room: { ...room, name: document.title, description, ...(document.avatar ? { avatar: document.avatar } : {}) } }, 201);
  } catch (error) { return failure(error); }
}
