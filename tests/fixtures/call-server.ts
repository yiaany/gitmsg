/** Loopback-only two-account browser test. APIs stay in memory; real WebRTC carries a generated tone.
 * Run with tsx; serve a production build separately on localhost:3496.
 * No fixture code is imported by the application. No GitHub traffic or credentials.
 */
import http from "node:http";
import { validEvent, type ChatEvent, type Room } from "../../src/lib/protocol";

const alice = { id: 987654331, login: "call-alice" }, bob = { id: 987654332, login: "call-bob" };
const base: Room = { id: "call-alice/gitmsg-call-test", name: "Call Bob", description: "Isolated audio verification", branch: "main", private: true, kind: "chat", canWrite: true };
const events: ChatEvent[] = [];
let policy = { enabled: false, keyId: undefined as string | undefined };
const writes: { path: string; kind?: string; phase?: string }[] = [];
const instrumentation = `<script>
// Test-only audio source and connection observation, not simulated WebRTC.
window.__callTest = { peers: [], tracks: [], microphoneRequests: 0 };
Object.defineProperty(document, 'hidden', {get: () => false});
document.hasFocus = () => true;
const NativePeer = window.RTCPeerConnection;
window.RTCPeerConnection = class extends NativePeer { constructor(config) { super(config); window.__callTest.peers.push(this); } };
navigator.mediaDevices.getUserMedia = async () => {
 window.__callTest.microphoneRequests++;
 const context = new AudioContext(); await context.resume();
 const oscillator = context.createOscillator(); oscillator.frequency.value = location.port === '3494' ? 330 : 440;
 const gain = context.createGain(); gain.gain.value = .01;
 const destination = context.createMediaStreamDestination(); oscillator.connect(gain); gain.connect(destination); oscillator.start();
 for (const track of destination.stream.getTracks()) { window.__callTest.tracks.push(track); const stop = track.stop.bind(track); track.stop = () => { stop(); oscillator.stop(); void context.close(); }; }
 return destination.stream;
};
</script>`;
function json(response: http.ServerResponse, data: unknown, status = 200) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(data)); }
for (const [port, user, peer] of [[3494, alice, bob], [3495, bob, alice]] as const) {
  const room = { ...base, peer, name: peer.id === bob.id ? "Call Bob" : "Call Alice" };
  http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url!, `http://localhost:${port}`);
      if (url.pathname === "/__fixture/state") return json(response, { writes, events: events.map(e => ({ kind: e.kind, phase: e.call?.phase, sealed: !!e.sealed })), room });
      if (url.pathname === "/__fixture/mobile") {
        response.writeHead(200, { "Content-Type": "text/html" });
        return response.end('<iframe title="Mobile call test" src="/" style="width:390px;height:844px;border:0" allow="microphone;autoplay"></iframe>');
      }
      if (!url.pathname.startsWith("/api/")) {
        const upstream = await fetch(`http://localhost:3496${url.pathname}${url.search}`);
        const headers = Object.fromEntries([...upstream.headers].filter(([key]) => !["content-encoding", "content-length", "transfer-encoding", "content-security-policy", "x-frame-options"].includes(key)));
        headers["content-security-policy"] = (upstream.headers.get("content-security-policy") || "").replace("frame-ancestors 'none'", "frame-ancestors 'self'");
        response.writeHead(upstream.status, headers);
        const bytes = Buffer.from(await upstream.arrayBuffer());
        return response.end(upstream.headers.get("content-type")?.includes("text/html") ? bytes.toString().replace("<head>", "<head>" + instrumentation) : bytes);
      }
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const write = request.method === "POST";
      if (write) writes.push({ path: url.pathname, kind: body.event?.kind, phase: body.event?.call?.phase });
      if (url.pathname === "/api/session") return json(response, { user, configured: true, mode: "oauth", installUrl: null });
      if (url.pathname === "/api/library") return json(response, { rooms: [room], room });
      if (url.pathname === "/api/repos") return write ? json(response, { error: "Unexpected repository creation" }, 400) : json(response, { room, rooms: [room] });
      if (url.pathname === "/api/profile") return json(response, { profile: { name: user.id === alice.id ? "Call Alice" : "Call Bob", bio: "Isolated test account", color: "#6c61df" }, published: true });
      if (url.pathname === "/api/security") { if (write) policy = { enabled: true, keyId: body.keyId }; return json(response, policy); }
      if (url.pathname === "/api/chat") {
        if (write) {
          const e = { ...body.event, actor: user };
          if (body.repo !== room.id || !validEvent(e) || (policy.enabled && e.sealed?.keyId !== policy.keyId)) return json(response, { error: "Invalid fixture signaling" }, 400);
          if (!events.some(old => old.id === e.id)) events.push({ ...e, sha: crypto.randomUUID().replaceAll("-", "").padEnd(40, "0") });
          return json(response, { event: events.find(old => old.id === e.id) }, 201);
        }
        return json(response, { events, head: events.at(-1)?.sha || null, older: null });
      }
      return json(response, { error: "Fixture blocks unknown API" }, 400);
    } catch (error) { json(response, { error: (error as Error).message }, 500); }
  }).listen(port, "127.0.0.1", () => console.log(`Isolated call fixture http://localhost:${port}`));
}
