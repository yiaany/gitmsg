import { NextRequest } from "next/server";
import { acceptRepositoryInvitation, inspectRepositoryAccess, RepositoryAccessError } from "@/lib/repository-access";
import { body, failure, getSession, github, HttpError, json, sameOrigin, throttle } from "@/lib/server";

export const maxDuration = 60;
function failed(error: unknown) {
  return failure(error instanceof RepositoryAccessError ? new HttpError(error.status, error.message) : error);
}
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    return json(await inspectRepositoryAccess((path, init) => github(session, path, init), request.nextUrl.searchParams.get("repo") || ""));
  } catch (error) { return failed(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const session = await getSession();
    throttle(`join:${session.user.id}`, 10, 60000);
    const { repo } = await body<{ repo: string }>(request);
    return json(await acceptRepositoryInvitation((path, init) => github(session, path, init), repo));
  } catch (error) { return failed(error); }
}
