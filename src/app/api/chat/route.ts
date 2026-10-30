import { NextRequest, NextResponse } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { commitSubject, EVENT_PREFIX, eventPath, parseCommit, validEvent, validRepo, type ChatEvent } from "@/lib/protocol";

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
    try { response = await github(session, `/repos/${repo}/commits?${query}`, { headers: etag && !cursor ? { "If-None-Match": etag } : {} }); }
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
    const input = await body<{ repo: string; branch: string; event: ChatEvent }>(request);
    if (!validRepo(input.repo) || typeof input.branch !== "string" || !input.branch || input.branch.length > 200) throw new HttpError(400, "Invalid repository.");
    const event = { ...input.event, actor: session.user };
    if (!validEvent(event) || Math.abs(Date.now() - Date.parse(event.createdAt)) > 86400000) throw new HttpError(400, "Invalid event. Messages can contain up to 4,000 characters.");
    // Do not allow client-provided URLs / SHAs to become protocol data.
    delete event.sha; delete event.url;
    const path = eventPath(event);
    const payload = JSON.stringify({ branch: input.branch, message: `${commitSubject(event)}\n\n${EVENT_PREFIX}${JSON.stringify(event)}`, content: Buffer.from(JSON.stringify(event, null, 2)).toString("base64") });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await (await github(session, `/repos/${input.repo}/contents/${path}`, { method: "PUT", body: payload })).json();
        return json({ event: { ...event, sha: result.commit.sha, url: `https://github.com/${input.repo}/commit/${result.commit.sha}` } }, 201);
      } catch (error) {
        if (!(error instanceof HttpError) || ![409, 422].includes(error.status)) throw error;
        // A lost successful response must not create a duplicate event on retry.
        try {
          const existing = await (await github(session, `/repos/${input.repo}/contents/${path}?ref=${encodeURIComponent(input.branch)}`)).json();
          const stored = JSON.parse(Buffer.from(existing.content, "base64").toString());
          if (JSON.stringify(stored) === JSON.stringify(event)) return json({ event }, 200);
          throw new HttpError(409, "This event ID already exists. Refresh before sending again.");
        } catch (lookup) { if (!(lookup instanceof HttpError) || lookup.status !== 404) throw lookup; }
        if (attempt === 2 || error.status === 422) throw error;
        await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt + Math.random() * 200));
      }
    }
    throw new HttpError(409, "The branch moved too quickly. Please retry.");
  } catch (error) { return failure(error); }
}
