import { github, HttpError, type Session } from "./server";
import { AccountDocumentError, readAccountDocument as read, writeAccountDocument as write, type DocumentKind } from "./account-documents";

function account(session: Session) {
  return { owner: session.user.login, request: async (path: string, init?: RequestInit) => {
    try { return await github(session, path, init); }
    catch (error) { if (error instanceof HttpError) throw Object.assign(new AccountDocumentError(error.status, error.message), { retryAfter: error.retryAfter }); throw error; }
  } };
}
async function result<T>(operation: Promise<T>): Promise<T> {
  try { return await operation; }
  catch (error) { if (error instanceof AccountDocumentError) throw new HttpError(error.status, error.message, (error as AccountDocumentError & { retryAfter?: number }).retryAfter); throw error; }
}
export function readAccountDocument(session: Session, kind: DocumentKind, owner = session.user.login) { return result(read(account(session), kind, owner)); }
export function writeAccountDocument(session: Session, kind: DocumentKind, update: (previous: unknown) => unknown) { return result(write(account(session), kind, update)); }
