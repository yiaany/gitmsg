import test from "node:test";
import assert from "node:assert/strict";
import { encodeGitMedia, readGitMedia } from "../src/lib/git-media";
import { MAX_MEDIA } from "../src/lib/protocol";
test("Git uploads use canonical padded base64 even when browser transport omits padding", () => {
  for (const length of [1, 2, 3, 4, 37, 42, 646]) {
    const bytes = new Uint8Array(length).fill(241), encoded = encodeGitMedia(bytes);
    assert.equal(encoded.length % 4, 0); assert.deepEqual(new Uint8Array(Buffer.from(encoded, "base64")), bytes);
  }
});
test("Git binary retrieval preserves every byte, including non-UTF8 ciphertext", async () => {
  const bytes = new Uint8Array(256).map((_, i) => i);
  const sha = "b".repeat(40);
  const result = await readGitMedia(async path => {
    if (path.includes("/contents/")) return { size: bytes.length, sha, encoding: "base64", content: Buffer.from("transcoded content must not be used").toString("base64") };
    assert.equal(path, `/repos/owner/chat/git/blobs/${sha}`);
    return { size: bytes.length, encoding: "base64", content: Buffer.from(bytes).toString("base64") };
  }, "owner/chat", "main", "file-id-123");
  assert.deepEqual(result, bytes);
});
test("large attachments use Git Blobs base64 when Contents omits content", async () => {
  const bytes = new Uint8Array(1024 * 1024 + 123).fill(241), sha = "a".repeat(40); let calls = 0;
  const result = await readGitMedia(async path => {
    calls++;
    if (calls === 1) return { size: bytes.length, sha, encoding: "none", content: "" };
    assert.equal(path, `/repos/owner/chat/git/blobs/${sha}`);
    return { size: bytes.length, encoding: "base64", content: Buffer.from(bytes).toString("base64") };
  }, "owner/chat", "main", "file-id-123");
  assert.equal(calls, 2); assert.deepEqual(result, bytes);
});
test("oversized, missing and inconsistent attachments fail before rendering", async () => {
  for (const size of [0, -1, MAX_MEDIA + 17]) await assert.rejects(readGitMedia(async () => ({ size }), "owner/chat", "main", "file-id-123"));
  await assert.rejects(readGitMedia(async () => ({ size: 10, encoding: "none", sha: "invalid" }), "owner/chat", "main", "file-id-123"));
  await assert.rejects(readGitMedia(async () => ({ size: 10, sha: "a".repeat(40), encoding: "base64", content: "YQ==" }), "owner/chat", "main", "file-id-123"), /size verification/);
});
