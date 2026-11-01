import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runtimePackage, supportedNode } from "../bin/runtime.mjs";
import { secretKinds } from "../../scripts/check-secrets.mjs";
import { DEFAULT_CLIENT_ID } from "../src/config";

test("alpha packaging is public-scope ready, allowlisted, and never runs an install or publish command automatically", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.name, "@yiaany/gitmsg"); assert.notEqual(pkg.private, true);
  assert.equal(pkg.publishConfig.tag, "alpha"); assert.equal(pkg.publishConfig.access, "public");
  assert.deepEqual(pkg.files, ["bin/gitmsg.mjs", "bin/runtime.mjs", "dist/main.js", "dist/call-worker.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]);
  assert.equal(pkg.dependencies["@roamhq/wrtc"], "0.10.0");
  for (const script of ["preinstall", "install", "postinstall", "prepare", "publish"]) assert.equal(pkg.scripts[script], undefined);
  assert.equal(pkg.scripts.prepack, "npm run build"); assert.equal(pkg.scripts.prepublishOnly, "npm run release:check");
  assert.equal(pkg.bin["git-message"], pkg.bin.gitmsg);
  assert.equal(pkg.dependencies["@opentui/core"], "0.8.1");
});

test("npm supplies pinned platform runtimes including musl, without an executable downloader", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const platform of ["darwin", "linux", "win32"] as const) for (const arch of ["arm64", "x64"] as const) {
    assert.equal(pkg.optionalDependencies[runtimePackage(platform, arch)!], "1.4.4");
  }
  assert.equal(pkg.optionalDependencies[runtimePackage("linux", "arm64", true)!], "1.4.4");
  assert.equal(runtimePackage("freebsd", "x64"), null);
  assert.equal(runtimePackage("linux", "ia32"), null);
  assert.equal(supportedNode("26.4.0"), true); assert.equal(supportedNode("28.0.0"), true);
  assert.equal(supportedNode("26.3.0"), false); assert.equal(supportedNode("22.23.4"), false);
});

test("bundled OAuth identity is public configuration, never a credential or client secret", () => {
  assert.match(DEFAULT_CLIENT_ID, /^Ov23[A-Za-z0-9]+$/);
  assert.deepEqual(secretKinds(DEFAULT_CLIENT_ID), []);
  const source = readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /CLIENT_SECRET\s*=|access_token\s*[:=]|github_pat_|ghp_/);
});

test("launcher disables dotenv loading, does not invoke a shell, and does not auto-download runtimes", () => {
  const source = readFileSync(new URL("../bin/gitmsg.mjs", import.meta.url), "utf8");
  assert.match(source, /--no-env-file/); assert.match(source, /shell: false/);
  assert.doesNotMatch(source, /execSync|execFileSync|fetch\(|curl |https?:\/\//);
});
