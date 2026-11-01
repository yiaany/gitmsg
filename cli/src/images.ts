import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_MEDIA } from "../../src/lib/protocol";
import { ClientError, containsCredential, terminalText } from "./safety";

export type LocalImage = { id: string; name: string; mime: string; bytes: Uint8Array<ArrayBuffer> };
export function memoryImage(data: Uint8Array, filename = "pasted-image.png"): LocalImage {
  if (!data.length || data.length > MAX_MEDIA) throw new ClientError("Choose an image up to 2 MiB.");
  const bytes = new Uint8Array(data), mime = imageMime(bytes), name = terminalText(basename(filename), 160);
  if (!bytes.length || bytes.length > MAX_MEDIA || !mime || containsCredential(Buffer.from(bytes).toString("latin1")) || containsCredential(name)) throw new ClientError("Choose a PNG/JPEG/GIF/WebP up to 2 MiB, without credentials.");
  return { id: randomUUID(), name: name || "pasted-image.png", mime, bytes };
}

/** Only a single explicitly pasted image path, never arbitrary pasted prose. */
export function pastedImagePath(text: string): string | null {
  let value = text.trim();
  if (value.length > 4096 || /[\r\n\0]/.test(value)) return null;
  if (value.startsWith("file://")) { try { const url = new URL(value); if (url.username || url.password || url.search || url.hash || url.hostname && url.hostname !== "localhost") return null; value = decodeURIComponent(url.pathname); } catch { return null; } }
  else if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
  else value = value.replace(/\\ /g, " ");
  return !/[\x00-\x1f\x7f]/.test(value) && isAbsolute(value) && /\.(png|jpe?g|webp|gif)$/i.test(value) ? value : null;
}
export function imageMime(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b.length >= 12 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.length >= 10 && ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (b.length >= 20 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}
export async function localImage(path: string): Promise<LocalImage> {
  if (!isAbsolute(path)) throw new ClientError("Use /attach followed by an absolute PNG, JPEG, GIF or WebP path.");
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > MAX_MEDIA) throw new Error();
      const buffer = Buffer.alloc(MAX_MEDIA + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_MEDIA || bytesRead !== stat.size) throw new Error();
      const bytes = new Uint8Array(buffer.subarray(0, bytesRead));
      const mime = imageMime(bytes), name = terminalText(basename(path), 160);
      if (!mime || containsCredential(buffer.subarray(0, bytesRead).toString("latin1")) || containsCredential(name)) throw new Error();
      return { id: randomUUID(), name, mime, bytes };
    } finally { await file.close(); }
  } catch { throw new ClientError("Could not preview this image. Choose a regular PNG/JPEG/GIF/WebP up to 2 MiB, not a symlink or a credential-containing file."); }
}
