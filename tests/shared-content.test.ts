import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sharedContent } from "../src/lib/shared-content";
import type { Attachment, Message } from "../src/lib/protocol";
import { RoomInfo } from "../src/components/room-info";

const attachment = (id: string, mime: string): Attachment => ({ id, mime, name: id, size: 10, sha256: "a".repeat(64) });
const message = (overrides: Partial<Message> = {}): Message => ({ id: "message-123", actor: { id: 1, login: "friend" }, text: "", createdAt: "2026-10-31T00:00:00Z", edited: false, deleted: false, reactions: {}, ...overrides });

test("shared content separates photo tiles from audio/files and deduplicates attachments", () => {
  const photo = attachment("photo-123", "image/png"), audio = attachment("audio-123", "audio/webm"), file = attachment("file-1234", "application/octet-stream");
  const result = sharedContent([message({ attachments: [photo, audio, file] }), message({ attachments: [photo] })]);
  assert.deepEqual(result.media, [photo]);
  assert.deepEqual(result.files, [audio, file]);
});

test("deleted and locked history cannot leak attachments or links through profile tabs", () => {
  const secret = { attachments: [attachment("secret-12", "image/png")], text: "https://private.example" };
  assert.deepEqual(sharedContent([message({ ...secret, deleted: true }), message({ ...secret, locked: true })]), { media: [], files: [], links: [] });
});

test("shared links reject malformed URLs, strip sentence punctuation and deduplicate", () => {
  assert.deepEqual(sharedContent([message({ text: "https://github.com, https://github.com. https:// https://[broken javascript:alert(1)" })]).links, ["https://github.com"]);
});

test("existing peer profile opens as User Info, not a new-chat invitation", () => {
  const html = renderToStaticMarkup(createElement(RoomInfo, { room: { id: "owner/chat", name: "Friend", description: "Bio", branch: "main", peer: { id: 1, login: "friend" } }, messages: [], encrypted: false, subscribed: true, muted: false, busy: false, onClose() {}, onSecurity() {}, onLeave() {}, onToggleMute() {} }));
  assert.match(html, /User Info/);
  assert.match(html, /href="https:\/\/github.com\/friend"/);
  assert.match(html, /role="switch" aria-checked="true"/);
  assert.match(html, /No media here yet/);
  assert.doesNotMatch(html, /Start chat|collaborator invitation/);
});

test("feed scrolling stays inside the feed and the empty log cannot add a second viewport", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.doesNotMatch(read("src/components/messenger.tsx"), /scrollIntoView/);
  assert.match(read("src/app/messenger.css"), /\.message-feed\.is-empty \.messages \{ min-height: 0; height: 0;/);
  assert.match(read("src/app/messenger.css"), /\.sidebar \{ position: absolute; inset: 0;.*border-radius: 0;/);
});
