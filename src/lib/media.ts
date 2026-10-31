import { api } from "./client";
import { MAX_MEDIA, type Attachment, type Room } from "./protocol";
import { base64url, decryptBytes, digest, encryptBytes, roomKey } from "./room-crypto";

export async function uploadMedia(room: Room, file: Blob, name: string, secure: boolean, duration?: number, waveform?: number[]): Promise<Attachment> {
  if (!file.size || file.size > MAX_MEDIA) throw new Error("Attachments must be at most 2 MiB.");
  const id = crypto.randomUUID(); let bytes = new Uint8Array(await file.arrayBuffer()); let iv: string | undefined;
  if (secure) {
    const key = await roomKey(room.id); if (!key) throw new Error("Import the room key before uploading encrypted media.");
    const result = await encryptBytes(key, bytes, `gitmsg:media:${room.id.toLowerCase()}:${id}`); bytes = result.bytes; iv = result.iv;
  }
  await api("/api/media", { method: "POST", body: JSON.stringify({ repo: room.id, branch: room.branch, id, encrypted: secure, data: base64url(bytes).replaceAll("-", "+").replaceAll("_", "/") }) });
  return { id, name: name.slice(0, 160), mime: file.type.split(";")[0], size: bytes.length, sha256: await digest(bytes), ...(iv ? { iv } : {}), ...(duration ? { duration } : {}), ...(waveform ? { waveform } : {}) };
}
export async function loadMedia(room: Room, attachment: Attachment): Promise<Blob> {
  const repo = attachment.sourceRepo || room.id;
  const r = await fetch(`/api/media?${new URLSearchParams({ repo, branch: attachment.sourceBranch || room.branch, id: attachment.id })}`);
  if (!r.ok) throw new Error("Could not load attachment. Check repository access.");
  let bytes = new Uint8Array(await r.arrayBuffer());
  if (await digest(bytes) !== attachment.sha256) throw new Error("Attachment hash verification failed.");
  if (attachment.iv) {
    const key = await roomKey(repo); if (!key) throw new Error("Import the original room key to unlock this attachment.");
    bytes = await decryptBytes(key, bytes, attachment.iv, `gitmsg:media:${repo.toLowerCase()}:${attachment.id}`);
  }
  return new Blob([new Uint8Array(bytes)], { type: attachment.mime });
}
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Choose a PNG, JPEG, GIF or WebP image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MiB.");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image conversion failed.")), "image/webp", 0.8));
}
