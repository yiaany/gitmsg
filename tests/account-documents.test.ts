import test from "node:test";
import assert from "node:assert/strict";
import { AccountDocumentError, readAccountDocument, writeAccountDocument } from "../src/lib/account-documents";
import { LIBRARY_MARKER, PROFILE_MARKER } from "../src/lib/github-models";

const ok = (value: unknown) => Response.json(value);
const missing = () => { throw new AccountDocumentError(404, "Missing"); };
const repository = (kind = "settings", privacy = kind === "settings") => ({ description: kind === "settings" ? LIBRARY_MARKER : PROFILE_MARKER, private: privacy, default_branch: "trunk" });
const file = (value: unknown, sha = "old-sha") => ({ size: 100, sha, content: Buffer.from(JSON.stringify(value)).toString("base64") });
test("reading missing account data never creates anything", async () => {
  const calls: string[] = [];
  const result = await readAccountDocument({ owner: "alice", request: async (path, init) => { calls.push(path); assert.equal(init?.method, undefined); return missing(); } }, "settings");
  assert.deepEqual(result, { value: null }); assert.equal(calls.length, 1);
});
test("explicit profile save creates public marked repo; settings save creates private marked repo", async () => {
  for (const kind of ["profile", "settings"] as const) {
    let created = false; let writes = 0;
    await writeAccountDocument({ owner: "alice", request: async (path, init) => {
      if (path === "/user/repos") { const body = JSON.parse(init!.body as string); assert.equal(body.private, kind === "settings"); assert.match(body.description, /\[gitmsg:/); created = true; return ok(repository(kind)); }
      if (init?.method === "PUT") { writes++; assert.ok(created); const body = JSON.parse(init.body as string); assert.equal(body.branch, "trunk"); assert.equal(body.sha, undefined); const content = JSON.parse(Buffer.from(body.content, "base64").toString()); assert.equal(content.app, "gitmsg"); assert.equal(content.version, 1); return ok({}); }
      return missing();
    } }, kind, () => kind === "settings" ? { rooms: [] } : { profile: { name: "Alice" } });
    assert.equal(writes, 1);
  }
});
test("existing unmarked or wrongly public settings repos are never written", async () => {
  for (const repo of [{ ...repository(), description: "My files" }, repository("settings", false), repository("profile", true)]) {
    let writes = 0;
    const account = { owner: "alice", request: async (_path: string, init?: RequestInit) => { if (init?.method) writes++; return ok(repo); } };
    await assert.rejects(writeAccountDocument(account, "settings", () => ({ rooms: [] })), { status: 409 });
    assert.equal(writes, 0);
  }
});
test("malformed or unknown documents cannot be overwritten", async () => {
  for (const document of [{ content: "e2JhZA==", size: 10 }, file({ app: "other", version: 1 }), file({ app: "gitmsg", version: 2 }), file({ app: "gitmsg", version: 1, rooms: {} })]) {
    let writes = 0;
    const account = { owner: "alice", request: async (path: string, init?: RequestInit) => { if (init?.method) writes++; return ok(path.includes("/contents/") ? document : repository()); } };
    await assert.rejects(writeAccountDocument(account, "settings", () => ({ rooms: [] })), { status: 409 });
    assert.equal(writes, 0);
  }
});
test("conflict retry re-reads latest SHA and merges concurrent subscriptions", async () => {
  let writes = 0; let reads = 0;
  const account = { owner: "alice", request: async (path: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(init.body as string); writes++;
      if (writes === 1) throw new AccountDocumentError(409, "Conflict");
      assert.equal(body.sha, "new-sha"); assert.equal(body.branch, "trunk");
      const value = JSON.parse(Buffer.from(body.content, "base64").toString());
      assert.deepEqual(value.rooms, ["other-device", "new-channel"]); return ok({});
    }
    if (path.includes("/contents/")) { reads++; return ok(file({ app: "gitmsg", version: 1, rooms: reads === 1 ? [] : ["other-device"] }, reads === 1 ? "old-sha" : "new-sha")); }
    return ok(repository());
  } };
  await writeAccountDocument(account, "settings", previous => ({ rooms: [...(previous as { rooms: string[] }).rooms, "new-channel"] }));
  assert.equal(reads, 2); assert.equal(writes, 2);
});
test("authorization failures are not treated as missing account data", async () => {
  const account = { owner: "alice", request: async () => { throw new AccountDocumentError(403, "Denied"); } };
  await assert.rejects(readAccountDocument(account, "settings"), { status: 403 });
});
