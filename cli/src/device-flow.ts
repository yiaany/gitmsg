import { setTimeout as delay } from "node:timers/promises";
import { ClientError } from "./safety";
import type { Fetch } from "./github";

export type Credential = { token: string; clientId: string; expiresAt?: number };
export type DeviceCode = { device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number; requestedAt: number };
type Options = { transport?: Fetch; signal?: AbortSignal; now?: () => number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> };

export function validClientId(id: string): boolean { return typeof id === "string" && /^[A-Za-z0-9_.-]{10,100}$/.test(id) && !/^(?:gh[pousr]_|github_pat_|npm_|vc[pra]_)/.test(id); }
async function post(path: "device/code" | "oauth/access_token", fields: Record<string, string>, options: Options): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await (options.transport ?? fetch)(`https://github.com/login/${path}`, {
      method: "POST", redirect: "error", signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "gitmsg-terminal/0.1.0" }, body: new URLSearchParams(fields),
    });
  } catch { throw new ClientError("GitHub sign-in was cancelled, timed out, or could not connect."); }
  let value: unknown;
  try { value = await response.json(); }
  catch {
    if (!response.ok) throw new ClientError(`GitHub sign-in returned HTTP ${response.status}. Try again later.`);
    throw new ClientError("GitHub returned an invalid sign-in response.");
  }
  // GitHub returns OAuth errors with HTTP 400 as well as 200. Map only known
  // codes to our own text; never display remote descriptions or response data.
  if (!response.ok) {
    const code = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).error : undefined;
    if ((response.status === 400 || response.status === 401) && typeof code === "string" && Object.hasOwn(oauthErrors, code)) throw oauthError(code);
    throw new ClientError(`GitHub sign-in returned HTTP ${response.status}. Try again later.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ClientError("GitHub returned an invalid sign-in response.");
  return value as Record<string, unknown>;
}

const oauthErrors: Record<string, string> = {
  access_denied: "Authorization declined. Nothing was saved.",
  expired_token: "The sign-in code expired. Start sign-in again.",
  token_expired: "The sign-in code expired. Start sign-in again.",
  device_flow_disabled: "Device Flow is disabled for this OAuth App. Enable Device Flow in GitHub Settings → Developer settings → OAuth Apps, save, then press Enter to retry.",
  incorrect_client_credentials: "GitHub did not recognize that public OAuth client ID.",
  invalid_client: "GitHub did not recognize that public OAuth client ID.",
};
function oauthError(code: unknown): ClientError {
  return new ClientError(typeof code === "string" && Object.hasOwn(oauthErrors, code) ? oauthErrors[code] : "GitHub could not complete Device Flow. Check your OAuth App configuration.");
}

export async function requestDeviceCode(clientId: string, options: Options = {}): Promise<DeviceCode> {
  if (!validClientId(clientId)) throw new ClientError("Enter your OAuth App's public client ID, not a token or client secret.");
  const requestedAt = (options.now ?? Date.now)();
  const value = await post("device/code", { client_id: clientId, scope: "repo read:user" }, options);
  if (value.error) throw oauthError(value.error);
  if (typeof value.device_code !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(value.device_code) || typeof value.user_code !== "string" || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.user_code) || value.verification_uri !== "https://github.com/login/device" || !Number.isInteger(value.expires_in) || Number(value.expires_in) < 1 || Number(value.expires_in) > 1800 || !Number.isInteger(value.interval) || Number(value.interval) < 1 || Number(value.interval) > 60) throw new ClientError("GitHub returned invalid device verification parameters.");
  return { device_code: value.device_code, user_code: value.user_code, verification_uri: value.verification_uri, expires_in: Number(value.expires_in), interval: Number(value.interval), requestedAt };
}

export async function waitForAuthorization(clientId: string, code: DeviceCode, options: Options = {}): Promise<Credential> {
  if (options.signal?.aborted) throw new ClientError("GitHub sign-in cancelled. Nothing was saved.");
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (async (ms, signal) => { await delay(ms, undefined, { signal }); });
  const expires = code.requestedAt + code.expires_in * 1000;
  let interval = code.interval * 1000;
  while (now() < expires) {
    if (options.signal?.aborted) throw new ClientError("GitHub sign-in cancelled. Nothing was saved.");
    try { await sleep(Math.min(interval, expires - now()), options.signal); } catch { throw new ClientError("GitHub sign-in cancelled. Nothing was saved."); }
    if (now() >= expires) break;
    const value = await post("oauth/access_token", { client_id: clientId, device_code: code.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }, options);
    if (value.error === "authorization_pending") continue;
    if (value.error === "slow_down") { interval = Math.max(interval + 5000, Number.isInteger(value.interval) ? Number(value.interval) * 1000 : 0); continue; }
    if (value.error) throw oauthError(value.error);
    if (value.token_type !== "bearer" || typeof value.access_token !== "string" || !/^[A-Za-z0-9_.-]{1,512}$/.test(value.access_token) || typeof value.scope !== "string" || !value.scope.split(/[ ,]+/).includes("repo")) throw new ClientError("GitHub did not grant the expected repository authorization.");
    if (value.expires_in !== undefined && (!Number.isInteger(value.expires_in) || Number(value.expires_in) <= 0)) throw new ClientError("GitHub returned an invalid token expiry.");
    // Refresh tokens are deliberately not persisted in this alpha. Expired tokens require sign-in.
    return { token: value.access_token, clientId, ...(value.expires_in === undefined ? {} : { expiresAt: now() + Number(value.expires_in) * 1000 }) };
  }
  throw oauthError("expired_token");
}
