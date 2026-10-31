import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { LoginScreen } from "../src/components/login-screen";
import { WelcomeChannel } from "../src/components/welcome-channel";
import { ConversationList } from "../src/components/conversation-list";

test("manifest has English GitHub entry, white emphasis and no footer", () => {
  const html = renderToStaticMarkup(createElement(LoginScreen, { session: { configured: true, mode: "oauth" }, onRetry() {} }));
  assert.match(html, /href="\/api\/auth\/login"/);
  assert.ok(html.indexOf("Sign in with GitHub") < html.indexOf("Some things should exist"));
  assert.match(html, /<strong>/);
  assert.match(html, /GitHub can read standard messages/);
  assert.doesNotMatch(html, /[А-Яа-яЁё]|<footer|manifest-purple|manifest-green/);
});
test("unconfigured sign-in cannot link to a broken OAuth flow", () => {
  const html = renderToStaticMarkup(createElement(LoginScreen, { session: { configured: false, mode: "oauth" }, onRetry() {} }));
  assert.match(html, /disabled/); assert.match(html, /href="\/setup"/);
  assert.doesNotMatch(html, /href="\/api\/auth\/login"/);
});
test("manifest links to source independently of sign-in configuration", () => {
  for (const session of [null, { configured: false, mode: "oauth" }, { configured: true, mode: "oauth" }]) {
    const html = renderToStaticMarkup(createElement(LoginScreen, { session, onRetry() {} }));
    assert.match(html, /<a class="manifest-source" href="https:\/\/github\.com\/yiaany\/gitmsg" target="_blank" rel="noopener noreferrer">/);
    assert.match(html, /View source on GitHub/);
  }
});
test("welcome uses English message bubbles without explanatory labels or fake receipts", () => {
  const html = renderToStaticMarkup(createElement(WelcomeChannel, { onBack() {}, onNew() {} }));
  assert.match(html, /Getting started/);
  assert.equal((html.match(/class="message group-end guide-message"/g) || []).length, 7);
  assert.match(html, /A link alone doesn’t grant access/);
  assert.match(html, /Room security/);
  assert.doesNotMatch(html, /role="log"|Committed|last seen|[А-Яа-яЁё]|not a conversation|not a message|guide-post/);
});
test("chat list shows actual previews and accessible unread badges", () => {
  const room = { id: "owner/chat", name: "A friend", branch: "main", description: "" };
  const html = renderToStaticMarkup(createElement(ConversationList, { rooms: [room], active: { ...room, id: "" }, unread: { "owner/chat": 2 }, timelines: { "owner/chat": { events: [{ v: 1, id: "message-unread", kind: "message", actor: { id: 2, login: "friend" }, text: "New hello", createdAt: "2026-10-31T12:00:00Z" }] } }, onSelect() {}, onNew() {}, onMenu() {} }));
  assert.match(html, /New hello/); assert.match(html, /aria-label="2 unread messages"/);
});
test("draft proposal action is removed and photo sending requires confirmation", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.doesNotMatch(read("src/components/messenger.tsx"), /Propose current draft|async function propose\(/);
  assert.match(read("src/components/media-composer.tsx"), /setPhoto\(file\)/);
  assert.match(read("src/components/photo-preview.tsx"), /Nothing is uploaded until you press Send/);
});
