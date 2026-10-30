import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Actor } from "./protocol";

export type Session = { token: string; user: Actor; exp: number };
function key(secret: string | undefined) {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}
export function seal(session: Session, secret = process.env.SESSION_SECRET): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function unseal(value: string, secret = process.env.SESSION_SECRET): Session | null {
  try {
    const data = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(secret), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const session = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString()) as Session;
    return typeof session.exp === "number" && session.exp > Date.now() && Number.isSafeInteger(session.user?.id) && session.user.id > 0 && typeof session.token === "string" && session.token.length > 0 ? session : null;
  } catch { return null; }
}
