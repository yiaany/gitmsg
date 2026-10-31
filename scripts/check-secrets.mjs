#!/usr/bin/env node
/** Offline, redacted pre-publication checks. No network calls or secret values in output. */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{50,255})\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["google-api-key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["vercel-token", /\bvc[pra]_[A-Za-z0-9_-]{24,}\b/],
  ["npm-token", /\bnpm_[A-Za-z0-9]{36,}\b/],
  ["telegram-bot-token", /\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b/],
  ["credential-url", /https?:\/\/[^\s/@:"'<>]+:[^\s/@"'<>]+@[^\s/"'<>),;]+/],
  ["assigned-secret", /["']?(?:GITHUB_CLIENT_SECRET|SESSION_SECRET|GITHUB_TOKEN|GH_TOKEN|VERCEL_TOKEN|NPM_TOKEN|TELEGRAM_BOT_TOKEN|AWS_SECRET_ACCESS_KEY|client_secret|access_token|refresh_token|api_key)["']?\s*[:=]\s*["']?([A-Za-z0-9_+\/-]{24,})/i],
  ["room-key-link", /[#&]key=([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/],
];
export function secretKinds(text) {
  return rules.filter(([name, expression]) => {
    return [...text.matchAll(new RegExp(expression.source, expression.flags + "g"))].some(match => {
      if (name === "credential-url") { try { const host = new URL(match[0]).hostname; if (host.endsWith(".example") || host === "example.com" || host.endsWith(".invalid")) return false; } catch { /* Report malformed credential URLs too. */ } }
      if (["assigned-secret", "room-key-link"].includes(name) && /^(?:x+|a+|0+|test[-_].*|example[-_].*|replace[-_].*|your[-_].*)$/i.test(match[1])) return false;
      return true;
    });
  }).map(([name]) => name);
}
export function forbiddenPublishPath(path) {
  return /(?:^|\/)(?:\.env(?!\.example$)(?:\..*)?|id_(?:rsa|ed25519)(?:\.pub)?|credentials\.json|\.npmrc|\.netrc|\.DS_Store|[^/]+\.(?:pem|key|p12|pfx|sqlite3?|db|7z|zip)|node_modules|\.next|\.vercel)(?:\/|$)/.test(path) || /^(?:events|media|exports)\//.test(path);
}
export function checkSecrets({ history = true, cwd = process.cwd() } = {}) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  const findings = []; let checked = 0;
  function scan(bytes, location) {
    if (bytes.includes(0)) return false; // Binary assets are not a full malware/steganography scan.
    bytes.toString("utf8").split("\n").forEach((line, i) => {
      for (const rule of secretKinds(line)) findings.push({ ...location, line: i + 1, rule });
    });
    return true;
  }
  for (const path of new Set(files)) {
    let stat; try { stat = statSync(resolve(cwd, path)); } catch { continue; }
    if (!stat.isFile()) continue;
    if (forbiddenPublishPath(path)) findings.push({ path, rule: "forbidden-publish-path" });
    if (scan(readFileSync(resolve(cwd, path)), { path })) checked++;
  }
  const objects = new Map();
  // Also inspect staged bytes: an innocent working copy can hide a staged credential.
  for (const entry of git("ls-files", "--stage", "-z").split("\0").filter(Boolean)) {
    const match = /^\d+ ([a-f0-9]{40,64}) \d\t([\s\S]+)$/.exec(entry);
    if (match && !/^0+$/.test(match[1])) {
      if (forbiddenPublishPath(match[2])) findings.push({ path: match[2], source: "index", rule: "forbidden-publish-path" });
      objects.set(match[1], { path: match[2], source: "index" });
    }
  }
  let commits = 0, historicalTextBlobs = 0, binaryBlobs = 0;
  if (history) {
    for (const entry of git("rev-list", "--objects", "--all").trim().split("\n").filter(Boolean)) {
      const space = entry.indexOf(" "); const id = space < 0 ? entry : entry.slice(0, space);
      objects.set(id, { ...(space < 0 ? {} : { path: entry.slice(space + 1) }), source: "history" });
    }
    // Include removed names and renames, even when the same blob has multiple paths.
    for (const path of new Set(git("log", "--all", "--format=", "--name-only", "--no-renames", "--root", "-m", "-z").split("\0").map(p => p.replace(/^\n+/, "")).filter(Boolean))) {
      if (forbiddenPublishPath(path)) findings.push({ path, rule: "historical-forbidden-path" });
    }
  }
  if (objects.size) {
    const batch = execFileSync("git", ["cat-file", "--batch"], { cwd, input: [...objects.keys()].join("\n") + "\n", maxBuffer: 100 * 1024 * 1024 });
    let offset = 0;
    while (offset < batch.length) {
      const end = batch.indexOf(10, offset);
      const header = batch.subarray(offset, end).toString("utf8");
      const match = /^([a-f0-9]{40,64}) (blob|commit|tag|tree) (\d+)$/.exec(header);
      if (!match) throw new Error("Git object scan could not read a complete object; publication check failed.");
      const [, id, type, size] = match; const start = end + 1;
      const bytes = batch.subarray(start, start + Number(size)); offset = start + Number(size) + 1;
      if (type === "commit") commits++;
      if (type === "tree") continue;
      const location = { ...objects.get(id), object: id };
      const text = scan(bytes, location);
      if (type === "blob") { if (text) historicalTextBlobs++; else binaryBlobs++; }
      if (type === "blob" && location.path && forbiddenPublishPath(location.path)) findings.push({ ...location, rule: "forbidden-git-object-path" });
    }
  }
  return { checkedTextFiles: checked, checkedCommits: commits, checkedTextBlobs: historicalTextBlobs, skippedBinaryBlobs: binaryBlobs, findings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = checkSecrets({ history: !process.argv.includes("--no-history") });
    console.log(JSON.stringify(result, null, 2));
    if (result.findings.length) process.exitCode = 1;
  } catch {
    // Child-process errors can contain raw Git object buffers. Never dump them.
    console.error("Secret scan could not finish. Publication check failed; no raw data printed.");
    process.exitCode = 1;
  }
}
