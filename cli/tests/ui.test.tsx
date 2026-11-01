import { expect, spyOn, test } from "bun:test";
import { createTestRenderer as createRenderer, ManualClock, type TestRendererOptions } from "@opentui/core/testing";
import { ASCIIFontRenderable, BoxRenderable, SelectRenderable, TextareaRenderable, NativeImage, RGBA, Audio, type Renderable } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { act } from "react";
import { App as Messenger, type AppProps } from "../src/app";
import { ChatRow, FocusFrame, MessageBubble, Reveal } from "../src/motion";
import { GitHub, type Fetch } from "../src/github";
import { Rooms } from "../src/rooms";
import type { Vault } from "../src/credentials";
import { EVENT_PREFIX } from "../../src/lib/protocol";
import { ChatImage, checkImage, ImageLightbox, ImageView } from "../src/image-view";
import { pngImage } from "./fixtures";
import { HELP } from "../src/commands";
import { THEMES } from "../src/themes";
import { ClientError } from "../src/safety";
import { memoryImage } from "../src/images";
import type { History, TerminalRoom } from "../src/rooms";
import { subscribeImages } from "../src/image-input";
import { memoryVoice, voiceWav } from "../src/voice-data";
import type { VoiceDriver, VoiceUpdate } from "../src/voice";
import { exportKey } from "../../src/lib/room-crypto";
import { messageCopyTargets } from "../src/clipboard-targets";
import { terminalText } from "../src/safety";
import { CallPanel, callDuration } from "../src/call-view";
import type { TerminalCallView } from "../src/calls";
import type { CallDeviceFactory, CallLevels } from "../src/call-device";
import { nativeCallDevice } from "../src/call-native";

const vault: Vault = { get: async () => null, set: async () => {}, delete: async () => true };
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const createTestRenderer = (options: TestRendererOptions) => createRenderer({ ...options, exitOnCtrlC: false, kittyKeyboard: true });
const noBackup = async () => null;
const App = (props: AppProps) => <Messenger readKeyBackup={noBackup} {...props} reducedMotion />;
function fixture(ids: string[] = [], participants?: string[]) {
  const requests: { path: string; method: string; data?: any }[] = [];
  const messages = new Map<string, { sha: string; html_url: string; commit: { message: string } }[]>();
  const media = new Map<string, Uint8Array>();
  const policies = new Map<string, unknown>();
  const file = (data: unknown) => ({ type: "file", encoding: "base64", content: Buffer.from(JSON.stringify(data)).toString("base64"), size: 100 });
  const repository = (id: string) => ({ full_name: id, private: true, default_branch: "main", permissions: { push: true, admin: true } });
  const transport: Fetch = async (url, init) => {
    const path = new URL(String(url)).pathname, method = init?.method ?? "GET";
    const data = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path, method, data });
    const id = path.match(/^\/repos\/([^/]+\/[^/]+)/)?.[1] ?? "";
    let value: unknown = {};
    if (path === "/user") value = { id: 1, login: "alice" };
    else if (path === "/users/bob") value = { id: 2, login: "bob" };
    else if (path === "/user/repos") value = method === "GET" ? ids.map(repository) : repository(`alice/${data.name}`);
    else if (path === "/user/repository_invitations") value = [];
    else if (path === `/repos/${id}`) value = repository(id);
    else if (path.endsWith("/.gitmsg/room.json")) value = method === "GET" ? file({ schema: "gitmsg-room-v1", title: id.split("/")[1].replace(/^gitmsg-/, ""), ...(participants ? { participants } : {}) }) : { commit: { sha: "a".repeat(40) } };
    else if (path.endsWith("/commits")) value = messages.get(id) ?? [];
    else if (path.endsWith("/gitmsg/security.json")) {
      if (method === "PUT") { policies.set(id, JSON.parse(Buffer.from(data.content, "base64").toString())); value = { commit: { sha: "a".repeat(40) } }; }
      else if (policies.has(id)) value = file(policies.get(id));
      else return new Response("{}", { status: 404 });
    }
    else if (method === "PUT" && path.includes("/events/")) {
      const existing = messages.get(id) ?? [];
      existing.unshift({ sha: "b".repeat(40), html_url: "", commit: { message: data.message } }); messages.set(id, existing);
      value = { commit: { sha: "b".repeat(40) } };
    } else if (method === "PUT" && path.includes("/contents/media/")) {
      media.set(path, new Uint8Array(Buffer.from(data.content, "base64")));
      value = { commit: { sha: "c".repeat(40) } };
    } else if (method === "GET" && media.has(path)) value = { size: media.get(path)!.length, sha: "c".repeat(40) };
    else if (path.includes("/git/blobs/")) value = { encoding: "base64", content: Buffer.from([...media.values()][0]).toString("base64") };
    else if (path.includes("/collaborators/")) return new Response("{}", { status: 201 });
    else return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(value));
  };
  return { requests, messages, policies, service: new Rooms(new GitHub("fixture-token", transport)) };
}
async function type(setup: Awaited<ReturnType<typeof createTestRenderer>>, text: string) { await act(async () => { await setup.mockInput.typeText(text); }); }
async function enter(setup: Awaited<ReturnType<typeof createTestRenderer>>) { await act(async () => setup.mockInput.pressEnter()); }
async function key(setup: Awaited<ReturnType<typeof createTestRenderer>>, name: string, ctrl = false) {
  await act(async () => {
    if (name === "escape") setup.mockInput.pressEscape();
    else if (name === "backspace") setup.mockInput.pressBackspace();
    else if (name === "down" || name === "up" || name === "left" || name === "right") setup.mockInput.pressArrow(name);
    else if (name === "tab") setup.mockInput.pressTab();
    else setup.mockInput.pressKey(name, { ctrl });
  });
  // Flush the parser's standalone Escape without using fixed sleeps.
  if (name === "escape") await act(async () => { await setup.renderOnce(); });
}

test("native call negotiates before remote playback is ready and disposes local audio without opening real devices", async () => {
  let disposed = false, started = false, playbackStarted = false, rejectPlayback!: (error: Error) => void;
  const audio = spyOn(Audio, "create").mockImplementation(() => ({
    on() {},
    openCapture: async () => ({ dispose() {}, readable: new ReadableStream<Float32Array>() }),
    playStream: () => { playbackStarted = true; return new Promise((_, reject) => { rejectPlayback = reject; }); },
    start: () => { started = true; return true; },
    dispose: () => { disposed = true; rejectPlayback?.(new Error("Cancelled")); },
  }) as unknown as Audio);
  const device = nativeCallDevice(() => {});
  try {
    const stream = await device.microphone();
    expect(started).toBe(true); expect(playbackStarted).toBe(true);
    expect(stream.getAudioTracks()).toHaveLength(1);
    stream.getTracks()[0].stop(); expect(disposed).toBe(true);
  } finally { device.dispose(); audio.mockRestore(); }
});

test("call confirmation defaults to Cancel, preserves drafts and releases a pending microphone on hangup", async () => {
  const id = "alice/gitmsg-bob", f = fixture([id], ["alice", "bob"]), setup = await createTestRenderer({ width: 100, height: 30 });
  let opened = 0, disposed = 0;
  const callDevice: CallDeviceFactory = () => ({ microphone: () => { opened++; return new Promise(() => {}); }, peer: () => { throw new Error("No permission yet"); }, dispose: () => { disposed++; } });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={id} createRooms={() => f.service} callDevice={callDevice} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "unsent call draft");
    const clickCall = async () => { const button = setup.renderer.root.findDescendantById("call-button")!; await act(async () => { await setup.mockMouse.click(button.x + 1, button.y); }); await setup.waitForFrame(frame => frame.includes("Start audio call?")); };
    await clickCall(); expect(opened).toBe(0);
    await enter(setup); await setup.waitForFrame(frame => frame.includes("unsent call draft"));
    expect(opened).toBe(0); expect(f.requests.every(r => r.method === "GET")).toBe(true);
    await clickCall(); await key(setup, "down"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("PREPARING AUDIO")); expect(opened).toBe(1);
    await key(setup, "h"); await setup.waitForFrame(frame => frame.includes("CALL ENDED")); expect(disposed).toBe(1);
    expect(setup.captureCharFrame()).toContain("MIC OFF");
    await key(setup, "escape"); await setup.waitForFrame(frame => frame.includes("unsent call draft"));
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("unsent call draft");
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("incoming calls never open the microphone before Answer and Decline only writes an end signal", async () => {
  const id = "alice/gitmsg-bob", f = fixture([id], ["alice", "bob"]), setup = await createTestRenderer({ width: 80, height: 24 });
  const event = { v: 1, id: crypto.randomUUID(), kind: "call", actor: { id: 2, login: "bob" }, createdAt: new Date().toISOString(), call: { id: crypto.randomUUID(), to: 1, phase: "offer", expiresAt: new Date(Date.now() + 90000).toISOString(), sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fingerprint:sha-256 AA:BB\r\na=ice-ufrag:abcd\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=candidate:1 1 udp 2122260223 127.0.0.1 12345 typ host\r\n" } };
  f.messages.set(id, [{ sha: "d".repeat(40), html_url: "", commit: { message: `${EVENT_PREFIX}${JSON.stringify(event)}` } }]);
  let opened = 0;
  const callDevice: CallDeviceFactory = () => { opened++; throw new Error("Must not open input"); };
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={id} createRooms={() => f.service} callDevice={callDevice} />); });
    const frame = await setup.waitForFrame(frame => frame.includes("INCOMING CALL"));
    expect(frame).toContain("MIC OFF"); expect(frame).toContain("Answer"); expect(opened).toBe(0);
    const panel = setup.renderer.root.findDescendantById("call-panel")!;
    expect(panel.y + panel.height).toBeLessThanOrEqual(24);
    await key(setup, "h"); await setup.waitForFrame(frame => frame.includes("CALL ENDED"));
    await act(async () => { await setup.renderOnce(); });
    expect(opened).toBe(0);
    const writes = f.requests.filter(r => r.method === "PUT"); expect(writes).toHaveLength(1);
    expect(JSON.parse(Buffer.from(writes[0].data.content, "base64").toString()).call.phase).toBe("end");
  } finally { await act(async () => setup.dispose()); }
});

test("call ASCII panel shows real measured levels, connection phases, mute and frozen duration in compact layouts", async () => {
  const setup = await createTestRenderer({ width: 64, height: 24 }), root = createRoot(setup.renderer);
  let view: TerminalCallView = { room: { id: "alice/gitmsg-bob", branch: "main", name: "Bob", description: "", private: true, kind: "chat", peer: { id: 2, login: "bob" } }, id: "call-fixture", incoming: false, phase: "connecting", muted: false };
  let levels: CallLevels = { local: 0, remote: 0 }, ended = 0;
  const render = async () => { await act(async () => { root.render(<CallPanel view={view} levels={levels} width={60} compact reduced onAccept={() => {}} onEnd={() => { ended++; }} onMute={() => {}} onClose={() => {}} />); }); await act(async () => { await setup.renderOnce(); }); };
  try {
    await render(); expect(setup.captureCharFrame()).toContain("CONNECTING");
    const quiet = setup.captureCharFrame(); levels = { local: 1, remote: .5 }; await render();
    expect(setup.captureCharFrame().split("┃").length).toBeGreaterThan(quiet.split("┃").length);
    expect(setup.captureCharFrame()).toContain("▰▰▰▰▰▰▰▰▰▰▰▰");
    view = { ...view, phase: "connected", startedAt: Date.now() - 65000 }; await render();
    expect(setup.captureCharFrame()).toContain("CONNECTED"); expect(setup.captureCharFrame()).toContain("01:05");
    view = { ...view, muted: true }; await render(); expect(setup.captureCharFrame()).toContain("MIC MUTED");
    const button = setup.renderer.root.findDescendantById("call-end")!;
    await act(async () => { await setup.mockMouse.click(button.x + 1, button.y); }); expect(ended).toBe(1);
    view = { ...view, phase: "finished", endedAt: view.startedAt! + 67000 }; await render();
    expect(callDuration(view, Date.now() + 100000)).toBe("01:07"); expect(setup.captureCharFrame()).toContain("MIC OFF");
    const panel = setup.renderer.root.findDescendantById("call-panel")!;
    expect(panel.y + panel.height).toBeLessThanOrEqual(24);
  } finally { await act(async () => setup.dispose()); }
});

test("onboarding has no permanent navigation banners at 80 and 100 columns", async () => {
  for (const width of [80, 100]) {
    const setup = await createTestRenderer({ width, height: 28 });
    try {
      await act(async () => { createRoot(setup.renderer).render(<App vault={vault} />); });
      const frame = await setup.waitForFrame(frame => frame.includes("Connect your OAuth App"));
      expect(frame).toContain("Public Client ID"); expect(frame).toContain("Never enter a token");
      expect(frame).not.toContain("Ctrl+C"); expect(frame).not.toContain("Real messages.");
    } finally { await act(async () => setup.dispose()); }
  }
});

test("configured clients offer one-button GitHub sign-in instead of asking users to create apps", async () => {
  const setup = await createTestRenderer({ width: 100, height: 30 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialClientId="fixture-public-client" />); });
    const frame = await setup.waitForFrame(frame => frame.includes("Continue with GitHub"));
    expect(frame).not.toContain("Public Client ID"); expect(frame).toContain("repo + read:user");
  } finally { await act(async () => setup.dispose()); }
});

test("animated GitHub sign-in renders the device link and code, then cancels safely", async () => {
  const setup = await createTestRenderer({ width: 110, height: 36, targetFps: 60, maxFps: 60 });
  const transport = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (url: Parameters<typeof fetch>[0]) => {
    expect(String(url)).toBe("https://github.com/login/device/code");
    return new Response(JSON.stringify({ device_code: "fixture-device-code-00001", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 60 }));
  }, { preconnect: fetch.preconnect }));
  try {
    await act(async () => { createRoot(setup.renderer).render(<Messenger vault={vault} initialClientId="fixture-public-client" />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Continue with GitHub")); });
    await enter(setup);
    await act(async () => {
      const frame = await setup.waitForFrame(frame => frame.includes("Waiting for approval"));
      expect(frame).toContain("https://github.com/login/device");
      expect(frame).toContain("ABCD-1234");
      expect(frame).not.toContain("fixture-device-code-00001");
    });
    await key(setup, "escape");
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Continue with GitHub")); });
    expect(transport).toHaveBeenCalledTimes(1);
  } finally { await act(async () => setup.dispose()); transport.mockRestore(); }
});

test("GitHub login link opens the browser only on click or Enter and failures preserve authorization", async () => {
  const setup = await createTestRenderer({ width: 110, height: 36 });
  let opened = 0;
  const transport = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async () => new Response(JSON.stringify({ device_code: "fixture-device-code-00001", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 60 })), { preconnect: fetch.preconnect }));
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialClientId="fixture-public-client" openBrowser={async () => { opened++; if (opened === 3) throw new ClientError("Could not open your browser."); }} />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Continue with GitHub")); });
    await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Waiting for approval")); });
    expect(opened).toBe(0);
    const link = setup.renderer.root.findDescendantById("github-login-link")!;
    await act(async () => { await setup.mockMouse.click(link.x + 5, link.y); });
    expect(opened).toBe(1);
    await enter(setup); expect(opened).toBe(2);
    await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Could not open your browser.")); });
    expect(opened).toBe(3);
    await act(async () => {
      const frame = setup.captureCharFrame();
      expect(frame).toContain("ABCD-1234"); expect(frame).toContain("Waiting for approval");
      expect(frame).not.toContain("fixture-device-code-00001");
    });
    expect(transport).toHaveBeenCalledTimes(1);
    await key(setup, "escape");
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Continue with GitHub")); });
  } finally { await act(async () => setup.dispose()); transport.mockRestore(); }
});

test("creation defaults to cancel and only explicit confirmation writes a repository", async () => {
  const f = fixture(), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("Messages") && !frame.includes("MESSAGES"));
    await enter(setup); await setup.waitForFrame(frame => frame.includes("New conversation"));
    await type(setup, "test"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Create private chat?"));
    await enter(setup); await setup.waitForFrame(frame => frame.includes("New conversation"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
    await enter(setup); await setup.waitForFrame(frame => frame.includes("Create private chat?"));
    await key(setup, "down"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    expect(f.requests.filter(r => r.method === "POST")).toHaveLength(1);
    await type(setup, "hello from an isolated UI test"); await enter(setup);
    const frame = await setup.waitForFrame(frame => frame.includes("hello from an isolated UI test") && frame.includes("Sent"));
    expect(frame).not.toContain("fixture-token");
    expect(f.requests.filter(r => r.method === "PUT" && r.path.includes("/events/"))).toHaveLength(1);
    if (process.env.GITMSG_TEST_CHAT_FRAME) await Bun.write(process.env.GITMSG_TEST_CHAT_FRAME, frame);
  } finally { await act(async () => setup.dispose()); }
});

test("help is opened by a slash command, never committed, and focus returns to a clean composer", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    const input = setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    expect(input.plainText).toBe(""); expect(input.cursorStyle.style).toBe("line");
    await act(async () => { await setup.mockMouse.click(input.x + 2, input.y); });
    expect(input.plainText).toBe("");
    await type(setup, "/help"); await enter(setup);
    const frame = await setup.waitForFrame(frame => frame.includes("Commands"));
    expect(frame).toContain("/invite @username"); expect(frame).toContain("/chats");
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
    await key(setup, "escape");
    await setup.waitForFrame(frame => frame.includes("Message…"));
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("");
    await type(setup, "m"); await key(setup, "backspace");
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("");
  } finally { await act(async () => setup.dispose()); }
});

test("switching multiple chats keeps separate drafts and never leaks history between rooms", async () => {
  const f = fixture(["alice/gitmsg-first", "alice/gitmsg-second"]), setup = await createTestRenderer({ width: 110, height: 36 });
  f.messages.set("alice/gitmsg-second", [{ sha: "a".repeat(40), html_url: "", commit: { message: EVENT_PREFIX + JSON.stringify({ v: 1, id: "second-event-001", kind: "message", actor: { id: 2, login: "bob" }, text: "Second room only", createdAt: "2026-11-01T12:00:00.000Z" }) } }]);
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-first" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "draft for first"); await key(setup, "k", true);
    await setup.waitForFrame(frame => frame.includes("Messages") && !frame.includes("MESSAGES"));
    await key(setup, "down"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Second room only"));
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("");
    await type(setup, "draft for second"); await key(setup, "k", true);
    await setup.waitForFrame(frame => frame.includes("Messages") && !frame.includes("MESSAGES")); await key(setup, "up"); await enter(setup);
    const frame = await setup.waitForFrame(frame => frame.includes("draft for first"));
    expect(frame).not.toContain("Second room only");
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("draft for first");
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("friend invitation needs explicit confirmation and commands never become messages", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "/invite @bob"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Send invitation?"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
    await enter(setup); await setup.waitForFrame(frame => frame.includes("Message…"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
    await type(setup, "/invite @bob"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Send invitation?")); await key(setup, "down"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Invited @bob"));
    expect(f.requests.filter(r => r.path.endsWith("/collaborators/bob") && r.method === "PUT")).toHaveLength(1);
    expect(f.requests.some(r => r.path.includes("/events/") && r.method !== "GET")).toBe(false);
  } finally { await act(async () => setup.dispose()); }
});

test("slash help also works from the empty chat picker", async () => {
  const f = fixture(), setup = await createTestRenderer({ width: 80, height: 28 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("+ New chat"));
    await type(setup, "/help"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Commands"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("real native image decoder renders a bounded inline preview and rejects corrupt images", async () => {
  const bytes = pngImage(), setup = await createTestRenderer({ width: 80, height: 28 });
  const decoded = NativeImage.decode(bytes);
  try {
    expect(checkImage(bytes).width).toBe(32); expect(decoded.height).toBe(20);
    expect(() => checkImage(new Uint8Array([1, 2, 3]))).toThrow();
    await act(async () => { createRoot(setup.renderer).render(<box><text>Image fixture</text><ImageView bytes={bytes} width={32} /></box>); });
    const frame = await setup.waitForFrame(frame => frame.includes("Image fixture") && !frame.includes("Loading image"));
    expect(frame).not.toContain("unavailable");
    if (process.env.GITMSG_TEST_IMAGE_FRAME) await Bun.write(process.env.GITMSG_TEST_IMAGE_FRAME, frame);
  } finally { decoded.dispose(); await act(async () => setup.dispose()); }
});

test("narrow chat layout hides sidebar without hiding the composer", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 60, height: 22 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    const frame = await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    expect(frame).not.toContain("MESSAGES"); expect(frame).toContain("Message…"); expect(frame).toContain("+ Invite");
    await type(setup, "/help"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Commands"));
  } finally { await act(async () => setup.dispose()); }
});

test("small-window image preview keeps confirmation visible and cancel uploads nothing", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 60, height: 22 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} readLocalImage={async () => ({ id: "fixture-image-01", name: "fixture.png", mime: "image/png", bytes: pngImage() })} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "/attach /fixture.png"); await enter(setup);
    const frame = await setup.waitForFrame(frame => frame.includes("Send image?") && frame.includes("Send image") && !frame.includes("Loading image"));
    expect(frame).toContain("Cancel"); expect(frame).not.toContain("unavailable");
    const actions = setup.renderer.root.findDescendantById("image-send-actions") as SelectRenderable;
    expect(actions.options.map(option => option.name)).toEqual(["Send Image", "Cancel"]);
    expect(actions.getSelectedOption()?.name).toBe("Send Image");
    await key(setup, "down"); await enter(setup); await setup.waitForFrame(frame => frame.includes("Message…"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("session-only users can sign out even when OS credential storage is unavailable", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 100, height: 28 });
  const brokenVault: Vault = { get: async () => { throw new Error(); }, set: async () => { throw new Error(); }, delete: async () => { throw new Error(); } };
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={brokenVault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "/logout"); await enter(setup); await setup.waitForFrame(frame => frame.includes("Sign out?"));
    await key(setup, "down"); await enter(setup);
    const frame = await setup.waitForFrame(frame => frame.includes("Connect your OAuth App"));
    expect(frame).not.toContain("@alice"); expect(frame).toContain("Signed out locally");
  } finally { await act(async () => setup.dispose()); }
});

test("arrow navigation spans sidebar, history, invitation action and composer without sending", async () => {
  const f = fixture(["alice/gitmsg-first", "alice/gitmsg-second"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-first" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    const composer = () => setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    expect(composer().focused).toBe(true);
    await key(setup, "left");
    expect(composer().focused).toBe(false);
    await key(setup, "down"); await key(setup, "right");
    await setup.waitForFrame(frame => frame.includes("second  private"));
    expect(composer().focused).toBe(true);
    await key(setup, "up"); expect(setup.renderer.root.findDescendantById("history")!.focused).toBe(true);
    await key(setup, "right"); expect(composer().focused).toBe(true);
    await key(setup, "g", true);
    await setup.waitForFrame(frame => frame.includes("Invite a friend"));
    await key(setup, "escape"); await setup.waitForFrame(frame => frame.includes("Message…"));
    await type(setup, "draft");
    await key(setup, "left"); expect(composer().focused).toBe(true); expect(composer().plainText).toBe("draft");
    await key(setup, "up"); expect(setup.renderer.root.findDescendantById("history")!.focused).toBe(true);
    await enter(setup); expect(composer().focused).toBe(true); expect(composer().plainText).toBe("draft");
    await key(setup, "g", true); await setup.waitForFrame(frame => frame.includes("Invite a friend"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("generated repository names are replaced by stable friendly labels in sidebar and header", async () => {
  const f = fixture(["alice/gitmsg-chat-c85", "alice/gitmsg-chat-af13"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-chat-c85" createRooms={() => f.service} />); });
    const frame = await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    expect(frame).toContain("Conversation 1"); expect(frame).toContain("Conversation 2");
    expect(frame).not.toContain("c85"); expect(frame).not.toContain("af13");
    await key(setup, "k", true);
    const picker = await setup.waitForFrame(frame => frame.includes("Messages") && !frame.includes("MESSAGES"));
    expect(picker).not.toContain("gitmsg-chat"); expect(picker).toContain("Conversation 1");
  } finally { await act(async () => setup.dispose()); }
});

test("direct conversation uses the explicit other participant, never the signed-in user", async () => {
  const f = fixture(["alice/gitmsg-chat-c85"], ["alice", "bob"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-chat-c85" createRooms={() => f.service} />); });
    const frame = await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    expect(frame).toContain("@bob  private"); expect(frame).not.toContain("c85");
  } finally { await act(async () => setup.dispose()); }
});

test("sidebar arrow selection scrolls offscreen rooms into view", async () => {
  const ids = Array.from({ length: 15 }, (_, i) => `alice/gitmsg-friends-${i}`), f = fixture(ids), setup = await createTestRenderer({ width: 110, height: 24 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={ids[0]} createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); await key(setup, "left");
    for (let i = 0; i < 12; i++) await key(setup, "down");
    const frame = await setup.waitForFrame(frame => frame.includes("friends-12"));
    expect(frame).toContain("friends-12");
    await enter(setup); await setup.waitForFrame(frame => frame.includes("friends-12  private"));
  } finally { await act(async () => setup.dispose()); }
});

test("180ms reveal advances on the shared 60Hz clock and settles without an idle loop", async () => {
  const clock = new ManualClock(), setup = await createTestRenderer({ width: 80, height: 24, clock, targetFps: 60, maxFps: 60 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<Reveal><text>Animated fixture</text></Reveal>); });
    await setup.renderOnce();
    const reveal = setup.renderer.root.getChildren()[0];
    expect(reveal.opacity).toBeLessThan(1);
    let frames = 0;
    setup.renderer.on("frame", () => frames++);
    for (let i = 0; i < 14; i++) await act(async () => { clock.advance(1000 / 60); await setup.renderOnce(); });
    expect(reveal.opacity).toBe(1);
    const timers = clock.pendingTimerCount;
    await act(async () => { clock.advance(1000); });
    expect(clock.pendingTimerCount).toBeLessThanOrEqual(timers);
    expect(frames).toBeGreaterThan(0);
  } finally { await act(async () => setup.dispose()); }
});

test("slash opens all commands; arrows select, Tab completes, Esc dismisses without losing input", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 130, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "/");
    const frame = await setup.waitForFrame(frame => frame.includes("/themes") && frame.includes("/attach"));
    for (const [usage] of HELP) expect(frame).toContain(usage.split(" ")[0]);
    const input = () => setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    await key(setup, "down"); await key(setup, "tab");
    expect(input().plainText).toBe("/new "); expect(input().focused).toBe(true);
    expect(setup.renderer.root.findDescendantById("command-menu")).toBeUndefined();
    for (let i = 0; i < 5; i++) await key(setup, "backspace");
    await type(setup, "/th");
    await setup.waitForFrame(frame => frame.includes("/themes"));
    await enter(setup); expect(input().plainText).toBe("/themes");
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
    await enter(setup); await setup.waitForFrame(frame => frame.includes("Tokyo Night"));
    await key(setup, "escape");
    await type(setup, "/"); await key(setup, "escape");
    expect(input().plainText).toBe("/"); expect(input().focused).toBe(true);
    expect(setup.renderer.root.findDescendantById("command-menu")).toBeUndefined();
    await type(setup, "/literal"); expect(input().plainText).toBe("//literal");
    expect(setup.renderer.root.findDescendantById("command-menu")).toBeUndefined();
  } finally { await act(async () => setup.dispose()); }
});

test("theme previews cover the whole UI; Escape restores, Enter applies, parked drafts survive", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "parked draft"); await key(setup, "k", true);
    await type(setup, "/themes"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Tokyo Night"));
    const background = () => (setup.renderer.root.findDescendantById("messenger") as BoxRenderable).backgroundColor;
    for (const theme of THEMES.slice(1)) { await key(setup, "down"); expect(background().equals(RGBA.fromHex(theme.colors.bg))).toBe(true); }
    await key(setup, "escape"); expect(background().equals(RGBA.fromHex(THEMES[0].colors.bg))).toBe(true);
    await type(setup, "/themes"); await enter(setup); await key(setup, "down"); await enter(setup);
    expect(background().equals(RGBA.fromHex(THEMES[1].colors.bg))).toBe(true);
    await enter(setup); await setup.waitForFrame(frame => frame.includes("parked draft"));
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("parked draft");
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
    const wordmark = setup.renderer.root.findDescendantById("wordmark") as ASCIIFontRenderable;
    expect(wordmark).toBeInstanceOf(ASCIIFontRenderable);
    expect(wordmark.font).toBe("tiny"); expect(wordmark.text).toBe("gitmsg"); expect(wordmark.height).toBe(2);
  } finally { await act(async () => setup.dispose()); }
});

test("compact command menu scrolls to every command and leaves the composer visible", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 60, height: 20 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); await type(setup, "/");
    for (let i = 0; i < HELP.length - 1; i++) await key(setup, "down");
    const frame = await setup.waitForFrame(frame => frame.includes("/help"));
    expect((setup.renderer.root.findDescendantById("wordmark") as ASCIIFontRenderable).font).toBe("tiny");
    const input = setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    expect(input.focused).toBe(true); expect(input.y).toBeLessThan(20);
    await key(setup, "tab"); expect(input.plainText).toBe("/help");
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("pending send shows activity, not success; failure preserves the exact draft", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  let reject!: (reason: Error) => void;
  const pending = new Promise<never>((_, fail) => { reject = fail; });
  const send = spyOn(f.service, "send").mockImplementation(() => pending);
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "keep this draft"); await enter(setup);
    const frame = await setup.waitForFrame(frame => frame.includes("Sending…")); expect(frame).not.toContain("Sent");
    await act(async () => { reject(new ClientError("Send failed safely.")); });
    await setup.waitForFrame(frame => frame.includes("Send failed safely."));
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("keep this draft");
    expect(setup.renderer.root.findDescendantById("send-activity")).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  } finally { await act(async () => setup.dispose()); send.mockRestore(); }
});

test("animated chat transitions, command menu and themes keep drafts and settle on the shared clock", async () => {
  const clock = new ManualClock(), f = fixture(["alice/gitmsg-first", "alice/gitmsg-second"]);
  const setup = await createTestRenderer({ width: 110, height: 36, clock, targetFps: 60, maxFps: 60 });
  const step = async (frames = 14) => { for (let i = 0; i < frames; i++) await act(async () => { clock.advance(1000 / 60); await setup.renderOnce(); }); };
  try {
    await act(async () => { createRoot(setup.renderer).render(<Messenger vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-first" createRooms={() => f.service} />); });
    await step(); expect(setup.captureCharFrame()).toContain("A fresh conversation.");
    await type(setup, "animated draft"); await key(setup, "up"); await step();
    expect(setup.renderer.root.findDescendantById("history")!.focused).toBe(true);
    await key(setup, "left"); await key(setup, "down"); await key(setup, "right"); await step();
    expect(setup.captureCharFrame()).toContain("second  private");
    await enter(setup); await type(setup, "/th"); await step();
    expect(setup.captureCharFrame()).toContain("/themes");
    await key(setup, "tab"); await enter(setup); await step();
    expect(setup.captureCharFrame()).toContain("Catppuccin Mocha");
    await key(setup, "down"); await enter(setup); await step();
    await key(setup, "k", true); await key(setup, "up"); await enter(setup); await step();
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("animated draft");
    const timers = clock.pendingTimerCount;
    await act(async () => { clock.advance(1000); });
    expect(clock.pendingTimerCount).toBeLessThanOrEqual(timers);
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("rapid focus reversals interpolate from the current color without a flash", async () => {
  const clock = new ManualClock(), setup = await createTestRenderer({ width: 80, height: 24, clock, targetFps: 60, maxFps: 60 });
  const root = createRoot(setup.renderer);
  const render = async (active: boolean) => { await act(async () => { root.render(<FocusFrame id="focus-fixture" active={active}><text>Focus</text></FocusFrame>); }); await setup.renderOnce(); };
  const color = () => (setup.renderer.root.findDescendantById("focus-fixture") as BoxRenderable).borderColor;
  try {
    await render(false); const initial = RGBA.clone(color());
    await render(true); expect(color().equals(initial)).toBe(true);
    for (let i = 0; i < 4; i++) await act(async () => { clock.advance(1000 / 60); await setup.renderOnce(); });
    const midway = RGBA.clone(color()); expect(midway.equals(initial)).toBe(false);
    await render(false); expect(color().equals(midway)).toBe(true);
    for (let i = 0; i < 14; i++) await act(async () => { clock.advance(1000 / 60); await setup.renderOnce(); });
    expect(color().equals(initial)).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("cached chat selection remains interactive during deferred history and ignores stale history", async () => {
  const ids = ["alice/gitmsg-first", "alice/gitmsg-second"], f = fixture(ids);
  const setup = await createTestRenderer({ width: 110, height: 36 });
  let resolve!: (value: History) => void;
  const pending = new Promise<History>(done => { resolve = done; });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={ids[0]} createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    const read = f.service.history.bind(f.service);
    const history = spyOn(f.service, "history").mockImplementation((room, ...args) => room.id === ids[1] ? pending : read(room, ...args));
    const metadata = spyOn(f.service, "open");
    await type(setup, "first draft"); await key(setup, "k", true); await key(setup, "down"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("second  private") && frame.includes("Loading messages"));
    const input = () => setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    expect(input().focused).toBe(true);
    await type(setup, "second draft"); await key(setup, "k", true); await key(setup, "up"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("first draft"));
    await act(async () => { resolve({ events: [], messages: [{ id: "stale-message", actor: { id: 2, login: "bob" }, text: "STALE SECOND", createdAt: "2026-11-01T12:00:00Z", reactions: {}, edited: false, deleted: false }], truncated: false, encrypted: false }); });
    expect(setup.captureCharFrame()).not.toContain("STALE SECOND");
    expect(input().plainText).toBe("first draft"); expect(metadata).not.toHaveBeenCalled();
    history.mockRestore(); metadata.mockRestore();
  } finally { await act(async () => setup.dispose()); }
});

test("out-of-order metadata cannot override the last selected chat", async () => {
  const ids = ["alice/gitmsg-first", "alice/gitmsg-second", "alice/gitmsg-third"], f = fixture(ids);
  const setup = await createTestRenderer({ width: 110, height: 36 });
  const resolves = new Map<string, (room: TerminalRoom) => void>();
  const pending = new Map(ids.slice(1).map(id => [id, new Promise<TerminalRoom>(done => resolves.set(id, done))]));
  const original = f.service.open.bind(f.service);
  const open = spyOn(f.service, "open").mockImplementation(id => pending.get(id) ?? original(id));
  const resolve = (id: string) => resolves.get(id)!({ id, title: id.split("-").at(-1)!, branch: "main", private: true, canWrite: true });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={ids[0]} createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await key(setup, "k", true); await key(setup, "down"); await enter(setup);
    await key(setup, "down"); await enter(setup);
    await act(async () => { resolve(ids[2]); });
    await setup.waitForFrame(frame => frame.includes("third  private"));
    await act(async () => { resolve(ids[1]); });
    expect(setup.captureCharFrame()).toContain("third  private");
    expect(setup.captureCharFrame()).not.toContain("second  private");
  } finally { await act(async () => setup.dispose()); open.mockRestore(); }
});

test("compact rounded composer keeps bottom breathing room and command menu never overlaps it", async () => {
  for (const [width, height] of [[60, 20], [80, 24], [110, 36]]) {
    const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width, height });
    try {
      await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
      await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
      await type(setup, "/"); await setup.renderOnce();
      const input = setup.renderer.root.findDescendantById("composer")!;
      const menu = setup.renderer.root.findDescendantById("command-menu")!;
      const panel = setup.renderer.root.findDescendantById("composer-panel") as BoxRenderable;
      expect(panel.border).toBe(true); expect(panel.borderStyle).toBe("rounded");
      expect(panel.height).toBe(3);
      expect(panel.y + panel.height).toBe(height - 2);
      expect(input.y).toBe(panel.y + 1);
      expect(input.y + input.height).toBeLessThanOrEqual(height - 3);
      expect(menu.y + menu.height).toBeLessThanOrEqual(input.y - 1);
      const logo = setup.renderer.root.findDescendantById("wordmark")!;
      const sidebar = setup.renderer.root.findDescendantById("sidebar");
      expect(logo.height).toBe(2);
      if (sidebar) expect(sidebar.y - logo.y - logo.height).toBeGreaterThanOrEqual(1);
    } finally { await act(async () => setup.dispose()); }
  }
});

test("long drafts wrap and grow upwards, Shift+Enter inserts a newline, Enter sends exact text", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 60, height: 24 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    const editor = () => setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    const text = "This is a long draft that must wrap naturally inside the composer. ".repeat(4);
    await type(setup, text); await setup.renderOnce();
    expect(editor().plainText).toBe(text); expect(editor().wrapMode).toBe("word");
    expect(editor().virtualLineCount).toBeGreaterThan(1); expect(editor().height).toBe(3);
    const panel = setup.renderer.root.findDescendantById("composer-panel") as BoxRenderable;
    expect(panel.height).toBe(5); expect(panel.y + panel.height).toBe(22);
    expect(editor().editorView.getViewport().offsetX).toBe(0);
    await key(setup, "up"); expect(editor().focused).toBe(true);
    await act(async () => { editor().gotoBufferEnd(); setup.mockInput.pressEnter({ shift: true }); });
    await type(setup, "Next paragraph.");
    expect(editor().plainText).toBe(text + "\nNext paragraph.");
    await key(setup, "j", true); await type(setup, "Final line.");
    expect(editor().plainText).toBe(text + "\nNext paragraph.\nFinal line.");
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
    await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Sent"));
    const writes = f.requests.filter(request => request.method === "PUT" && request.path.includes("/events/"));
    expect(writes).toHaveLength(1);
    expect(JSON.parse(Buffer.from(writes[0].data.content, "base64").toString()).text).toBe(text + "\nNext paragraph.\nFinal line.");
    expect(editor().plainText).toBe(""); expect(editor().height).toBe(1);
  } finally { await act(async () => setup.dispose()); }
});

test("long sent message bodies stay within the conversation width and wrap vertically", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 60, height: 24 });
  const text = "A long received message should wrap into several readable rows. ".repeat(5);
  f.messages.set("alice/gitmsg-test", [{ sha: "a".repeat(40), html_url: "", commit: { message: EVENT_PREFIX + JSON.stringify({ v: 1, id: "long-message-001", kind: "message", actor: { id: 2, login: "bob" }, text, createdAt: "2026-11-01T12:00:00.000Z" }) } }]);
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("readable rows."));
    const walk = (node: Renderable): Renderable[] => [node, ...node.getChildren().flatMap(walk)];
    const body = walk(setup.renderer.root).find(node => "plainText" in node && node.plainText === text)!;
    expect(body).toBeDefined(); expect(body.height).toBeGreaterThan(1);
    expect(body.x + body.width).toBeLessThanOrEqual(59);
  } finally { await act(async () => setup.dispose()); }
});

test("oversized multiline paste stays bounded, scrolls vertically and preserves its draft across chats", async () => {
  const f = fixture(["alice/gitmsg-first", "alice/gitmsg-second"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-first" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    const editor = () => setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    const text = "Long pasted paragraph with spaces and words.\n".repeat(120);
    await act(async () => { setup.renderer.keyInput.processPaste(new TextEncoder().encode(text)); });
    await setup.renderOnce();
    expect(editor().plainText).toBe(text.slice(0, 4000)); expect(editor().height).toBe(5);
    expect(editor().editorView.getViewport().offsetX).toBe(0);
    await key(setup, "k", true); await key(setup, "down"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("second  private"));
    expect(editor().plainText).toBe(""); expect(editor().height).toBe(1);
    await key(setup, "k", true); await key(setup, "up"); await enter(setup);
    await setup.renderOnce();
    expect(editor().plainText).toBe(text.slice(0, 4000)); expect(editor().height).toBe(5);
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("image paste selects Send Image first, preserves the draft and opens sent images in a read-only lightbox", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  const clipboard = async () => memoryImage(pngImage(), "clipboard.png");
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} readClipboardImage={clipboard} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "unsent draft"); await key(setup, "v", true);
    await setup.waitForFrame(frame => frame.includes("Send image?") && frame.includes("clipboard.png"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true);
    expect((setup.renderer.root.findDescendantById("image-send-actions") as SelectRenderable).getSelectedOption()?.name).toBe("Send Image");
    await key(setup, "down"); await enter(setup); await setup.waitForFrame(frame => frame.includes("unsent draft"));
    await key(setup, "v", true);
    let refreshed!: () => void, decoded!: () => void;
    const refreshDone = new Promise<void>(resolve => { refreshed = resolve; });
    const imageDone = new Promise<void>(resolve => { decoded = resolve; });
    const originalHistory = f.service.history.bind(f.service), originalImage = f.service.image.bind(f.service);
    const history = spyOn(f.service, "history").mockImplementation(async (...args) => { const result = await originalHistory(...args); refreshed(); return result; });
    const image = spyOn(f.service, "image").mockImplementation(async (...args) => { const result = await originalImage(...args); decoded(); return result; });
    await act(async () => { setup.mockInput.pressEnter(); await refreshDone; });
    await act(async () => { await imageDone; });
    const frame = await setup.waitForFrame(frame => frame.includes("Image sent") && !frame.includes("loading…"));
    expect(frame).not.toContain("unavailable");
    expect(f.requests.filter(r => r.method === "PUT" && r.path.includes("/media/"))).toHaveLength(1);
    expect(f.requests.filter(r => r.method === "PUT" && r.path.includes("/events/"))).toHaveLength(1);
    expect(setup.renderer.root.findDescendantById("image-preview")).toBeDefined();
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("unsent draft");
    const inline = setup.renderer.root.findDescendantById("image-preview")!;
    const inlineWidth = inline.width, before = f.requests.length;
    await act(async () => { await setup.mockMouse.click(inline.x + 1, inline.y + 1); });
    await setup.waitForFrame(frame => frame.includes("Esc to close") && frame.includes("32 × 20"));
    const lightbox = setup.renderer.root.findDescendantById("image-lightbox")!;
    expect(lightbox).toBeDefined();
    expect((setup.renderer.root.findDescendantById("image-lightbox-frame") as BoxRenderable).borderStyle).toBe("rounded");
    expect(lightbox.findDescendantById("image-preview")!.width).toBeGreaterThan(inlineWidth);
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).focused).toBe(false);
    await type(setup, "never enters draft"); await enter(setup);
    expect(setup.renderer.root.findDescendantById("image-lightbox")).toBeUndefined();
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("unsent draft");
    expect(f.requests.length).toBe(before); // Verified bytes reused, no upload or send.
    const thumbnail = setup.renderer.root.findDescendantById("image-preview")!;
    await act(async () => { await setup.mockMouse.click(thumbnail.x + 1, thumbnail.y + 1); });
    await key(setup, "escape");
    expect(setup.renderer.root.findDescendantById("image-lightbox")).toBeUndefined();
    history.mockRestore(); image.mockRestore();
  } finally { await act(async () => setup.dispose()); }
});

test("sidebar uses inset padded cards, distinguishes focus, and messages retain a two-row gap", async () => {
  const setup = await createTestRenderer({ width: 100, height: 30 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<box flexDirection="column">
      <ChatRow id="active-row" name="Opened" preview="" active selected={false} reduced onClick={() => {}} />
      <ChatRow id="focused-row" name="Focused" preview="" active={false} selected reduced onClick={() => {}} />
      <MessageBubble own={false} reduced><text>First</text></MessageBubble>
      <MessageBubble own reduced><text>Second</text></MessageBubble>
    </box>); });
    await setup.renderOnce();
    const active = setup.renderer.root.findDescendantById("active-row")!.getChildren()[0] as BoxRenderable;
    const focused = setup.renderer.root.findDescendantById("focused-row")!.getChildren()[0] as BoxRenderable;
    expect(active.backgroundColor.equals(RGBA.fromHex(THEMES[0].colors.own))).toBe(true);
    expect(focused.backgroundColor.equals(RGBA.fromHex(THEMES[0].colors.elevated))).toBe(true);
    expect(active.borderStyle).toBe("rounded"); expect(focused.borderStyle).toBe("rounded");
    expect(active.border).toBe(true); expect(focused.border).toBe(true);
    expect(active.x).toBeGreaterThan(0);
    expect(active.getChildren()[0].y - active.y).toBe(1);
    const [, , first, second] = setup.renderer.root.getChildren()[0].getChildren();
    expect(second.y - first.y - first.height).toBeGreaterThanOrEqual(2);
    for (const bubble of [first, second]) {
      const panel = bubble.getChildren()[0] as BoxRenderable;
      expect(panel.border).toBe(true); expect(panel.borderStyle).toBe("rounded");
    }
  } finally { await act(async () => setup.dispose()); }
});

test("unloaded image opens on first click and closing its viewer cancels the pending read", async () => {
  const f = fixture(), setup = await createTestRenderer({ width: 80, height: 24 });
  const room: TerminalRoom = { id: "alice/gitmsg-test", branch: "main", title: "test", private: true, canWrite: false };
  const attachment = { id: "older-image-001", name: "older.png", mime: "image/png", size: pngImage().length, sha256: "a".repeat(64) };
  let signal: AbortSignal | undefined, opened = false, finish!: (bytes: Uint8Array<ArrayBuffer>) => void;
  const image = spyOn(f.service, "image").mockImplementation((_room, _attachment, input) => { signal = input; return new Promise(resolve => { finish = resolve; }); });
  const root = createRoot(setup.renderer);
  try {
    await act(async () => { root.render(<ChatImage rooms={f.service} room={room} attachment={attachment} autoLoad={false} width={40} onOpen={() => { opened = true; root.render(<ImageLightbox rooms={f.service} room={room} attachment={attachment} onClose={() => root.render(<text>Closed</text>)} />); }} />); });
    await setup.waitForFrame(frame => frame.includes("[open image]")); expect(image).not.toHaveBeenCalled();
    const thumbnail = setup.renderer.root.findDescendantById("chat-image-older-image-001")!;
    await act(async () => { await setup.mockMouse.click(thumbnail.x + 1, thumbnail.y); });
    await setup.waitForFrame(frame => frame.includes("Loading image…")); expect(opened).toBe(true);
    expect(image).toHaveBeenCalledTimes(1);
    const close = setup.renderer.root.findDescendantById("image-lightbox-close")!;
    await act(async () => { await setup.mockMouse.click(close.x + 1, close.y); });
    await setup.waitForFrame(frame => frame.includes("Closed")); expect(signal?.aborted).toBe(true);
    await act(async () => { finish(pngImage()); });
    expect(setup.captureCharFrame()).toContain("Closed");
    expect(f.requests).toHaveLength(0);
  } finally { await act(async () => setup.dispose()); image.mockRestore(); }
});

test("image lightbox fits a small terminal and displays read failures without sending", async () => {
  const f = fixture(), setup = await createTestRenderer({ width: 60, height: 22 });
  const room: TerminalRoom = { id: "alice/gitmsg-test", branch: "main", title: "test", private: true, canWrite: false };
  const attachment = { id: "failed-image-001", name: "picture.png", mime: "image/png", size: pngImage().length, sha256: "a".repeat(64) };
  const image = spyOn(f.service, "image").mockRejectedValue(new ClientError("Image integrity check failed."));
  try {
    await act(async () => { createRoot(setup.renderer).render(<ImageLightbox rooms={f.service} room={room} attachment={attachment} onClose={() => {}} />); });
    const frame = await setup.waitForFrame(frame => frame.includes("Image integrity check failed."));
    expect(frame).toContain("Esc to close"); expect(frame).toContain("× Close");
    const box = setup.renderer.root.findDescendantById("image-lightbox-frame")!;
    expect(box.x + box.width).toBeLessThanOrEqual(60); expect(box.y + box.height).toBeLessThanOrEqual(22);
    expect(f.requests).toHaveLength(0);
  } finally { await act(async () => setup.dispose()); image.mockRestore(); }
});

test("sidebar action labels stay vertically centered when highlighted", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await key(setup, "left");
    for (let index = 1; index <= 3; index++) {
      await key(setup, "down"); await setup.renderOnce();
      const row = setup.renderer.root.findDescendantById(`sidebar-row-${index}`) as BoxRenderable;
      const label = row.getChildren()[0];
      expect(row.height).toBe(3); expect(row.borderStyle).toBe("rounded");
      expect(label.y - row.y).toBe(1);
      expect(row.y + row.height - label.y - label.height).toBe(1);
      expect(row.backgroundColor.equals(RGBA.fromHex(THEMES[0].colors.elevated))).toBe(true);
    }
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("Copy visibly waits for acknowledgement, blocks duplicate clicks and never calls a request or failure copied", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24 });
  let complete!: (value: "copied" | "requested" | "failed") => void, calls = 0;
  try {
    await act(async () => { createRoot(setup.renderer).render(<MessageBubble id="copy-fixture" own={false} reduced onCopy={() => { calls++; return new Promise(resolve => { complete = resolve; }); }} onReply={() => {}}><text>Exact message</text></MessageBubble>); });
    await act(async () => { await setup.renderOnce(); });
    const bubble = setup.renderer.root.findDescendantById("copy-fixture")!;
    await act(async () => { await setup.mockMouse.moveTo(bubble.x + 2, bubble.y + 1); });
    const copy = setup.renderer.root.findDescendantById("copy-fixture-copy")!;
    for (const state of ["requested", "failed", "copied"] as const) {
      await act(async () => { await setup.mockMouse.click(copy.x + 1, copy.y); });
      await act(async () => { await setup.waitForFrame(frame => frame.includes("Copying…")); });
      const before = calls;
      await act(async () => { await setup.mockMouse.click(copy.x + 1, copy.y); });
      expect(calls).toBe(before);
      await act(async () => { await setup.mockMouse.moveTo(70, 20); complete(state); });
      let frame = "";
      await act(async () => { frame = await setup.waitForFrame(frame => frame.includes(state === "copied" ? "✓ Copied" : state === "requested" ? "↗ Requested" : "! Retry")); });
      if (state !== "copied") expect(frame).not.toContain("✓ Copied");
      expect(setup.renderer.root.findDescendantById("copy-fixture-actions")!.opacity).toBe(1);
    }
    expect(calls).toBe(3);
  } finally { await act(async () => setup.dispose()); }
});

test("hover actions copy exact message text and Reply preserves drafts per chat without sending until Enter", async () => {
  const ids = ["alice/gitmsg-first", "alice/gitmsg-second"], f = fixture(ids), setup = await createTestRenderer({ width: 110, height: 36 });
  const copied: string[] = [], text = "Copy this exact message.\nSecond line.";
  const original = { v: 1, id: "reply-original-01", kind: "message", actor: { id: 2, login: "bob" }, text, createdAt: "2026-11-01T12:00:00.000Z" };
  f.messages.set(ids[0], [{ sha: "a".repeat(40), html_url: "", commit: { message: EVENT_PREFIX + JSON.stringify(original) } }]);
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={ids[0]} createRooms={() => f.service} copyText={async value => { copied.push(value); return "copied"; }} />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Copy this exact message.")); });
    await type(setup, "Existing draft");
    const bubble = setup.renderer.root.findDescendantById(`message-${original.id}`)!;
    const actions = setup.renderer.root.findDescendantById(`message-${original.id}-actions`)!;
    expect(actions.opacity).toBe(0);
    expect(messageCopyTargets(setup.renderer, [original], terminalText)).toEqual([]);
    const height = bubble.height;
    await act(async () => { await setup.mockMouse.moveTo(bubble.x + 2, bubble.y + 1); });
    expect(actions.opacity).toBe(1); expect(bubble.height).toBe(height);
    const targets = messageCopyTargets(setup.renderer, [original], terminalText);
    expect(targets).toHaveLength(1); expect(targets[0].text).toBe(text);
    expect(messageCopyTargets(setup.renderer, [{ ...original, locked: true }], terminalText)).toEqual([]);
    const copy = setup.renderer.root.findDescendantById(`message-${original.id}-copy`)!;
    await act(async () => { await setup.mockMouse.click(copy.x + 1, copy.y); });
    expect(copied).toEqual([text]);
    await act(async () => { await setup.renderOnce(); });
    expect(setup.captureCharFrame()).toContain("✓ Copied");
    expect(setup.renderer.root.findDescendantById("status-footer")).toBeUndefined();
    const reply = setup.renderer.root.findDescendantById(`message-${original.id}-reply`)!;
    await act(async () => { await setup.mockMouse.click(reply.x + 1, reply.y); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Reply to @bob")); });
    const editor = () => setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    expect(editor().plainText).toBe("Existing draft"); expect(editor().focused).toBe(true);
    await act(async () => { await setup.renderOnce(); });
    await act(async () => { await setup.mockMouse.moveTo(bubble.x + 2, bubble.y + 1); });
    await act(async () => { await setup.mockMouse.click(reply.x + 1, reply.y); });
    expect(editor().focused).toBe(true);
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
    await key(setup, "k", true); await key(setup, "down"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("second  private")); });
    expect(setup.renderer.root.findDescendantById("reply-preview")).toBeUndefined();
    await key(setup, "left"); await key(setup, "up"); await key(setup, "right");
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Reply to @bob")); });
    expect(editor().focused).toBe(true); expect(editor().plainText).toBe("Existing draft");
    const failedSend = spyOn(f.service, "send").mockRejectedValueOnce(new ClientError("Synthetic send failure. No write was made."));
    try {
      await enter(setup);
      await act(async () => { await setup.waitForFrame(frame => frame.includes("Synthetic send failure")); });
      expect(editor().plainText).toBe("Existing draft");
      expect(setup.renderer.root.findDescendantById("reply-preview")).toBeDefined();
      expect(f.requests.every(request => request.method === "GET")).toBe(true);
    } finally { failedSend.mockRestore(); }
    await enter(setup); await act(async () => { await setup.waitForFrame(frame => frame.includes("Sent")); });
    const writes = f.requests.filter(request => request.method === "PUT" && request.path.includes("/events/"));
    expect(writes).toHaveLength(1);
    const event = JSON.parse(Buffer.from(writes[0].data.content, "base64").toString());
    expect(event.replyTo).toBe(original.id); expect(event.text).toBe("Existing draft");
    expect(setup.renderer.root.findDescendantById("reply-preview")).toBeUndefined();
    await act(async () => { expect(setup.captureCharFrame()).toContain("↳ @bob:"); });
    // Switching rooms remounts bubbles; hit-test the current renderable after refresh.
    await act(async () => { await setup.renderOnce(); });
    const currentBubble = setup.renderer.root.findDescendantById(`message-${original.id}`)!;
    await act(async () => { await setup.mockMouse.moveTo(currentBubble.x + 2, currentBubble.y + 1); });
    const replyAgain = setup.renderer.root.findDescendantById(`message-${original.id}-reply`)!;
    await act(async () => { await setup.mockMouse.click(replyAgain.x + 1, replyAgain.y); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Reply to @bob")); });
    await type(setup, "keep after cancel"); await key(setup, "escape");
    expect(setup.renderer.root.findDescendantById("reply-preview")).toBeUndefined();
    expect(editor().plainText).toBe("keep after cancel"); expect(editor().focused).toBe(true);
    expect(f.requests.filter(request => request.method === "PUT" && request.path.includes("/events/"))).toHaveLength(1);
  } finally { await act(async () => setup.dispose()); }
});

test("Left at the start of a nonempty draft goes directly to sidebar and Right returns directly to input", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "draft");
    const editor = setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    await act(async () => { editor.gotoBufferHome(); });
    await key(setup, "left"); expect(editor.focused).toBe(false);
    expect(setup.renderer.root.findDescendantById("history")!.focused).toBe(false);
    await key(setup, "right"); expect(editor.focused).toBe(true); expect(editor.plainText).toBe("draft");
    await act(async () => { setup.mockInput.pressKey("c", { ctrl: true, shift: true }); });
    expect(setup.renderer.isDestroyed).toBe(false);
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("Ctrl+C copies a selection instead of exiting and copy failures keep the session alive", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 110, height: 36 });
  const copied: string[] = [];
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} copyText={async value => { copied.push(value); if (copied.length > 1) throw new ClientError("Clipboard unavailable."); return "copied"; }} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "Select part of this draft");
    const editor = setup.renderer.root.findDescendantById("composer") as TextareaRenderable;
    await act(async () => { editor.setSelection(0, 6); });
    await key(setup, "c", true);
    expect(copied).toEqual(["Select"]); expect(setup.renderer.isDestroyed).toBe(false);
    await key(setup, "c", true);
    await setup.waitForFrame(frame => frame.includes("Clipboard unavailable."));
    expect(setup.renderer.isDestroyed).toBe(false); expect(editor.plainText).toBe("Select part of this draft");
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("sidebar cross and X remove locally after confirmation, preserve GitHub data and allow rejoining", async () => {
  const ids = ["alice/gitmsg-first", "alice/gitmsg-second"], f = fixture(ids), setup = await createTestRenderer({ width: 110, height: 36 });
  const values = new Map<string, string>(), localVault: Vault = { get: async o => values.get(`${o.service}:${o.name}`) ?? null, set: async o => { values.set(`${o.service}:${o.name}`, o.value); }, delete: async () => true };
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={localVault} initialToken="fixture-token" initialRepo={ids[0]} createRooms={() => f.service} />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); });
    await key(setup, "left"); await key(setup, "x");
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Remove from chat list?")); });
    await enter(setup); // Cancel is selected.
    await act(async () => { await setup.renderOnce(); });
    expect(setup.renderer.root.findDescendantById("sidebar-row-1-remove")).toBeDefined();
    const row = setup.renderer.root.findDescendantById("sidebar-row-0")!;
    await act(async () => { await setup.mockMouse.moveTo(row.x + 2, row.y + 1); });
    const cross = setup.renderer.root.findDescendantById("sidebar-row-0-remove")!;
    await act(async () => { await setup.mockMouse.click(cross.x, cross.y); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Remove from chat list?")); });
    await key(setup, "down"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("second  private")); });
    expect(setup.renderer.root.findDescendantById("sidebar-row-1-remove")).toBeUndefined();
    expect([...values.values()].some(value => value === JSON.stringify([ids[0]]))).toBe(true);
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
    await type(setup, `/join ${ids[0]}`); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("first  private")); });
    expect(setup.renderer.root.findDescendantById("sidebar-row-1-remove")).toBeDefined();
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("access warnings occupy the lower footer without moving or covering the composer", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 80, height: 24 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); });
    const request = spyOn(f.service, "history").mockRejectedValueOnce(new ClientError("Repository or file unavailable. A link alone does not grant private repository access."));
    await key(setup, "r", true);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Repository or file unavailable")); });
    const footer = setup.renderer.root.findDescendantById("status-footer")!, composer = setup.renderer.root.findDescendantById("composer-panel")!;
    expect(footer.y).toBe(22); expect(composer.y + composer.height).toBeLessThanOrEqual(footer.y); expect(footer.y + footer.height).toBe(24);
    request.mockRestore();
  } finally { await act(async () => setup.dispose()); }
});

test("voice records a real-level diagram, previews locally, sends only on confirmation and plays received audio", async () => {
  const id = "alice/gitmsg-test", f = fixture([id]), setup = await createTestRenderer({ width: 110, height: 36 });
  const voice = memoryVoice(voiceWav(Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 10) * .2)));
  let update!: (value: VoiceUpdate) => void, complete!: (value: typeof voice) => void, recordings = 0, plays = 0;
  const audio: VoiceDriver = {
    record: async (callback, signal) => {
      recordings++; update = callback;
      const result = new Promise<typeof voice>((resolve, reject) => { complete = resolve; signal.addEventListener("abort", () => reject(new ClientError("Cancelled")), { once: true }); });
      return { result, stop: () => complete(voice), cancel: () => {} };
    },
    play: async bytes => { expect(bytes).toEqual(voice.bytes); plays++; },
  };
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={id} createRooms={() => f.service} audio={audio} />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); });
    await type(setup, "keep my draft");
    const button = setup.renderer.root.findDescendantById("voice-button")!;
    await act(async () => { await setup.mockMouse.click(button.x + 1, button.y); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("● REC")); });
    expect(recordings).toBe(1);
    await act(async () => { update({ level: .1, seconds: .2 }); await setup.renderOnce(); });
    await act(async () => { await setup.renderOnce(); });
    const quiet = setup.captureCharFrame();
    await act(async () => { update({ level: 1, seconds: 1 }); await setup.renderOnce(); });
    await act(async () => { await setup.renderOnce(); });
    expect(setup.captureCharFrame().split("┃").length).toBeGreaterThan(quiet.split("┃").length);
    await enter(setup); // Stop recording, never send.
    await act(async () => { await setup.waitForFrame(frame => frame.includes("VOICE / READY")); });
    expect((setup.renderer.root.findDescendantById("voice-actions") as SelectRenderable).getSelectedOption()?.value).toBe("cancel");
    await key(setup, "down"); await enter(setup); expect(plays).toBe(1);
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
    const upload = f.service.uploadVoice.bind(f.service), send = f.service.send.bind(f.service);
    let uploadResult: ReturnType<typeof upload> | undefined, sendResult: ReturnType<typeof send> | undefined;
    spyOn(f.service, "uploadVoice").mockImplementation((...args) => uploadResult = upload(...args));
    spyOn(f.service, "send").mockImplementation((...args) => sendResult = send(...args));
    await key(setup, "down"); await enter(setup);
    await act(async () => { await uploadResult; await sendResult; });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Voice sent")); });
    expect(f.requests.filter(request => request.method === "PUT")).toHaveLength(2);
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("keep my draft");
    const play = setup.renderer.root.findDescendantById(`voice-play-${voice.id}`)!;
    await act(async () => { await setup.mockMouse.click(play.x + 1, play.y); });
    expect(plays).toBe(2);
    await key(setup, "escape"); await enter(setup);
    await act(async () => { const editor = setup.renderer.root.findDescendantById("composer") as TextareaRenderable; editor.setSelection(0, editor.plainText.length); });
    await type(setup, "/voice"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("● REC")); });
    await key(setup, "escape");
    expect(f.requests.filter(request => request.method === "PUT")).toHaveLength(2);
  } finally { await act(async () => setup.dispose()); }
});

test("secure confirmation persists the key before policy and never renders or commits it", async () => {
  const id = "alice/gitmsg-test", f = fixture([id]), setup = await createTestRenderer({ width: 110, height: 36 });
  const values = new Map<string, string>(), localVault: Vault = { get: async o => values.get(`${o.service}:${o.name}`) ?? null, set: async o => { values.set(`${o.service}:${o.name}`, o.value); }, delete: async () => true };
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={localVault} initialToken="fixture-token" initialRepo={id} createRooms={() => f.service} />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); });
    await type(setup, "/secure"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Secure conversation")); });
    await enter(setup); expect(f.requests.every(request => request.method === "GET")).toBe(true);
    await type(setup, "/secure"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Secure conversation")); });
    await key(setup, "down"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("AES-256-GCM enabled")); });
    const room = await f.service.open(id), roomSecret = await f.service.roomKey(room), raw = await exportKey(roomSecret!);
    expect([...values.values()]).toContain(raw);
    expect(setup.captureCharFrame()).not.toContain(raw);
    expect(JSON.stringify(f.requests)).not.toContain(raw);
    const send = f.service.send.bind(f.service);
    let sent: ReturnType<typeof send> | undefined;
    spyOn(f.service, "send").mockImplementation((...args) => sent = send(...args));
    await key(setup, "escape"); await type(setup, "hidden contents"); await enter(setup);
    await act(async () => { await sent; });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Sent")); });
    const write = f.requests.find(request => request.method === "PUT" && request.path.includes("/events/"))!;
    expect(JSON.parse(Buffer.from(write.data.content, "base64").toString()).sealed.algorithm).toBe("AES-256-GCM");
    expect(JSON.stringify(write)).not.toContain("hidden contents"); expect(JSON.stringify(write)).not.toContain(raw);
  } finally { await act(async () => setup.dispose()); }
});

test("voice uses the native OpenTUI PCM decoder and mixer without opening a device", () => {
  const voice = memoryVoice(voiceWav(Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 10) * .2)));
  const audio = Audio.create({ autoStart: false, sampleRate: 16000 });
  audio.on("error", error => { throw error; });
  try {
    const sound = audio.loadSound(voice.bytes);
    expect(sound).not.toBeNull(); expect(audio.startMixer()).toBe(true);
    expect(audio.play(sound!)).not.toBeNull();
    const pcm = audio.mixFrames(1024, 1)!;
    expect(pcm.some(value => Math.abs(value) > .01)).toBe(true);
    expect(audio.isStarted()).toBe(false);
  } finally { audio.dispose(); }
});

test("voice cancellation and permission failure never upload; compact controls fit inside the terminal", async () => {
  for (const deny of [false, true]) {
    const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 60, height: 20 });
    let aborted = false;
    const audio: VoiceDriver = {
      record: async (_, signal) => {
        if (deny) throw new ClientError("Microphone permission denied.");
        const result = new Promise<ReturnType<typeof memoryVoice>>((_, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new ClientError("Cancelled")); }, { once: true }));
        return { result, stop() {}, cancel() {} };
      }, play: async () => {},
    };
    try {
      await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} audio={audio} />); });
      await act(async () => { await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); });
      await type(setup, "/voice"); await enter(setup);
      await act(async () => { await setup.waitForFrame(frame => frame.includes(deny ? "permission denied" : "● REC")); });
      const actions = setup.renderer.root.findDescendantById("voice-actions")!;
      expect(actions.y + actions.height).toBeLessThanOrEqual(18);
      await key(setup, "escape");
      if (!deny) expect(aborted).toBe(true);
      expect(f.requests.every(request => request.method === "GET")).toBe(true);
    } finally { await act(async () => setup.dispose()); }
  }
});

test("secure mode refuses to publish a policy when durable key storage is unavailable", async () => {
  const id = "alice/gitmsg-test", f = fixture([id]), setup = await createTestRenderer({ width: 110, height: 36 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={id} createRooms={() => f.service} />); });
    await act(async () => { await setup.waitForFrame(frame => frame.includes("A fresh conversation.")); });
    await type(setup, "/secure"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Secure conversation")); });
    await key(setup, "down"); await enter(setup);
    await act(async () => { await setup.waitForFrame(frame => frame.includes("Secure key storage unavailable")); });
    expect(f.requests.every(request => request.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("secure setup keeps Cancel and both storage choices visible in a short terminal", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 60, height: 20 });
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await type(setup, "/secure"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Secure conversation"));
    const actions = setup.renderer.root.findDescendantById("secure-actions") as SelectRenderable;
    expect(actions.y + actions.height).toBeLessThanOrEqual(18);
    expect(actions.getSelectedOption()?.value).toBe("cancel");
    await key(setup, "escape"); expect(f.requests.every(request => request.method === "GET")).toBe(true);
  } finally { await act(async () => setup.dispose()); }
});

test("sign-out invalidates deferred history and room metadata responses", async () => {
  const ids = ["alice/gitmsg-first", "alice/gitmsg-second"], f = fixture(ids), setup = await createTestRenderer({ width: 110, height: 36 });
  let finish!: (room: TerminalRoom) => void;
  const pending = new Promise<TerminalRoom>(resolve => { finish = resolve; });
  const original = f.service.open.bind(f.service);
  const open = spyOn(f.service, "open").mockImplementation(id => id === ids[1] ? pending : original(id));
  let finishHistory!: (history: History) => void;
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo={ids[0]} createRooms={() => f.service} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    spyOn(f.service, "history").mockImplementation(() => new Promise(resolve => { finishHistory = resolve; }));
    await key(setup, "k", true); await enter(setup); // cached room refresh without blocking input
    await type(setup, "/logout"); await enter(setup); await key(setup, "down"); await enter(setup);
    await setup.waitForFrame(frame => frame.includes("Signed out locally"));
    await act(async () => {
      finish({ id: ids[1], title: "LATE PRIVATE TITLE", private: true, canWrite: true, branch: "main" });
      finishHistory({ events: [], messages: [], truncated: false, encrypted: false });
    });
    expect(setup.captureCharFrame()).toContain("Connect your OAuth App");
    expect(setup.captureCharFrame()).not.toContain("LATE PRIVATE TITLE");
  } finally { await act(async () => setup.dispose()); open.mockRestore(); }
});

test("bracketed image paths and bridge bytes open confirmation, ordinary text paste remains text", async () => {
  const f = fixture(["alice/gitmsg-test"]), setup = await createTestRenderer({ width: 80, height: 24 });
  let receive!: (image: ReturnType<typeof memoryImage>) => void, disposed = false;
  const path = spyOn({ read: async () => memoryImage(pngImage(), "pasted.png") }, "read");
  try {
    await act(async () => { createRoot(setup.renderer).render(<App vault={vault} initialToken="fixture-token" initialRepo="alice/gitmsg-test" createRooms={() => f.service} readLocalImage={path} receiveImages={callback => { receive = callback; return () => { disposed = true; }; }} />); });
    await setup.waitForFrame(frame => frame.includes("A fresh conversation."));
    await act(async () => { setup.renderer.keyInput.processPaste(new TextEncoder().encode("normal pasted text")); });
    expect((setup.renderer.root.findDescendantById("composer") as TextareaRenderable).plainText).toBe("normal pasted text");
    await act(async () => { setup.renderer.keyInput.processPaste(new TextEncoder().encode("'/fixture/two words.png'")); });
    await setup.waitForFrame(frame => frame.includes("Send image?")); expect(path).toHaveBeenCalledWith("/fixture/two words.png");
    await key(setup, "escape"); await setup.waitForFrame(frame => frame.includes("normal pasted text"));
    await act(async () => { receive(memoryImage(pngImage(), "bridge.png")); });
    await setup.waitForFrame(frame => frame.includes("bridge.png"));
    expect(f.requests.every(r => r.method === "GET")).toBe(true); expect(disposed).toBe(false);
  } finally { await act(async () => setup.dispose()); path.mockRestore(); }
  expect(disposed).toBe(true);
});

test("image IPC ignores unrelated packets, rejects malformed input, throttles and removes listeners", () => {
  const connected = Object.getOwnPropertyDescriptor(process, "connected");
  Object.defineProperty(process, "connected", { configurable: true, value: true });
  const images: unknown[] = [], errors: unknown[] = [], before = process.listenerCount("message");
  let dispose = subscribeImages(image => images.push(image), error => errors.push(error));
  try {
    process.emit("message", { type: "unrelated" });
    process.emit("message", { type: "gitmsg:image", name: "bad.png", base64: "!!!!" });
    expect(errors).toHaveLength(1); expect(images).toHaveLength(0);
    dispose(); dispose = subscribeImages(image => images.push(image), error => errors.push(error));
    const packet = { type: "gitmsg:image", name: "paste.png", base64: Buffer.from(pngImage()).toString("base64") };
    process.emit("message", packet); process.emit("message", packet);
    expect(images).toHaveLength(1);
  } finally { dispose(); if (connected) Object.defineProperty(process, "connected", connected); else delete (process as any).connected; }
  expect(process.listenerCount("message")).toBe(before);
});
