import test from "node:test";
import assert from "node:assert/strict";
import { checkSecrets, forbiddenPublishPath, secretKinds } from "../scripts/check-secrets.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("JSON credentials, package/hosting tokens and room invitation keys are detected", () => {
  for (const text of ['{"client_secret":"' + "r4nd0m".repeat(8) + '"}', '"access_token": "' + "R7s9".repeat(10) + '"', "NPM_TOKEN=" + "npm_" + "Z".repeat(36), "VERCEL_TOKEN=" + "vcp_" + "Q".repeat(40), "https://chat.example/#key=" + "qR4sT9".repeat(7) + "z"]) assert.ok(secretKinds(text).length > 0);
  assert.deepEqual(secretKinds("https://chat.example/#key=" + "x".repeat(43)), []);
  assert.deepEqual(secretKinds('session_secret="' + "R7s9".repeat(10) + '"'), ["assigned-secret"]);
});

test("publish paths exclude local credentials, archives and actual conversation storage", () => {
  for (const path of [".env.local", ".env", ".vercel/project.json", "private.key", "Desktop.7z", ".npmrc", "events/2026/11/01/message.json", "media/audio.bin", "exports/chat.json", "nested/credentials.json", "cli/dist/main.js", "cli/gitmsg.tgz", "gitmsg-auth.json", "gitmsg-room-key.txt", ".gitmsg-local/config.json"]) assert.equal(forbiddenPublishPath(path), true, path);
  for (const path of [".env.example", "src/lib/media.ts", "tests/fixtures/call-server.ts", "public/chat-pattern.svg"]) assert.equal(forbiddenPublishPath(path), false, path);
});

test("scan covers staged bytes, removed historical files and commit messages with redacted output", () => {
  const cwd = mkdtempSync(join(tmpdir(), "gitmsg-secret-scan-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const token = "ghp_" + "Z".repeat(36);
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(cwd, "old.txt"), token); git("add", "old.txt"); git("commit", "-qm", "fixture " + token);
    git("rm", "-q", "old.txt"); git("commit", "-qm", "remove fixture");
    writeFileSync(join(cwd, "staged.txt"), token); git("add", "staged.txt"); writeFileSync(join(cwd, "staged.txt"), "innocent working copy");
    const staged = checkSecrets({ cwd, history: false });
    assert.ok(staged.findings.some((f: { source?: string; rule: string }) => f.source === "index" && f.rule === "github-token"));
    const full = checkSecrets({ cwd });
    assert.equal(full.checkedCommits, 2);
    assert.ok(full.findings.some((f: { source?: string }) => f.source === "history"));
    assert.equal(JSON.stringify(full).includes(token), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("scan checks removed forbidden paths, annotated tags and all staged path aliases", () => {
  const cwd = mkdtempSync(join(tmpdir(), "gitmsg-secret-paths-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const token = "ghp_" + "Q".repeat(36);
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(cwd, ".env.local"), "innocent content"); git("add", ".env.local"); git("commit", "-qm", "fixture");
    git("rm", "-q", ".env.local"); git("commit", "-qm", "remove fixture"); git("tag", "-a", "fixture", "-m", token);
    writeFileSync(join(cwd, "private.key"), "identical bytes"); writeFileSync(join(cwd, "safe.txt"), "identical bytes");
    git("add", "private.key", "safe.txt"); rmSync(join(cwd, "private.key"));
    const staged = checkSecrets({ cwd, history: false });
    assert.ok(staged.findings.some((f: { path?: string; source?: string }) => f.path === "private.key" && f.source === "index"));
    const full = checkSecrets({ cwd });
    assert.ok(full.findings.some((f: { rule: string }) => f.rule === "github-token"));
    assert.ok(full.findings.some((f: { path?: string; rule: string }) => f.path === ".env.local" && f.rule === "historical-forbidden-path"));
    assert.equal(JSON.stringify(full).includes(token), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
