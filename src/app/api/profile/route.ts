import { NextRequest } from "next/server";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";
import { parseGitHubProfile, validLogin, validProfileAvatar } from "@/lib/github-models";
import { readAccountDocument, writeAccountDocument } from "@/lib/account-store";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(); throttle(`profile-read:${session.user.id}`, 40);
    const login = request.nextUrl.searchParams.get("login") || session.user.login;
    if (!validLogin(login)) throw new HttpError(400, "Invalid GitHub username.");
    const user = login.toLowerCase() === session.user.login.toLowerCase() ? session.user : await (await github(session, `/users/${login}`)).json().then(user => ({ id: user.id, login: user.login, avatar: user.avatar_url }));
    const document = await readAccountDocument(session, "profile", user.login);
    return json({ user, profile: parseGitHubProfile((document.value as { profile?: unknown } | null)?.profile), published: !!document.value });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request); const session = await getSession(); throttle(`profile-save:${session.user.id}`, 10, 3600000);
    const input = await body<{ profile: { name?: unknown; bio?: unknown; color?: unknown; avatar?: unknown }; publish: boolean }>(request, 400000);
    if (input.publish !== true) throw new HttpError(400, "Confirm publishing your profile to a public GitHub repository.");
    if (!input.profile || typeof input.profile !== "object" || (input.profile.avatar !== undefined && !validProfileAvatar(input.profile.avatar))) throw new HttpError(400, "Choose a PNG, JPEG or WebP avatar under 256 KiB.");
    const profile = parseGitHubProfile(input.profile);
    await writeAccountDocument(session, "profile", () => ({ profile }));
    return json({ user: session.user, profile, published: true });
  } catch (error) { return failure(error); }
}
