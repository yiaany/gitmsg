import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { validEvent, validRepo, type ChatEvent } from "@/lib/protocol";
import { roomPolicy } from "@/lib/room-policy";
import { storeEvent } from "@/lib/event-store";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(); const repo = request.nextUrl.searchParams.get("repo") || "", branch = request.nextUrl.searchParams.get("branch") || "main";
    if (!validRepo(repo) || branch.length > 200) throw new HttpError(400, "Invalid room.");
    const pulls = await (await github(session, `/repos/${repo}/pulls?state=open&base=${encodeURIComponent(branch)}&per_page=100`)).json();
    return json({ proposals: pulls.filter((p: { head: { ref: string; repo?: { full_name: string } } }) => p.head.ref.startsWith("gitmsg-proposals/") && p.head.repo?.full_name.toLowerCase() === repo.toLowerCase()).map((p: { number: number; title: string; html_url: string; user: { login: string } }) => ({ number: p.number, title: p.title, url: p.html_url, author: p.user.login })) });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request); const session = await getSession(); throttle(`proposal:${session.user.id}`, 8);
    const input = await body<{ repo: string; branch: string; event?: ChatEvent; number?: number }>(request, 48000);
    if (!validRepo(input.repo) || typeof input.branch !== "string" || !input.branch || input.branch.length > 200) throw new HttpError(400, "Invalid room.");
    if (input.number) {
      if (!Number.isSafeInteger(input.number) || input.number < 1) throw new HttpError(400, "Invalid pull request.");
      const pr = await (await github(session, `/repos/${input.repo}/pulls/${input.number}`)).json();
      if (!pr.head.ref.startsWith("gitmsg-proposals/") || pr.base.ref !== input.branch || pr.head.repo?.full_name.toLowerCase() !== input.repo.toLowerCase()) throw new HttpError(403, "Only this room's chat proposals can be merged here.");
      const result = await (await github(session, `/repos/${input.repo}/pulls/${input.number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: "merge", sha: pr.head.sha }) })).json();
      if (!result.merged) throw new HttpError(409, "GitHub could not merge this proposal. Review conflicts on GitHub.");
      return json({ merged: true });
    }
    const event = { ...input.event, actor: session.user } as ChatEvent;
    delete event.sha; delete event.url;
    if (!validEvent(event) || event.kind !== "message" || Math.abs(Date.now() - Date.parse(event.createdAt)) > 86400000) throw new HttpError(400, "Invalid proposal message.");
    const policy = await roomPolicy(session, input.repo, input.branch);
    if (policy.enabled && (!event.sealed || event.sealed.keyId !== policy.keyId)) throw new HttpError(409, "Encrypt the proposal with this room's key first.");
    const ref = await (await github(session, `/repos/${input.repo}/git/ref/heads/${encodeURIComponent(input.branch)}`)).json();
    const head = `gitmsg-proposals/${event.id}`;
    try { await github(session, `/repos/${input.repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${head}`, sha: ref.object.sha }) }); }
    catch (error) { if (!(error instanceof HttpError) || error.status !== 422) throw error; }
    await storeEvent(session, input.repo, head, event);
    const existing = await (await github(session, `/repos/${input.repo}/pulls?head=${encodeURIComponent(`${input.repo.split("/")[0]}:${head}`)}&state=open`)).json();
    const pr = existing[0] || await (await github(session, `/repos/${input.repo}/pulls`, { method: "POST", body: JSON.stringify({ head, base: input.branch, title: event.sealed ? "Encrypted chat proposal" : `Chat proposal: ${(event.text || "Attachment").slice(0, 70)}`, body: "A gitmsg message awaiting review. Merge using a merge commit (not squash/rebase) to preserve the protocol event. Encrypted content is decrypted only in clients with the room key." }) })).json();
    return json({ url: pr.html_url, number: pr.number }, 201);
  } catch (error) { return failure(error); }
}
