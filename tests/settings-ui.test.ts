import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AccountSettings } from "../src/components/account-settings";
import { parseGitHubProfile, parseProfileMusic } from "../src/lib/github-models";

test("favorite music is bounded, HTTPS-only profile metadata, not an embedded player", () => {
  const music = { title: "Track", artist: "Artist", url: "https://music.example/track" };
  assert.deepEqual(parseGitHubProfile({ music }).music, music);
  for (const url of ["javascript:alert(1)", "data:text/html,bad", "http://music.example", "https://name:secret@music.example", "not a URL"]) assert.equal(parseProfileMusic({ ...music, url }), undefined);
  assert.equal(parseProfileMusic({ ...music, title: "" }), undefined);
  assert.equal(parseProfileMusic({ ...music, title: "x".repeat(200) })?.title.length, 100);
});

test("settings use grouped functional rows without fabricated Telegram account services", () => {
  const html = renderToStaticMarkup(createElement(AccountSettings, {
    actor: { id: 1, login: "octocat" }, profile: parseGitHubProfile({ name: "Name", bio: "Bio", music: { title: "Track", artist: "Artist", url: "https://music.example/track" } }),
    sound: true, query: null, onQuery() {}, onEdit() {}, onSound() {}, onSaved() {}, onHelp() {}, onConnect() {},
  }));
  assert.match(html, /settings-hero/);
  assert.match(html, /settings-group/);
  assert.match(html, /role="switch" aria-checked="true"/);
  assert.match(html, /href="https:\/\/music.example\/track"/);
  assert.doesNotMatch(html, /Telegram Premium|Birthday|Phone|last seen|Active Sessions|<audio|<iframe/);
});

test("settings search really filters available actions", () => {
  const html = renderToStaticMarkup(createElement(AccountSettings, { actor: { id: 1, login: "octocat" }, profile: parseGitHubProfile({}), sound: false, query: "notifications", onQuery() {}, onEdit() {}, onSound() {}, onSaved() {}, onHelp() {}, onConnect() {} }));
  assert.match(html, /Notifications/);
  assert.doesNotMatch(html, /General Settings|settings-hero/);
});

test("floating surfaces match the reference opacity, squircle corners and scale motion", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("src/app/theme.css"), /--floating-surface: #212121dd/);
  const css = read("src/app/messenger.css");
  assert.match(css, /corner-shape: squircle/);
  assert.match(css, /transform: scale\(\.85\)/);
  assert.match(css, /backdrop-filter: blur\(10px\)/);
  assert.match(read("src/components/chat-menu.tsx"), /Menu.SubmenuRoot/);
});
