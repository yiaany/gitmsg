import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = await Bun.build({
  entrypoints: [root + "src/main.tsx"],
  outdir: root + "dist",
  naming: "main.js",
  target: "bun",
  packages: "external",
  sourcemap: "none",
  tsconfig: root + "tsconfig.json",
});
if (!result.success) throw new Error("Terminal client build failed.");
const worker = await Bun.build({ entrypoints: [root + "src/call-worker.ts"], outdir: root + "dist", naming: "call-worker.js", target: "node", packages: "external", sourcemap: "none" });
if (!worker.success) throw new Error("WebRTC worker build failed.");
await mkdir(root + "dist", { recursive: true });
await copyFile(new URL("../../LICENSE", import.meta.url), root + "LICENSE");
console.log("Built terminal client. No credentials, source maps or chat exports included.");
