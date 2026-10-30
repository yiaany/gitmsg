import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { roomPolicy } from "@/lib/room-policy";
import { validRepo } from "@/lib/protocol";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(); const repo = request.nextUrl.searchParams.get("repo") || "", branch = request.nextUrl.searchParams.get("branch") || "main";
    if (!validRepo(repo) || branch.length > 200) throw new HttpError(400, "Invalid room.");
    return json(await roomPolicy(session, repo, branch));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request); const session = await getSession(); throttle(`secure:${session.user.id}`, 5, 3600000);
    const { repo, branch, keyId } = await body<{ repo: string; branch: string; keyId: string }>(request);
    if (!validRepo(repo) || typeof branch !== "string" || !branch || branch.length > 200 || !/^[a-f0-9]{64}$/.test(keyId)) throw new HttpError(400, "Invalid security policy.");
    const repository = await (await github(session, `/repos/${repo}`)).json();
    if (!repository.private || !repository.permissions?.admin) throw new HttpError(403, "Only an administrator of a private repository can enable secure mode.");
    const existing = await roomPolicy(session, repo, branch);
    if (existing.enabled) { if (existing.keyId !== keyId) throw new HttpError(409, "This room already has a different key. Import its existing key instead."); return json(existing); }
    await github(session, `/repos/${repo}/contents/gitmsg/security.json`, { method: "PUT", body: JSON.stringify({ branch, message: "feat(security): require encrypted events", content: Buffer.from(JSON.stringify({ version: 1, enabled: true, algorithm: "AES-256-GCM", keyId }, null, 2)).toString("base64") }) });
    return json({ enabled: true, keyId });
  } catch (error) { return failure(error); }
}
