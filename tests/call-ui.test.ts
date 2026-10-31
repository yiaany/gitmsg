import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("call surface has measured controls without technical marketing captions", () => {
  const panel = readFileSync("src/components/audio-call-panel.tsx", "utf8");
  const css = readFileSync("src/components/audio-call.css", "utf8");
  for (const caption of ["Git exchanges", "Audio travels directly", "Direct WebRTC", "No TURN relay", "Some networks cannot connect"]) assert.equal(panel.includes(caption), false);
  for (const action of ["Mute microphone", "Unmute microphone", "Minimize call", "Toggle fullscreen"]) assert.ok(panel.includes(action));
  assert.match(css, /width: 48px; height: 48px/); assert.ok(css.includes("#ff595a")); assert.match(css, /560px/); assert.match(css, /680px/);
  const messenger = readFileSync("src/components/messenger.tsx", "utf8");
  assert.match(messenger, /<h3>Calls<\/h3>/); assert.ok(messenger.includes("IP addresses"));
  assert.equal(messenger.includes("call-privacy"), false);
});

test("API call writes retain direct-room/default-branch and encryption enforcement", () => {
  const route = readFileSync("src/app/api/chat/route.ts", "utf8");
  assert.ok(route.includes("callableRoom(room, session.user)"));
  assert.ok(route.includes("event.call.to !== room.peer!.id"));
  assert.ok(route.includes("input.branch !== repository.default_branch"));
  assert.ok(route.includes("event.sealed.keyId !== policy.keyId"));
  assert.ok(route.includes("actor: session.user"));
  assert.ok(route.includes("storeEvent(session, input.repo, input.branch, event)"));
});
