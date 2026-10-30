import test from "node:test";
import assert from "node:assert/strict";
import { loadMedia } from "../src/lib/media";
import { digest } from "../src/lib/room-crypto";
import { MAX_MEDIA, validAttachment, validEvent, materialize, type Attachment, type ChatEvent } from "../src/lib/protocol";
const attachment: Attachment = { id: "attachment-test", name: "image.webp", mime: "image/webp", size: 10, sha256: "a".repeat(64) };
const event: ChatEvent = { v: 1, id: "message-media", kind: "message", actor: { id: 1, login: "octocat" }, createdAt: "2026-10-30T12:00:00Z", text: "", attachments: [attachment] };
test("media metadata validates size, type, digest, IV and duration", () => {
  assert.ok(validAttachment(attachment)); assert.ok(validEvent(event));
  for (const value of [{ size: 0 }, { size: MAX_MEDIA + 17 }, { mime: "image/svg+xml" }, { sha256: "bad" }, { iv: "short" }, { duration: -1 }, { duration: Infinity }, { id: "../escape" }, { sourceRepo: "../escape" }]) assert.equal(validAttachment({ ...attachment, ...value }), false);
  assert.equal(validEvent({ ...event, attachments: Array(5).fill(attachment) }), false);
});
test("hiding media tombstones attachments without changing the original event", () => {
  const removed: ChatEvent = { ...event, id: "delete-media", kind: "delete", target: event.id };
  assert.equal(materialize([event, removed])[0].attachments, undefined);
  assert.equal(event.attachments?.length, 1);
});
test("encrypted envelopes reject accidental plaintext or exposed file metadata", () => {
  const sealed = { algorithm: "AES-256-GCM", iv: "a".repeat(16), keyId: "a".repeat(64), ciphertext: "a".repeat(24) };
  assert.ok(validEvent({ ...event, text: undefined, attachments: undefined, sealed }));
  assert.equal(validEvent({ ...event, sealed }), false);
});
test("download verifies content hashes and refuses corrupt or inaccessible media", async t => {
  const bytes = new TextEncoder().encode("media data"); const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(bytes);
  const media = { ...attachment, sha256: await digest(bytes) };
  assert.equal(await (await loadMedia({ id: "owner/chat", name: "chat", description: "", branch: "main" }, media)).text(), "media data");
  await assert.rejects(loadMedia({ id: "owner/chat", name: "chat", description: "", branch: "main" }, attachment), /hash verification/);
  globalThis.fetch = async () => new Response(null, { status: 403 });
  await assert.rejects(loadMedia({ id: "owner/chat", name: "chat", description: "", branch: "main" }, media), /repository access/);
});
