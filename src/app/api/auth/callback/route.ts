import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appUrl, configured, github, seal, sessionCookie, type Session } from "@/lib/server";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const ready = configured();
  const state = request.nextUrl.searchParams.get("state");
  const saved = request.cookies.get("gitmsg_oauth_state")?.value;
  const code = request.nextUrl.searchParams.get("code");
  const verifier = request.cookies.get("gitmsg_oauth_verifier")?.value;
  const response = ready ? NextResponse.redirect(`${appUrl()}/?auth_error=authorization-failed`) : new NextResponse(null, { status: 307, headers: { Location: "/?auth_error=not-configured" } });
  response.cookies.delete("gitmsg_oauth_state");
  response.cookies.delete("gitmsg_oauth_verifier");
  response.headers.set("Cache-Control", "no-store");
  if (!ready) return response;
  const origin = appUrl();
  if (!state || !saved || !code || !verifier || !/^[A-Za-z0-9_-]{43}$/.test(verifier) || !/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(saved) || !timingSafeEqual(Buffer.from(state), Buffer.from(saved))) return response;
  try {
    const result = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, code_verifier: verifier, redirect_uri: `${origin}/api/auth/callback` }),
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    const data = await result.json();
    if (!result.ok || !data.access_token) return response;
    const lifetime = Math.min(Number(data.expires_in) || 604800, 604800);
    const session: Session = { token: data.access_token, user: { id: 1, login: "pending" }, exp: Date.now() + lifetime * 1000 };
    const user = await (await github(session, "/user")).json();
    session.user = { id: user.id, login: user.login, avatar: user.avatar_url };
    const success = NextResponse.redirect(`${origin}/?connected=1`);
    success.cookies.delete("gitmsg_oauth_state");
    success.cookies.delete("gitmsg_oauth_verifier");
    success.headers.set("Cache-Control", "no-store");
    sessionCookie(success, seal(session), lifetime);
    return success;
  } catch { return response; }
}
