import { validRepo, type Room } from "./protocol";

type Repository = { full_name: string; name: string; description?: string; default_branch?: string; private: boolean; permissions?: { push?: boolean } };
type Invitation = { id: number; repository: { full_name: string } };
type Request = (path: string, init?: RequestInit) => Promise<Response>;
export type JoinStatus = { status: "ready"; room: Room } | { status: "invited" | "unavailable"; repo: string };
export class RepositoryAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function repositoryRoom(repo: Repository): Room {
  return { id: repo.full_name, name: repo.name.replace(/^gitmsg-/, ""), description: repo.description || "A conversation with version control.", branch: repo.default_branch || "main", private: repo.private };
}
function validate(repo: string) {
  if (typeof repo !== "string" || !validRepo(repo)) throw new RepositoryAccessError(400, "Use owner/repository, for example octocat/gitmsg-friends.");
}
async function writableRoom(request: Request, repo: string): Promise<Room | null> {
  try {
    const repository: Repository = await (await request(`/repos/${repo}`)).json();
    return repository.permissions?.push ? repositoryRoom(repository) : null;
  } catch (error) {
    // GitHub deliberately returns 404 for private repositories without access.
    if (![403, 404].includes((error as { status: number }).status)) throw error;
    return null;
  }
}
async function pendingInvitation(request: Request, repo: string): Promise<Invitation | undefined> {
  for (let page = 1; page <= 10; page++) {
    const invitations: Invitation[] = await (await request(`/user/repository_invitations?per_page=100&page=${page}`)).json();
    const invitation = invitations.find(i => i.repository.full_name.toLowerCase() === repo.toLowerCase());
    if (invitation) return invitation;
    if (invitations.length < 100) return;
  }
}
export async function inspectRepositoryAccess(request: Request, repo: string): Promise<JoinStatus> {
  validate(repo);
  const room = await writableRoom(request, repo);
  if (room) return { status: "ready", room };
  return { status: await pendingInvitation(request, repo) ? "invited" : "unavailable", repo };
}
export async function acceptRepositoryInvitation(request: Request, repo: string): Promise<JoinStatus> {
  validate(repo);
  const room = await writableRoom(request, repo);
  if (room) return { status: "ready", room };
  // Resolve the invitation through the signed-in user's token, never a client-supplied ID.
  const invitation = await pendingInvitation(request, repo);
  if (!invitation) throw new RepositoryAccessError(409, "No pending invitation for this account. Ask the chat owner to invite your GitHub username, then check again.");
  await request(`/user/repository_invitations/${invitation.id}`, { method: "PATCH" });
  const joined = await writableRoom(request, repo);
  if (!joined) throw new RepositoryAccessError(409, "Invitation accepted. GitHub has not enabled write access yet. Check access again in a moment.");
  return { status: "ready", room: joined };
}
