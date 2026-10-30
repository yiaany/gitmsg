import test from "node:test";
import assert from "node:assert/strict";
import { commitSubject, EVENT_PREFIX, eventPath, materialize, MAX_TEXT, mergeEvents, parseCommit, reconcileEvents, validEvent, validRepo, type ChatEvent } from "../src/lib/protocol";

const alice = { id: 1, login: "alice" };
const bob = { id: 2, login: "bob" };
const message: ChatEvent = { v: 1, id: "message-0001", kind: "message", actor: alice, text: "hello", createdAt: "2026-10-30T12:00:00.000Z" };
const event = (changes: Partial<ChatEvent>): ChatEvent => ({ ...message, id: "event-000002", ...changes });

test("repository names are constrained, not arbitrary API paths", () => {
  for (const name of ["octocat/chat", "my-org/gitmsg-after-hours", "alice/a.b_c"]) assert.equal(validRepo(name), true);
  for (const name of ["../secrets", "alice/..", "alice/.", "alice/chat/issues", "https://github.com/a/b", "alice/chat?x=y", "", "a/"]) assert.equal(validRepo(name), false, name);
});
test("valid messages and replies pass protocol validation", () => {
  assert.equal(validEvent(message), true);
  assert.equal(validEvent(event({ replyTo: message.id })), true);
});
test("untrusted protocol input is rejected", () => {
  for (const value of [null, {}, { ...message, v: 2 }, { ...message, id: 12345678 }, { ...message, id: "../../etc" }, { ...message, actor: { id: 0, login: "alice" } }, { ...message, actor: { id: 1, login: "<script>" } }, { ...message, createdAt: "tomorrow" }, { ...message, createdAt: "2026-99-99T00:00:00Z" }, { ...message, text: "   " }, { ...message, kind: "sudo" }, { ...message, replyTo: "x" }]) assert.equal(validEvent(value), false, JSON.stringify(value));
});
test("message length is bounded", () => {
  assert.equal(validEvent(event({ text: "x".repeat(MAX_TEXT) })), true);
  assert.equal(validEvent(event({ text: "x".repeat(MAX_TEXT + 1) })), false);
});
test("mutation events require target IDs and supported reactions", () => {
  assert.equal(validEvent(event({ kind: "edit", target: message.id })), true);
  assert.equal(validEvent(event({ kind: "delete", target: message.id })), true);
  assert.equal(validEvent(event({ kind: "edit" })), false);
  assert.equal(validEvent(event({ kind: "reaction", target: message.id, emoji: "🚀", active: true })), true);
  assert.equal(validEvent(event({ kind: "reaction", target: message.id, emoji: "💩" as never, active: true })), false);
  assert.equal(validEvent(event({ kind: "reaction", target: message.id, emoji: "🚀" })), false);
});
test("date-partitioned event paths never use message text or username", () => {
  assert.equal(eventPath(message), "events/2026/10/30/message-0001.json");
});
test("a protocol commit roundtrips with its real SHA and URL", () => {
  const value = parseCommit(`${commitSubject(message)}\n\n${EVENT_PREFIX}${JSON.stringify(message)}`, "abc123", "https://github.com/a/b/commit/abc123");
  assert.equal(value?.text, "hello"); assert.equal(value?.sha, "abc123");
});
test("ordinary commits and malformed protocol commits are ignored", () => {
  assert.equal(parseCommit("Update README", "x", ""), null);
  assert.equal(parseCommit(`${EVENT_PREFIX}{broken`, "x", ""), null);
  assert.equal(parseCommit(`${EVENT_PREFIX}{"v":1}`, "x", ""), null);
});
test("materialization preserves Git order, not untrusted client clocks", () => {
  const later = event({ createdAt: "2020-01-01T00:00:00Z", text: "second" });
  assert.deepEqual(materialize([message, later]).map(m => m.text), ["hello", "second"]);
});
test("duplicate message events do not duplicate bubbles", () => {
  assert.equal(materialize([message, message]).length, 1);
});
test("the author may edit a message", () => {
  const result = materialize([message, event({ kind: "edit", target: message.id, text: "fixed" })]);
  assert.equal(result[0].text, "fixed"); assert.equal(result[0].edited, true);
});
test("other participants cannot edit or delete someone else's message in the UI", () => {
  const result = materialize([message, event({ actor: bob, kind: "edit", target: message.id, text: "hijacked" }), event({ id: "event-delete", actor: bob, kind: "delete", target: message.id })]);
  assert.equal(result[0].text, "hello"); assert.equal(result[0].deleted, false);
});
test("deletion is a tombstone; later edits do not resurrect the text", () => {
  const result = materialize([message, event({ id: "event-delete", kind: "delete", target: message.id }), event({ kind: "edit", target: message.id, text: "resurrect" })]);
  assert.equal(result[0].deleted, true);
  assert.equal(result[0].text, "This message was reverted. Git remembers.");
});
test("reactions are per-person and idempotent", () => {
  const reaction = event({ kind: "reaction", actor: bob, target: message.id, emoji: "🚀", active: true });
  const result = materialize([message, reaction, { ...reaction, id: "event-again" }]);
  assert.equal(result[0].reactions["🚀"]?.length, 1);
});
test("reactions can be removed and re-added", () => {
  const reaction = event({ kind: "reaction", actor: bob, target: message.id, emoji: "🚀", active: true });
  assert.equal(materialize([message, reaction, { ...reaction, id: "event-remove", active: false }])[0].reactions["🚀"]?.length, 0);
  assert.equal(materialize([message, reaction, { ...reaction, id: "event-remove", active: false }, { ...reaction, id: "event-return" }])[0].reactions["🚀"]?.length, 1);
});
test("deleted messages cannot accumulate reactions", () => {
  const result = materialize([message, event({ kind: "delete", target: message.id }), event({ id: "event-react", kind: "reaction", target: message.id, emoji: "🚀", active: true })]);
  assert.deepEqual(result[0].reactions, {});
});
test("missing targets are safe and older history can fill them later", () => {
  const edit = event({ kind: "edit", target: message.id, text: "fixed" });
  assert.deepEqual(materialize([edit]), []);
  assert.equal(materialize([message, edit])[0].text, "fixed");
});
test("merging deduplicates incoming batches and upgrades commit metadata", () => {
  const result = mergeEvents([message], [{ ...message, sha: "abcdef" }, event({}), event({})]);
  assert.equal(result.length, 2); assert.equal(result[0].sha, "abcdef");
});
test("canonical sync fixes concurrent send order", () => {
  const other = event({ id: "message-other", text: "from another client" });
  const own = event({ id: "message-own1", text: "my optimistic send" });
  assert.deepEqual(reconcileEvents([message, own], [message, other, own]).map(e => e.id), [message.id, other.id, own.id]);
});
test("canonical sync retains a confirmed send not visible in the snapshot yet", () => {
  const own = event({ id: "message-own1" });
  assert.deepEqual(reconcileEvents([message, own], [message]).map(e => e.id), [message.id, own.id]);
});
test("history pagination puts older events before newer ones", () => {
  const next = event({});
  assert.deepEqual(mergeEvents([message, next], [next]).map(e => e.id), [message.id, next.id]);
});
test("a replayed mutation does not override a newer edit", () => {
  const first = event({ kind: "edit", target: message.id, text: "first edit" });
  const second = event({ id: "event-edit-2", kind: "edit", target: message.id, text: "second edit" });
  assert.equal(materialize([message, first, second, first])[0].text, "second edit");
});
