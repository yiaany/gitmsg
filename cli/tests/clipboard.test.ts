import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { requestClipboard } from "../src/clipboard-bridge";

function fixture() {
  const emitter = new EventEmitter(), sent: { id: string; type: string; text: string }[] = [];
  const channel = Object.assign(emitter, { send: (value: object) => sent.push(value as typeof sent[number]) });
  return { emitter, sent, channel: channel as unknown as Parameters<typeof requestClipboard>[1] };
}
test("clipboard IPC waits for its matching acknowledged write, not a queued request", async () => {
  const f = fixture(); let done = false;
  const result = requestClipboard("exact\nтекст", f.channel).then(value => { done = true; return value; });
  assert.equal(f.sent[0].text, "exact\nтекст");
  f.emitter.emit("message", { type: "gitmsg:copy-result", id: "wrong", copied: true });
  await Promise.resolve(); assert.equal(done, false);
  f.emitter.emit("message", { type: "gitmsg:copy-result", id: f.sent[0].id, copied: true });
  assert.equal(await result, "copied"); assert.equal(f.emitter.listenerCount("message"), 0); assert.equal(f.emitter.listenerCount("disconnect"), 0);
});
test("clipboard refusal and disconnection reject and clean up without false success", async () => {
  for (const disconnect of [false, true]) {
    const f = fixture(), result = requestClipboard("private text", f.channel);
    if (disconnect) f.emitter.emit("disconnect");
    else f.emitter.emit("message", { type: "gitmsg:copy-result", id: f.sent[0].id, copied: false });
    await assert.rejects(result, /did not confirm/);
    assert.equal(f.emitter.listenerCount("message"), 0); assert.equal(f.emitter.listenerCount("disconnect"), 0);
  }
});
