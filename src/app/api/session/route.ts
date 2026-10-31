import { configured, getSession, json } from "@/lib/server";
export async function GET() {
  let user = null;
  try { user = (await getSession()).user; } catch { /* The public sign-in screen needs configuration, not credentials. */ }
  return json({ user, configured: configured(), mode: process.env.GITHUB_AUTH_MODE === "app" ? "app" : "oauth", installUrl: process.env.GITHUB_APP_INSTALL_URL || null });
}
