// Node-only native WebRTC. Never imports credentials, GitHub, files or the TUI.
import wrtc from "@roamhq/wrtc";
import type { CallPacket } from "./call-device";
let pc: RTCPeerConnection | undefined, track: MediaStreamTrack | undefined, source: InstanceType<typeof wrtc.nonstandard.RTCAudioSource> | undefined;
let sink: InstanceType<typeof wrtc.nonstandard.RTCAudioSink> | undefined, session = "";
let queued = 0;
function send(value: { type: string; [key: string]: unknown }) { if (process.connected && (value.type !== "gitmsg:rtc-audio" || queued < 4)) { queued++; process.send?.(value, () => { queued--; }); } }
function close() { sink?.stop(); sink = undefined; track?.stop(); track = undefined; pc?.close(); pc = undefined; source = undefined; }
process.on("message", async (input: unknown) => {
  if (!input || typeof input !== "object") return;
  const packet = input as CallPacket & { samples?: string };
  if (packet.type !== "gitmsg:rtc" || !/^[a-f0-9-]{36}$/.test(packet.session)) return;
  if (session && session !== packet.session) return;
  if (packet.method === "pcm") {
    if (source && typeof packet.value === "string" && packet.value.length === 1280) {
      const bytes = Buffer.from(packet.value, "base64");
      if (bytes.length === 960) {
        // libwebrtc inspects the backing ArrayBuffer, not the view length. Never
        // pass a view onto Node's pooled 8192-byte Buffer slab.
        const samples = new Int16Array(480);
        for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2);
        try { source.onData({ samples, sampleRate: 48000, channelCount: 1, numberOfFrames: 480 }); }
        catch { send({ type: "gitmsg:rtc", session, event: "state", value: "failed" }); close(); }
      }
    }
    return;
  }
  if (packet.method === "close") { close(); process.disconnect?.(); return; }
  try {
    let value: unknown;
    if (packet.method === "prepare" && !pc) {
      session = packet.session;
      pc = new wrtc.RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }], bundlePolicy: "max-bundle", iceCandidatePoolSize: 0 });
      source = new wrtc.nonstandard.RTCAudioSource(); track = source.createTrack(); pc.addTrack(track);
      pc.onicecandidate = () => send({ type: "gitmsg:rtc", session, event: "description", value: pc?.localDescription?.toJSON() });
      pc.onconnectionstatechange = () => send({ type: "gitmsg:rtc", session, event: "state", value: pc?.connectionState });
      pc.ontrack = event => {
        if (event.track.kind !== "audio") return;
        sink?.stop(); sink = new wrtc.nonstandard.RTCAudioSink(event.track);
        sink.ondata = (data: { samples: Int16Array; sampleRate: number; channelCount: number; numberOfFrames: number }) => {
          if (data.sampleRate !== 48000 || data.samples.length > 1920 || ![1, 2].includes(data.channelCount)) return;
          const mono = new Int16Array(data.numberOfFrames);
          for (let i = 0; i < mono.length; i++) mono[i] = data.samples[i * data.channelCount];
          send({ type: "gitmsg:rtc-audio", session, samples: Buffer.from(mono.buffer).toString("base64") });
        };
      };
    } else if (!pc) throw new Error();
    else if (packet.method === "offer") value = await pc.createOffer();
    else if (packet.method === "answer") value = await pc.createAnswer();
    else if (packet.method === "local") { await pc.setLocalDescription(packet.value as RTCSessionDescriptionInit); value = pc.localDescription?.toJSON(); }
    else if (packet.method === "remote") { const description = packet.value as RTCSessionDescriptionInit; if (!description || !["offer", "answer"].includes(description.type) || typeof description.sdp !== "string" || description.sdp.length > 14000) throw new Error(); await pc.setRemoteDescription(description); }
    else if (packet.method === "mute") { if (track) track.enabled = !packet.value; }
    else throw new Error();
    if (packet.id) send({ type: "gitmsg:rtc", session, id: packet.id, value });
  } catch { if (packet.id) send({ type: "gitmsg:rtc", session: packet.session, id: packet.id, error: true }); }
});
process.once("disconnect", () => { close(); });
process.once("SIGTERM", () => { close(); process.exit(0); });
