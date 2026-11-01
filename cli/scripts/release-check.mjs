import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.env.npm_execpath;
if (!npm || basename(npm) !== "npm-cli.js") throw new Error("Use npm run release:check.");
for (const [cwd, args] of [
  [resolve(root, ".."), ["run", "check:secrets"]],
  [root, ["run", "typecheck"]],
  [root, ["test"]],
  [root, ["run", "test:ui"]],
  [root, ["run", "build"]],
  [root, ["run", "pack:check"]],
]) {
  const result = spawnSync(process.execPath, [npm, ...args], { cwd, stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) process.exit(1);
}
console.log("Local release checks passed. Nothing was pushed or published. Registry ownership, dependency audit and live acceptance checks are separate release gates.");
