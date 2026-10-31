import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PROFILE, parseMutedRooms, parsePins, parseProfile, pinnedMessages, toggleMessagePin } from "../src/lib/view-preferences";
import { materialize } from "../src/lib/protocol";
import { ProfileSettings } from "../src/components/profile-settings";

test("profile preferences reject malformed data and bound local display text", () => {
  assert.deepEqual(parseProfile(null), DEFAULT_PROFILE);
  assert.deepEqual(parseProfile({ name: 10, bio: [], color: "url(https://example.com)" }), DEFAULT_PROFILE);
  assert.deepEqual(parseProfile({ name: " Alice ", bio: " hello ", color: "#123abc" }), { name: "Alice", bio: "hello", color: "#123abc" });
  assert.equal(parseProfile({ name: "a".repeat(100), bio: "b".repeat(300) }).name.length, 64);
  assert.equal(parseProfile({ bio: "b".repeat(300) }).bio.length, 160);
});

test("local pins contain bounded, unique message IDs, never message content", () => {
  for (const value of [null, 2, [], "invalid"]) assert.deepEqual(parsePins(value), {});
  assert.deepEqual(parsePins({ room: ["message-123", "message-123", {}, "secret plaintext"], bad: null }), { room: ["message-123"] });
  assert.equal(parsePins({ room: Array.from({ length: 120 }, (_, i) => `message-${i}`) }).room.length, 100);
});

test("muted rooms tolerate malformed storage and normalize case without storing content", () => {
  for (const value of [null, {}, "oops", 12]) assert.deepEqual(parseMutedRooms(value), []);
  assert.deepEqual(parseMutedRooms(["Alice/News", "alice/news", null, {}, "secret text", "../outside"]), ["alice/news"]);
  assert.equal(parseMutedRooms(Array.from({ length: 1100 }, (_, i) => `alice/room-${i}`)).length, 1000);
});

test("pin and unpin affect only the selected room without mutating previous state", () => {
  const pins = { first: ["message-111"], second: ["message-222"] };
  const next = toggleMessagePin(pins, "first", "message-333");
  assert.deepEqual(next.first, ["message-111", "message-333"]);
  assert.deepEqual(next.second, pins.second);
  assert.deepEqual(pins.first, ["message-111"]);
  assert.deepEqual(toggleMessagePin(next, "first", "message-111").first, ["message-333"]);
});

test("pinned navigation follows message order and excludes deleted, locked and unloaded targets", () => {
  const [message] = materialize([{ v: 1, id: "message-111", kind: "message", actor: { id: 1, login: "alice" }, createdAt: "2026-10-31T12:00:00Z", text: "hello" }]);
  const messages = [message, { ...message, id: "message-222", locked: true }, { ...message, id: "message-333", deleted: true }, { ...message, id: "message-444" }];
  assert.deepEqual(pinnedMessages(messages, ["message-444", "message-333", "message-222", "message-111", "missing-111"]).map(value => value.id), ["message-111", "message-444"]);
  assert.deepEqual(pinnedMessages(messages), []);
});

test("profile editor keeps GitHub identity separate and escapes user text", () => {
  const html = renderToStaticMarkup(createElement(ProfileSettings, { actor: { id: 1, login: "alice", avatar: "https://untrusted.example/avatar.png" }, profile: { ...DEFAULT_PROFILE, name: "<script>bad</script>" }, onSave() {} }));
  assert.match(html, /Display name/);
  assert.match(html, /@alice/);
  assert.match(html, /public gitmsg-profile repository/);
  assert.match(html, /readOnly=""/i);
  assert.match(html, /Save profile to GitHub/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|untrusted\.example/);
});
