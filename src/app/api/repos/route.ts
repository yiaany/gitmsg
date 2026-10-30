import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { validRepo } from "@/lib/protocol";
export const maxDuration = 60;

function room(repo: { full_name: string; name: string; description: string; default_branch: string; private: boolean }) {
  return { id: repo.full_name, name: repo.name.replace(/^gitmsg-/, ""), description: repo.description || "A conversation with version control.", branch: repo.default_branch || "main", private: repo.private };
}
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const name = request.nextUrl.searchParams.get("repo");
    if (name) {
      if (!validRepo(name)) throw new HttpError(400, "Use owner/repository, for example octocat/gitmsg-after-hours.");
      const repo = await (await github(session, `/repos/${name}`)).json();
      if (!repo.permissions?.push) throw new HttpError(403, "You need write access to this repository to chat. Ask the owner for a collaborator invitation.");
      return json({ room: room(repo) });
    }
    const repos = await (await github(session, "/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member")).json();
    return json({ rooms: repos.filter((r: { name: string; permissions?: { push?: boolean } }) => r.name.startsWith("gitmsg-") && r.permissions?.push).map(room) });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const session = await getSession();
    throttle(`create:${session.user.id}`, 3, 3600000);
    const input = await body<{ name: string }>(request);
    if (typeof input.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{1,39}$/.test(input.name)) throw new HttpError(400, "Pick a name with 2–40 letters, numbers, or hyphens.");
    const repo = await (await github(session, "/user/repos", { method: "POST", body: JSON.stringify({ name: `gitmsg-${input.name}`, description: "Messages are commits. Feelings are unversioned. Made with gitmsg.", private: true, auto_init: true }) })).json();
    return json({ room: room(repo) }, 201);
  } catch (error) { return failure(error); }
}
