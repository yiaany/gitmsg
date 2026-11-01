// Installs only an explicitly selected local archive into a fresh temporary prefix.
// Never logs npm config, reads app credentials, starts OAuth or sends GitHub writes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const archive = process.argv[2] && resolve(process.argv[2]);
const npm = process.env.npm_execpath;
if (!archive || !archive.endsWith(".tgz") || !existsSync(archive) || !npm || basename(npm) !== "npm-cli.js") throw new Error("Use npm run test:package -- /absolute/path/to/reviewed.tgz");
const prefix = mkdtempSync(join(tmpdir(), "gitmsg-package-smoke-"));
const offline = process.env.GITMSG_PACKAGE_TEST_OFFLINE === "1";
const installed = spawnSync(process.execPath, [npm, "install", "--global", "--prefix", prefix, ...(offline ? ["--offline"] : []), "--registry=https://registry.npmjs.org/", "--ignore-scripts", "--no-audit", "--no-fund", "--json", archive], { encoding: "utf8", shell: false });
if (installed.error || installed.status !== 0) {
  let failure; try { failure = JSON.parse(installed.stdout).error; } catch {}
  const registryPath = String(failure?.summary ?? "").match(/https:\/\/registry\.npmjs\.org\/[A-Za-z0-9@%_.\/-]+/)?.[0];
  console.error(JSON.stringify({ npmError: failure?.code ?? installed.error?.code ?? "INSTALL_FAILED", publicRegistryPath: registryPath }));
  throw new Error("Isolated archive install failed. Check registry access or warm the public cache for an offline test; raw npm output was not printed.");
}
const packageRoot = process.platform === "win32" ? join(prefix, "node_modules", "@yiaany", "gitmsg") : join(prefix, "lib", "node_modules", "@yiaany", "gitmsg");
const { bunExecutable } = await import(pathToFileURL(join(packageRoot, "bin", "runtime.mjs")).href);
const runtime = bunExecutable();
assert.notEqual(runtime, "bun", "The tarball install must resolve its npm-provided Bun, not depend on PATH");
assert.ok(runtime.startsWith(prefix));
const launcher = join(packageRoot, "bin", "gitmsg.mjs");
const help = spawnSync(process.execPath, [launcher, "--help"], { encoding: "utf8", shell: false });
assert.equal(help.status, 0); assert.match(help.stdout, /@yiaany\/gitmsg/);
assert.ok(existsSync(process.platform === "win32" ? join(prefix, "gitmsg.cmd") : join(prefix, "bin", "gitmsg")));
assert.ok(existsSync(process.platform === "win32" ? join(prefix, "git-message.cmd") : join(prefix, "bin", "git-message")));
// No TTY: this must load the real runtime/UI and reject before reading a vault,
// starting sign-in, opening microphone devices or contacting GitHub.
const startup = spawnSync(process.execPath, [launcher], { encoding: "utf8", shell: false, timeout: 15000, env: { ...process.env, GITMSG_TOKEN: "", GITMSG_KEY_FILE: "" } });
assert.equal(startup.status, 1); assert.match(startup.stderr, /interactive messenger needs a terminal/);
if (process.platform !== "win32" || process.arch !== "arm64") {
  const worker = spawnSync(process.execPath, [join(packageRoot, "dist", "call-worker.js")], { encoding: "utf8", shell: false, timeout: 15000 });
  assert.equal(worker.status, 0, "Packaged Node WebRTC worker must load and exit without opening audio devices");
}
console.log(JSON.stringify({ installedLocalArchive: true, offline, npmRuntimeResolved: true, launchers: ["gitmsg", "git-message"], nonTTYStartupChecked: true, prefix, published: false }, null, 2));
