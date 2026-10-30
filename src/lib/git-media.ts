import { MAX_MEDIA } from "./protocol";

type GitFile = { type?: string; encoding?: string; content?: string; size?: number; sha?: string };
export class MediaStorageError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
// Never use raw media responses: base64 JSON preserves arbitrary binary bytes
// across GitHub's content negotiation and intermediate HTTP implementations.
export async function readGitMedia(get: (path: string) => Promise<GitFile>, repo: string, branch: string, id: string): Promise<Uint8Array<ArrayBuffer>> {
  const file = await get(`/repos/${repo}/contents/media/${id}.bin?ref=${encodeURIComponent(branch)}`);
  if (!Number.isSafeInteger(file.size) || !file.size || file.size < 0 || file.size > MAX_MEDIA + 16) throw new MediaStorageError(413, "Attachment exceeds the supported size.");
  // Always read the authoritative Git blob. Contents can transcode detected
  // text encodings even inside its base64 field, and omits content above 1 MiB.
  if (!/^[a-f0-9]{40}$/.test(file.sha || "")) throw new MediaStorageError(502, "Invalid attachment metadata from GitHub.");
  const blob = await get(`/repos/${repo}/git/blobs/${file.sha}`);
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || blob.content.length > 3 * 1024 * 1024) throw new MediaStorageError(502, "Invalid attachment encoding from GitHub.");
  const bytes = new Uint8Array(Buffer.from(blob.content, "base64"));
  if (bytes.length !== file.size) throw new MediaStorageError(502, "Attachment size verification failed.");
  return bytes;
}
