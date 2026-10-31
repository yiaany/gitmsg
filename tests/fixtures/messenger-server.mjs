/** Browser-only integration fixture. Never imported by the application.
 * All /api calls terminate here in process memory; no credentials or GitHub traffic.
 * Start with Node 22; proxies only HTML/static assets from localhost:3490.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

const user = { id: 987654321, login: "fixture-user" };
const other = { id: 987654322, login: "fixture-friend" };
const channel = { id: "fixture-friend/gitmsg-channel-news", name: "news", description: "Browser verification channel", branch: "main", private: false, kind: "channel", canWrite: false };
const room = { id: "fixture-user/gitmsg-check", name: "Fixture Friend", peer: other, color: "#6c61df", description: "Browser verification only", branch: "main", private: true, kind: "chat", canWrite: true };
const repositories = new Map([[room.id, room], [channel.id, channel]]);
let rooms = [room];
let profile = { name: "Fixture User", bio: "Only in the test process", color: "#6c61df" };
let published = false;
const policies = new Map();
const events = new Map([[room.id, [
  { v: 1, id: "fixture-message-one", kind: "message", actor: other, createdAt: new Date().toISOString(), text: "A message for checking replies and search. https://github.com" },
  { v: 1, id: "fixture-message-two", kind: "message", actor: user, createdAt: new Date().toISOString(), text: "A real interface, with isolated test data." },
]], [channel.id, [{ v: 1, id: "fixture-post-one", kind: "message", actor: other, createdAt: new Date().toISOString(), text: "Only repository writers can publish here." }]]]);
const calls = [];
const media = new Map();
function json(response, data, status = 200) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(data)); }
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost:3491");
    if (url.pathname === "/__fixture/state") return json(response, { rooms, profile, published, calls });
    if (url.pathname === "/__fixture/incoming" && request.method === "POST") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (!repositories.has(body.repo)) return json(response, { error: "Unknown fixture repository" }, 404);
      const event = { v: 1, id: randomUUID(), kind: "message", actor: other, text: String(body.text || "Fixture incoming message"), createdAt: new Date().toISOString(), sha: randomUUID().replaceAll("-", "").padEnd(40, "0") };
      events.set(body.repo, [...(events.get(body.repo) || []), event]); return json(response, { event });
    }
    // Separate, loopback-only test documents. Production keeps X-Frame-Options
    // DENY / frame-ancestors 'none'; no real account/session is present here.
    if (url.pathname === "/__fixture/render" || url.pathname === "/__fixture/login") {
      const html = await (await fetch("http://localhost:3490/")).text();
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": "frame-ancestors 'self'" });
      return response.end(html);
    }
    if (url.pathname === "/__fixture/viewport") {
      const width = Math.max(320, Math.min(1600, Number(url.searchParams.get("width")) || 390));
      const height = Math.max(320, Math.min(1200, Number(url.searchParams.get("height")) || 844));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return response.end(`<!doctype html><html><head><title>Isolated ${width}×${height} viewport</title></head><body style="margin:0;background:#777"><iframe title="gitmsg test viewport" style="display:block;width:${width}px;height:${height}px;border:0" src="/__fixture/${url.searchParams.get("screen") === "login" ? "login" : "render"}"></iframe></body></html>`);
    }
    if (!url.pathname.startsWith("/api/")) {
      const upstream = await fetch(`http://localhost:3490${request.url}`);
      response.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([key]) => !["content-encoding", "content-length", "transfer-encoding"].includes(key))));
      return response.end(Buffer.from(await upstream.arrayBuffer()));
    }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const path = url.pathname; const write = request.method === "POST";
    calls.push({ path, method: request.method, ...(write ? { body } : {}) });
    if (path === "/api/session") return json(response, { user: new URL(request.headers.referer || "/", "http://localhost:3491").pathname === "/__fixture/login" ? null : user, configured: true, mode: "oauth", installUrl: null });
    if (path === "/api/profile") { if (write) { if (!body.publish) return json(response, { error: "Consent required" }, 400); profile = body.profile; published = true; } return json(response, { user: url.searchParams.get("login") === other.login ? other : user, profile, published }); }
    if (path === "/api/library") {
      if (write) { const selected = repositories.get(body.repo); rooms = rooms.filter(room => room.id !== body.repo); if (body.action !== "remove" && selected) rooms.push(selected); }
      return json(response, { rooms, ...(write && body.action !== "remove" ? { room: repositories.get(body.repo) } : {}) });
    }
    if (path === "/api/search") return json(response, { users: [other], channels: [channel] });
    if (path === "/api/repos") {
      if (write) { const created = { id: `fixture-user/gitmsg-${body.kind === "channel" ? "channel-" : ""}${body.name}`, name: body.title || body.name, ...(body.avatar ? { avatar: body.avatar } : {}), ...(body.peer ? { peer: other } : {}), description: body.description || "", branch: "main", private: body.kind !== "channel", kind: body.kind || "chat", canWrite: true }; repositories.set(created.id, created); return json(response, { room: created }, 201); }
      return json(response, url.searchParams.has("repo") ? { room: repositories.get(url.searchParams.get("repo")) } : { rooms: [...repositories.values()] });
    }
    if (path === "/api/security") { if (write) policies.set(body.repo, { enabled: true, keyId: body.keyId }); return json(response, policies.get(body.repo || url.searchParams.get("repo")) || { enabled: false }); }
    if (path === "/api/media") {
      const repo = body.repo || url.searchParams.get("repo"); const id = body.id || url.searchParams.get("id"); const key = `${repo}/${id}`;
      if (write) { if (!repositories.get(repo)?.canWrite) return json(response, { error: "Read only" }, 403); media.set(key, Buffer.from(body.data, "base64")); return json(response, { stored: true }); }
      const bytes = media.get(key); if (!bytes) return json(response, { error: "Missing fixture media" }, 404);
      response.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" }); return response.end(bytes);
    }
    if (path === "/api/chat") {
      const repo = body.repo || url.searchParams.get("repo");
      if (write) { if (!repositories.get(repo)?.canWrite) return json(response, { error: "Read only" }, 403); const event = { ...body.event, actor: user, sha: randomUUID().replaceAll("-", "").padEnd(40, "0") }; events.set(repo, [...(events.get(repo) || []), event]); return json(response, { event }, 201); }
      return json(response, { events: events.get(repo) || [], head: "fixture-head", older: null });
    }
    if (path === "/api/proposals") return json(response, { proposals: [] });
    if (path === "/api/bot") return json(response, { installed: false });
    if (path === "/api/invite") return json(response, { invited: true });
    return json(response, { error: `Fixture blocks unhandled API: ${path}` }, 400);
  } catch (error) { json(response, { error: error.message }, 500); }
}).listen(3491, "127.0.0.1", () => console.log("Isolated browser fixture: http://localhost:3491 (no GitHub requests)"));
