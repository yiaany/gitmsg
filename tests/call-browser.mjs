/** Opt-in browser integration: production build on 3496 + call-server.ts on 3494/3495.
 * Uses an isolated Chrome profile, loopback fixture accounts and real WebRTC audio.
 * No user profile, GitHub credentials or physical microphone is accessed.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

const root = process.env.CALL_TEST_TMP || tmpdir();
const profile = await mkdtemp(join(root, "gitmsg-call-chrome-"));
const chrome = spawn(process.env.CHROME_BIN || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome"), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--no-proxy-server", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let launchError; let launchLog = ""; chrome.stderr.on("data", bytes => { launchLog = (launchLog + bytes.toString()).slice(-5000); });
chrome.on("error", error => { launchError = error; }); chrome.on("exit", (code, signal) => { launchError = new Error(`Chrome exited (${signal || code}): ${launchLog}`); });
const clients = [];
async function until(fn, label, ms = 20000) {
  const deadline = Date.now() + ms; let last;
  while (Date.now() < deadline) { try { last = await fn(); if (last) return last; } catch (error) { last = error.message; } await delay(100); }
  throw new Error(`Timed out: ${label}; last=${JSON.stringify(last)}`);
}
async function connect(port, url) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = event => { const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (waiter) { pending.delete(message.id); message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ": " + result.exceptionDetails.exception?.description); return result.result.value; };
  await send("Runtime.enable"); await send("Page.enable");
  const client = { socket, send, evaluate, click: expression => evaluate(`${expression}.click()`), panel: () => evaluate('document.querySelector(".audio-call-panel")?.innerText || ""') };
  clients.push(client); return client;
}
const statsScript = `(async()=>Promise.all(window.__callTest.peers.map(async p=>({state:p.connectionState,types:(p.localDescription?.sdp.match(/ typ (host|srflx|relay|prflx)/g)||[]),received:Array.from((await p.getStats()).values()).filter(s=>s.type==='inbound-rtp'&&s.kind==='audio').map(s=>({packets:s.packetsReceived,bytes:s.bytesReceived,energy:s.totalAudioEnergy}))}))))()`;
try {
  const active = await until(async () => { if (launchError) throw launchError; return await readFile(join(profile, "DevToolsActivePort"), "utf8"); }, "Chrome debugging endpoint");
  const port = Number(active.split("\n")[0]);
  const a = await connect(port, "http://localhost:3494/"), b = await connect(port, "http://localhost:3495/");
  for (const client of [a, b]) {
    await until(() => client.evaluate('!!document.querySelector("button.room:not(.guide-room)")'), "fixture conversation");
    await client.click('document.querySelector("button.room:not(.guide-room)")');
    await until(() => client.evaluate('document.querySelector(\'[aria-label="Start audio call"]\')?.disabled === false'), "call entry enabled");
  }
  const start = async () => {
    await a.click('document.querySelector(\'[aria-label="Start audio call"]\')');
    await until(async () => (await b.panel()).includes("Incoming call"), "incoming call");
  };
  const close = async client => { await until(() => client.evaluate('!!document.querySelector(".call-done")'), "finished call"); await client.click('document.querySelector(".call-done")'); };
  await start();
  assert.equal(await b.evaluate("window.__callTest.microphoneRequests"), 0, "incoming must not request microphone");
  await b.click('document.querySelector(".call-accept")');
  for (const client of [a, b]) await until(async () => (await client.evaluate(statsScript)).some(p => p.state === "connected" && p.received.some(s => s.packets > 5 && s.bytes > 0 && s.energy > 0)), "received real audio", 15000);
  const plainStats = [await a.evaluate(statsScript), await b.evaluate(statsScript)];
  await a.click('document.querySelector(\'[aria-label="Mute microphone"]\')');
  assert.equal(await a.evaluate("window.__callTest.tracks.at(-1).enabled"), false);
  await a.click('document.querySelector(\'[aria-label="Unmute microphone"]\')');
  assert.equal(await a.evaluate("window.__callTest.tracks.at(-1).enabled"), true);
  await a.click('document.querySelector(\'[aria-label="Mute call audio"]\')');
  assert.equal(await a.evaluate('document.querySelector(\'[aria-label="Unmute call audio"]\').getAttribute("aria-pressed")'), "true");
  await a.click('document.querySelector(".audio-call-panel .call-decline")');
  await close(a); await close(b);
  for (const client of [a, b]) assert.equal(await client.evaluate("window.__callTest.tracks.every(t=>t.readyState==='ended') && window.__callTest.peers.every(p=>p.connectionState==='closed')"), true);

  const beforeDecline = await b.evaluate("window.__callTest.microphoneRequests");
  await start(); await b.click('document.querySelector(".call-decline")'); await close(b); await close(a);
  assert.equal(await b.evaluate("window.__callTest.microphoneRequests"), beforeDecline);

  // The same production path, now with real browser AES-GCM and IndexedDB keys.
  const raw = [...randomBytes(32)];
  for (const client of [a, b]) await client.evaluate(`(async()=>{const raw=new Uint8Array(${JSON.stringify(raw)}); const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',true,['encrypt','decrypt']); const keyId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join(''); const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gitmsg-keyring',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onsuccess=()=>resolve(r.result);r.onerror=reject;}); await new Promise((resolve,reject)=>{const t=db.transaction('keys','readwrite');t.objectStore('keys').put(key,'call-alice/gitmsg-call-test');t.oncomplete=resolve;t.onerror=reject;});db.close();await fetch('/api/security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyId})});return true;})()`);
  await start(); await b.click('document.querySelector(".call-accept")');
  for (const client of [a, b]) await until(async () => (await client.evaluate(statsScript)).at(-1)?.received.some(s => s.packets > 5 && s.energy > 0), "encrypted signaling audio", 15000);
  const secureStats = [await a.evaluate(statsScript), await b.evaluate(statsScript)];
  const screen = await a.send("Page.captureScreenshot", { format: "png" });
  const screenshot = join(profile, "call-connected.png"); await writeFile(screenshot, Buffer.from(screen.data, "base64"));
  await a.click('document.querySelector(".audio-call-panel .call-decline")'); await close(a); await close(b);
  const state = await (await fetch("http://localhost:3494/__fixture/state")).json();
  assert.ok(state.events.slice(-3).every(e => e.sealed && e.kind === "call"));
  assert.equal(state.writes.filter(w => w.path === "/api/repos").length, 0);
  for (const client of [a, b]) {
    assert.equal(await client.evaluate('document.querySelectorAll(".message").length'), 0, "technical signaling must not appear as messages");
    assert.equal(await client.evaluate("window.__callTest.tracks.every(t=>t.readyState==='ended')"), true);
  }
  console.log(JSON.stringify({ result: "PASS", plainStats, secureStats, writes: state.writes, screenshot, checks: ["real bidirectional audio packets and energy", "no microphone before accept or on decline", "microphone/output mute", "encrypted signaling", "tracks stopped and peers closed", "no message bubbles or repository creation"] }, null, 2));
} finally {
  clients.forEach(c => c.socket.close()); chrome.kill("SIGTERM");
}
