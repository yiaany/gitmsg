import test from "node:test";
import assert from "node:assert/strict";
import { base64url, unbase64, generateKey, importKey, exportKey, keyFingerprint, encryptBytes, decryptBytes, encryptEvent, decryptEvent } from "../src/lib/room-crypto";
import { validEvent, materialize, mergeEvents, EVENT_PREFIX, parseCommit, type ChatEvent } from "../src/lib/protocol";

const event: ChatEvent = { v: 1, id: "event-test-001", kind: "message", actor: { id: 1, login: "octocat" }, createdAt: "2026-10-30T12:00:00.000Z", text: "private hello 🔒" };
test("room keys are random 256-bit secrets with stable public SHA-256 fingerprints", async () => {
  const key = await generateKey(), raw = await exportKey(key);
  assert.equal(unbase64(raw).length, 32);
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await keyFingerprint(key), await keyFingerprint(await importKey(raw)));
  assert.notEqual(await keyFingerprint(key), await keyFingerprint(await generateKey()));
  await assert.rejects(importKey("not-a-room-key"));
  assert.throws(() => unbase64("spaces are not base64"));
});
test("base64url roundtrips binary attachments without argument-stack overflow", () => {
  const bytes = new Uint8Array(2 * 1024 * 1024).map((_, i) => i % 256);
  assert.deepEqual(unbase64(base64url(bytes)), bytes);
});
test("AES-GCM uses fresh IVs and authenticates bytes and media context", async () => {
  const key = await generateKey(), data = new TextEncoder().encode("voice bytes");
  const a = await encryptBytes(key, data, "media:room:123"), b = await encryptBytes(key, data, "media:room:123");
  assert.notEqual(a.iv, b.iv);
  assert.deepEqual(await decryptBytes(key, a.bytes, a.iv, "media:room:123"), data);
  await assert.rejects(decryptBytes(key, a.bytes, a.iv, "media:other:123"));
  await assert.rejects(decryptBytes(await generateKey(), a.bytes, a.iv, "media:room:123"));
  a.bytes[0] ^= 1;
  await assert.rejects(decryptBytes(key, a.bytes, a.iv, "media:room:123"));
});
test("encrypted events contain no plaintext and survive protocol commit parsing", async () => {
  const key = await generateKey(), wire = await encryptEvent(key, "owner/chat", "main", event);
  assert.ok(validEvent(wire)); assert.equal(wire.text, undefined);
  assert.ok(!JSON.stringify(wire).includes(event.text!));
  const parsed = parseCommit(`feat(chat): encrypted event\n\n${EVENT_PREFIX}${JSON.stringify(wire)}`, "a".repeat(40), "https://github.com/owner/chat");
  assert.ok(parsed);
  assert.equal((await decryptEvent(key, "OWNER/CHAT", "main", parsed)).text, event.text);
});
test("event authentication rejects a changed room, branch, actor, date, ID or ciphertext", async () => {
  const key = await generateKey(), wire = await encryptEvent(key, "owner/chat", "main", event);
  await assert.rejects(decryptEvent(key, "owner/elsewhere", "main", wire));
  await assert.rejects(decryptEvent(key, "owner/chat", "other", wire));
  for (const change of [{ id: "event-test-002" }, { actor: { id: 2, login: "other" } }, { createdAt: "2026-10-30T13:00:00.000Z" }]) await assert.rejects(decryptEvent(key, "owner/chat", "main", { ...wire, ...change }));
  await assert.rejects(decryptEvent(await generateKey(), "owner/chat", "main", wire));
  const damaged = { ...wire, sealed: { ...wire.sealed!, ciphertext: (wire.sealed!.ciphertext[0] === "A" ? "B" : "A") + wire.sealed!.ciphertext.slice(1) } };
  await assert.rejects(decryptEvent(key, "owner/chat", "main", damaged));
});
test("encrypted edits, deletes and reactions retain semantics after decrypting", async () => {
  const key = await generateKey();
  const events: ChatEvent[] = [event, { ...event, id: "edit-test-001", kind: "edit", target: event.id, text: "new text" }, { ...event, id: "react-test-001", kind: "reaction", target: event.id, text: undefined, emoji: "🚀", active: true }];
  const decoded = await Promise.all(events.map(async e => decryptEvent(key, "owner/chat", "main", await encryptEvent(key, "owner/chat", "main", e))));
  assert.equal(materialize(decoded)[0].text, "new text"); assert.equal(materialize(decoded)[0].reactions["🚀"]?.length, 1);
  const removed = await decryptEvent(key, "owner/chat", "main", await encryptEvent(key, "owner/chat", "main", { ...event, id: "delete-test-001", kind: "delete", target: event.id, text: undefined }));
  assert.ok(materialize([...decoded, removed])[0].deleted);
});
test("importing a key clears locked state even when merging existing placeholders", async () => {
  const key = await generateKey(), wire = await encryptEvent(key, "owner/chat", "main", event);
  const placeholder = { ...wire, locked: true, text: "Encrypted message" };
  const decoded = await decryptEvent(key, "owner/chat", "main", wire);
  const merged = mergeEvents([placeholder], [decoded]);
  assert.equal(materialize(merged)[0].locked, false); assert.equal(merged[0].sealed, undefined);
});
