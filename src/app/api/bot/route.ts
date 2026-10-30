import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { validRepo } from "@/lib/protocol";
import { roomPolicy } from "@/lib/room-policy";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(); const repo = request.nextUrl.searchParams.get("repo") || "";
    if (!validRepo(repo)) throw new HttpError(400, "Invalid repository.");
    try { const workflow = await (await github(session, `/repos/${repo}/actions/workflows/gitmsg-bot.yml`)).json(); return json({ installed: workflow.state === "active", url: workflow.html_url }); }
    catch (error) { if (error instanceof HttpError && error.status === 404) return json({ installed: false }); throw error; }
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request); const session = await getSession(); throttle(`bot:${session.user.id}`, 5);
    const { repo, branch, command } = await body<{ repo: string; branch: string; command: string }>(request);
    if (!validRepo(repo) || typeof branch !== "string" || !branch || branch.length > 200 || !["roll", "standup", "deploy"].includes(command)) throw new HttpError(400, "Choose a supported bot command.");
    if ((await roomPolicy(session, repo, branch)).enabled) throw new HttpError(409, "Actions bots intentionally have no key for secure rooms.");
    const repository = await (await github(session, `/repos/${repo}`)).json();
    if (!repository.permissions?.push || (command === "deploy" && !repository.permissions.admin)) throw new HttpError(403, "Write access is required. Only repository administrators may request a deployment.");
    await github(session, `/repos/${repo}/actions/workflows/gitmsg-bot.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: repository.default_branch, inputs: { command, branch } }) });
    return json({ queued: true, url: `https://github.com/${repo}/actions/workflows/gitmsg-bot.yml` }, 202);
  } catch (error) { return failure(error); }
}
