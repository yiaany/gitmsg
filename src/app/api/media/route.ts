import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { MAX_MEDIA, validRepo } from "@/lib/protocol";
import { roomPolicy } from "@/lib/room-policy";
import { MediaStorageError, readGitMedia } from "@/lib/git-media";

export const maxDuration = 60;
function validate(repo: string, id: string, branch: string) {
  if (!validRepo(repo) || !/^[a-zA-Z0-9_-]{8,80}$/.test(id) || !branch || branch.length > 200) throw new HttpError(400, "Invalid media location.");
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request); const session = await getSession(); throttle(`media:${session.user.id}`, 12);
    const { repo, branch, id, data, encrypted } = await body<{ repo: string; branch: string; id: string; data: string; encrypted?: boolean }>(request, 3 * 1024 * 1024);
    validate(repo, id, branch);
    if ((await roomPolicy(session, repo, branch)).enabled && encrypted !== true) throw new HttpError(409, "This room requires encrypted attachments.");
    if (typeof data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(400, "Invalid media payload.");
    const bytes = Buffer.from(data, "base64");
    if (!bytes.length || bytes.length > MAX_MEDIA + 16) throw new HttpError(413, "Attachments must be at most 2 MiB. Try a shorter recording or smaller image.");
    const path = `/repos/${repo}/contents/media/${id}.bin`;
    try { await github(session, path, { method: "PUT", body: JSON.stringify({ branch, message: "feat(media): store attachment", content: data }) }); }
    catch (error) {
      if (!(error instanceof HttpError) || ![409, 422].includes(error.status)) throw error;
      const existing = await readGitMedia(async path => (await github(session, path)).json(), repo, branch, id);
      if (!Buffer.from(existing).equals(bytes)) throw new HttpError(409, "Attachment ID already exists. Retry with a new file.");
    }
    return json({ id, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }, 201);
  } catch (error) { return failure(error instanceof MediaStorageError ? new HttpError(error.status, error.message) : error); }
}
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(); throttle(`media-read:${session.user.id}`, 120);
    const repo = request.nextUrl.searchParams.get("repo") || "", id = request.nextUrl.searchParams.get("id") || "", branch = request.nextUrl.searchParams.get("branch") || "main";
    validate(repo, id, branch);
    const bytes = await readGitMedia(async path => (await github(session, path, { signal: request.signal })).json(), repo, branch, id);
    return new NextResponse(bytes, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error instanceof MediaStorageError ? new HttpError(error.status, error.message) : error); }
}
