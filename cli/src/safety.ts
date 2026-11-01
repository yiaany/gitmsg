import { validRepo } from "../../src/lib/protocol";

export class ClientError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs = 0) { super(message); }
}

export function parseRepo(input: string): string {
  let value = input.trim();
  if (/[\x00-\x20\x7f\\]/.test(value) || /(?:^|\/)(?:\.|\.\.)(?:\/|$)/.test(value)) throw new ClientError("Use a plain repository identifier without controls or path traversal.");
  if (/^(?:https:\/\/)?github\.com\//i.test(value)) {
    const url = new URL(value.startsWith("https://") ? value : `https://${value}`);
    if (url.origin !== "https://github.com" || url.username || url.password || url.search || url.hash) throw new ClientError("Paste a GitHub repository URL without credentials, queries or room keys.");
    value = url.pathname.slice(1).replace(/\/$/, "");
  }
  value = value.replace(/\.git$/, "");
  if (!validRepo(value)) throw new ClientError("Use owner/repository or https://github.com/owner/repository.");
  return value;
}

/** Remote text is data, never terminal escape sequences, OSC links or bidi controls. */
export function terminalText(value: unknown, max = 4000): string {
  if (typeof value !== "string") return "";
  return value.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
    .slice(0, max);
}

export function containsCredential(text: string): boolean {
  return /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|npm_[A-Za-z0-9]{36,}|vc[pra]_[A-Za-z0-9_-]{24,})\b/.test(text)
    || /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text)
    || /[#&]key=[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(text)
    || /(?:SESSION_SECRET|GITHUB_CLIENT_SECRET|GITHUB_TOKEN|GITMSG_TOKEN|access_token)\s*["']?\s*[:=]\s*["']?[A-Za-z0-9_+/-]{24,}/i.test(text)
    || /https?:\/\/[^\s/@]+:[^\s/@]+@/.test(text);
}

export function publicError(error: unknown): string {
  // Never echo arbitrary server bodies, request options, token values or runtime errors.
  return error instanceof ClientError ? terminalText(error.message, 300) : "The operation failed. No raw request or credential data was logged.";
}
