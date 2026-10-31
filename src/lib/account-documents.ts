import { LIBRARY_MARKER, PROFILE_MARKER } from "./github-models";

export type DocumentKind = "profile" | "settings";
export class AccountDocumentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Request = (path: string, init?: RequestInit) => Promise<Response>;
type Account = { owner: string; request: Request };
const github = (account: Account, path: string, init?: RequestInit) => account.request(path, init);
const HttpError = AccountDocumentError;
const config = { profile: { name: "gitmsg-profile", marker: PROFILE_MARKER, private: false }, settings: { name: "gitmsg-settings", marker: LIBRARY_MARKER, private: true } };

export async function readAccountDocument(session: Account, kind: DocumentKind, owner = session.owner): Promise<{ value: unknown; sha?: string; branch?: string }> {
  const spec = config[kind];
  try {
    const repo = await (await github(session, `/repos/${owner}/${spec.name}`)).json();
    if (!repo.description?.includes(spec.marker) || repo.private !== spec.private) throw new HttpError(409, `${spec.name} already exists but is not a gitmsg ${kind} repository. No existing files were changed.`);
    const file = await (await github(session, `/repos/${owner}/${spec.name}/contents/gitmsg/${kind}.json?ref=${encodeURIComponent(repo.default_branch)}`)).json();
    if (file.size > 500000 || typeof file.content !== "string") throw new HttpError(409, "Invalid account document.");
    let value;
    try { value = JSON.parse(Buffer.from(file.content, "base64").toString("utf8")); }
    catch { throw new HttpError(409, "Malformed account document; refusing to overwrite it."); }
    if (value?.app !== "gitmsg" || value?.version !== 1 || (kind === "settings" ? !Array.isArray(value.rooms) : !value.profile || typeof value.profile !== "object" || Array.isArray(value.profile))) throw new HttpError(409, "Unrecognized account document; refusing to overwrite it.");
    return { value, sha: file.sha, branch: repo.default_branch };
  } catch (error) { if (error instanceof AccountDocumentError && error.status === 404) return { value: null }; throw error; }
}

/** Called only for explicit save/subscribe actions, never by sign-in or a GET. */
export async function writeAccountDocument(session: Account, kind: DocumentKind, update: (previous: unknown) => unknown) {
  const spec = config[kind];
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await readAccountDocument(session, kind);
    let branch = previous.branch;
    if (!branch) {
      try { const repo = await (await github(session, `/repos/${session.owner}/${spec.name}`)).json();
        if (!repo.description?.includes(spec.marker) || repo.private !== spec.private) throw new HttpError(409, `Refusing to change existing ${spec.name}.`);
        branch = repo.default_branch;
      } catch (error) {
        if (!(error instanceof AccountDocumentError) || error.status !== 404) throw error;
        try { const repo = await (await github(session, "/user/repos", { method: "POST", body: JSON.stringify({ name: spec.name, description: `${spec.marker} gitmsg ${kind === "profile" ? "public profile. Published explicitly by its owner." : "private chat list and channel subscriptions."}`, private: spec.private, auto_init: true }) })).json(); branch = repo.default_branch; }
        catch (creation) { if (creation instanceof AccountDocumentError && creation.status === 422 && attempt < 2) continue; throw creation; }
      }
    }
    const value = update(previous.value);
    const content = JSON.stringify({ ...value as object, app: "gitmsg", version: 1 }, null, 2);
    if (Buffer.byteLength(content) > 500000) throw new HttpError(400, "Account document is too large. Remove some entries before saving.");
    try {
      await github(session, `/repos/${session.owner}/${spec.name}/contents/gitmsg/${kind}.json`, { method: "PUT", body: JSON.stringify({ branch, ...(previous.sha ? { sha: previous.sha } : {}), message: `chore(gitmsg): update ${kind}`, content: Buffer.from(content).toString("base64") }) });
      return value;
    } catch (error) { if (error instanceof AccountDocumentError && [409, 422].includes(error.status) && attempt < 2) continue; throw error; }
  }
  throw new HttpError(409, "Account changed on another device. Please retry.");
}
