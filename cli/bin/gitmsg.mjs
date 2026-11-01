#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bunExecutable, supportedNode } from "./runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`gitmsg — real conversations, real commits

gitmsg                     Open the terminal messenger
gitmsg owner/repo          Open an existing private chat
git message               Same messenger, when installed on PATH
gitmsg auth logout        Remove this client's locally saved credential

Install: npm install --global @yiaany/gitmsg@alpha
Requires Node >=26.4.0. A pinned platform Bun runtime is installed by npm.
Choose Continue with GitHub for one-time-code sign-in. No client secret is used.
GITMSG_CLIENT_ID optionally overrides the bundled PUBLIC terminal OAuth App ID.
Tokens use the OS credential store when available, otherwise session memory only.
GITMSG_TOKEN is an optional, session-only credential-manager environment override.
GITMSG_KEY_FILE optionally points to a private room-key backup outside the repo.
No tokens/messages in command arguments. No automatic Git commits or pushes in your cwd.
Package: @yiaany/gitmsg (alpha), not the unrelated npm package named gitmsg.`);
} else if (!supportedNode()) {
  console.error("gitmsg requires Node.js >=26.4.0. Upgrade Node before launching the terminal client.");
  process.exitCode = 1;
} else {
  const entry = fileURLToPath(new URL("../dist/main.js", import.meta.url));
  if (!existsSync(entry)) {
    console.error("Built entry point missing. Reinstall @yiaany/gitmsg, or run npm run build from cli/ for a source checkout.");
    process.exitCode = 1;
  } else {
    // Fixed executable/arguments; never run a shell or load the caller's .env files.
    const child = spawn(bunExecutable(), ["--no-env-file", entry, ...args], { cwd: root, stdio: "inherit", shell: false, env: { ...process.env, GITMSG_NODE_EXECUTABLE: process.execPath } });
    child.on("error", () => { console.error("Bun runtime unavailable. Reinstall with optional dependencies, or provide Bun >=1.4.4 on PATH. No installer was run at launch."); process.exitCode = 1; });
    child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1); });
  }
}
