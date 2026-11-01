import { AudioCall, type CallView } from "../../src/lib/audio-call";
import type { Actor, ChatEvent, Room } from "../../src/lib/protocol";
import type { Rooms, TerminalRoom } from "./rooms";
import { bridgeCallDevice, type CallDevice, type CallDeviceFactory, type CallLevels } from "./call-device";
import { nativeCallDevice } from "./call-native";
import { ClientError } from "./safety";
import { freshCall } from "../../src/lib/call-protocol";

export type TerminalCallView = CallView & { endedAt?: number };
export class TerminalCalls {
  private engine: AudioCall;
  private device?: CallDevice;
  private room?: TerminalRoom;
  private view: TerminalCallView | null = null;
  private disposed = false;
  private discovery = 0;
  private starting = false;
  private startRequest = 0;
  private identities = new Map<string, Room>();
  constructor(private rooms: Rooms, private actor: Actor, change: (view: TerminalCallView | null) => void, levels: (value: CallLevels) => void, private factory: CallDeviceFactory = process.connected ? bridgeCallDevice : nativeCallDevice) {
    this.engine = new AudioCall({ actor, change: view => { this.view = view ? { ...view, ...(view.phase === "finished" ? { endedAt: this.view?.endedAt ?? Date.now() } : {}) } : null; if (!view || view.phase === "finished") { this.device?.dispose(); this.device = undefined; } if (!this.disposed) change(this.view); }, remote: () => {},
      microphone: async () => { this.device?.dispose(); this.device = this.factory(levels); return this.device.microphone(); }, peer: () => this.device!.peer(),
      send: async (room, event) => { const target: TerminalRoom = { id: room.id, branch: room.branch, title: room.name, private: true, canWrite: true }; await rooms.sendCall(target, actor, event); },
    });
  }
  get busy() { return this.starting || this.engine.busy; }
  get activeRoom() { return this.busy ? this.room : undefined; }
  async start(room: TerminalRoom) {
    if (this.busy) throw new ClientError("Finish the current call first.");
    const request = ++this.startRequest;
    this.starting = true; this.room = room;
    try {
      const identity = await this.rooms.callRoom(room, this.actor);
      await this.rooms.callEvents(room, []);
      if (this.disposed || request !== this.startRequest || this.engine.busy) return;
      this.identities.set(`${room.id}:${room.branch}`, identity);
      await this.engine.start(identity);
    } catch (error) { if (!this.disposed && request === this.startRequest) throw error; }
    finally { if (request === this.startRequest) this.starting = false; }
  }
  async observe(room: TerminalRoom, events: ChatEvent[]) {
    if (this.disposed || !events.some(event => freshCall(event))) return;
    const key = `${room.id}:${room.branch}`, request = ++this.discovery;
    try {
      const identity = this.identities.get(key) ?? await this.rooms.callRoom(room, this.actor);
      const signals = await this.rooms.callEvents(room, events);
      if (this.disposed || request !== this.discovery) return;
      this.identities.set(key, identity);
      this.engine.observe(identity, signals);
      if (this.view?.room.id === room.id) this.room = room;
    } catch { /* Non-direct chats and missing keys do not ring or open a microphone. */ }
  }
  accept() { return this.engine.accept(); }
  end() { this.startRequest++; this.starting = false; return this.engine.end(this.view?.phase === "incoming" ? "declined" : "hangup"); }
  mute() { this.engine.toggleMute(); }
  dismiss() { this.engine.dismiss(); }
  dispose() { this.disposed = true; this.discovery++; this.startRequest++; this.starting = false; this.engine.dispose(); this.device?.dispose(); }
}
