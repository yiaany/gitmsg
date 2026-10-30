export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAfter = 0) { super(message); }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "Request failed.", response.status, data.retryAfter || 0);
  return data as T;
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (value === null) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(value)) return fallback;
    if (fallback !== null && typeof value !== typeof fallback) return fallback;
    return value as T;
  } catch { return fallback; }
}
export function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing / a full cache must never prevent sending. */ }
}
export function shortSha() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), n => n.toString(16).padStart(2, "0")).join("").slice(0, 7);
}
