import { exportKey, importKey, keyFingerprint } from "../../src/lib/room-crypto";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Vault } from "./credentials";
import { loadRoomKey, type TerminalRoom } from "./rooms";
import { ClientError } from "./safety";

const slot = (account: number, room: TerminalRoom) => ({ service: "fun.gitmsg.terminal.keys", name: `${account}:${room.id.toLowerCase()}:${room.branch}` });
export async function readRoomKey(vault: Vault, account: number, room: TerminalRoom): Promise<CryptoKey | null> {
  let raw;
  try { raw = await vault.get(slot(account, room)); } catch { return null; }
  if (!raw) return null;
  try { return await importKey(raw); } catch { throw new ClientError("The stored room key is invalid. Import a valid backup with /secure import."); }
}
export async function saveRoomKey(vault: Vault, account: number, room: TerminalRoom, key: CryptoKey): Promise<void> {
  try {
    const value = await exportKey(key);
    await vault.set({ ...slot(account, room), value, persist: "local" });
    if (await vault.get(slot(account, room)) !== value) throw new Error();
  } catch { throw new ClientError("Secure key storage unavailable. No encryption policy was written. Use /secure import with an owner-only key backup first."); }
}

/** Deliberate, visible backup alternative, never a silent plaintext fallback. */
export function privateBackupPath(account: number, room: TerminalRoom, directory = homedir()): string {
  const id = createHash("sha256").update(`${account}:${room.id.toLowerCase()}:${room.branch}`).digest("hex").slice(0, 24);
  return join(directory, `.gitmsg-room-key-${id}.txt`);
}
export async function readPrivateBackup(account: number, room: TerminalRoom, directory?: string): Promise<CryptoKey | null> {
  try { return await loadRoomKey(privateBackupPath(account, room, directory)); } catch { return null; }
}
export async function savePrivateBackup(account: number, room: TerminalRoom, key: CryptoKey, directory?: string): Promise<void> {
  if (process.platform === "win32") throw new ClientError("Use the system credential store on Windows. Private backup creation requires verified owner-only file permissions.");
  const path = privateBackupPath(account, room, directory);
  try {
    const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await file.writeFile(await exportKey(key), "utf8"); await file.sync(); }
    finally { await file.close(); }
  } catch {
    const existing = await readPrivateBackup(account, room, directory);
    if (!existing || await keyFingerprint(existing) !== await keyFingerprint(key)) throw new ClientError("Could not create the private key backup. Existing files were not overwritten; no policy was written.");
  }
  const saved = await readPrivateBackup(account, room, directory);
  if (!saved || await keyFingerprint(saved) !== await keyFingerprint(key)) throw new ClientError("Private key backup verification failed. No policy was written.");
}
