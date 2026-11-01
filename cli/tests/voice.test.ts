import test from "node:test";
import assert from "node:assert/strict";
import { amplitude, memoryVoice, voiceDiagram, voiceWav, VOICE_RATE } from "../src/voice-data";
import { privateBackupPath, readPrivateBackup, readRoomKey, savePrivateBackup, saveRoomKey } from "../src/room-keys";
import { mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKey, keyFingerprint } from "../../src/lib/room-crypto";
import type { Vault } from "../src/credentials";

test("voice PCM stays bounded, format-checked, clamped and has a measured waveform", () => {
  const quiet = memoryVoice(voiceWav(new Float32Array(VOICE_RATE).fill(.01)));
  const loud = memoryVoice(voiceWav(new Float32Array(VOICE_RATE).fill(.5)));
  assert.equal(loud.duration, 1); assert.equal(loud.mime, "audio/wav"); assert.equal(loud.waveform.length, 48);
  assert.ok(loud.waveform.every(value => value > quiet.waveform[0]));
  assert.ok(amplitude([.5, -.5]) > amplitude([.01])); assert.equal(amplitude([NaN]), 0);
  assert.equal(memoryVoice(voiceWav(new Float32Array(VOICE_RATE * 60))).duration, 60);
  assert.throws(() => voiceWav(new Float32Array(VOICE_RATE * 60 + 1)));
  assert.throws(() => voiceWav(new Float32Array()));
  for (const bytes of [new Uint8Array(), new Uint8Array(2 * 1024 * 1024 + 1), loud.bytes.subarray(1), new Uint8Array(loud.bytes.length)]) assert.throws(() => memoryVoice(bytes));
  const bad = new Uint8Array(loud.bytes); new DataView(bad.buffer).setUint32(24, 192000, true); assert.throws(() => memoryVoice(bad));
  const clipped = new DataView(voiceWav(Float32Array.of(-100, 100, NaN)).buffer);
  assert.equal(clipped.getInt16(44, true), -32767); assert.equal(clipped.getInt16(46, true), 32767); assert.equal(clipped.getInt16(48, true), 0);
});

test("voice diagram grows with measured loudness, stays symmetric and bounded", () => {
  const quiet = voiceDiagram([0, .01], 12), loud = voiceDiagram([1, 1], 12);
  assert.equal(quiet.split("\n").length, 5);
  assert.ok(loud.split("┃").length > quiet.split("┃").length);
  assert.equal(loud.split("\n")[0], loud.split("\n")[4]);
  assert.ok(loud.split("\n").every(row => row.length === 12));
});

test("room key vault is scoped by account, repo and branch and verifies durable writes", async () => {
  const values = new Map<string, string>(), vault: Vault = { get: async o => values.get(o.name) ?? null, set: async o => { values.set(o.name, o.value); }, delete: async () => true };
  const room = { id: "alice/gitmsg-test", branch: "main", title: "test", private: true as const, canWrite: true }, key = await generateKey();
  await saveRoomKey(vault, 1, room, key);
  assert.equal(await keyFingerprint((await readRoomKey(vault, 1, room))!), await keyFingerprint(key));
  assert.equal(await readRoomKey(vault, 2, room), null);
  assert.equal(await readRoomKey(vault, 1, { ...room, branch: "other" }), null);
  assert.equal(await readRoomKey(vault, 1, { ...room, id: "bob/gitmsg-test" }), null);
  await assert.rejects(saveRoomKey({ ...vault, set: async () => {}, get: async () => null }, 1, room, key), /No encryption policy was written/);
});

test("explicit private backup is owner-only, scoped, verified and never overwrites files or follows links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gitmsg-key-test-"));
  const room = { id: "alice/gitmsg-test", branch: "main", title: "test", private: true as const, canWrite: true }, key = await generateKey();
  try {
    await savePrivateBackup(1, room, key, directory);
    const path = privateBackupPath(1, room, directory);
    if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(await keyFingerprint((await readPrivateBackup(1, room, directory))!), await keyFingerprint(key));
    await savePrivateBackup(1, room, key, directory);
    await assert.rejects(savePrivateBackup(1, room, await generateKey(), directory), /not overwritten/);
    assert.equal(await readPrivateBackup(2, room, directory), null);
    await symlink(path, privateBackupPath(2, room, directory));
    await assert.rejects(savePrivateBackup(2, room, key, directory), /not overwritten/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
