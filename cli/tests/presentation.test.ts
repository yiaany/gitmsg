import test from "node:test";
import assert from "node:assert/strict";
import { blend, conversationName, easeOut } from "../src/presentation";

test("chat labels hide generated storage identifiers without hiding custom titles", () => {
  for (const title of [undefined, "", "chat-c85", "gitmsg-chat-abc123", "room-72e84b", "conversation-a12"]) assert.equal(conversationName(title), "Conversation");
  assert.equal(conversationName("after-hours"), "after-hours");
  assert.equal(conversationName("Weekend plans"), "Weekend plans");
  assert.equal(conversationName("chat-c85", "octocat"), "@octocat");
  assert.equal(conversationName("\x1b[31mFriends"), "Friends");
});

test("motion interpolation clamps endpoints and eases monotonically", () => {
  assert.equal(blend("#343440", "#b39aff", 0), "#343440");
  assert.equal(blend("#343440", "#b39aff", 1), "#b39aff");
  assert.equal(blend("#343440", "#b39aff", 9), "#b39aff");
  assert.equal(easeOut(-1), 0); assert.equal(easeOut(2), 1);
  let previous = 0;
  for (let i = 0; i <= 60; i++) { const value = easeOut(i / 60); assert.ok(value >= previous); previous = value; }
});
