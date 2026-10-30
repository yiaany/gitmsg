// Reproducibly package upstream fonts and their embedded notices; no network.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const source = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
const target = "public/excalidraw/fonts";
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
const ofl = await readFile("public/fonts/LICENSE.txt", "utf8");
await writeFile("public/excalidraw/OFL.txt", ofl.slice(ofl.indexOf("SIL OPEN FONT LICENSE")));
// Font copyright/license name tables are preserved byte-for-byte in the WOFF2
// files. Source headers for split fonts are also bundled in upstream JS chunks.
const files = await readdir("node_modules/@excalidraw/excalidraw/dist/prod");
const notices = [];
for (const file of files.filter(f => f.endsWith(".js"))) {
  const text = await readFile(join("node_modules/@excalidraw/excalidraw/dist/prod", file), "utf8");
  for (const match of text.matchAll(/\/\*[\s\S]*?\*\//g)) if (/license|copyright/i.test(match[0])) notices.push(match[0]);
}
await writeFile("public/excalidraw/BUNDLED-NOTICES.txt", [...new Set(notices)].join("\n\n").replace(/[ \t]+$/gm, ""));
console.log("Packaged self-hosted Excalidraw fonts and upstream notices.");
