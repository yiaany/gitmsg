import { NextRequest } from "next/server";
import { failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";

export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const session = await getSession();
    throttle(`onboard:${session.user.id}`, 8, 3600000);
    const fullName = `${session.user.login}/gitmsg-inbox`;
    let repo;
    try { repo = await (await github(session, `/repos/${fullName}`)).json(); }
    catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      try {
        repo = await (await github(session, "/user/repos", { method: "POST", body: JSON.stringify({ name: "gitmsg-inbox", private: true, auto_init: true, description: "Your gitmsg inbox. Messages are commits. Feelings are unversioned." }) })).json();
      } catch (creation) {
        if (!(creation instanceof HttpError) || creation.status !== 422) throw creation;
        repo = await (await github(session, `/repos/${fullName}`)).json();
      }
    }
    if (!repo.private) throw new HttpError(409, "A public gitmsg-inbox already exists. We will not put private messages there. Create a new private chat instead.");
    if (!repo.permissions?.push) throw new HttpError(403, "The inbox exists but your authorization cannot write to it. Check app permissions.");
    return json({ room: { id: repo.full_name, name: "inbox", description: "Your thoughts, now with version control.", branch: repo.default_branch || "main", private: true } });
  } catch (error) { return failure(error); }
}
