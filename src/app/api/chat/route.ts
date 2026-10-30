import { NextRequest, NextResponse } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { parseCommit, validEvent, validRepo, type ChatEvent } from "@/lib/protocol";
import { roomPolicy } from "@/lib/room-policy";
import { storeEvent } from "@/lib/event-store";

type Commit = { sha: string; html_url: string; commit: { message: string }; parents: { sha: string }[] };
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const repo = request.nextUrl.searchParams.get("repo") || "";
    const branch = request.nextUrl.searchParams.get("branch") || "main";
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (!validRepo(repo) || branch.length > 200 || (cursor && !/^[a-f0-9]{40}$/.test(cursor))) throw new HttpError(400, "Invalid repository or history cursor.");
    throttle(`read:${session.user.id}`, 90);
    const query = new URLSearchParams({ sha: cursor || branch, path: "events", per_page: "100" });
    const etag = request.headers.get("if-none-match");
    let response: Response;
    try { response = await github(session, `/repos/${repo}/commits?${query}`, { signal: request.signal, headers: etag && !cursor ? { "If-None-Match": etag } : {} }); }
    catch (error) { if (error instanceof HttpError && error.status === 409) return json({ events: [], head: null, older: null }); throw error; }
    if (response.status === 304) return new NextResponse(null, { status: 304, headers: { "Cache-Control": "private, no-store", ETag: etag! } });
    const commits: Commit[] = await response.json();
    const events = commits.map(c => parseCommit(c.commit.message, c.sha, c.html_url)).filter((e): e is ChatEvent => e !== null).reverse();
    const oldest = commits.at(-1);
    return json({ events, head: commits[0]?.sha || null, older: commits.length === 100 ? oldest?.parents[0]?.sha || null : null }, 200, response.headers.get("etag") ? { ETag: response.headers.get("etag")! } : {});
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const session = await getSession();
    throttle(`write:${session.user.id}`, 18);
    const input = await body<{ repo: string; branch: string; event: ChatEvent }>(request, 48000);
    if (!validRepo(input.repo) || typeof input.branch !== "string" || !input.branch || input.branch.length > 200) throw new HttpError(400, "Invalid repository.");
    const event = { ...input.event, actor: session.user };
    if (!validEvent(event) || Math.abs(Date.now() - Date.parse(event.createdAt)) > 86400000) throw new HttpError(400, "Invalid event. Messages can contain up to 4,000 characters.");
    const policy = await roomPolicy(session, input.repo, input.branch);
    if (policy.enabled && (!event.sealed || event.sealed.keyId !== policy.keyId)) throw new HttpError(409, "Secure mode is enabled. Import the correct room key and retry; plaintext is not accepted.");
    // Do not allow client-provided URLs / SHAs to become protocol data.
    delete event.sha; delete event.url;
    return json({ event: await storeEvent(session, input.repo, input.branch, event) }, 201);
  } catch (error) { return failure(error); }
}
