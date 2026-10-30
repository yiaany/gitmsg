import { github, HttpError, type Session } from "./server";
import { commitSubject, EVENT_PREFIX, eventPath, type ChatEvent } from "./protocol";

export async function storeEvent(session: Session, repo: string, branch: string, event: ChatEvent): Promise<ChatEvent> {
  const path = eventPath(event);
  const payload = JSON.stringify({ branch, message: `${commitSubject(event)}\n\n${EVENT_PREFIX}${JSON.stringify(event)}`, content: Buffer.from(JSON.stringify(event, null, 2)).toString("base64") });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await (await github(session, `/repos/${repo}/contents/${path}`, { method: "PUT", body: payload })).json();
      return { ...event, sha: result.commit.sha, url: `https://github.com/${repo}/commit/${result.commit.sha}` };
    } catch (error) {
      if (!(error instanceof HttpError) || ![409, 422].includes(error.status)) throw error;
      try {
        const existing = await (await github(session, `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`)).json();
        const stored = JSON.parse(Buffer.from(existing.content, "base64").toString());
        if (JSON.stringify(stored) === JSON.stringify(event)) return event;
        throw new HttpError(409, "This event ID already exists. Refresh before sending again.");
      } catch (lookup) { if (!(lookup instanceof HttpError) || lookup.status !== 404) throw lookup; }
      if (attempt === 2 || error.status === 422) throw error;
      await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt + Math.random() * 200));
    }
  }
  throw new HttpError(409, "The branch moved too quickly. Please retry.");
}
