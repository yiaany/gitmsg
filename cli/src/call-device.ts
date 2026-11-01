import { randomUUID } from "node:crypto";
import { ClientError } from "./safety";

export type CallLevels = { local: number; remote: number };
export interface CallDevice {
  microphone(signal?: AbortSignal): Promise<MediaStream>;
  peer(): RTCPeerConnection;
  dispose(): void;
}
export type CallDeviceFactory = (levels: (value: CallLevels) => void) => CallDevice;
export type CallPacket = { type: "gitmsg:rtc"; session: string; id?: string; method?: string; value?: unknown; event?: string; error?: boolean };
export interface CallTransport { send(value: CallPacket): void; listen(fn: (value: unknown) => void): () => void; close(): void }

/** One bounded RPC peer; only SDP/control crosses IPC, never credentials or room keys. */
export function rpcCallDevice(transport: CallTransport, levels: (value: CallLevels) => void): CallDevice {
  const session = randomUUID(), pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  let closed = false, enabled = true;
  const pc = {
    connectionState: "new", localDescription: null as RTCSessionDescriptionInit | null,
    onconnectionstatechange: null as (() => void) | null,
    addTrack() {},
    createOffer: () => request("offer"), createAnswer: () => request("answer"),
    async setLocalDescription(value: RTCSessionDescriptionInit) { pc.localDescription = await request("local", value); },
    setRemoteDescription: (value: RTCSessionDescriptionInit) => request("remote", value),
    close: () => close(),
  };
  const unsubscribe = transport.listen(value => {
    if (!value || typeof value !== "object") return;
    const packet = value as CallPacket;
    if (packet.type !== "gitmsg:rtc" || packet.session !== session || closed) return;
    if (packet.id && pending.has(packet.id)) {
      const operation = pending.get(packet.id)!; pending.delete(packet.id); clearTimeout(operation.timer);
      if (packet.error) operation.reject(new ClientError("WebRTC audio failed. Check microphone permissions, audio devices and network access."));
      else operation.resolve(packet.value);
    } else if (packet.event === "description") {
      const description = packet.value as RTCSessionDescriptionInit;
      if (description && typeof description.sdp === "string" && description.sdp.length <= 14000 && ["offer", "answer"].includes(description.type)) pc.localDescription = description;
    } else if (packet.event === "state" && ["new", "connecting", "connected", "disconnected", "failed", "closed"].includes(String(packet.value))) {
      if (packet.value === "failed") { for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(new ClientError("WebRTC audio device or connection failed.")); } pending.clear(); }
      pc.connectionState = String(packet.value); pc.onconnectionstatechange?.();
    } else if (packet.event === "level") {
      const value = packet.value as CallLevels;
      if (value && Number.isFinite(value.local) && Number.isFinite(value.remote)) levels({ local: enabled ? Math.max(0, Math.min(1, value.local)) : 0, remote: Math.max(0, Math.min(1, value.remote)) });
    }
  });
  function request(method: string, value?: unknown): Promise<any> {
    if (closed) return Promise.reject(new ClientError("Call device closed."));
    if (pending.size >= 8) return Promise.reject(new ClientError("Call device busy."));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new ClientError("Call device timed out.")); }, 30000);
      pending.set(id, { resolve, reject, timer });
      try { transport.send({ type: "gitmsg:rtc", session, id, method, value }); }
      catch { pending.delete(id); clearTimeout(timer); reject(new ClientError("Call device unavailable.")); }
    });
  }
  function close() {
    if (closed) return;
    try { transport.send({ type: "gitmsg:rtc", session, method: "close" }); } catch {}
    closed = true; unsubscribe();
    for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(new ClientError("Call cancelled.")); }
    pending.clear(); transport.close(); levels({ local: 0, remote: 0 });
  }
  const track = { get enabled() { return enabled; }, set enabled(value: boolean) { enabled = value; void request("mute", !value).catch(() => {}); }, onended: null, stop: close };
  return {
    async microphone(signal) { signal?.addEventListener("abort", close, { once: true }); if (signal?.aborted) { close(); throw new ClientError("Call cancelled."); } await request("prepare"); return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream; },
    peer: () => pc as unknown as RTCPeerConnection, dispose: close,
  };
}

export function bridgeCallDevice(levels: (value: CallLevels) => void): CallDevice {
  let session = "", notifyDisconnect = () => {};
  return rpcCallDevice({ send: value => { session = value.session; if (!process.connected || !process.send) throw new Error(); process.send(value, error => { if (error) notifyDisconnect(); }); }, listen: fn => {
    const disconnected = () => fn({ type: "gitmsg:rtc", session, event: "state", value: "failed" });
    notifyDisconnect = disconnected; process.on("message", fn); process.on("disconnect", disconnected);
    return () => { notifyDisconnect = () => {}; process.off("message", fn); process.off("disconnect", disconnected); };
  }, close() {} }, levels);
}
