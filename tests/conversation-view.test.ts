import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationList } from "../src/components/conversation-list";
import { dayLabel, isGrouped, messagePreview, roomInitials } from "../src/lib/conversation-view";
import { materialize, type ChatEvent } from "../src/lib/protocol";

const event: ChatEvent = { v: 1, id: "one", kind: "message", actor: { id: 1, login: "alex" }, createdAt: "2026-10-20T12:00:00Z", text: "Real preview" };
const message = materialize([event])[0];

test("previews respect locked and deleted content and attachment types", () => {
  assert.equal(messagePreview(message), "Real preview");
  assert.equal(messagePreview({ ...message, locked: true }), "Encrypted message");
  assert.equal(messagePreview({ ...message, deleted: true }), "Message hidden");
  assert.equal(messagePreview(), "No messages yet");
  assert.equal(messagePreview({ ...message, text: "", attachments: [{ id: "a", name: "v.webm", mime: "audio/webm", size: 3, sha256: "a".repeat(64) }] }), "Voice message");
});

test("grouping respects actor, day boundary and chronological order", () => {
  assert.equal(isGrouped(message, { ...message, createdAt: "2026-10-20T12:01:00Z" }), true);
  assert.equal(isGrouped(message, { ...message, createdAt: "2026-10-20T11:59:00Z" }), false);
  assert.equal(isGrouped(message, { ...message, actor: { id: 2, login: "sarah" } }), false);
  assert.equal(isGrouped(message, { ...message, createdAt: "2026-10-21T12:01:00Z" }), false);
  assert.equal(dayLabel("2026-10-20T12:00:00Z", new Date("2026-10-20T12:00:00Z")), "Today");
});

test("conversation list renders actual event previews without invented unread/presence", () => {
  const room = { id: "demo/chat", name: "Ship it", branch: "main", description: "", demo: true };
  assert.equal(roomInitials(room), "SI");
  const html = renderToStaticMarkup(createElement(ConversationList, { rooms: [room], active: room, timelines: { [room.id]: { events: [event] } }, onSelect() {}, onNew() {}, onMenu() {} }));
  assert.match(html, /aria-current="page"/);
  assert.match(html, /alex: /);
  assert.match(html, /Real preview/);
  assert.match(html, /Search chats/);
  assert.doesNotMatch(html, /online|unread|read receipt/);
});
