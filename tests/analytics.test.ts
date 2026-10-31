import test from "node:test";
import assert from "node:assert/strict";
import { analyticsEvent } from "../src/lib/analytics";

test("analytics strips room queries and secret fragments without mutating input", () => {
  const event = { type: "pageview", url: "https://www.gitmsg.fun/?repo=alice%2Fprivate-chat#key=test-invite-fragment" };
  assert.deepEqual(analyticsEvent(event), { type: "pageview", url: "https://www.gitmsg.fun/" });
  assert.ok(event.url.includes("#key="));
  assert.deepEqual(analyticsEvent({ type: "pageview", url: "https://www.gitmsg.fun/setup?connected=1" }), { type: "pageview", url: "https://www.gitmsg.fun/setup" });
});

test("analytics rejects invalid and non-web URLs", () => {
  for (const url of ["invalid", "javascript:alert(1)", "file:///secret"]) assert.equal(analyticsEvent({ url }), null);
});
