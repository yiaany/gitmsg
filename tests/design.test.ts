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
  for (const name of ["command-button.tsx", "particle-button.tsx", "slide-text-button.tsx"]) {
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
