import { randomUUID } from "node:crypto";
import { ClientError } from "./safety";
import { amplitude, memoryVoice, voiceWav, VOICE_RATE, VOICE_SECONDS, type LocalVoice } from "./voice-data";

export type VoiceUpdate = { level: number; seconds: number };
export type VoiceCapture = { result: Promise<LocalVoice>; stop(): void; cancel(): void };
export interface VoiceDriver {
  record(update: (value: VoiceUpdate) => void, signal: AbortSignal): Promise<VoiceCapture>;
  play(bytes: Uint8Array, mime: string, signal: AbortSignal): Promise<void>;
}
const unavailable = () => new ClientError("Audio device unavailable. Check microphone/speaker permissions on this device.");

/** Loads native audio only after an explicit action; never records a remote host. */
export const nativeVoice: VoiceDriver = {
  async record(update, signal) {
    if (process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT) throw new ClientError("Microphone recording over SSH is disabled. Use the local browser terminal.");
    const { Audio } = await import("@opentui/core");
    const audio = Audio.create({ autoStart: false, sampleRate: VOICE_RATE });
    let failed = false;
    audio.on("error", () => { failed = true; });
    let capture;
    try { capture = await audio.openCapture({ channels: 1, chunkFrames: 1024, signal }); }
    catch { audio.dispose(); throw unavailable(); }
    capture.on("error", () => { failed = true; });
    const samples = new Float32Array(VOICE_RATE * VOICE_SECONDS);
    let count = 0, cancelled = false;
    const cancel = () => { cancelled = true; capture.dispose(); };
    const result = (async () => {
      try {
        for await (const pcm of capture.readable) {
          const chunk = pcm.subarray(0, samples.length - count);
          samples.set(chunk, count); count += chunk.length;
          update({ level: amplitude(chunk), seconds: count / VOICE_RATE });
          if (count === samples.length) { capture.stop(); break; }
        }
        if (cancelled || signal.aborted) throw new ClientError("Recording cancelled.");
        if (failed || capture.getStats().framesDropped) throw unavailable();
        return memoryVoice(voiceWav(samples.subarray(0, count)));
      } catch (error) { if (error instanceof ClientError) throw error; throw unavailable(); }
      finally { capture.dispose(); await capture.closed; audio.dispose(); samples.fill(0); }
    })();
    return { result, stop: () => capture.stop(), cancel };
  },
  async play(bytes, mime, signal) {
    if (process.env.SSH_CONNECTION || process.env.SSH_TTY || process.env.SSH_CLIENT) throw new ClientError("Remote host playback is disabled. Use the local browser terminal.");
    if (mime !== "audio/wav") throw new ClientError("This terminal plays PCM voice messages. Use the web app for other audio codecs.");
    const voice = memoryVoice(bytes);
    if (signal.aborted) return;
    const { Audio } = await import("@opentui/core");
    const audio = Audio.create({ autoStart: false });
    let failed = false;
    audio.on("error", () => { failed = true; });
    try {
      const sound = audio.loadSound(voice.bytes);
      if (sound === null || !audio.start() || audio.play(sound) === null || failed) throw unavailable();
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, voice.duration * 1000 + 100);
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      });
    } finally { audio.dispose(); }
  },
};

/** Authenticated local PTY IPC. Browser owns microphone permissions and speakers. */
export const bridgeVoice: VoiceDriver = {
  async record(update, signal) {
    const id = randomUUID();
    let stop = () => {}, cancel = () => {};
    const result = new Promise<LocalVoice>((resolve, reject) => {
      const finish = (error?: ClientError, voice?: LocalVoice) => {
        clearTimeout(timer); process.off("message", listener); signal.removeEventListener("abort", cancel);
        if (error) reject(error); else resolve(voice!);
      };
      const send = (action: string) => process.send?.({ type: "gitmsg:voice", action, id });
      const listener = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const event = value as { type?: string; id?: string; level?: number; seconds?: number; base64?: string };
        if (event.id !== id) return;
        if (event.type === "gitmsg:voice-level" && Number.isFinite(event.level) && Number.isFinite(event.seconds)) update({ level: Math.max(0, Math.min(1, event.level!)), seconds: Math.max(0, Math.min(60, event.seconds!)) });
        if (event.type === "gitmsg:voice-error") finish(unavailable());
        if (event.type === "gitmsg:voice-result") {
          try {
            if (typeof event.base64 !== "string" || event.base64.length > 2_800_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(event.base64)) throw unavailable();
            const bytes = Buffer.from(event.base64, "base64");
            if (bytes.toString("base64") !== event.base64) throw unavailable();
            finish(undefined, memoryVoice(bytes));
          } catch { finish(unavailable()); }
        }
      };
      const timer = setTimeout(() => { send("cancel"); finish(new ClientError("Recording timed out.")); }, 75_000);
      stop = () => send("stop");
      cancel = () => { send("cancel"); finish(new ClientError("Recording cancelled.")); };
      process.on("message", listener); signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel(); else send("record");
    });
    return { result, stop, cancel };
  },
  async play(bytes, mime, signal) {
    if (bytes.length > 2 * 1024 * 1024 || !["audio/wav", "audio/webm", "audio/mp4", "audio/ogg"].includes(mime)) throw unavailable();
    const id = randomUUID();
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: ClientError) => {
        clearTimeout(timer); process.off("message", listener); signal.removeEventListener("abort", stop);
        if (error) reject(error); else resolve();
      };
      const stop = () => { process.send?.({ type: "gitmsg:voice", action: "stop-play", id }); finish(); };
      const listener = (value: unknown) => {
        const event = value as { type?: string; id?: string } | null;
        if (event?.id !== id) return;
        if (event.type === "gitmsg:voice-ended") finish();
        if (event.type === "gitmsg:voice-error") finish(unavailable());
      };
      const timer = setTimeout(stop, 65_000);
      process.on("message", listener); signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop(); else process.send?.({ type: "gitmsg:voice", action: "play", id, mime, base64: Buffer.from(bytes).toString("base64") });
    });
  },
};
export const voiceDriver = () => process.connected ? bridgeVoice : nativeVoice;
