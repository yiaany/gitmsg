import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { libraryRooms, repositoryRoom } from "@/lib/github-models";
import { validRepo, type Room } from "@/lib/protocol";
import { readAccountDocument, writeAccountDocument } from "@/lib/account-store";
import { roomIdentity } from "@/lib/room-store";
export const maxDuration = 60;
export async function GET() {
  try { const session = await getSession(); throttle(`library-read:${session.user.id}`, 30); const document = await readAccountDocument(session, "settings"); return json({ rooms: libraryRooms((document.value as { rooms?: unknown } | null)?.rooms) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request); const session = await getSession(); throttle(`library:${session.user.id}`, 30);
    const { repo, action } = await body<{ repo: string; action: "add" | "subscribe" | "remove" }>(request);
    if (!validRepo(repo) || !["add", "subscribe", "remove"].includes(action)) throw new HttpError(400, "Invalid library action.");
    let room: Room | undefined;
    if (action !== "remove") {
      room = repositoryRoom(await (await github(session, `/repos/${repo}`)).json());
      if (action === "subscribe" && (room.kind !== "channel" || room.private)) throw new HttpError(400, "Only public gitmsg channels support subscriptions.");
       if (action === "add" && !room.canWrite) throw new HttpError(403, "Write access is required to add a chat. Subscribe to public channels instead.");
       room = await roomIdentity(session, room);
    }
    const result = await writeAccountDocument(session, "settings", previous => ({ rooms: [...libraryRooms((previous as { rooms?: unknown } | null)?.rooms).filter(room => room.id.toLowerCase() !== repo.toLowerCase()), ...(room ? [room] : [])] }));
    return json({ rooms: (result as { rooms: unknown }).rooms, ...(room ? { room } : {}) });
  } catch (error) { return failure(error); }
}
