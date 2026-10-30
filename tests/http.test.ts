import test from "node:test";
import assert from "node:assert/strict";

const origin = process.env.TEST_BASE_URL;
test("anonymous session exposes no token and no cacheable private response", { skip: !origin }, async () => {
  const response = await fetch(`${origin}/api/session`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const body = await response.json();
  assert.equal(body.user, null); assert.equal("token" in body, false);
});
test("chat and repository APIs require an authenticated session", { skip: !origin }, async () => {
  for (const path of ["/api/chat?repo=octocat/chat", "/api/repos", "/api/join?repo=octocat/chat", "/api/media?repo=octocat/chat", "/api/security?repo=octocat/chat", "/api/proposals?repo=octocat/chat", "/api/bot?repo=octocat/chat"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /session expired/i);
  }
});
test("the app shell is static, framed safely, and English", { skip: !origin }, async () => {
  const response = await fetch(origin!);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(await response.text(), /lang="en"/);
});

test("the messenger shell stays minimal with Kokonut UI and accessible controls", { skip: !origin }, async () => {
  const html = await (await fetch(origin!)).text();
  assert.match(html, /Sign in with GitHub/);
  assert.match(html, /data-slot="frame"/);
  assert.match(html, /data-slot="textarea-control"/);
  assert.match(html, /Geist-latin\.woff2/);
  assert.match(html, /Search messages/);
  assert.doesNotMatch(html, /Open whiteboard|Excalidraw|board-modal/);
  assert.doesNotMatch(html, /Under the hood|Receipts\. Literally|Take your baggage|All the chat|extremely online|BETA-ISH/);
});

test("onboarding and invitations require a session and same-origin requests", { skip: !origin }, async () => {
  for (const path of ["/api/onboard", "/api/invite", "/api/join", "/api/chat", "/api/media", "/api/security", "/api/proposals", "/api/saved", "/api/bot"]) {
    const denied = await fetch(`${origin}${path}`, { method: "POST", headers: { Origin: "https://other.example" } });
    assert.equal(denied.status, 403);
    const anonymous = await fetch(`${origin}${path}`, { method: "POST", headers: { Origin: origin! } });
    assert.equal(anonymous.status, 401);
  }
});

test("self-hosted typography is available", { skip: !origin }, async () => {
  for (const name of ["Geist-latin.woff2", "Geist-cyrillic.woff2", "GeistMono-latin.woff2"]) {
    const response = await fetch(`${origin}/fonts/${name}`);
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), "wOF2");
    assert.ok(bytes.length > 1000);
  }
});

test("unconfigured OAuth stays on the deployed origin without a server error", { skip: !origin }, async t => {
  const session = await (await fetch(`${origin}/api/session`)).json();
  if (session.configured) { t.skip("Deployment already has OAuth credentials"); return; }
  for (const path of ["/api/auth/login", "/api/auth/callback"]) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    assert.ok([302, 303, 307].includes(response.status));
    assert.equal(new URL(response.headers.get("location")!, origin).origin, new URL(origin!).origin);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
  }
});
