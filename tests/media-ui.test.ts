import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MediaMessage } from "../src/components/media-message";
import type { Attachment, Room } from "../src/lib/protocol";

const room: Room = { id: "owner/chat", name: "chat", description: "", branch: "main" };
const attachment: Attachment = { id: "attachment-legacy", name: "drawing.excalidraw", mime: "application/vnd.excalidraw+json", size: 100, sha256: "a".repeat(64) };

test("legacy drawings and generic files offer click-to-load downloads, not a board or audio player", () => {
  for (const mime of [attachment.mime, "application/octet-stream"]) {
    const html = renderToStaticMarkup(createElement(MediaMessage, { room, attachment: { ...attachment, mime } }));
    assert.match(html, /Load drawing\.excalidraw/);
    assert.doesNotMatch(html, /<audio|<img|Whiteboard|board-message|href=/);
  }
});

test("image and voice attachments retain their click-to-load controls", () => {
  const render = (mime: string) => renderToStaticMarkup(createElement(MediaMessage, { room, attachment: { ...attachment, mime } }));
  assert.match(render("image/webp"), /Load image/);
  assert.match(render("audio/webm"), /Voice note/);
  assert.match(render("audio/webm"), /aria-label="Play audio"/);
  assert.match(render("audio/webm"), /voice-message-wave/);
  assert.doesNotMatch(render("audio/webm"), /<audio[^>]*controls|Load voice|Download/);
});

test("short and long voice notes use bounded waveform lanes without eager media loading", () => {
  for (const [duration, width] of [[1, 180], [60, 357]]) {
    const html = renderToStaticMarkup(createElement(MediaMessage, { room, attachment: { ...attachment, name: "voice.webm", mime: "audio/webm", duration, waveform: Array(48).fill(16) } }));
    assert.match(html, new RegExp(`width:${width}px`));
    assert.match(html, /preload="none"/);
    assert.doesNotMatch(html, /src=|controls=/);
    assert.equal((html.match(/<i style=/g) || []).length, 40);
  }
});

test("whiteboard UI, dependency, adapters and assets are removed", () => {
  for (const file of ["src/components/messenger.tsx", "src/components/media-message.tsx", "src/app/messenger.css", "next.config.ts", "package.json", "package-lock.json"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), /[Ee]xcalidraw|[Ww]hiteboard|PencilRuler|\bonBoard\b|board-modal/, file);
  }
  for (const file of ["src/components/whiteboard.tsx", "public/excalidraw", "scripts/package-assets.mjs", "scripts/excalidraw-local-fonts.cjs"]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  }
});
