import test from "node:test";
import assert from "node:assert/strict";
import { secretKinds } from "../scripts/check-secrets.mjs";

test("publication scan detects credential shapes without printing their values", () => {
  for (const text of ["ghp_" + "Z".repeat(36), "github_pat_" + "Q".repeat(70), "-----BEGIN " + "OPENSSH PRIVATE KEY-----", "123456789:" + "Q".repeat(35), "SESSION_SECRET=" + "r4nd0m".repeat(8)]) assert.ok(secretKinds(text).length > 0);
});
test("publication scan permits env references and obvious documented placeholders", () => {
  for (const text of ["SESSION_SECRET=", "process.env.GITHUB_TOKEN", "SESSION_SECRET=" + "x".repeat(32), "GITHUB_CLIENT_SECRET=your-client-secret-placeholder"]) assert.deepEqual(secretKinds(text), []);
});
test("example URL fixtures do not hide a later credential on the same line", () => {
  const example = '"https://name:' + 'secret@music.example",';
  assert.deepEqual(secretKinds(example), []);
  const realHost = "https://name:" + "secret@github.com";
  assert.deepEqual(secretKinds(example + " " + realHost), ["credential-url"]);
});
