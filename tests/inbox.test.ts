import test from "node:test";
import assert from "node:assert/strict";
import { observeMessages, parseInboxReads } from "../src/lib/unread";
import type { ChatEvent } from "../src/lib/protocol";

const message = (id: string, actorId = 2): ChatEvent => ({ v: 1, id, kind: "message", text: "not stored in read receipts", actor: { id: actorId, login: `user${actorId}` }, createdAt: "2026-10-31T12:00:00.000Z" });
const first = message("message-first"), second = message("message-second");
test("first sync is a baseline; later incoming messages increment exactly once", () => {
  const baseline = observeMessages(undefined, [first], 1, false);
  assert.deepEqual(baseline.unread, []);
  const next = observeMessages(baseline, [first, second], 1, false);
  assert.deepEqual(next.unread, [second.id]);
  assert.deepEqual(observeMessages(next, [first, second, second], 1, false).unread, [second.id]);
  assert.equal(JSON.stringify(next).includes(first.text!), false);
});
test("own sends, edits, reactions and old history do not inflate unread counts", () => {
  const baseline = observeMessages(undefined, [first], 1, false);
  const own = message("message-myself", 1);
  const edit: ChatEvent = { ...message("edit-message"), kind: "edit", target: first.id };
  const reaction: ChatEvent = { ...message("react-message"), kind: "reaction", target: first.id, emoji: "❤️", active: true };
  assert.deepEqual(observeMessages(baseline, [message("older-message"), first, own, edit, reaction], 1, false).unread, []);
});
test("reading clears badges, deletion removes unread messages and reload preserves IDs", () => {
  const initial = observeMessages(observeMessages(undefined, [first], 1, false), [first, second], 1, false);
  const restored = parseInboxReads(JSON.parse(JSON.stringify({ "Owner/Chat": initial })))["owner/chat"];
  assert.deepEqual(restored.unread, [second.id]);
  assert.deepEqual(observeMessages(restored, [first, second], 1, true).unread, []);
  assert.deepEqual(observeMessages(restored, [first, second, { ...message("delete-event"), kind: "delete", target: second.id }], 1, false).unread, []);
});
test("Git order, not sender clocks, determines what is newly received", () => {
  const baseline = observeMessages(undefined, [first], 1, false);
  assert.deepEqual(observeMessages(baseline, [first, { ...second, createdAt: "2000-01-01T00:00:00Z", locked: true, text: undefined }], 1, false).unread, [second.id]);
});
test("read-state parser rejects malformed input and bounds local metadata", () => {
  assert.deepEqual(parseInboxReads(null), {});
  assert.deepEqual(parseInboxReads({ invalid: { seen: [first.id] } }), {});
  const parsed = parseInboxReads({ "owner/chat": { seen: Array.from({ length: 3000 }, (_, i) => `message-${i}`), unread: [second.id, second.id, "bad", {}] } });
  assert.equal(parsed["owner/chat"].seen.length, 2000);
  assert.deepEqual(parsed["owner/chat"].unread, [second.id]);
});
