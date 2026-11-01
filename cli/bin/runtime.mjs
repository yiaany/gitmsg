import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export function supportedNode(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return major > 26 || (major === 26 && minor >= 4);
}
export function runtimePackage(platform = process.platform, arch = process.arch, musl = false) {
  if (!["darwin", "linux", "win32"].includes(platform) || !["arm64", "x64"].includes(arch)) return null;
  const os = platform === "win32" ? "windows" : platform;
  const cpu = arch === "arm64" ? "aarch64" : "x64";
  return `@oven/bun-${os}-${cpu}${platform === "linux" && musl ? "-musl" : ""}`;
}
export function bunExecutable() {
  const musl = process.platform === "linux" && !process.report?.getReport().header.glibcVersionRuntime;
  const name = runtimePackage(process.platform, process.arch, musl);
  if (name) {
    try { return require.resolve(`${name}/bin/${process.platform === "win32" ? "bun.exe" : "bun"}`); }
    catch { /* Source installs / --omit=optional may use an existing local Bun. */ }
  }
  return "bun";
}
