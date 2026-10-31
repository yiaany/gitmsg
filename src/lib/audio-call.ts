import { callableRoom, CALL_TTL_MS, freshCall, ICE_BATCH_MS, validCallSignal, type CallSignal } from "./call-protocol";
import type { Actor, ChatEvent, Room } from "./protocol";

export const DIRECT_CALL_FAILURE = "Could not connect directly. Your provider, router, or firewall may prevent this call. There is no TURN relay; try another network.";
export type CallView = { room: Room; id: string; incoming: boolean; phase: "incoming" | "preparing" | "ringing" | "connecting" | "connected" | "finished"; muted: boolean; startedAt?: number; detail?: string };
type Active = { view: CallView; abort: AbortController; pc?: RTCPeerConnection; stream?: MediaStream; offer?: ChatEvent; timer?: ReturnType<typeof setTimeout>; disconnect?: ReturnType<typeof setTimeout>; published?: boolean; answering?: boolean };
type Options = {
  actor: Actor; send: (room: Room, event: ChatEvent) => Promise<void>; change: (view: CallView | null) => void;
  remote: (stream: MediaStream | null) => void;
  microphone?: () => Promise<MediaStream>; peer?: () => RTCPeerConnection;
  seen?: (key: string) => boolean; remember?: (key: string) => void;
};

/** One audio connection. Git carries only three bounded batches: offer, answer, end. */
export class AudioCall {
  private active?: Active;
  private seen = new Set<string>();
  private writes: Promise<void> = Promise.resolve();
  private disposed = false;
  constructor(private options: Options) {}
  get busy() { return !!this.active && this.active.view.phase !== "finished"; }
  private update(a: Active, patch: Partial<CallView>) {
    if (this.active !== a || this.disposed) return;
    a.view = { ...a.view, ...patch }; this.options.change(a.view);
  }
  private key(room: Room, id: string) { return `${room.id.toLowerCase()}:${room.branch}:${id}`; }
  private remember(room: Room, id: string) {
    const key = this.key(room, id); this.seen.add(key); this.options.remember?.(key);
    if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value!);
  }
  private emit(a: Active, phase: CallSignal["phase"], data: Partial<CallSignal> = {}) {
    const event: ChatEvent = { v: 1, id: crypto.randomUUID(), kind: "call", actor: this.options.actor, createdAt: new Date().toISOString(), call: { id: a.view.id, to: a.view.room.peer!.id, phase, expiresAt: new Date(Date.now() + CALL_TTL_MS).toISOString(), ...data } };
    // Serialize a hangup behind an in-flight offer/answer. Never retry as a new ID.
    const pending = this.writes.then(() => this.options.send(a.view.room, event));
    this.writes = pending.catch(() => {}); return pending;
  }
  private deadline(a: Active, ms: number) {
    clearTimeout(a.timer);
    a.timer = setTimeout(() => { void this.end(a.view.phase === "connecting" ? "failed" : "timeout"); }, Math.max(0, ms));
  }
  private create(room: Room, id: string, incoming: boolean): Active {
    const a: Active = { view: { room, id, incoming, phase: incoming ? "incoming" : "preparing", muted: false }, abort: new AbortController() };
    this.active = a; this.remember(room, id); this.options.change(a.view); this.deadline(a, CALL_TTL_MS); return a;
  }
  async start(room: Room) {
    if (this.disposed || this.busy || !callableRoom(room, this.options.actor)) return;
    const a = this.create(room, crypto.randomUUID(), false);
    try {
      const pc = await this.prepare(a); if (!pc) return;
      await pc.setLocalDescription(await pc.createOffer());
      const sdp = await this.batch(a); if (!sdp) return;
      a.published = true; await this.emit(a, "offer", { sdp });
      if (!a.abort.signal.aborted && a.view.phase === "preparing") { this.update(a, { phase: "ringing" }); this.deadline(a, CALL_TTL_MS); }
    } catch (error) { await this.fail(a, error); }
  }
  /** Observe a whole canonical batch before ringing: a later end suppresses an old offer. */
  observe(room: Room, events: ChatEvent[]) {
    if (this.disposed || !callableRoom(room, this.options.actor)) return;
    const signals = events.filter(e => freshCall(e) && e.actor.id === room.peer!.id && e.actor.login.toLowerCase() === room.peer!.login.toLowerCase() && e.call!.to === this.options.actor.id);
    const ended = new Set(signals.filter(e => e.call!.phase === "end").map(e => e.call!.id));
    for (const e of signals) {
      const c = e.call!, a = this.active;
      const matches = a && a.view.id === c.id && a.view.room.id.toLowerCase() === room.id.toLowerCase() && a.view.room.branch === room.branch;
      if (c.phase === "end") {
        this.remember(room, c.id);
        if (matches && !a.abort.signal.aborted) this.finish(a, c.reason === "declined" ? "Call declined" : c.reason === "busy" ? "Already on another call" : "Call ended");
      } else if (c.phase === "answer" && matches && !a.view.incoming && !a.answering && a.pc && !a.abort.signal.aborted) {
        a.answering = true; this.update(a, { phase: "connecting" }); this.deadline(a, 35000);
        void a.pc.setRemoteDescription({ type: "answer", sdp: c.sdp }).catch(error => this.fail(a, error));
      } else if (c.phase === "offer") {
        const key = this.key(room, c.id);
        if (ended.has(c.id) || this.seen.has(key) || this.options.seen?.(key)) continue;
        this.remember(room, c.id);
        if (this.busy) {
          // Simultaneous dialing: the lower actor ID keeps its outgoing call.
          if (a && !a.view.incoming && a.view.phase !== "connected" && a.view.room.id === room.id && room.peer!.id < this.options.actor.id) { void this.end("busy"); }
          else { const rejected: Active = { view: { room, id: c.id, incoming: true, phase: "finished", muted: false }, abort: new AbortController() }; void this.emit(rejected, "end", { reason: "busy" }).catch(() => {}); continue; }
        }
        const incoming = this.create(room, c.id, true); incoming.offer = e;
        this.deadline(incoming, Date.parse(c.expiresAt) - Date.now());
      }
    }
  }
  async accept() {
    const a = this.active;
    if (!a || a.view.phase !== "incoming" || !a.offer || !freshCall(a.offer)) return;
    this.update(a, { phase: "preparing" });
    try {
      const pc = await this.prepare(a); if (!pc) return;
      await pc.setRemoteDescription({ type: "offer", sdp: a.offer.call!.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      const sdp = await this.batch(a); if (!sdp) return;
      a.published = true; await this.emit(a, "answer", { sdp });
      if (!a.abort.signal.aborted && !a.view.startedAt) { this.update(a, { phase: "connecting" }); this.deadline(a, 35000); }
    } catch (error) { await this.fail(a, error); }
  }
  private async prepare(a: Active) {
    if (!this.options.microphone && (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection)) throw new Error("Audio calls need a secure browser with microphone and WebRTC support.");
    // Never request a microphone or contact a peer merely because an offer arrived.
    const stream = await (this.options.microphone?.() ?? navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }));
    if (a.abort.signal.aborted) { stream.getTracks().forEach(track => track.stop()); return; }
    a.stream = stream;
    const pc = this.options.peer?.() ?? new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }], bundlePolicy: "max-bundle", iceCandidatePoolSize: 0 });
    a.pc = pc;
    stream.getAudioTracks().forEach(track => { track.enabled = !a.view.muted; pc.addTrack(track, stream); track.onended = () => { if (!a.abort.signal.aborted) void this.end("failed"); }; });
    pc.ontrack = event => { if (!a.abort.signal.aborted && event.track.kind === "audio") this.options.remote(event.streams[0] || new MediaStream([event.track])); };
    pc.onconnectionstatechange = () => {
      if (a.abort.signal.aborted) return;
      if (pc.connectionState === "connected") { clearTimeout(a.timer); clearTimeout(a.disconnect); a.disconnect = undefined; this.update(a, { phase: "connected", startedAt: a.view.startedAt || Date.now() }); }
      if (pc.connectionState === "failed") void this.end("failed");
      if (pc.connectionState === "disconnected" && !a.disconnect) a.disconnect = setTimeout(() => { if (pc.connectionState !== "connected") void this.end("failed"); a.disconnect = undefined; }, 10000);
    };
    return pc;
  }
  private async batch(a: Active) {
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); a.abort.signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, ICE_BATCH_MS); a.abort.signal.addEventListener("abort", done, { once: true });
      if (a.abort.signal.aborted) done();
    });
    if (a.abort.signal.aborted) return;
    const sdp = a.pc?.localDescription?.sdp;
    if (!sdp?.includes("\r\na=candidate:")) throw new Error(DIRECT_CALL_FAILURE);
    if (!validCallSignal({ id: a.view.id, to: a.view.room.peer!.id, phase: "offer", expiresAt: new Date().toISOString(), sdp })) throw new Error("The browser produced unsupported or oversized audio connection parameters.");
    return sdp;
  }
  toggleMute() {
    const a = this.active; if (!a || a.abort.signal.aborted) return;
    const muted = !a.view.muted; a.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; }); this.update(a, { muted });
  }
  private finish(a: Active, detail: string) {
    a.abort.abort(); clearTimeout(a.timer); clearTimeout(a.disconnect);
    a.pc?.close(); a.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    if (this.active === a) this.options.remote(null);
    this.update(a, { phase: "finished", detail });
  }
  async end(reason: NonNullable<CallSignal["reason"]> = "hangup") {
    const a = this.active; if (!a || a.abort.signal.aborted) return;
    this.finish(a, reason === "failed" ? DIRECT_CALL_FAILURE : reason === "timeout" ? "No answer. Your partner must have gitmsg open and online." : reason === "declined" ? "Call declined" : "Call ended");
    if (a.published || a.view.incoming) {
      try { await this.emit(a, "end", { reason }); }
      catch { this.update(a, { detail: `${a.view.detail} Your microphone is off, but the end signal could not be committed; the other side will time out.` }); }
    }
  }
  private async fail(a: Active, error: unknown) {
    if (a.abort.signal.aborted) return;
    await this.end("failed");
    const denied = error instanceof Error && ["NotAllowedError", "NotFoundError", "NotReadableError"].includes(error.name);
    this.update(a, { detail: denied ? "Microphone unavailable. Allow microphone access and check that an audio input is connected." : error instanceof Error ? error.message : DIRECT_CALL_FAILURE });
  }
  dismiss() { if (!this.busy) { this.active = undefined; this.options.change(null); } }
  dispose() { const a = this.active; if (a && !a.abort.signal.aborted) this.finish(a, "Call ended"); this.disposed = true; }
}
