import { readAccountDocument } from "./account-store";
import { resolveRoomIdentity } from "./room-identity";
import { github, HttpError, type Session } from "./server";
import type { Room } from "./protocol";

/** Read-only decoration. Never infer a recipient from message authors or repo names. */
export async function roomIdentity(session: Session, room: Room): Promise<Room> {
  return resolveRoomIdentity(session.user, room, {
    request: async path => { try { return await github(session, path); } catch (error) { if (error instanceof HttpError && error.status === 404) return null; throw error; } },
    profile: async login => { try { return (await readAccountDocument(session, "profile", login)).value; } catch (error) { if (error instanceof HttpError && [403, 404, 409].includes(error.status)) return null; throw error; } },
  });
}
