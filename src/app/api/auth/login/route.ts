import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appUrl, configured } from "@/lib/server";

export async function GET() {
  if (!configured()) {
    const response = new NextResponse(null, { status: 307, headers: { Location: "/?auth_error=not-configured" } });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${appUrl()}/api/auth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  if (process.env.GITHUB_AUTH_MODE !== "app") url.searchParams.set("scope", "repo read:user");
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("gitmsg_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  response.cookies.set("gitmsg_oauth_verifier", verifier, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return response;
}
