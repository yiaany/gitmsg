import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rpcCallDevice, type CallDevice, type CallLevels, type CallPacket } from "./call-device";
import { amplitude } from "./voice-data";

/** Bun owns local audio; isolated Node owns libwebrtc (not safe to unload in Bun). */
export function nativeCallDevice(levels: (value: CallLevels) => void): CallDevice {
  let stop = () => {}, controller: AbortController | undefined;
  const listeners = new Set<(value: unknown) => void>();
  let child: ReturnType<typeof spawn> | undefined, session = "", disposed = false;
  let local = 0, remote = 0, lastLevel = 0;
  const notify = () => { if (Date.now() - lastLevel > 65) { lastLevel = Date.now(); levels({ local, remote }); } };
  let output: ReadableStreamDefaultController<Uint8Array> | undefined;
  const outputQueue: Uint8Array[] = [];
  let outputWaiting = false;
  const failed = () => { if (!disposed) for (const fn of listeners) fn({ type: "gitmsg:rtc", session, event: "state", value: "failed" }); };
  const device = rpcCallDevice({
    listen(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    send(packet) {
      session = packet.session;
      if (packet.method === "prepare") { void prepare(packet); return; }
      if (child?.connected) child.send(packet, error => { if (error) failed(); });
      else if (packet.method !== "close") throw new Error();
    },
    close() {
      disposed = true; controller?.abort(); try { stop(); } catch {} outputQueue.length = 0;
      try { output?.close(); } catch {} output = undefined;
      const owned = child; child = undefined;
      if (owned && owned.exitCode === null && owned.signalCode === null) { const timer = setTimeout(() => owned.kill("SIGKILL"), 1500); timer.unref(); owned.once("exit", () => clearTimeout(timer)); if (owned.connected) owned.send({ type: "gitmsg:rtc", session, method: "close" }, () => {}); }
    },
  }, levels);
  async function prepare(packet: CallPacket) {
    try {
      if (disposed || process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT) throw new Error();
      const bundled = fileURLToPath(new URL("./call-worker.js", import.meta.url));
      const worker = existsSync(bundled) ? bundled : fileURLToPath(new URL("../dist/call-worker.js", import.meta.url));
      if (!existsSync(worker)) throw new Error();
      // Deliberate executable, no shell, no inherited tokens, room keys, NODE_OPTIONS or dotenv.
      const env: NodeJS.ProcessEnv = {};
      for (const key of ["HOME", "PATH", "SystemRoot", "TMPDIR", "LANG"]) if (process.env[key]) env[key] = process.env[key];
      const proc = spawn(process.env.GITMSG_NODE_EXECUTABLE || "node", [worker], { env, stdio: ["ignore", "ignore", "ignore", "ipc"], shell: false }); child = proc;
      proc.on("error", () => { for (const fn of listeners) fn({ type: "gitmsg:rtc", session, id: packet.id, error: true }); });
      proc.on("exit", () => { if (!disposed) for (const fn of listeners) fn({ type: "gitmsg:rtc", session, event: "state", value: "failed" }); });
      proc.on("message", (message: any) => {
        if (disposed || message?.session !== session) return;
        if (message.type === "gitmsg:rtc-audio" && typeof message.samples === "string" && message.samples.length <= 2560) {
          const bytes = Buffer.from(message.samples, "base64");
          if (!bytes.length || bytes.length % 2) return;
          const samples = new Float32Array(bytes.length / 2);
          for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2) / 32768;
          remote = amplitude(samples); notify();
          const pcm = new Uint8Array(samples.buffer);
          if (outputWaiting && output) { outputWaiting = false; output.enqueue(pcm); }
          else { if (outputQueue.length >= 20) outputQueue.shift(); outputQueue.push(pcm); }
        } else if (message.type === "gitmsg:rtc") for (const fn of listeners) fn(message);
      });
      const { Audio } = await import("@opentui/core");
      if (disposed) return;
      controller = new AbortController();
      const audio = Audio.create({ autoStart: false, sampleRate: 48000 });
      stop = () => audio.dispose();
      audio.on("error", () => { if (!disposed) for (const fn of listeners) fn({ type: "gitmsg:rtc", session, event: "state", value: "failed" }); });
      const capture = await audio.openCapture({ channels: 1, chunkFrames: 480, signal: controller.signal });
      if (disposed) { capture.dispose(); audio.dispose(); return; }
      const pcm = new ReadableStream<Uint8Array>({ start(c) { output = c; }, pull(c) { const chunk = outputQueue.shift(); if (chunk) c.enqueue(chunk); else outputWaiting = true; } }, { highWaterMark: 1 });
      // playStream resolves only after the first remote PCM frames. Waiting here
      // would deadlock before we can negotiate the connection that supplies them.
      void audio.playStream(pcm, { format: "pcm", sampleFormat: "f32le", sampleRate: 48000, channels: 1, signal: controller.signal, buffer: { capacityMs: 250, startupMs: 30, resumeMs: 30 } })
        .then(playback => { if (disposed) playback.dispose(); else playback.on("error", failed); }).catch(failed);
      if (!audio.start()) throw new Error();
      if (disposed) return;
      proc.send(packet, error => { if (error) failed(); });
      let queued = 0;
      void (async () => {
        try {
          const frame = new Int16Array(480); let offset = 0;
          for await (const chunk of capture.readable) {
            if (disposed) break;
            local = amplitude(chunk); notify();
            for (const sample of chunk) {
              frame[offset++] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
              if (offset === 480) { offset = 0; if (proc.connected && queued < 4) { queued++; proc.send({ type: "gitmsg:rtc", session, method: "pcm", value: Buffer.from(frame.buffer).toString("base64") }, error => { queued--; if (error) failed(); }); } }
            }
          }
          if (!disposed) failed();
        } catch { if (!disposed) for (const fn of listeners) fn({ type: "gitmsg:rtc", session, event: "state", value: "failed" }); }
      })();
    } catch { try { stop(); } catch {} for (const fn of listeners) fn({ type: "gitmsg:rtc", session, id: packet.id, error: true }); }
  }
  return device;
}
