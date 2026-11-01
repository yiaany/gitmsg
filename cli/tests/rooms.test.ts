import test from "node:test";
import assert from "node:assert/strict";
import { GitHub, type Fetch } from "../src/github";
import { Rooms, loadRoomKey, type TerminalRoom } from "../src/rooms";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EVENT_PREFIX, parseCommit, type ChatEvent } from "../../src/lib/protocol";
import { decryptEvent, encryptEvent, exportKey, generateKey, keyFingerprint } from "../../src/lib/room-crypto";

const actor = { id: 1, login: "alice" };
const room: TerminalRoom = { id: "alice/gitmsg-test", title: "test", branch: "main", private: true, canWrite: true };
const event: ChatEvent = { v: 1, id: "event-fixture-01", kind: "message", actor, text: "hello", createdAt: "2026-11-01T12:00:00.000Z" };
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers });
const content = (value: unknown) => ({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify(value)).toString("base64"), size: 100 });
function fixture(options: { private?: boolean; marked?: boolean; policy?: unknown; commits?: unknown[]; loseResponse?: boolean } = {}) {
  const writes: { path: string; data: any }[] = [];
  const stored = new Map<string, unknown>();
  let lose = options.loseResponse ?? false;
  const transport = (async (url, init) => {
    const u = new URL(String(url)), path = u.pathname, method = init?.method ?? "GET";
    if (method !== "GET") {
      const data = JSON.parse(String(init?.body)); writes.push({ path, data });
      if (path === "/user/repos") return json({ full_name: room.id, private: true, default_branch: "main" });
      stored.set(path, JSON.parse(Buffer.from(data.content, "base64").toString("utf8")));
      if (lose && path.includes("/events/")) { lose = false; throw new Error("response lost after Git accepted the write"); }
      return json({ commit: { sha: "a".repeat(40) } });
    }
    if (path === "/user") return json(actor);
    if (path === `/repos/${room.id}`) return json({ full_name: room.id, private: options.private ?? true, default_branch: "main", permissions: { push: true } });
    if (path.endsWith("/.gitmsg/room.json")) return options.marked === false ? json({}, 404) : json(content({ schema: "gitmsg-room-v1", title: "test" }));
    if (path.endsWith("/gitmsg/security.json")) return options.policy === undefined ? json({}, 404) : json(content(options.policy));
    if (path.endsWith("/commits")) return json(options.commits ?? [], 200, { etag: '"fixture-history"' });
    if (stored.has(path)) return json(content(stored.get(path)));
    return json({}, 404);
  }) as typeof fetch;
  return { rooms: new Rooms(new GitHub("fixture-token", transport)), transport, writes, stored };
}

test("opening a chat is read-only and refuses public/source or unmarked repositories", async () => {
  const good = fixture(); assert.equal((await good.rooms.open(room.id)).title, "test"); assert.equal(good.writes.length, 0);
  for (const options of [{ private: false }, { marked: false }]) {
    const bad = fixture(options); await assert.rejects(bad.rooms.open(room.id)); assert.equal(bad.writes.length, 0);
  }
});

test("creation requires confirmation, always private, and uploads only fixed room metadata", async () => {
  const f = fixture();
  await assert.rejects(f.rooms.create("test", false), /confirmation/); assert.equal(f.writes.length, 0);
  await assert.rejects(f.rooms.create("settings", true), /reserved/); assert.equal(f.writes.length, 0);
  const created = await f.rooms.create("test", true); assert.equal(created.room.id, room.id);
  assert.equal(f.writes.length, 2); assert.equal(f.writes[0].path, "/user/repos");
  assert.deepEqual(f.writes[0].data, { name: "gitmsg-test", private: true, auto_init: true, description: "Messages are commits. Made with gitmsg." });
  assert.deepEqual(JSON.parse(Buffer.from(f.writes[1].data.content, "base64").toString()), { schema: "gitmsg-room-v1", title: "test" });
  assert.equal(JSON.stringify(f.writes).includes("fixture-token"), false);
});

test("partial creation is reported as created, not retried or deleted", async () => {
  let calls = 0;
  const f = new Rooms(new GitHub("fixture-token", (async (_url, init) => { calls++; return init?.method === "POST" ? json({ full_name: room.id, private: true, default_branch: "main" }) : json({}, 403); }) as typeof fetch));
  const result = await f.create("test", true); assert.match(result.warning!, /Do not create it again/); assert.equal(calls, 2);
});

test("one terminal message creates one web-compatible event commit, no local project upload", async () => {
  const f = fixture(); const result = await f.rooms.send(room, actor, "hello from terminal");
  assert.equal(result.sha, "a".repeat(40)); assert.equal(f.writes.length, 1);
  const write = f.writes[0]; assert.match(write.path, /\/contents\/events\/\d{4}\/\d{2}\/\d{2}\//);
  const parsed = parseCommit(write.data.message, result.sha, "https://github.com/fixture");
  assert.equal(parsed?.text, "hello from terminal"); assert.equal(parsed?.actor.login, "alice");
  assert.equal(write.data.branch, "main"); assert.equal("sha" in write.data, false);
  assert.equal(JSON.stringify(f.writes).includes("fixture-token"), false);
});

test("credential-like messages are rejected before any network operation", async () => {
  const f = fixture(); await assert.rejects(f.rooms.send(room, actor, "oops " + "ghp_" + "Z".repeat(36)), /credential/); assert.equal(f.writes.length, 0);
  await assert.rejects(f.rooms.send(room, actor, "oops fixture-token"), /credential/);
  const key = await generateKey();
  const secure = new Rooms(new GitHub("fixture-token", f.transport), key);
  await assert.rejects(secure.send(room, actor, "oops " + await exportKey(key)), /credential/);
  assert.equal(f.writes.length, 0);
});

test("secure or malformed room policy never silently falls back to plaintext", async () => {
  for (const policy of [{ enabled: true, keyId: "b".repeat(64) }, { enabled: false }]) {
    const f = fixture({ policy }); await assert.rejects(f.rooms.send(room, actor, "must not leak")); assert.equal(f.writes.length, 0);
  }
});

test("secure rooms use the website's exact AES-GCM protocol and do not commit plaintext or key", async () => {
  const key = await generateKey(); const policy = { enabled: true, keyId: await keyFingerprint(key) };
  const f = fixture({ policy }); const service = new Rooms(new GitHub("fixture-token", f.transport), key);
  const result = await service.send(room, actor, "protected terminal message");
  assert.ok(result.event.sealed); assert.equal(result.event.text, undefined);
  assert.equal(JSON.stringify(f.writes).includes("protected terminal message"), false);
  assert.ok(parseCommit(f.writes[0].data.message, "a".repeat(40), "")?.sealed);
});

test("an ambiguous successful write is confirmed on explicit retry without a duplicate commit", async () => {
  const f = fixture({ loseResponse: true });
  await assert.rejects(f.rooms.send(room, actor, "send once"), /no automatic write retry/);
  assert.equal(f.writes.length, 1);
  const result = await f.rooms.send(room, actor, "send once");
  assert.equal(result.sha, "already-confirmed"); assert.equal(f.writes.length, 1);
});

test("replies use protocol replyTo, validate room history, and remain duplicate-safe on retry", async () => {
  const f = fixture({ commits: [{ sha: "b".repeat(40), html_url: "", commit: { message: EVENT_PREFIX + JSON.stringify(event) } }], loseResponse: true });
  const history = await f.rooms.history(room);
  await assert.rejects(f.rooms.send(room, actor, "reply", history, [], "missing-target-01"), /Reply target/);
  assert.equal(f.writes.length, 0);
  await assert.rejects(f.rooms.send(room, actor, "reply", history, [], event.id), /no automatic write retry/);
  assert.equal(f.writes.length, 1);
  assert.equal(parseCommit(f.writes[0].data.message, "a".repeat(40), "")?.replyTo, event.id);
  assert.equal((await f.rooms.send(room, actor, "reply", history, [], event.id)).sha, "already-confirmed");
  assert.equal(f.writes.length, 1);
});

test("secure replies encrypt their target with the message content", async () => {
  const key = await generateKey(), policy = { enabled: true, keyId: await keyFingerprint(key) };
  const sealed = await encryptEvent(key, room.id, room.branch, event);
  const f = fixture({ policy, commits: [{ sha: "b".repeat(40), html_url: "", commit: { message: EVENT_PREFIX + JSON.stringify(sealed) } }] });
  const service = new Rooms(new GitHub("fixture-token", f.transport), key), history = await service.history(room);
  const result = await service.send(room, actor, "encrypted reply", history, [], event.id);
  assert.equal(result.event.replyTo, undefined); assert.ok(result.event.sealed);
  const decrypted = await decryptEvent(key, room.id, room.branch, result.event);
  assert.equal(decrypted.replyTo, event.id); assert.equal(decrypted.text, "encrypted reply");
});

test("concurrent sends are bounded even while checking an imported encryption key", async () => {
  const key = await generateKey(), f = fixture({ policy: { enabled: true, keyId: await keyFingerprint(key) } });
  const service = new Rooms(new GitHub("fixture-token", f.transport), key);
  const first = service.send(room, actor, "first message");
  await assert.rejects(service.send(room, actor, "second message"), /already being sent/);
  await first;
  assert.equal(f.writes.length, 1);
});

test("history preserves Git order and materializes edits instead of sorting by sender clocks", async () => {
  const edit: ChatEvent = { ...event, id: "event-fixture-02", kind: "edit", target: event.id, text: "edited", createdAt: "2026-10-31T12:00:00.000Z" };
  const commits = [edit, event].map((e, i) => ({ sha: String(i).repeat(40), html_url: "", commit: { message: `${EVENT_PREFIX}${JSON.stringify(e)}` } }));
  const f = fixture({ commits }); const history = await f.rooms.history(room);
  assert.equal(history.messages.length, 1); assert.equal(history.messages[0].text, "edited"); assert.equal(history.messages[0].edited, true);
  assert.equal(history.etag, '"fixture-history"');
});

test("locked encrypted history is not treated as plaintext, and a matching key decrypts it", async () => {
  const key = await generateKey(); const sealed = await encryptEvent(key, room.id, room.branch, event);
  const f = fixture({ commits: [{ sha: "a".repeat(40), html_url: "", commit: { message: EVENT_PREFIX + JSON.stringify(sealed) } }] });
  const locked = await f.rooms.history(room); assert.equal(locked.messages[0].locked, true); assert.equal(locked.encrypted, true);
  await assert.rejects(f.rooms.send(room, actor, "unsafe downgrade", locked), /policy is missing/); assert.equal(f.writes.length, 0);
  const unlocked = await new Rooms(new GitHub("fixture-token", f.transport), key).history(room);
  assert.equal(unlocked.messages[0].text, "hello"); assert.equal(unlocked.messages[0].encrypted, true);
});

test("conditional history response reuses a previous materialization", async () => {
  const f = fixture(); const previous = await f.rooms.history(room);
  const conditional = new Rooms(new GitHub("fixture-token", (async (_url, init) => { assert.equal((init?.headers as Record<string, string>)["If-None-Match"], previous.etag); return new Response(null, { status: 304 }); }) as typeof fetch));
  assert.equal(await conditional.history(room, previous), previous);
});

test("room keys require an absolute owner-only file and are never loaded from symlinks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gitmsg-private-key-test-"));
  try {
    const key = await generateKey(), raw = await exportKey(key), path = join(dir, "backup.txt");
    writeFileSync(path, raw, { mode: 0o600 });
    assert.equal(await keyFingerprint((await loadRoomKey(path))!), await keyFingerprint(key));
    await assert.rejects(loadRoomKey("relative-file.txt"), /absolute path/);
    if (process.platform !== "win32") {
      symlinkSync(path, join(dir, "link.txt")); await assert.rejects(loadRoomKey(join(dir, "link.txt")), /not a symlink/);
      chmodSync(path, 0o644); await assert.rejects(loadRoomKey(path), /owner-only/);
    }
    assert.equal(await loadRoomKey(undefined), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("history has a bounded recent window instead of silently fetching an entire repository", async () => {
  let calls = 0;
  const service = new Rooms(new GitHub("fixture-token", (async () => {
    calls++;
    return json(Array.from({ length: 100 }, (_, i) => ({ sha: `${calls}${i}`.padEnd(40, "a"), html_url: "", commit: { message: "ordinary code commit" } })));
  }) as Fetch));
  const history = await service.history(room);
  assert.equal(calls, 3); assert.equal(history.truncated, true); assert.equal(history.messages.length, 0);
});
