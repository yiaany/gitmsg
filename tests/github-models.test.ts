import test from "node:test";
import assert from "node:assert/strict";
import { CHANNEL_MARKER, CHANNEL_TITLE_MARKER, libraryRooms, parseGitHubProfile, repositoryRoom, validDiscoveryQuery, validLogin, validProfileAvatar } from "../src/lib/github-models";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationList } from "../src/components/conversation-list";
import { LoginScreen } from "../src/components/login-screen";

const repo = { full_name: "alice/gitmsg-channel-news", name: "gitmsg-channel-news", description: `${CHANNEL_MARKER} News`, default_branch: "main", private: false };
test("public channel mapping never invents publishing access", () => {
  assert.deepEqual(repositoryRoom(repo), { id: repo.full_name, name: "news", description: "News", branch: "main", private: false, kind: "channel", canWrite: false });
  assert.equal(repositoryRoom({ ...repo, permissions: { push: true } }).canWrite, true);
  assert.equal(repositoryRoom({ ...repo, private: true }).kind, "chat");
  assert.equal(repositoryRoom({ ...repo, description: "unmarked" }).kind, "chat");
  assert.equal(repositoryRoom({ ...repo, name: "unrelated" }).kind, "chat");
});
test("GitHub library normalizes, deduplicates and rejects legacy demos or invalid paths", () => {
  const room = repositoryRoom(repo);
  assert.deepEqual(libraryRooms([null, {}, { ...room, demo: true }, { ...room, id: "../bad" }, { ...room, branch: "" }]), []);
  const rooms = libraryRooms([room, { ...room, id: room.id.toUpperCase(), name: "new" }]);
  assert.equal(rooms.length, 1); assert.equal(rooms[0].name, "new");
  assert.equal(libraryRooms(null).length, 0);
});
test("profile avatars validate encoding, signatures and size without throwing", () => {
  const png = `data:image/png;base64,${Buffer.from("\x89PNG\r\n\x1a\n", "latin1").toString("base64")}`;
  assert.equal(validProfileAvatar(png), true);
  for (const value of [null, "data:image/png;base64,A", "data:image/png;base64,AAAA=", "data:image/svg+xml;base64,AAAA", "https://example.com/a.png", "data:image/png;base64,SGVsbG8=", `data:image/png;base64,${"A".repeat(350000)}`]) assert.equal(validProfileAvatar(value), false);
  assert.equal(parseGitHubProfile({ avatar: png }).avatar, png);
  assert.equal(parseGitHubProfile({ avatar: "javascript:bad" }).avatar, undefined);
  assert.equal("login" in parseGitHubProfile({ name: "Alice", login: "forged" }), false);
});
test("usernames disallow API path and search injection", () => {
  assert.equal(validLogin("octo-cat"), true);
  for (const value of [null, "@alice", "alice/repo", "a?x=y", "a b", "a".repeat(40)]) assert.equal(validLogin(value), false);
});
test("channel discovery accepts display titles without allowing GitHub query qualifiers", () => {
  for (const query of ["news", "Новости канала", "Café friends", "octo-cat"]) assert.equal(validDiscoveryQuery(query), true);
  for (const query of ["a", "alice/repo", "a?x=y", "news is:private", "a\nrepo", "x".repeat(65)]) assert.equal(validDiscoveryQuery(query), false);
  const channel = repositoryRoom({ ...repo, description: `${CHANNEL_MARKER} ${CHANNEL_TITLE_MARKER} Новости канала` });
  assert.equal(channel.name, "Новости канала"); assert.equal(channel.description, ""); assert.equal(channel.kind, "channel");
});
test("empty conversation list has neither automatic folders nor account avatar", () => {
  const html = renderToStaticMarkup(createElement(ConversationList, { rooms: [], active: repositoryRoom(repo), timelines: {}, onSelect() {}, onNew() {}, onMenu() {} }));
  assert.match(html, /Search chats/); assert.match(html, /Start a conversation/);
  assert.doesNotMatch(html, /conversation-tabs|list-account|local demo|simulated replies/);
});
test("entry links to OAuth only when configured and never offers anonymous demo", () => {
  const html = renderToStaticMarkup(createElement(LoginScreen, { session: { configured: true, mode: "oauth" }, onRetry() {} }));
  assert.match(html, /href="\/api\/auth\/login"/); assert.match(html, /Sign in with GitHub/);
  assert.doesNotMatch(html, /Continue in demo|Connect your Telegram/);
  const unconfigured = renderToStaticMarkup(createElement(LoginScreen, { session: { configured: false, mode: "app" }, onRetry() {} }));
  assert.match(unconfigured, /disabled/); assert.doesNotMatch(unconfigured, /href="\/api\/auth\/login"/);
});
