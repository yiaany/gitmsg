import "server-only";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { unseal, type Session } from "./session-codec";
export { seal, type Session } from "./session-codec";

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}
export const configured = () => Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && (process.env.SESSION_SECRET?.length ?? 0) >= 32 && process.env.APP_URL);
const cookieName = "gitmsg_session";
export async function getSession(): Promise<Session> {
  const value = (await cookies()).get(cookieName)?.value;
  const session = value ? unseal(value) : null;
  if (!session) throw new HttpError(401, "Your session expired. Connect GitHub again.");
  return session;
}
export function sessionCookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set(cookieName, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge });
}
export function appUrl() {
  if (!process.env.APP_URL) throw new HttpError(503, "APP_URL is not configured.");
  return new URL(process.env.APP_URL).origin;
}
export function sameOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== appUrl()) throw new HttpError(403, "Cross-origin requests are not allowed.");
}
export async function body<T>(request: NextRequest): Promise<T> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "Send JSON, not vibes.");
  if (Number(request.headers.get("content-length") ?? 0) > 24000) throw new HttpError(413, "That payload needs its own repository.");
  // Bound actual bytes too; Content-Length can be missing or untrusted.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 24000) { await reader.cancel(); throw new HttpError(413, "That payload needs its own repository."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T; }
  catch { throw new HttpError(400, "Invalid JSON."); }
}
export async function github(session: Session, path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init, cache: "no-store", signal: init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal,
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${session.token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...init.headers },
    });
    if (response.status === 304) return response;
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const limited = response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit|abuse/i.test(error.message ?? "")));
      if (limited) {
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        const retry = Number(response.headers.get("retry-after")) || (reset ? Math.ceil(reset - Date.now() / 1000) : 60);
        throw new HttpError(429, "GitHub needs a coffee break. Your message is safe in the composer. Try again after the cooldown.", Math.max(60, retry));
      }
      if (response.status === 401) throw new HttpError(401, "GitHub authorization expired. Please reconnect.");
      if (response.status === 404) throw new HttpError(404, "Repository not found, or GitHub access is missing. Check the name, invitation, and app installation.");
      throw new HttpError(response.status, typeof error.message === "string" ? error.message : "GitHub could not complete that request.");
    }
    return response;
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "GitHub is taking too long. Please retry; the event ID prevents duplicate messages.");
  } finally { clearTimeout(timeout); }
}
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message, retryAfter: error.retryAfter }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
  console.error("gitmsg request failed", error instanceof Error ? error.message : "Unknown error");
  return json({ error: "Something went sideways. No force-pushes were performed." }, 500);
}

// Best-effort per-instance abuse protection, NOT a distributed quota.
const buckets = new Map<string, { remaining: number; reset: number }>();
export function throttle(id: string, limit = 20, window = 60000) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [key, value] of buckets) if (value.reset < now) buckets.delete(key);
  if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value!);
  const bucket = buckets.get(id);
  if (!bucket || bucket.reset < now) { buckets.set(id, { remaining: limit - 1, reset: now + window }); return; }
  if (bucket.remaining-- <= 0) throw new HttpError(429, "Easy, Linus. Give the commits a moment to breathe.", Math.ceil((bucket.reset - now) / 1000));
}
