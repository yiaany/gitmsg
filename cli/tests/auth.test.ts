import test from "node:test";
import assert from "node:assert/strict";
import { requestDeviceCode, validClientId, waitForAuthorization } from "../src/device-flow";
import { forgetCredential, readCredential, saveCredential, type Vault } from "../src/credentials";
import { GitHub, type Fetch } from "../src/github";
import { containsCredential, parseRepo, publicError, terminalText } from "../src/safety";

const clientId = "0123456789abcdef0123";
const device = { device_code: "d".repeat(40), user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5, requestedAt: 0 };
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers });

test("Device Flow uses fixed HTTPS endpoints, no client secret and disclosed minimal scopes", async () => {
  const transport = (async (url, init) => {
    assert.equal(url, "https://github.com/login/device/code");
    assert.equal(init?.redirect, "error"); assert.equal(init?.method, "POST");
    const fields = new URLSearchParams(String(init?.body));
    assert.equal(fields.get("client_id"), clientId); assert.equal(fields.get("scope"), "repo read:user");
    assert.equal(fields.has("client_secret"), false);
    return json(device);
  }) as Fetch;
  const code = await requestDeviceCode(clientId, { transport, now: () => 0 });
  assert.equal(code.user_code, "ABCD-EFGH");
});

test("Device Flow respects polling interval and slow_down, never persists refresh tokens", async () => {
  let now = 0, calls = 0; const waits: number[] = [];
  const transport = (async (url, init) => {
    assert.equal(url, "https://github.com/login/oauth/access_token");
    const fields = new URLSearchParams(String(init?.body));
    assert.equal(fields.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
    assert.equal(fields.has("client_secret"), false);
    calls++;
    return json(calls === 1 ? { error: "authorization_pending" } : calls === 2 ? { error: "slow_down", interval: 10 } : { access_token: "fixture-token", scope: "repo,read:user", token_type: "bearer", expires_in: 28800, refresh_token: "fixture-refresh" });
  }) as Fetch;
  const credential = await waitForAuthorization(clientId, device, { transport, now: () => now, sleep: async ms => { waits.push(ms); now += ms; } });
  assert.deepEqual(waits, [5000, 5000, 10000]);
  assert.equal(credential.token, "fixture-token"); assert.equal(credential.expiresAt, 28820000);
  assert.equal("refresh_token" in credential, false);
});

test("HTTP 400 OAuth errors show actionable local messages without remote descriptions", async () => {
  for (const [code, expected] of [["device_flow_disabled", /Enable Device Flow/], ["incorrect_client_credentials", /public OAuth client ID/], ["invalid_client", /public OAuth client ID/]] as const) {
    let calls = 0;
    await assert.rejects(requestDeviceCode(clientId, { transport: async () => {
      calls++;
      return json({ error: code, error_description: "do-not-echo-me", error_uri: "https://attacker.invalid" }, 400);
    } }), error => expected.test(String(error)) && !String(error).includes("do-not-echo-me") && !String(error).includes("attacker.invalid"));
    assert.equal(calls, 1);
  }
});

test("unknown HTTP errors stay generic and malformed OAuth responses are rejected", async () => {
  for (const value of [{ error: "do-not-echo-me", error_description: "private-data" }, { error: "constructor" }, { error: "__proto__" }]) {
    await assert.rejects(requestDeviceCode(clientId, { transport: async () => json(value, 400) }), error => /HTTP 400/.test(String(error)) && !String(error).includes("do-not-echo-me") && !String(error).includes("private-data"));
  }
  await assert.rejects(requestDeviceCode(clientId, { transport: async () => new Response("do-not-echo-me", { status: 502 }) }), /HTTP 502/);
  for (const value of [null, [], "do-not-echo-me"]) {
    await assert.rejects(requestDeviceCode(clientId, { transport: async () => json(value) }), /invalid sign-in response/);
  }
});

test("HTTP 400 authorization denial stops polling with a redacted message", async () => {
  await assert.rejects(waitForAuthorization(clientId, device, { transport: async () => json({ error: "access_denied", error_description: "do-not-echo-me" }, 400), now: () => 0, sleep: async () => {} }), error => /declined/.test(String(error)) && !String(error).includes("do-not-echo-me"));
});

test("expiry and cancellation stop polling, denial is redacted", async () => {
  let now = 0, calls = 0;
  const transport = (async () => { calls++; return json({ error: "authorization_pending" }); }) as Fetch;
  await assert.rejects(waitForAuthorization(clientId, { ...device, expires_in: 1 }, { transport, now: () => now, sleep: async ms => { now += ms; } }), /expired/);
  assert.equal(calls, 0);
  await assert.rejects(waitForAuthorization(clientId, device, { transport, signal: AbortSignal.abort() }), /cancelled/);
  assert.equal(calls, 0);
  await assert.rejects(waitForAuthorization(clientId, device, { transport: (async () => json({ error: "access_denied", error_description: "do-not-echo-me" })) as Fetch, now: () => 0, sleep: async () => {} }), error => !String(error).includes("do-not-echo-me") && /declined/.test(String(error)));
});

test("Device Flow rejects redirected destinations, malformed code and missing repo scope", async () => {
  assert.equal(validClientId("ghp_" + "Z".repeat(36)), false);
  for (const value of [{ ...device, verification_uri: "https://attacker.invalid" }, { ...device, user_code: "\x1b[31mTOKEN" }, { ...device, interval: 0 }]) {
    await assert.rejects(requestDeviceCode(clientId, { transport: (async () => json(value)) as Fetch }), /invalid device/);
  }
  await assert.rejects(waitForAuthorization(clientId, device, { transport: (async () => json({ access_token: "fixture-token", token_type: "bearer", scope: "read:user" })) as Fetch, now: () => 0, sleep: async () => {} }), /authorization/);
});

test("credentials use an app-specific native vault slot with local persistence, never plaintext", async () => {
  let stored: string | null = null;
  const vault: Vault = {
    get: async slot => { assert.equal(slot.service, "fun.gitmsg.terminal"); return stored; },
    set: async options => { assert.equal(options.persist, "local"); stored = options.value; },
    delete: async () => { stored = null; return true; },
  };
  assert.equal(await readCredential(vault), null);
  await saveCredential(vault, { token: "fixture-token", clientId });
  assert.equal((await readCredential(vault))?.token, "fixture-token");
  await forgetCredential(vault); assert.equal(stored, null);
  const broken: Vault = { get: async () => { throw new Error("credential-in-raw-error"); }, set: async () => { throw new Error("credential-in-raw-error"); }, delete: async () => false };
  await assert.rejects(saveCredential(broken, { token: "fixture-token", clientId }), error => /memory only/.test(String(error)) && !String(error).includes("credential-in-raw-error"));
  await assert.rejects(readCredential(broken), /OS credential storage/);
});

test("expired/malformed native credentials do not silently authenticate", async () => {
  const vault = (value: unknown): Vault => ({ get: async () => JSON.stringify(value), set: async () => {}, delete: async () => false });
  assert.equal(await readCredential(vault({ token: "fixture-token", clientId, expiresAt: 1 })), null);
  await assert.rejects(readCredential(vault({ token: "fixture-token", clientId: 42 })), /invalid/);
});

test("API sends bearer tokens only to fixed GitHub origin and strips raw error bodies", async () => {
  let calls = 0;
  const api = new GitHub("fixture-token", (async (url, init) => {
    calls++; assert.equal(new URL(String(url)).origin, "https://api.github.com"); assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fixture-token");
    return json({ message: "do-not-echo-me" }, 403);
  }) as Fetch);
  await assert.rejects(api.json("//attacker.invalid/steal"), /invalid/); assert.equal(calls, 0);
  await assert.rejects(api.json("/user"), error => /denied/.test(String(error)) && !String(error).includes("do-not-echo-me"));
});

test("API honors rate limits and never automatically retries writes", async () => {
  let calls = 0;
  const api = new GitHub("fixture-token", (async () => { calls++; return json({}, 429, { "retry-after": "120" }); }) as Fetch);
  await assert.rejects(api.json("/user/repos", { method: "POST", data: {} }), (error: unknown) => (error as { retryAfterMs: number }).retryAfterMs >= 120000);
  assert.equal(calls, 1);
});

test("repository parsing refuses credential/key links, traversal and foreign hosts", () => {
  assert.equal(parseRepo("https://github.com/alice/gitmsg-room.git"), "alice/gitmsg-room");
  assert.equal(parseRepo("github.com/alice/gitmsg-room"), "alice/gitmsg-room");
  for (const input of ["https://github.com.evil.invalid/a/b", "https://github.com/alice/room#key=hidden", "https://name:" + "secret@github.com/alice/room", "alice/..", "alice/room?x=1", "alice/room/../../evil", "https://github.com/alice/room/../other", "https://github.com/alice/ro\nom"]) assert.throws(() => parseRepo(input));
});

test("terminal rendering strips untrusted terminal controls and secret-like drafts are blocked", () => {
  assert.equal(terminalText("hello\x1b[31m red\x1b[0m\x1b]52;c;payload\x07\u202e world"), "hello red world");
  for (const value of ["ghp_" + "Z".repeat(36), "https://chat.example/#key=" + "qR4sT9".repeat(7) + "z", "SESSION_SECRET=" + "R4s7".repeat(10)]) assert.equal(containsCredential(value), true);
  assert.equal(containsCredential("we should add a SESSION_SECRET setting"), false);
  assert.equal(publicError(new Error("fixture-secret" )).includes("fixture-secret"), false);
});
