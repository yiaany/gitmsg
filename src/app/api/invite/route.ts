import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { validRepo } from "@/lib/protocol";

export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const session = await getSession();
    throttle(`invite:${session.user.id}`, 5, 3600000);
    const { repo, login } = await body<{ repo: string; login: string }>(request);
    if (!validRepo(repo) || typeof login !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(login)) throw new HttpError(400, "Enter a valid GitHub username, without the @.");
    if (login.toLowerCase() === session.user.login.toLowerCase()) throw new HttpError(400, "You are already here. Self-love does not require a repository invitation.");
    const repository = await (await github(session, `/repos/${repo}`)).json();
    if (!repository.permissions?.admin) throw new HttpError(403, "Only a repository administrator can invite collaborators.");
    const response = await github(session, `/repos/${repo}/collaborators/${encodeURIComponent(login)}`, { method: "PUT", body: JSON.stringify({ permission: "push" }) });
    return json({ alreadyMember: response.status === 204, invitationSent: response.status === 201, acceptanceUrl: `https://github.com/${repo}/invitations` });
  } catch (error) { return failure(error); }
}
