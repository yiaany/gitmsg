import { createHostClipboard } from "@opentui/core";
import { MAX_MEDIA } from "../../src/lib/protocol";
import { memoryImage, type LocalImage } from "./images";
import { ClientError } from "./safety";

/** Explicit user action only. Native service: no shell, temporary file, or polling. */
export async function clipboardImage(): Promise<LocalImage> {
  if (process.connected || process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT) throw new ClientError("Host clipboard unavailable in a bridge or SSH session. Paste or drop image bytes, or use /attach.");
  const clipboard = createHostClipboard({ maxReadBytes: MAX_MEDIA, maxImagePixels: 16_000_000, maxConversionBytes: 64 * 1024 * 1024, timeoutMs: 3000 });
  try {
    const result = await clipboard.read({ preferredTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"] });
    if (result.status !== "read") throw new ClientError(result.status === "limit-exceeded" ? "Clipboard image exceeds 2 MiB or 16 megapixels." : "No supported clipboard image. Paste or drop an image file, or use /attach /absolute/path.png.");
    const extension = result.representation.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    return memoryImage(result.representation.bytes, `clipboard.${extension}`);
  } finally { await clipboard.dispose(); }
}

/** The local PTY bridge sends bounded bytes over Bun IPC, never terminal escape text. */
export function subscribeImages(receive: (image: LocalImage) => void, failure: (error: unknown) => void): () => void {
  if (!process.connected) return () => {};
  let last = -Infinity;
  const listener = (value: unknown) => {
    if (!value || typeof value !== "object" || !("type" in value) || value.type !== "gitmsg:image") return;
    const now = performance.now();
    if (now - last < 750) return;
    last = now;
    try {
      const { base64, name } = value as { base64?: unknown; name?: unknown };
      if (typeof base64 !== "string" || !base64.length || base64.length % 4 || base64.length > Math.ceil(MAX_MEDIA / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || typeof name !== "string" || name.length > 255) throw new ClientError("Invalid pasted image.");
      const bytes = Buffer.from(base64, "base64");
      if (bytes.toString("base64") !== base64) throw new ClientError("Invalid pasted image.");
      receive(memoryImage(bytes, name));
    } catch (error) { failure(error); }
  };
  process.on("message", listener);
  return () => { process.off("message", listener); };
}
