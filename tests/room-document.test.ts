import test from "node:test";
import assert from "node:assert/strict";
import { parseRoomDocument, roomRepositoryName } from "../src/lib/room-document";
import { libraryRooms } from "../src/lib/github-models";
import { resolveRoomIdentity } from "../src/lib/room-identity";
import type { Room } from "../src/lib/protocol";

test("conversation identity accepts Unicode titles and only marked bounded documents", () => {
  const document = { schema: "gitmsg-room-v1", title: " Новости канала ", participants: ["alice", "bob"] };
  assert.deepEqual(parseRoomDocument(document), { ...document, title: "Новости канала" });
  for (const value of [null, [], {}, { ...document, schema: "other" }, { ...document, title: " " }, { ...document, title: "a".repeat(101) }, { ...document, participants: ["alice", "ALICE"] }, { ...document, participants: ["alice", "../bob"] }, { ...document, participants: ["alice"] }, { ...document, avatar: "javascript:alert(1)" }]) assert.equal(parseRoomDocument(value), null);
});

test("display titles map to bounded GitHub names without losing their separate title", () => {
  assert.equal(roomRepositoryName("friends", "abcdef"), "friends");
  assert.equal(roomRepositoryName("Новости", "abcdef"), "conversation-abcdef");
  assert.equal(roomRepositoryName("Café friends", "abcdef"), "Cafe-friends-abcdef");
  for (const title of ["a", "💜", "../test/name", "a ".repeat(50)]) assert.match(roomRepositoryName(title, "abcdef"), /^[a-zA-Z0-9][a-zA-Z0-9-]{1,39}$/);
});

test("library identity preserves verified display data but strips injected avatars and peers", () => {
  const room = { id: "alice/gitmsg-friends", name: "Bob", branch: "main", description: "", private: true, canWrite: false, peer: { id: 2, login: "bob", avatar: "https://avatars.githubusercontent.com/u/2" }, avatar: "https://avatars.githubusercontent.com/u/2", color: "#6c61df" };
  const [parsed] = libraryRooms([room]);
  assert.deepEqual(parsed.peer, room.peer); assert.equal(parsed.avatar, room.avatar); assert.equal(parsed.color, room.color); assert.equal(parsed.canWrite, false);
  const [bad] = libraryRooms([{ ...room, peer: { id: -1, login: "../bob" }, avatar: "https://tracking.example/image", color: "url(evil)" }]);
  assert.equal(bad.peer, undefined); assert.equal(bad.avatar, undefined); assert.equal(bad.color, undefined);
});

const room: Room = { id: "alice/gitmsg-chat-bob-123", name: "chat-bob-123", description: "", branch: "main", private: true, kind: "chat", canWrite: true };
const viewer = { id: 1, login: "alice" };
const document = { schema: "gitmsg-room-v1", title: "Private chat", participants: ["Alice", "bob"] };
const file = (value: unknown) => Response.json({ encoding: "base64", content: Buffer.from(JSON.stringify(value)).toString("base64") });
test("direct chat uses the other participant's public profile, not the repo title or viewer", async () => {
  const paths: string[] = [];
  const source = { request: async (path: string) => { paths.push(path); return path.startsWith("/users/") ? Response.json({ id: 2, login: "bob", avatar_url: "https://avatars.githubusercontent.com/u/2" }) : file(document); }, profile: async (login: string) => { assert.equal(login, "bob"); return { profile: { name: "Bob Smith", bio: "Hello", color: "#6c61df" } }; } };
  const decorated = await resolveRoomIdentity(viewer, room, source);
  assert.equal(decorated.name, "Bob Smith"); assert.equal(decorated.description, "Hello"); assert.equal(decorated.peer?.login, "bob"); assert.equal(decorated.avatar, "https://avatars.githubusercontent.com/u/2"); assert.equal(decorated.canWrite, true);
  assert.equal(paths.length, 2); assert.match(paths[0], /\.gitmsg\/room\.json\?ref=main/);
});
test("missing or malformed identity does not invent a peer or block legacy rooms", async () => {
  for (const response of [null, file({}), Response.json({ encoding: "base64", content: Buffer.from("bad json").toString("base64") })]) {
    assert.deepEqual(await resolveRoomIdentity(viewer, room, { request: async () => response, profile: async () => { assert.fail("must not look up a profile"); } }), room);
  }
});
test("channels, public repos and nonparticipants never get a fabricated recipient", async () => {
  for (const candidate of [{ ...room, kind: "channel" as const }, { ...room, private: false }, room]) {
    let requests = 0;
    const decorated = await resolveRoomIdentity(candidate === room ? { id: 3, login: "carol" } : viewer, candidate, { request: async () => { requests++; return file(document); }, profile: async () => { assert.fail("must not look up another account"); } });
    assert.equal(decorated.name, "Private chat"); assert.equal(decorated.peer, undefined); assert.equal(requests, 1);
  }
});
