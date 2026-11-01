import { ClientError } from "./safety";

export type Fetch = (...args: Parameters<typeof fetch>) => Promise<Response>;
export class GitHub {
  constructor(private readonly token: string, private readonly transport: Fetch = fetch, private readonly signal?: AbortSignal) {
    if (!/^[A-Za-z0-9_.-]{1,512}$/.test(token)) throw new ClientError("The GitHub credential is invalid. Sign in again.");
  }
  containsActiveCredential(text: string): boolean { return text.includes(this.token); }
  async request(path: string, init: { method?: "GET" | "POST" | "PUT" | "PATCH"; data?: unknown; etag?: string; signal?: AbortSignal } = {}): Promise<Response> {
    if (!path.startsWith("/") || path.startsWith("//") || /[\r\n\\]/.test(path) || new URL(path, "https://api.github.com").origin !== "https://api.github.com") throw new ClientError("Refusing an invalid GitHub API destination.");
    let response: Response;
    try {
      response = await this.transport(`https://api.github.com${path}`, {
        method: init.method ?? "GET", redirect: "error",
        signal: AbortSignal.any([AbortSignal.timeout(20000), ...(this.signal ? [this.signal] : []), ...(init.signal ? [init.signal] : [])]),
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "gitmsg-terminal/0.1.0", ...(init.data === undefined ? {} : { "Content-Type": "application/json" }), ...(init.etag ? { "If-None-Match": init.etag } : {}) },
        ...(init.data === undefined ? {} : { body: JSON.stringify(init.data) }),
      });
    } catch { throw new ClientError("GitHub could not be reached, timed out, or redirected. Check the network; no automatic write retry was made."); }
    if (response.ok || response.status === 304) return response;
    const retry = Number(response.headers.get("retry-after"));
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const rateLimited = response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || retry > 0));
    if (rateLimited) throw new ClientError("GitHub rate limit reached. Waiting before the next read; writes are not retried automatically.", response.status, Math.max(60000, Number.isFinite(retry) ? retry * 1000 : 0, reset > 0 ? reset * 1000 - Date.now() : 0));
    const message = ({ 401: "GitHub authorization expired or was revoked. Sign in again.", 403: "GitHub denied access. Check repository permissions and organization SSO.", 404: "Repository or file unavailable. A link alone does not grant private repository access.", 409: "GitHub reported a conflict or an empty repository. Refresh before retrying.", 422: "GitHub rejected the request. The name may already exist or branch rules may block this write." } as Record<number, string>)[response.status] ?? `GitHub returned HTTP ${response.status}. No automatic write retry was made.`;
    throw new ClientError(message, response.status);
  }
  async json<T>(path: string, init: Parameters<GitHub["request"]>[1] = {}): Promise<T> {
    const response = await this.request(path, init);
    try { return await response.json() as T; } catch { throw new ClientError("GitHub returned an unreadable response."); }
  }
}
