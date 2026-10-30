import { github, HttpError, type Session } from "./server";
export type RoomPolicy = { enabled: boolean; keyId?: string };
export async function roomPolicy(session: Session, repo: string, branch: string): Promise<RoomPolicy> {
  try {
    const response = await github(session, `/repos/${repo}/contents/gitmsg/security.json?ref=${encodeURIComponent(branch)}`);
    const file = await response.json(); const value = JSON.parse(Buffer.from(file.content, "base64").toString());
    if (value.enabled !== true || !/^[a-f0-9]{64}$/.test(value.keyId)) throw new HttpError(409, "Invalid room security policy. Ask the owner to repair gitmsg/security.json.");
    return { enabled: true, keyId: value.keyId };
  } catch (error) { if (error instanceof HttpError && error.status === 404) return { enabled: false }; throw error; }
}
