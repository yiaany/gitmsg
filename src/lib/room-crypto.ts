import { validEvent, type ChatEvent } from "./protocol";

export function base64url(bytes: Uint8Array): string {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function unbase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoded data.");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}
export async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), n => n.toString(16).padStart(2, "0")).join("");
}
export async function importKey(raw: string): Promise<CryptoKey> {
  const bytes = unbase64(raw);
  if (bytes.byteLength !== 32) throw new Error("A room key must contain 256 random bits.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", true, ["encrypt", "decrypt"]);
}
export async function exportKey(key: CryptoKey) { return base64url(new Uint8Array(await crypto.subtle.exportKey("raw", key))); }
export async function keyFingerprint(key: CryptoKey) { return digest(new Uint8Array(await crypto.subtle.exportKey("raw", key))); }
export async function generateKey() { return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); }
export async function encryptBytes(key: CryptoKey, bytes: Uint8Array, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context), tagLength: 128 }, key, new Uint8Array(bytes));
  return { iv: base64url(iv), bytes: new Uint8Array(ciphertext) };
}
export async function decryptBytes(key: CryptoKey, bytes: Uint8Array, iv: string, context: string) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(iv), additionalData: new TextEncoder().encode(context), tagLength: 128 }, key, new Uint8Array(bytes)));
}
function context(repo: string, branch: string, event: ChatEvent) {
  return JSON.stringify(["gitmsg:event:v1", repo.toLowerCase(), branch, event.id, event.actor.id, event.createdAt]);
}
export async function encryptEvent(key: CryptoKey, repo: string, branch: string, event: ChatEvent): Promise<ChatEvent> {
  const { sha: _sha, url: _url, sealed: _sealed, locked: _locked, encrypted: _encrypted, ...plain } = event;
  if (!validEvent(plain)) throw new Error("Cannot encrypt an invalid event.");
  const encrypted = await encryptBytes(key, new TextEncoder().encode(JSON.stringify(plain)), context(repo, branch, event));
  return { v: 1, id: event.id, kind: "message", actor: event.actor, createdAt: event.createdAt, sealed: { algorithm: "AES-256-GCM", iv: encrypted.iv, ciphertext: base64url(encrypted.bytes), keyId: await keyFingerprint(key) } };
}
export async function decryptEvent(key: CryptoKey, repo: string, branch: string, event: ChatEvent): Promise<ChatEvent> {
  if (!event.sealed) return event;
  if (!validEvent(event) || await keyFingerprint(key) !== event.sealed.keyId) throw new Error("This event needs a different room key.");
  const plain = JSON.parse(new TextDecoder().decode(await decryptBytes(key, unbase64(event.sealed.ciphertext), event.sealed.iv, context(repo, branch, event)))) as ChatEvent;
  if (!validEvent(plain) || plain.sealed || plain.id !== event.id || plain.actor.id !== event.actor.id || plain.createdAt !== event.createdAt) throw new Error("Encrypted event integrity check failed.");
  return { ...plain, actor: event.actor, sha: event.sha, url: event.url, sealed: undefined, locked: false, encrypted: true };
}

async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("gitmsg-keyring", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("keys");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Secure device storage is unavailable. Do not enable encryption in this browser."));
  });
}
export async function roomKey(repo: string): Promise<CryptoKey | null> {
  const database = await db();
  try { return await new Promise((resolve, reject) => { const tx = database.transaction("keys"); const r = tx.objectStore("keys").get(repo.toLowerCase()); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error); }); }
  finally { database.close(); }
}
export async function storeRoomKey(repo: string, key: CryptoKey) {
  const database = await db();
  try { await new Promise<void>((resolve, reject) => { const tx = database.transaction("keys", "readwrite"); tx.objectStore("keys").put(key, repo.toLowerCase()); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { database.close(); }
}
export async function decodeEvents(repo: string, branch: string, events: ChatEvent[]): Promise<ChatEvent[]> {
  if (!events.some(e => e.sealed)) return events;
  const key = await roomKey(repo).catch(() => null);
  return Promise.all(events.map(async event => {
    if (!event.sealed) return event;
    try { if (key) return await decryptEvent(key, repo, branch, { ...event, text: undefined, locked: undefined }); } catch { /* Keep ciphertext visible as a locked placeholder. */ }
    return { ...event, text: "Encrypted message · import the room key to unlock", locked: true };
  }));
}
