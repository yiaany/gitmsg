import type { Message, Room } from "./protocol";

export function roomInitials(room: Room) {
  return room.name.split(/[-_\s]+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase() || "#";
}

export function messagePreview(message?: Message) {
  if (!message) return "No messages yet";
  if (message.locked) return "Encrypted message";
  if (message.deleted) return "Message hidden";
  if (message.text) return message.text;
  if (message.attachments?.some(file => file.mime.startsWith("audio/"))) return "Voice message";
  if (message.attachments?.some(file => file.mime.startsWith("image/"))) return "Photo";
  return message.attachments?.length ? "Attachment" : "Message";
}

export function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function isGrouped(previous: Message | undefined, current: Message) {
  const delta = previous ? Date.parse(current.createdAt) - Date.parse(previous.createdAt) : -1;
  return !!previous && previous.actor.id === current.actor.id && delta >= 0 && delta < 300000 && sameDay(previous.createdAt, current.createdAt);
}

export function dayLabel(value: string, now = new Date()) {
  if (sameDay(value, now.toISOString())) return "Today";
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(value, yesterday.toISOString())) return "Yesterday";
  return new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", ...(new Date(value).getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
