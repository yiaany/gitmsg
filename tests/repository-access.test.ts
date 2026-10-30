import test from "node:test";
import assert from "node:assert/strict";
import { acceptRepositoryInvitation, inspectRepositoryAccess, RepositoryAccessError } from "../src/lib/repository-access";

const repo = "owner/gitmsg-friends";
const repository = { full_name: repo, name: "gitmsg-friends", private: true, default_branch: "chat", permissions: { push: true } };
const invitation = { id: 42, repository: { full_name: repo } };
const ok = (data: unknown) => new Response(JSON.stringify(data));
const missing = () => { throw Object.assign(new Error("Not found"), { status: 404 }); };

test("a collaborator opens the shared room without an invitation lookup", async () => {
  const calls: string[] = [];
  const result = await inspectRepositoryAccess(async path => { calls.push(path); return ok(repository); }, repo);
  assert.deepEqual(result, { status: "ready", room: { id: repo, name: "friends", description: "A conversation with version control.", branch: "chat", private: true } });
  assert.deepEqual(calls, [`/repos/${repo}`]);
});
test("private repository 404 resolves to the signed-in user's pending invitation, without accepting it", async () => {
  const result = await inspectRepositoryAccess(async (path, init) => {
    assert.equal(init?.method, undefined);
    return path.startsWith("/repos/") ? missing() : ok([invitation]);
  }, repo.toUpperCase());
  assert.equal(result.status, "invited");
});
test("a shared link with no invitation does not grant access or hide the reason", async () => {
  const result = await inspectRepositoryAccess(async path => path.startsWith("/repos/") ? missing() : ok([]), repo);
  assert.deepEqual(result, { status: "unavailable", repo });
});
test("read-only repository access still requires a collaborator invitation", async () => {
  const result = await inspectRepositoryAccess(async path => ok(path.startsWith("/repos/") ? { ...repository, permissions: { push: false } } : []), repo);
  assert.equal(result.status, "unavailable");
});
test("only the matching invitation from the authenticated account is accepted", async () => {
  let accepted = false;
  const calls: string[] = [];
  const result = await acceptRepositoryInvitation(async (path, init) => {
    calls.push(`${init?.method || "GET"} ${path}`);
    if (path.startsWith("/repos/")) return accepted ? ok(repository) : missing();
    if (init?.method === "PATCH") { assert.equal(path, "/user/repository_invitations/42"); accepted = true; return new Response(null, { status: 204 }); }
    return ok([{ id: 99, repository: { full_name: "other/private" } }, invitation]);
  }, repo);
  assert.equal(result.status, "ready");
  assert.equal(calls.filter(c => c.startsWith("PATCH")).length, 1);
});
test("an unrelated invitation cannot be accepted via a chat link", async () => {
  await assert.rejects(acceptRepositoryInvitation(async (path, init) => {
    assert.notEqual(init?.method, "PATCH");
    return path.startsWith("/repos/") ? missing() : ok([{ id: 99, repository: { full_name: "other/private" } }]);
  }, repo), (error: unknown) => error instanceof RepositoryAccessError && error.status === 409);
});
test("pending invitations are paginated", async () => {
  const result = await inspectRepositoryAccess(async path => {
    if (path.startsWith("/repos/")) return missing();
    return ok(path.endsWith("page=1") ? Array.from({ length: 100 }, () => ({ id: 99, repository: { full_name: "other/private" } })) : [invitation]);
  }, repo);
  assert.equal(result.status, "invited");
});
test("invalid repository input never reaches GitHub", async () => {
  for (const invalid of ["", "../private", "owner/repo?admin=true", undefined]) {
    const request = async () => { assert.fail("GitHub must not be called"); };
    await assert.rejects(inspectRepositoryAccess(request, invalid as string), RepositoryAccessError);
    await assert.rejects(acceptRepositoryInvitation(request, invalid as string), RepositoryAccessError);
  }
});
test("expired sessions, rate limits and upstream failures are not treated as missing invitations", async () => {
  for (const status of [401, 429, 502]) {
    const error = Object.assign(new Error("upstream"), { status });
    await assert.rejects(inspectRepositoryAccess(async () => { throw error; }, repo), e => e === error);
  }
});
test("accepted invitations with delayed write permission produce a retryable error", async () => {
  await assert.rejects(acceptRepositoryInvitation(async (path, init) => {
    if (path.startsWith("/repos/")) return missing();
    return init?.method === "PATCH" ? new Response(null, { status: 204 }) : ok([invitation]);
  }, repo), (error: unknown) => error instanceof RepositoryAccessError && /Invitation accepted/.test(error.message));
});
test("accept is idempotent when the user already has access", async () => {
  const result = await acceptRepositoryInvitation(async (path, init) => { assert.equal(path, `/repos/${repo}`); assert.equal(init, undefined); return ok(repository); }, repo);
  assert.equal(result.status, "ready");
});
