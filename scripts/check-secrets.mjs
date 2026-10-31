#!/usr/bin/env node
/** Offline, redacted pre-publication checks. No network calls or secret values in output. */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const rules = [
  ["private-key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{50,255})\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["google-api-key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["telegram-bot-token", /\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b/],
  ["credential-url", /https?:\/\/[^\s/@:"'<>]+:[^\s/@"'<>]+@[^\s/"'<>),;]+/],
  ["assigned-secret", /(?:GITHUB_CLIENT_SECRET|SESSION_SECRET|GITHUB_TOKEN|TELEGRAM_BOT_TOKEN|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?([A-Za-z0-9_+\/-]{24,})/],
];
export function secretKinds(text) {
  return rules.filter(([name, expression]) => {
    return [...text.matchAll(new RegExp(expression.source, "g"))].some(match => {
      if (name === "credential-url") { try { const host = new URL(match[0]).hostname; if (host.endsWith(".example") || host === "example.com" || host.endsWith(".invalid")) return false; } catch { /* Report malformed credential URLs too. */ } }
      if (name === "assigned-secret" && /^(?:x+|a+|0+|test[-_].*|example[-_].*|replace[-_].*|your[-_].*)$/i.test(match[1])) return false;
      return true;
    });
  }).map(([name]) => name);
}
const forbidden = /(?:^|\/)(?:\.env(?!\.example$)(?:\..*)?|id_(?:rsa|ed25519)|credentials\.json|\.DS_Store|[^/]+\.(?:pem|p12|pfx)|node_modules|\.next|\.vercel)(?:\/|$)/;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
export function checkSecrets({ history = true } = {}) {
  const files = git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  const findings = []; let checked = 0;
  for (const path of new Set(files)) {
    let stat; try { stat = statSync(path); } catch { continue; }
    if (!stat.isFile()) continue;
    if (forbidden.test(path)) findings.push({ path, rule: "forbidden-publish-path" });
    const bytes = readFileSync(path); if (bytes.includes(0)) continue;
    checked++;
    bytes.toString("utf8").split("\n").forEach((line, i) => {
      for (const rule of secretKinds(line)) findings.push({ path, line: i + 1, rule });
    });
  }
  let commits = 0;
  if (history) {
    const log = git("log", "--all", "--format=commit %H", "--patch", "--no-ext-diff", "--no-renames");
    let commit = "", path = "";
    for (const line of log.split("\n")) {
      if (line.startsWith("commit ")) { commit = line.slice(7); commits++; }
      if (line.startsWith("+++ b/")) { path = line.slice(6); if (forbidden.test(path)) findings.push({ commit, path, rule: "historical-forbidden-path" }); }
      if (line.startsWith("+") && !line.startsWith("+++")) for (const rule of secretKinds(line.slice(1))) findings.push({ commit, path, rule });
    }
  }
  return { checkedTextFiles: checked, checkedCommits: commits, findings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkSecrets({ history: !process.argv.includes("--no-history") });
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length) process.exitCode = 1;
}
