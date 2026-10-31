import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CommandButton from "../src/components/kokonutui/command-button";
import ParticleButton from "../src/components/kokonutui/particle-button";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path: string) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
const sources = JSON.parse(read("src/components/kokonutui/sources.json"));

test("downloaded Kokonut UI sources retain pinned provenance, authors and original license", () => {
  assert.match(sources.commit, /^[a-f0-9]{40}$/);
  for (const name of ["command-button.tsx", "particle-button.tsx"]) {
    assert.match(read(`src/components/kokonutui/${name}`), /@license: MIT/);
    assert.match(read(`src/components/kokonutui/${name}`), /@github: https:\/\/github.com\/kokonut-labs\/kokonutui/);
  }
  for (const [path, sha] of [["src/components/kokonutui/loader.tsx", sources.originalFiles["components/kokonutui/loader.tsx"]], ["src/components/kokonutui/LICENSE", sources.originalFiles.LICENSE]]) assert.equal(hash(path), sha);
  for (const font of sources.fonts) assert.equal(hash(font.path), font.sha256);
});

test("search is a real command button, and send stays in controlled real form state", () => {
  const search = renderToStaticMarkup(createElement(CommandButton, { global: false }, "Search messages"));
  assert.match(search, /aria-keyshortcuts="Meta\+K"/);
  assert.match(search, /<button/);
  const pending = renderToStaticMarkup(createElement(ParticleButton, { status: "pending", type: "submit", pendingLabel: "Committing", disabled: true }, "Send"));
  assert.match(pending, /type="submit"/);
  assert.match(pending, /aria-busy="true"/);
  assert.match(pending, /disabled/);
  assert.match(read("src/components/messenger.tsx"), /status=\{sending \? "pending" : "idle"\}/);
});

test("motion honors user preference without a continuous background render loop", () => {
  assert.match(read("src/components/motion-provider.tsx"), /reducedMotion="user"/);
  assert.match(read("src/app/theme.css"), /prefers-reduced-motion: reduce/);
  assert.match(read("src/components/kokonutui/command-button.tsx"), /event\.isComposing \|\| event\.defaultPrevented/);
  const messenger = read("src/components/messenger.tsx");
  assert.doesNotMatch(messenger, /requestAnimationFrame/);
  assert.doesNotMatch(messenger, /behavior: "smooth"/);
  assert.match(messenger, /behavior: reduceMotion \? "instant" : "smooth"/);
  const intervals = messenger.split("\n").filter(line => /setInterval\(/.test(line));
  assert.equal(intervals.length, 1, "only the existing one-second send cooldown timer is allowed");
  assert.match(intervals[0], /setInterval\(\(\) => setCooldown\(.+, 1000\)/);
});

test("original wallpaper and Roboto retain source provenance and appropriate licenses", () => {
  assert.match(read("docs/TELEGRAM_DESIGN.md"), /6002824b6532f3d913997ce496d9ab5f9b86bc22/);
  assert.match(read("public/chat-pattern.svg"), /Original gitmsg artwork/);
  assert.match(read("public/chat-pattern.svg"), /MIT/);
  assert.doesNotMatch(read("src/app/messenger.css"), /telegram-pattern/);
  assert.match(read("public/fonts/Roboto-LICENSE.txt"), /Apache License/);
  assert.match(read("LICENSE"), /^MIT License/);
  const fonts = {
    "Roboto-Regular-latin.woff2": "5d1bc9b443f3f81fa4b4ad4634c1bb9702194c1898e3a9de0ab5e2cdc0e9f479",
    "Roboto-Regular-cyrillic.woff2": "daf6c28c5a080458eba26ba64a95b1fcff823944d429ccb84e8a4f3a0baf05ca",
    "Roboto-Medium-latin.woff2": "ce897833ac6e362df7c91ac8223fe511c6defcf33964928a81004600a2dd4c2e",
    "Roboto-Medium-cyrillic.woff2": "af2fdef955568dc79de38bfb097d53586855945811b638d6c41513bd62e25cc4",
  };
  for (const [name, expected] of Object.entries(fonts)) assert.equal(hash(`public/fonts/${name}`), expected);
});

test("floating creation and reader channel actions follow the measured reference", () => {
  const css = read("src/app/messenger.css"), messenger = read("src/components/messenger.tsx");
  assert.match(css, /\.sidebar:hover \.new-conversation/);
  assert.match(css, /\.sidebar:focus-within \.new-conversation/);
  assert.match(css, /@media \(hover: none\)/);
  assert.doesNotMatch(messenger, /Your words\. Your repositories\.|Subscribe to channel|Only channel publishers can post/);
  assert.match(messenger, /Join Channel/);
  assert.match(messenger, /Open channel info/);
  assert.match(read("src/components/room-info.tsx"), /role="tablist"/);
  assert.match(read("src/components/room-info.tsx"), /ArrowLeft.*ArrowRight.*Home.*End/);
});
