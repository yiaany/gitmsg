import test from "node:test";
import assert from "node:assert/strict";
import { command, roomLink } from "../src/commands";
import { imageMime, localImage, memoryImage, pastedImagePath } from "../src/images";
import { Rooms, type TerminalRoom } from "../src/rooms";
import { GitHub, type Fetch } from "../src/github";
import { digest, encryptBytes, generateKey, keyFingerprint } from "../../src/lib/room-crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pngImage } from "./fixtures";
import { memoryVoice, voiceWav } from "../src/voice-data";
import { decryptEvent, exportKey } from "../../src/lib/room-crypto";

const room: TerminalRoom = { id: "alice/gitmsg-test", title: "test", branch: "main", private: true, canWrite: true };
const png = pngImage();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const file = (value: unknown) => ({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify(value)).toString("base64"), size: 100 });
function fixture({ admin = true, privateRepo = true, marked = true, policy, invitations = [], bytes = png, failUpload = false }: { admin?: boolean; privateRepo?: boolean; marked?: boolean; policy?: unknown; invitations?: unknown[]; bytes?: Uint8Array; failUpload?: boolean } = {}) {
  const writes: { path: string; method: string; data?: any }[] = [];
  let stored: Uint8Array | null = null;
  const transport: Fetch = async (url, init) => {
    const path = new URL(String(url)).pathname, method = init?.method ?? "GET";
    if (method !== "GET") {
      const data = init?.body ? JSON.parse(String(init.body)) : undefined; writes.push({ path, method, data });
      if (path.includes("/collaborators/")) return json({}, 201);
      if (method === "PATCH") return new Response(null, { status: 204 });
      if (path.includes("/media/")) { stored = new Uint8Array(Buffer.from(data.content, "base64")); if (failUpload) throw new Error("ambiguous upload"); }
      return json({ commit: { sha: "a".repeat(40) } });
    }
    if (path === "/user") return json({ id: 1, login: "alice" });
    if (path === "/user/repository_invitations") return json(invitations);
    if (path === `/repos/${room.id}`) return json({ full_name: room.id, default_branch: "main", private: privateRepo, permissions: { push: true, admin } });
    if (path.endsWith("/.gitmsg/room.json")) return marked ? json(file({ schema: "gitmsg-room-v1", title: "test" })) : json({}, 404);
    if (path.endsWith("/gitmsg/security.json")) return policy ? json(file(policy)) : json({}, 404);
    if (path.includes("/contents/media/")) return stored ? json({ size: stored.length, sha: "a".repeat(40) }) : json({}, 404);
    if (path.includes("/git/blobs/")) return json({ encoding: "base64", content: Buffer.from(stored ?? bytes).toString("base64") });
    return json({}, 404);
  };
  return { writes, transport, service: new Rooms(new GitHub("fixture-token", transport)), setStored(data: Uint8Array) { stored = data; } };
}

test("commands are explicit, unknown slash commands are not sent as messages", () => {
  assert.deepEqual(command("/invite @bob"), { name: "invite", argument: "@bob" });
  assert.equal(command("/attach /Users/alice/two  spaces.png")?.argument, "/Users/alice/two  spaces.png");
  assert.equal(command("//literal"), null); assert.equal(command("hello"), null);
  assert.throws(() => command("/unknown"), /Unknown command/);
  assert.equal(roomLink("https://github.com/alice/gitmsg-test/invitations"), room.id);
  assert.throws(() => roomLink("https://github.com/alice/gitmsg-test/invitations#key=secret"));
});

test("invitations need confirmation, private marked rooms and admin permission", async () => {
  for (const options of [{ admin: false }, { privateRepo: false }, { marked: false }]) {
    const f = fixture(options); await assert.rejects(f.service.invite(room, "bob", true)); assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.service.invite(room, "bob", false), /confirmation/);
  await assert.rejects(f.service.invite(room, "alice", true), /already/);
  await assert.rejects(f.service.invite(room, "bob/other", true), /username/);
  assert.equal(f.writes.length, 0);
  const invited = await f.service.invite(room, "bob", true);
  assert.equal(invited.url, `https://github.com/${room.id}/invitations`);
  assert.deepEqual(f.writes, [{ path: `/repos/${room.id}/collaborators/bob`, method: "PUT", data: { permission: "push" } }]);
});

test("only pending private chat invitations can be accepted after confirmation", async () => {
  const f = fixture({ invitations: [{ id: 1, repository: { full_name: room.id, private: true }, inviter: { login: "bob" } }, { id: 2, repository: { full_name: "alice/gitmsg-settings", private: true } }, { id: 3, repository: { full_name: "alice/source", private: true } }, { id: 4, repository: { full_name: "alice/gitmsg-public", private: false } }] });
  const invites = await f.service.invitations(); assert.equal(invites.length, 1);
  await assert.rejects(f.service.accept(invites[0], false), /confirmation/);
  await assert.rejects(f.service.accept({ ...invites[0], id: 50 }, true), /no longer/);
  assert.equal(f.writes.length, 0);
  const joined = await f.service.accept(invites[0], true); assert.equal(joined.id, room.id);
  assert.deepEqual(f.writes, [{ path: "/user/repository_invitations/1", method: "PATCH", data: undefined }]);
});

test("image files require explicit paths, format signatures and bounded regular files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gitmsg-image-test-"));
  try {
    const path = join(dir, "picture.png"); await writeFile(path, png);
    assert.equal(imageMime(png), "image/png");
    const image = await localImage(path); assert.equal(image.name, "picture.png"); assert.deepEqual(image.bytes, png);
    await assert.rejects(localImage("picture.png"), /absolute/);
    await writeFile(join(dir, "text.png"), "not really an image"); await assert.rejects(localImage(join(dir, "text.png")), /Could not preview/);
    await writeFile(join(dir, "large.png"), Buffer.alloc(2 * 1024 * 1024 + 1)); await assert.rejects(localImage(join(dir, "large.png")));
    await symlink(path, join(dir, "symlink.png")); await assert.rejects(localImage(join(dir, "symlink.png")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("pasted image bytes are bounded, copied and signature-checked", () => {
  const bytes = pngImage(), image = memoryImage(bytes, "folder/picture.png");
  assert.equal(image.name, "picture.png"); assert.equal(image.mime, "image/png");
  bytes.fill(0); assert.deepEqual(image.bytes, png);
  assert.throws(() => memoryImage(new Uint8Array()));
  assert.throws(() => memoryImage(new Uint8Array(2 * 1024 * 1024 + 1)));
  assert.throws(() => memoryImage(new TextEncoder().encode("not an image")));
});

test("pasted file paths accept one explicit local image, not prose, remote URLs or control data", () => {
  for (const value of ["/Users/alice/two words.png", "'/Users/alice/two words.png'", '"/Users/alice/two words.png"', "/Users/alice/two\\ words.png", "file:///Users/alice/two%20words.png"]) assert.equal(pastedImagePath(value), "/Users/alice/two words.png");
  for (const value of ["picture.png", "https://example.com/picture.png", "file://remote/picture.png", "file:///picture.png#secret", "file:///picture.png?token=secret", "file:///bad%00.png", "/one.png\n/two.png", "here is /a.png", "/a.txt", "file:///bad%zz.png"]) assert.equal(pastedImagePath(value), null, value);
});

test("image uploads are confirmed, web-compatible and duplicate-safe after a lost response", async () => {
  const image = { id: "image-fixture-01", name: "picture.png", mime: "image/png", bytes: png };
  const f = fixture({ failUpload: true });
  await assert.rejects(f.service.uploadImage(room, image, false), /confirmation/); assert.equal(f.writes.length, 0);
  await assert.rejects(f.service.uploadImage(room, image, true), /no automatic write retry/);
  const attachment = await f.service.uploadImage(room, image, true);
  assert.equal(f.writes.length, 1); assert.equal(attachment.sha256, await digest(png));
  assert.deepEqual(await f.service.image(room, attachment), png);
  await assert.rejects(f.service.image(room, { ...attachment, sha256: "b".repeat(64) }), /integrity/);
  await assert.rejects(f.service.image(room, { ...attachment, mime: "image/jpeg" }), /format/);
});

test("encrypted image uploads hide original bytes and decrypt with the matching room key", async () => {
  const key = await generateKey(), f = fixture({ policy: { enabled: true, keyId: await keyFingerprint(key) } });
  const service = new Rooms(new GitHub("fixture-token", f.transport), key);
  const image = { id: "image-fixture-02", name: "picture.png", mime: "image/png", bytes: png };
  await assert.rejects(f.service.uploadImage(room, image, true), /matching room key/);
  const attachment = await service.uploadImage(room, image, true);
  assert.ok(attachment.iv); assert.equal(attachment.size, png.length + 16);
  assert.notEqual(f.writes[0].data.content, Buffer.from(png).toString("base64"));
  assert.deepEqual(await service.image(room, attachment), png);
  await assert.rejects(f.service.image(room, attachment), /room key/);
  const sent = await service.send(room, { id: 1, login: "alice" }, "", undefined, [attachment]); assert.ok(sent.event.sealed);
});

test("plaintext uploads are refused when encrypted history has lost its policy", async () => {
  const f = fixture();
  await assert.rejects(f.service.uploadImage(room, { id: "image-fixture-03", name: "picture.png", mime: "image/png", bytes: png }, true, { events: [], messages: [], truncated: false, encrypted: true }), /Refusing plaintext/);
  assert.equal(f.writes.length, 0);
});

test("secure voice encrypts audio bytes and metadata, verifies integrity and rejects wrong keys", async () => {
  const voice = memoryVoice(voiceWav(new Float32Array(16000).fill(.25))), key = await generateKey();
  const f = fixture({ policy: { enabled: true, keyId: await keyFingerprint(key) } });
  const service = new Rooms(new GitHub("fixture-token", f.transport), key);
  await assert.rejects(service.uploadVoice(room, voice, false), /confirmation/);
  assert.equal(f.writes.length, 0);
  const attachment = await service.uploadVoice(room, voice, true);
  assert.ok(attachment.iv); assert.equal(attachment.duration, 1); assert.deepEqual(attachment.waveform, voice.waveform);
  assert.notEqual(f.writes[0].data.content, Buffer.from(voice.bytes).toString("base64"));
  assert.deepEqual(await service.voice(room, attachment), voice.bytes);
  const sent = await service.send(room, { id: 1, login: "alice" }, "", undefined, [attachment]);
  assert.ok(sent.event.sealed); assert.equal(sent.event.attachments, undefined);
  assert.deepEqual((await decryptEvent(key, room.id, room.branch, sent.event)).attachments, [attachment]);
  assert.equal(JSON.stringify(f.writes).includes(await exportKey(key)), false);
  await assert.rejects(f.service.voice(room, attachment), /room key/);
  const wrong = new Rooms(new GitHub("fixture-token", f.transport), await generateKey());
  await assert.rejects(wrong.voice(room, attachment), /decrypt/);
  await assert.rejects(service.voice(room, { ...attachment, sha256: "b".repeat(64) }), /integrity/);
});

test("voice upload retries reuse one verified blob and policy loss never sends plaintext", async () => {
  const voice = memoryVoice(voiceWav(new Float32Array(1600).fill(.2))), f = fixture({ failUpload: true });
  await assert.rejects(f.service.uploadVoice(room, voice, true), /no automatic write retry/);
  const attachment = await f.service.uploadVoice(room, voice, true);
  assert.equal(f.writes.length, 1); assert.deepEqual(await f.service.voice(room, attachment), voice.bytes);
  f.service.setRoomKey(room, await generateKey());
  await assert.rejects(f.service.uploadVoice(room, { ...voice, id: "another-voice-01" }, true), /Refusing plaintext/);
  await assert.rejects(f.service.send(room, { id: 1, login: "alice" }, "blocked"), /Refusing plaintext/);
  assert.equal(f.writes.length, 1);
});

test("enabling secure mode requires admin, confirmation, private marked room and never overwrites another key", async () => {
  const key = await generateKey();
  for (const options of [{ admin: false }, { privateRepo: false }, { marked: false }, { policy: { enabled: true, keyId: "b".repeat(64) } }]) {
    const f = fixture(options); await assert.rejects(f.service.secure(room, key, true)); assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.service.secure(room, key, false), /confirmation/); assert.equal(f.writes.length, 0);
  await f.service.secure(room, key, true);
  assert.equal(f.writes.length, 1);
  const stored = JSON.parse(Buffer.from(f.writes[0].data.content, "base64").toString());
  assert.deepEqual(stored, { version: 1, enabled: true, algorithm: "AES-256-GCM", keyId: await keyFingerprint(key) });
  assert.equal(JSON.stringify(f.writes).includes(await exportKey(key)), false);
});
