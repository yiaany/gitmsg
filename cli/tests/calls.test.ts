import test from "node:test";
import assert from "node:assert/strict";
import { rpcCallDevice, type CallPacket, type CallTransport } from "../src/call-device";
import { Rooms, type TerminalRoom } from "../src/rooms";
import { GitHub, type Fetch } from "../src/github";
import { decryptEvent, encryptEvent, generateKey, keyFingerprint } from "../../src/lib/room-crypto";
import { EVENT_PREFIX, materialize, type ChatEvent } from "../../src/lib/protocol";
import { TerminalCalls } from "../src/calls";

const actor = { id: 1, login: "alice" }, peer = { id: 2, login: "bob" };
const room: TerminalRoom = { id: "alice/gitmsg-bob", branch: "main", title: "Bob", canWrite: true, private: true };
const sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 AA:BB\r\na=ice-ufrag:abcd\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=candidate:1 1 udp 2122260223 127.0.0.1 12345 typ host\r\n";
function fixture(options: { participants?: string[]; policy?: unknown; public?: boolean; wrongPeer?: boolean; events?: ChatEvent[] } = {}) {
  const writes: any[] = [], file = (value: unknown) => ({ type: "file", encoding: "base64", size: 100, content: Buffer.from(JSON.stringify(value)).toString("base64") });
  const transport: Fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    let value: unknown;
    if (init?.method === "PUT") { writes.push(JSON.parse(String(init.body))); value = { commit: { sha: "a".repeat(40) } }; }
    else if (path === `/repos/${room.id}`) value = { full_name: room.id, default_branch: "main", private: !options.public, permissions: { push: true } };
    else if (path.endsWith("/.gitmsg/room.json")) value = file({ schema: "gitmsg-room-v1", title: "Bob", participants: options.participants ?? ["alice", "bob"] });
    else if (path === "/users/bob") value = options.wrongPeer ? { id: 2, login: "mallory" } : peer;
    else if (path.endsWith("/commits")) value = (options.events ?? []).map(event => ({ sha: "a".repeat(40), html_url: "", commit: { message: EVENT_PREFIX + JSON.stringify(event) } }));
    else if (path.endsWith("/gitmsg/security.json") && options.policy) value = file(options.policy);
    else return new Response("{}", { status: 404 });
    return Response.json(value);
  };
  return { rooms: new Rooms(new GitHub("fixture-token", transport)), writes };
}
function signal(): ChatEvent { const now = Date.now(); return { v: 1, id: crypto.randomUUID(), kind: "call", actor, createdAt: new Date(now).toISOString(), call: { id: crypto.randomUUID(), to: peer.id, phase: "offer", sdp, expiresAt: new Date(now + 90000).toISOString() } }; }
test("call recipient comes only from verified direct-chat metadata, never repository or message authors", async () => {
  const f = fixture(); assert.deepEqual((await f.rooms.callRoom(room, actor)).peer, peer); assert.equal(f.writes.length, 0);
  for (const options of [{ public: true }, { wrongPeer: true }, { participants: ["mallory", "bob"] }]) await assert.rejects(fixture(options).rooms.callRoom(room, actor));
});
test("call signals share the website protocol, stay out of messages, and encrypt SDP under /secure", async () => {
  const key = await generateKey(), f = fixture({ policy: { enabled: true, keyId: await keyFingerprint(key) } });
  const event = signal();
  await assert.rejects(f.rooms.sendCall(room, actor, event), /matching room key/); assert.equal(f.writes.length, 0);
  f.rooms.setRoomKey(room, key); await f.rooms.sendCall(room, actor, event);
  const wire = JSON.parse(Buffer.from(f.writes[0].content, "base64").toString());
  assert.equal(wire.kind, "call"); assert.equal(wire.call, undefined); assert.ok(wire.sealed);
  assert.deepEqual((await decryptEvent(key, room.id, room.branch, wire)).call, event.call);
  assert.deepEqual(materialize([wire]), []); assert.equal(JSON.stringify(f.writes).includes("ice-pwd"), false);
});
test("wrong actor, recipient, expired signal and removed policy never publish call data", async () => {
  const f = fixture(), event = signal();
  for (const patch of [{ actor: peer }, { call: { ...event.call!, to: 3 } }, { createdAt: new Date(0).toISOString() }, { text: "not a call" }]) await assert.rejects(f.rooms.sendCall(room, actor, { ...event, ...patch }));
  f.rooms.setRoomKey(room, await generateKey()); await assert.rejects(f.rooms.sendCall(room, actor, event), /Refusing plaintext/); assert.equal(f.writes.length, 0);
});
test("RPC peer ignores other sessions, waits for actual device/state, clamps measured levels and cleans pending operations", async () => {
  const sent: CallPacket[] = []; let listener!: (value: unknown) => void, closed = false, levels: unknown;
  const transport: CallTransport = { send: value => { sent.push(value); }, listen: fn => { listener = fn; return () => {}; }, close: () => { closed = true; } };
  const device = rpcCallDevice(transport, value => { levels = value; }), preparing = device.microphone();
  const prepare = sent[0]; listener({ ...prepare, id: prepare.id, value: undefined }); const stream = await preparing;
  const pc = device.peer(); let changes = 0; pc.onconnectionstatechange = () => { changes++; };
  listener({ type: "gitmsg:rtc", session: "other", event: "state", value: "connected" }); assert.equal(changes, 0);
  listener({ type: "gitmsg:rtc", session: prepare.session, event: "state", value: "connected" }); assert.equal(changes, 1);
  listener({ type: "gitmsg:rtc", session: prepare.session, event: "level", value: { local: 2, remote: -.1 } }); assert.deepEqual(levels, { local: 1, remote: 0 });
  const offered = pc.createOffer(); device.dispose(); await assert.rejects(offered, /cancelled/); assert.equal(closed, true);
  stream.getTracks().forEach(track => track.stop()); assert.equal(sent.filter(p => p.method === "close").length, 1);
});

test("hangup during partner verification prevents a late request from ever opening the microphone", async () => {
  const f = fixture(), identity = await f.rooms.callRoom(room, actor);
  let complete!: (value: typeof identity) => void, devices = 0;
  f.rooms.callRoom = () => new Promise(resolve => { complete = resolve; });
  const calls = new TerminalCalls(f.rooms, actor, () => {}, () => {}, () => { devices++; throw new Error("Must not open input"); });
  try {
    const starting = calls.start(room); assert.equal(calls.busy, true);
    await calls.end(); complete(identity); await starting;
    assert.equal(devices, 0); assert.equal(calls.busy, false); assert.equal(f.writes.length, 0);
  } finally { calls.dispose(); }
});

test("secure rooms reject incoming plaintext call downgrades and missing keys before microphone access", async () => {
  const key = await generateKey(), f = fixture({ policy: { enabled: true, keyId: await keyFingerprint(key) } }), event = signal();
  await assert.rejects(f.rooms.callEvents(room, [event]), /matching room key/);
  f.rooms.setRoomKey(room, key);
  assert.deepEqual(await f.rooms.callEvents(room, [event]), []);
  assert.equal((await f.rooms.callEvents(room, [{ ...event, encrypted: true }])).length, 1);
  const loaded = fixture({ policy: { enabled: true, keyId: await keyFingerprint(key) }, events: [{ ...event, encrypted: true }, await encryptEvent(key, room.id, room.branch, { ...event, id: crypto.randomUUID() })] });
  loaded.rooms.setRoomKey(room, key);
  const history = await loaded.rooms.history(room);
  const verified = await loaded.rooms.callEvents(room, history.events);
  assert.equal(verified.length, 1); assert.notEqual(verified[0].id, event.id);
  let devices = 0;
  const missing = fixture({ policy: { enabled: true, keyId: await keyFingerprint(key) } });
  const calls = new TerminalCalls(missing.rooms, actor, () => {}, () => {}, () => { devices++; throw new Error("No input without key"); });
  try { await assert.rejects(calls.start(room), /matching room key/); assert.equal(devices, 0); }
  finally { calls.dispose(); }
});

test("incoming signals require acceptance and pending microphone disposal cannot publish a late offer", async () => {
  const f = fixture(); let phase = "", devices = 0, disposed = 0;
  let ready!: (stream: MediaStream) => void;
  const calls = new TerminalCalls(f.rooms, actor, view => { phase = view?.phase ?? ""; }, () => {}, () => {
    devices++;
    return { microphone: () => new Promise(resolve => { ready = resolve; }), peer: () => { throw new Error("Cancelled before peer creation"); }, dispose: () => { disposed++; } };
  });
  try {
    const incoming = signal(); incoming.actor = peer; incoming.call!.to = actor.id;
    await calls.observe(room, [incoming]); assert.equal(phase, "incoming"); assert.equal(devices, 0);
    const accepting = calls.accept(); assert.equal(phase, "preparing"); assert.equal(devices, 1);
    await calls.end(); assert.equal(disposed, 1);
    let stopped = false;
    ready({ getTracks: () => [{ stop: () => { stopped = true; } }] } as unknown as MediaStream);
    await accepting;
    assert.equal(stopped, true); assert.equal(phase, "finished");
    assert.equal(f.writes.length, 1);
    assert.equal(JSON.parse(Buffer.from(f.writes[0].content, "base64").toString()).call.phase, "end");
  } finally { calls.dispose(); }
});
