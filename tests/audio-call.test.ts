import test from "node:test";
import assert from "node:assert/strict";
import { AudioCall, type CallView } from "../src/lib/audio-call";
import { CALL_TTL_MS, ICE_BATCH_MS, MAX_SDP, freshCall, callableRoom } from "../src/lib/call-protocol";
import { validEvent, materialize, parseCommit, EVENT_PREFIX, type ChatEvent, type Room } from "../src/lib/protocol";
import { encryptEvent, decryptEvent, generateKey, decodeEvents } from "../src/lib/room-crypto";
import { observeMessages } from "../src/lib/unread";

const alice = { id: 1, login: "alice" }, bob = { id: 2, login: "bob" };
const room: Room = { id: "alice/gitmsg-bob", name: "Bob", description: "", branch: "main", private: true, kind: "chat", canWrite: true, peer: bob };
const sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 AA:BB\r\na=ice-ufrag:abcd\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=candidate:1 1 udp 2122260223 127.0.0.1 12345 typ host\r\n";
function event(phase: "offer" | "answer" | "end" = "offer", changes: Partial<ChatEvent> = {}): ChatEvent {
  return { v: 1, id: crypto.randomUUID(), kind: "call", actor: bob, createdAt: new Date().toISOString(), call: { id: "call-id-0001", to: alice.id, phase, expiresAt: new Date(Date.now() + CALL_TTL_MS).toISOString(), ...(phase === "end" ? { reason: "hangup" } : { sdp }) }, ...changes };
}
class Peer {
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: unknown;
  connectionState = "new";
  onconnectionstatechange?: () => void;
  ontrack?: (event: unknown) => void;
  added = 0; closed = false;
  addTrack() { this.added++; }
  createOffer() { return Promise.resolve({ type: "offer", sdp }); }
  createAnswer() { return Promise.resolve({ type: "answer", sdp }); }
  setLocalDescription(value: { type: string; sdp: string }) { this.localDescription = value; return Promise.resolve(); }
  setRemoteDescription(value: unknown) { this.remoteDescription = value; return Promise.resolve(); }
  state(value: string) { this.connectionState = value; this.onconnectionstatechange?.(); }
  close() { this.closed = true; }
}
function harness(send?: (room: Room, event: ChatEvent) => Promise<void>) {
  const peer = new Peer(); const sent: ChatEvent[] = []; const views: (CallView | null)[] = [];
  const track = { enabled: true, stopped: false, onended: null, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  let micCount = 0;
  const controller = new AudioCall({ actor: alice, send: send || (async (_room, e) => { sent.push(e); }), change: view => views.push(view), remote: () => {}, peer: () => peer as unknown as RTCPeerConnection, microphone: async () => { micCount++; return stream; } });
  return { controller, peer, sent, views, track, stream, micCount: () => micCount, view: () => views.at(-1) };
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test("call protocol is bounded, audio-only, and separate from messages/unread", () => {
  const e = event(); assert.equal(validEvent(e), true);
  assert.ok(parseCommit(EVENT_PREFIX + JSON.stringify(e), "abc", "https://github.com"));
  assert.deepEqual(materialize([e]), []);
  assert.deepEqual(observeMessages({ seen: [], unread: [] }, [e], 1, false).unread, []);
  for (const patch of [{ text: "leak" }, { attachments: [] }, { target: "message-001" }, { replyTo: "message-001" }, { actor: alice }]) assert.equal(validEvent({ ...e, ...patch }), false);
  for (const call of [{ ...e.call, to: 0 }, { ...e.call, sdp: sdp + "m=video 9 UDP/TLS/RTP/SAVPF 96\r\n" }, { ...e.call, sdp: "a".repeat(MAX_SDP + 1) }, { ...e.call, sdp: sdp + "\u0000" }, { ...e.call, phase: "candidate" }, { ...e.call, extra: "hidden" }]) assert.equal(validEvent({ ...e, call }), false);
  assert.equal(validEvent(event("end")), true);
  assert.equal(callableRoom(room, alice), true);
  for (const patch of [{ private: false }, { kind: "channel" as const }, { canWrite: false }, { peer: undefined }, { peer: alice }]) assert.equal(callableRoom({ ...room, ...patch }, alice), false);
});
test("encrypted signaling stays hidden, including without a key", async () => {
  const key = await generateKey(), e = event(); const sealed = await encryptEvent(key, room.id, room.branch, e);
  assert.equal(sealed.kind, "call"); assert.equal(validEvent(sealed), true); assert.equal(sealed.call, undefined);
  assert.deepEqual(materialize([sealed]), []);
  assert.equal((await decryptEvent(key, room.id, room.branch, sealed)).call?.sdp, sdp);
  assert.deepEqual(materialize(await decodeEvents(room.id, room.branch, [sealed])), []);
  await assert.rejects(decryptEvent(key, room.id, "other", sealed));
  assert.equal(validEvent({ ...sealed, call: e.call }), false);
});
test("stale, future, wrong recipient/actor/room and already-ended offers do not ring", () => {
  const h = harness(), e = event();
  assert.equal(freshCall(e, Date.now() + CALL_TTL_MS + 1), false);
  assert.equal(freshCall({ ...e, createdAt: new Date(Date.now() + 60000).toISOString() }), false);
  h.controller.observe(room, [{ ...e, call: { ...e.call!, to: 99 } }]);
  h.controller.observe(room, [{ ...e, actor: { id: 3, login: "mallory" } }]);
  h.controller.observe({ ...room, private: false }, [e]);
  h.controller.observe(room, [e, event("end")]);
  assert.equal(h.view(), undefined); assert.equal(h.micCount(), 0); h.controller.dispose();
});
test("outgoing batches ICE once, accepts answer once, mutes, connects and cleans up", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const h = harness(); const pending = h.controller.start(room); await flush();
  assert.equal(h.sent.length, 0); assert.equal(h.peer.added, 1);
  t.mock.timers.tick(ICE_BATCH_MS - 1); await flush(); assert.equal(h.sent.length, 0);
  t.mock.timers.tick(1); await pending; assert.deepEqual(h.sent.map(e => e.call!.phase), ["offer"]);
  const answer = event("answer"); answer.call!.id = h.view()!.id;
  h.controller.observe(room, [answer]); h.controller.observe(room, [answer]); await flush(); assert.ok(h.peer.remoteDescription);
  h.peer.state("connected"); assert.equal(h.view()!.phase, "connected");
  h.controller.toggleMute(); assert.equal(h.track.enabled, false); h.controller.toggleMute(); assert.equal(h.track.enabled, true);
  await h.controller.end(); assert.equal(h.track.stopped, true); assert.equal(h.peer.closed, true);
  assert.deepEqual(h.sent.map(e => e.call!.phase), ["offer", "end"]);
  assert.equal(h.view()!.phase, "finished"); h.controller.dispose();
});
test("incoming requires accept before microphone/peer, publishes only one answer, deduplicates", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const h = harness(), e = event();
  h.controller.observe(room, [e]); assert.equal(h.micCount(), 0); assert.equal(h.peer.added, 0);
  assert.equal(h.view()!.phase, "incoming"); const pending = h.controller.accept(); await flush(); t.mock.timers.tick(ICE_BATCH_MS); await pending;
  assert.equal(h.micCount(), 1); assert.deepEqual(h.sent.map(e => e.call!.phase), ["answer"]);
  const end = event("end"); h.controller.observe(room, [e, end]);
  assert.equal(h.view()!.phase, "finished"); assert.equal(h.track.stopped, true);
  h.controller.dismiss(); h.controller.observe(room, [e]); assert.equal(h.view(), null); h.controller.dispose();
});
test("decline never opens microphone and persists no SDP", async () => {
  const h = harness(); h.controller.observe(room, [event()]); await h.controller.end("declined");
  assert.equal(h.micCount(), 0); assert.equal(h.sent[0].call!.reason, "declined"); assert.equal(h.sent[0].call!.sdp, undefined); h.controller.dispose();
});
test("cancel during ICE gathering makes no offer and releases audio", async () => {
  const h = harness(); const pending = h.controller.start(room); await flush(); await h.controller.end(); await pending;
  assert.equal(h.sent.length, 0); assert.equal(h.track.stopped, true); assert.equal(h.peer.closed, true); h.controller.dispose();
});
test("late microphone permission result after dispose is stopped immediately", async () => {
  let release!: (stream: MediaStream) => void;
  const h = harness(); const controller = new AudioCall({ actor: alice, send: async () => {}, change: () => {}, remote: () => {}, microphone: () => new Promise(resolve => { release = resolve; }) });
  const pending = controller.start(room); controller.dispose(); release(h.stream); await pending;
  assert.equal(h.track.stopped, true); h.controller.dispose();
});
test("hangup queues behind an in-flight offer but microphone stops immediately", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); let release!: () => void; const sent: string[] = [];
  const h = harness(async (_room, e) => { sent.push(e.call!.phase); if (e.call!.phase === "offer") await new Promise<void>(resolve => { release = resolve; }); });
  const pending = h.controller.start(room); await flush(); t.mock.timers.tick(ICE_BATCH_MS); await flush();
  const ended = h.controller.end(); assert.equal(h.track.stopped, true); assert.deepEqual(sent, ["offer"]);
  release(); await pending; await ended; assert.deepEqual(sent, ["offer", "end"]); h.controller.dispose();
});
test("timeout, repeated disconnects and failures close all resources", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const h = harness();
  const pending = h.controller.start(room); await flush(); t.mock.timers.tick(ICE_BATCH_MS); await pending;
  h.peer.state("connected"); h.peer.state("disconnected"); h.peer.state("connected"); h.peer.state("disconnected"); t.mock.timers.tick(10000); await flush();
  assert.equal(h.track.stopped, true); assert.match(h.view()!.detail!, /provider|firewall/); h.controller.dispose();
  const timeout = harness(); timeout.controller.observe(room, [event()]); t.mock.timers.tick(CALL_TTL_MS + 1); await flush(); assert.equal(timeout.view()!.phase, "finished"); assert.equal(timeout.micCount(), 0); timeout.controller.dispose();
});

test("no ICE candidates fails cleanly before publishing an unusable offer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] }); const h = harness();
  h.peer.createOffer = async () => ({ type: "offer", sdp: sdp.replace(/a=candidate:.*\r\n/, "") });
  const pending = h.controller.start(room); await flush(); t.mock.timers.tick(ICE_BATCH_MS); await pending;
  assert.equal(h.sent.length, 0); assert.equal(h.track.stopped, true); assert.match(h.view()!.detail!, /provider|firewall/); h.controller.dispose();
});

test("wrong-room end cannot terminate an active call and another offer gets busy", async () => {
  const h = harness(); h.controller.observe(room, [event()]);
  h.controller.observe({ ...room, id: "alice/other" }, [event("end")]);
  assert.equal(h.view()!.phase, "incoming");
  const other = event(); other.call!.id = "other-call-001"; h.controller.observe(room, [other]); await flush();
  assert.equal(h.sent[0].call!.reason, "busy"); assert.equal(h.view()!.id, "call-id-0001"); h.controller.dispose();
});
