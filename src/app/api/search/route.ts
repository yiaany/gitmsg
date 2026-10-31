import { NextRequest } from "next/server";
import { failure, getSession, github, HttpError, json, throttle } from "@/lib/server";
import { CHANNEL_MARKER, repositoryRoom, validDiscoveryQuery } from "@/lib/github-models";
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(); throttle(`search:${session.user.id}`, 20);
    const query = (request.nextUrl.searchParams.get("q") || "").trim().replace(/^@/, "");
    if (!validDiscoveryQuery(query)) throw new HttpError(400, "Search with 2–64 letters, numbers, spaces or hyphens.");
    const [users, channels] = await Promise.all([
      /^[a-zA-Z0-9-]{2,39}$/.test(query) ? github(session, `/search/users?${new URLSearchParams({ q: `${query} in:login type:user`, per_page: "12" })}`, { signal: request.signal }).then(response => response.json()) : Promise.resolve({ items: [] }),
      github(session, `/search/repositories?${new URLSearchParams({ q: `gitmsg-channel- ${query} in:name,description is:public`, per_page: "12" })}`, { signal: request.signal }).then(response => response.json()),
    ]);
    return json({ users: users.items.map((user: { id: number; login: string; avatar_url: string }) => ({ id: user.id, login: user.login, avatar: user.avatar_url })), channels: channels.items.filter((repo: { description?: string }) => repo.description?.includes(CHANNEL_MARKER)).map(repositoryRoom) });
  } catch (error) { return failure(error); }
}
