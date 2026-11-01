import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { secretKinds } from "../../scripts/check-secrets.mjs";

const cwd = fileURLToPath(new URL("../", import.meta.url));
try {
  const npm = process.env.npm_execpath;
  if (!npm || basename(npm) !== "npm-cli.js") throw new Error();
  const reports = JSON.parse(execFileSync(process.execPath, [npm, "pack", "--dry-run", "--ignore-scripts", "--json"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const paths: string[] = reports[0].files.map((file: { path: string }) => file.path).sort();
  const expected = ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md", "bin/gitmsg.mjs", "bin/runtime.mjs", "dist/main.js", "dist/call-worker.js", "package.json"].sort();
  if (JSON.stringify(paths) !== JSON.stringify(expected)) throw new Error();
  for (const path of paths) {
    const bytes = readFileSync(cwd + path);
    const text = bytes.toString("utf8");
    if (bytes.includes(0) || secretKinds(text).length || /(?:\/Users\/[^/\s]+\/|\/private\/var\/folders\/|file:\.\.\/)/.test(text)) throw new Error();
  }
  console.log(JSON.stringify({ checkedPackageFiles: paths, secretFindings: 0, published: false }, null, 2));
} catch {
  console.error("Package check failed: build first, inspect the allowlist and rerun the redacted source scanner. No raw content printed.");
  process.exitCode = 1;
}
