import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test("Excalidraw fallback adapter is pinned, local and fails closed on upstream changes", async () => {
  const adapt = require("../scripts/excalidraw-local-fonts.cjs");
  const source = await readFile("node_modules/@excalidraw/excalidraw/dist/prod/chunk-K2UTITRG.js", "utf8");
  const output = adapt(source);
  assert.match(output, /new URL\(\w+,window.location.origin\+"\/excalidraw\/"\)/);
  assert.throws(() => adapt("upstream changed"), /review/);
});
test("self-hosted Excalidraw fonts match pinned package bytes and include notices", async () => {
  const base = "node_modules/@excalidraw/excalidraw/dist/prod/fonts";
  for (const family of await readdir(base)) for (const file of await readdir(`${base}/${family}`)) {
    assert.deepEqual(await readFile(`public/excalidraw/fonts/${family}/${file}`), await readFile(`${base}/${family}/${file}`));
  }
  assert.match(await readFile("public/excalidraw/OFL.txt", "utf8"), /SIL OPEN FONT LICENSE/);
});
