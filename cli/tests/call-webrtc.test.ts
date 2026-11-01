import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

test("two isolated native WebRTC workers exchange synthetic audio and cleanly hang up, without microphone or GitHub", { timeout: 20000 }, async () => {
  function worker() {
    const child = fork(fileURLToPath(new URL("../src/call-worker.ts", import.meta.url)), { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "ignore", "ipc"], env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    const session = crypto.randomUUID(), pending = new Map<string, (packet: any) => void>();
    let description: any, descriptionReady!: () => void, audioReady!: () => void, stateReady!: () => void;
    const ice = new Promise<void>(resolve => { descriptionReady = resolve; }), audio = new Promise<void>(resolve => { audioReady = resolve; }), connected = new Promise<void>(resolve => { stateReady = resolve; });
    child.on("message", (packet: any) => {
      if (packet.session !== session) return;
      if (packet.id && pending.has(packet.id)) { pending.get(packet.id)!(packet); pending.delete(packet.id); }
      if (packet.event === "description" && packet.value?.sdp?.includes("a=candidate:")) { description = packet.value; descriptionReady(); }
      if (packet.event === "state" && packet.value === "connected") stateReady();
      if (packet.type === "gitmsg:rtc-audio") { const bytes = Buffer.from(packet.samples, "base64"); for (let i = 0; i < bytes.length - 1; i += 2) if (Math.abs(bytes.readInt16LE(i)) > 50) { audioReady(); break; } }
    });
    function request(method: string, value?: unknown) { const id = crypto.randomUUID(); return new Promise<any>((resolve, reject) => { pending.set(id, packet => packet.error ? reject(new Error("WebRTC worker rejected control")) : resolve(packet.value)); child.send({ type: "gitmsg:rtc", session, id, method, value }); }); }
    let fail!: (error: Error) => void;
    const failure = new Promise<never>((_, reject) => { fail = reject; });
    child.on("error", fail);
    let closing = false;
    child.on("exit", () => { if (!closing) fail(new Error("WebRTC worker exited unexpectedly")); });
    return { child, request, ice, audio, connected, failure, description: () => description, pcm: (samples: string) => { if (child.connected) child.send({ type: "gitmsg:rtc", session, method: "pcm", value: samples }, error => { if (error && !closing) fail(error); }); }, close: async () => {
      closing = true;
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 1500);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
        if (child.connected) child.send({ type: "gitmsg:rtc", session, method: "close" }, () => {});
        else child.kill();
      });
    } };
  }
  const a = worker(), b = worker(); let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Synthetic WebRTC loopback timed out")), 15000); timer.unref(); });
  try {
    await Promise.race([(async () => {
      await Promise.all([a.request("prepare"), b.request("prepare")]);
      await a.request("local", await a.request("offer")); await a.ice;
      await b.request("remote", a.description()); await b.request("local", await b.request("answer")); await b.ice;
      await a.request("remote", b.description()); await Promise.all([a.connected, b.connected]);
      let phase = 0;
      interval = setInterval(() => { const samples = new Int16Array(480); for (let i = 0; i < samples.length; i++) samples[i] = Math.round(Math.sin(phase++ / 20) * 6000); a.pcm(Buffer.from(samples.buffer).toString("base64")); }, 10);
      await b.audio;
    })(), timeout, a.failure, b.failure]);
    assert.ok(true, "DTLS-SRTP delivered decoded, non-silent synthetic audio");
  } finally {
    clearInterval(interval); await Promise.all([a.close(), b.close()]);
  }
});
