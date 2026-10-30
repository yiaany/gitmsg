import { NextRequest } from "next/server";
import { failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { repositoryRoom } from "@/lib/repository-access";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request); const session = await getSession(); throttle(`saved:${session.user.id}`, 20);
    const repo = `${session.user.login}/gitmsg-saved`;
    try {
      const existing = await (await github(session, `/repos/${repo}`)).json();
      if (!existing.private) throw new HttpError(409, "Your gitmsg-saved repository is public. Make it private before saving messages.");
      return json({ room: repositoryRoom(existing) });
    } catch (error) { if (!(error instanceof HttpError) || error.status !== 404) throw error; }
    const created = await (await github(session, "/user/repos", { method: "POST", body: JSON.stringify({ name: "gitmsg-saved", private: true, auto_init: true, description: "Your saved gitmsg messages. Readable without the website." }) })).json();
    return json({ room: repositoryRoom(created) }, 201);
  } catch (error) { return failure(error); }
}
