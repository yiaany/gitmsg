import { ClientError } from "./safety";
import { validClientId, type Credential } from "./device-flow";

export interface Vault {
  get(options: { service: string; name: string }): Promise<string | null>;
  set(options: { service: string; name: string; value: string; persist?: "local" }): Promise<void>;
  delete(options: { service: string; name: string }): Promise<boolean>;
}
const slot = { service: "fun.gitmsg.terminal", name: "github.com:oauth" };
export async function readCredential(vault: Vault): Promise<Credential | null> {
  let raw: string | null;
  try { raw = await vault.get(slot); } catch { throw new ClientError("OS credential storage is unavailable. Use a working keychain/keyring or an explicit session-only GITMSG_TOKEN."); }
  if (raw === null) return null;
  let value: Credential;
  try { value = JSON.parse(raw); } catch { throw new ClientError("The saved credential is invalid. Use gitmsg auth logout, then sign in again."); }
  if (!value || !validClientId(value.clientId) || typeof value.token !== "string" || !/^[A-Za-z0-9_.-]{1,512}$/.test(value.token) || (value.expiresAt !== undefined && !Number.isFinite(value.expiresAt))) throw new ClientError("The saved credential is invalid. Sign in again.");
  return value.expiresAt !== undefined && value.expiresAt <= Date.now() ? null : value;
}
export async function saveCredential(vault: Vault, value: Credential): Promise<void> {
  try { await vault.set({ ...slot, value: JSON.stringify(value), persist: "local" }); }
  catch { throw new ClientError("Credential could not be saved securely. It remains in memory only; no plaintext file was created."); }
}
export async function forgetCredential(vault: Vault): Promise<void> {
  try { await vault.delete(slot); } catch { throw new ClientError("Could not remove the local credential. Check your OS credential store."); }
}
