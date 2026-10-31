import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("community entry points and local documentation links exist", () => {
  for (const path of ["README.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md", "docs/PUBLISHING.md", ".github/PULL_REQUEST_TEMPLATE.md", ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml"]) {
    assert.ok(existsSync(path), path);
    if (!path.endsWith(".md")) continue;
    for (const [, target] of readFileSync(path, "utf8").matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#|mailto:)/.test(target)) continue;
      const file = new URL(target.split("#")[0], new URL(`../${path}`, import.meta.url));
      assert.ok(existsSync(file), `${path}: ${target}`);
    }
  }
});

test("example configuration has no secrets and deployment config does not expose server env", () => {
  const example = readFileSync(".env.example", "utf8");
  for (const name of ["GITHUB_CLIENT_SECRET", "SESSION_SECRET"]) assert.match(example, new RegExp(`^${name}=$`, "m"));
  const config = readFileSync("next.config.ts", "utf8");
  assert.doesNotMatch(config, /\benv\s*:/);
  const clients = execFileSync("git", ["ls-files", "-z", "src"], { encoding: "utf8" }).split("\0").filter(Boolean);
  for (const path of clients) {
    const source = readFileSync(path, "utf8");
    if (!/^['"]use client['"]/.test(source)) continue;
    assert.doesNotMatch(source, /process\.env\.(?:GITHUB_CLIENT_SECRET|SESSION_SECRET|GITHUB_TOKEN|VERCEL_TOKEN|NEXT_PUBLIC_\w*(?:SECRET|TOKEN|PRIVATE_KEY))/i, path);
  }
});

test("CI runs untrusted PRs without deployment credentials and pins actions", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(workflow, /contents: read/); assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /pull_request_target|secrets\.|secrets: inherit/);
  for (const [, ref] of workflow.matchAll(/uses: ([^\s]+)/g)) assert.match(ref, /@[a-f0-9]{40}$/);
  for (const check of ["check:secrets", "test", "typecheck", "build"]) assert.ok(workflow.includes(`npm ${check === "test" ? "test" : `run ${check}`}`));
});
