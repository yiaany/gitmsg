import type { Message } from "./protocol";

/** Only materialized, readable messages contribute to a room's shared content. */
export function sharedContent(messages: Message[]) {
  const available = messages.filter(message => !message.deleted && !message.locked);
  const attachments = [...new Map(available.flatMap(message => message.attachments || []).map(attachment => [attachment.id, attachment])).values()];
  const links = [...new Set(available.flatMap(message => message.text.match(/https?:\/\/[^\s<>]+/g) || []).map(url => url.replace(/[.,;!?)\]]+$/, "")))];
  return {
    media: attachments.filter(attachment => attachment.mime.startsWith("image/")),
    files: attachments.filter(attachment => !attachment.mime.startsWith("image/")),
    links: links.filter(url => { try { return !!new URL(url).hostname; } catch { return false; } }),
  };
}
