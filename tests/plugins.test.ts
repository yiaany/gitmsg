import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("coin-flip plugin manifest is local, explicit, minimal and secure-room disabled", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugins/coinflip/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifestVersion, 1); assert.equal(manifest.entry, "index.mjs");
  assert.deepEqual(manifest.capabilities, ["chat:write"]); assert.equal(manifest.secureMode, "disabled");
});
test("coin-flip handler has deterministic test injection and bounded output", async () => {
  const { run } = await import("../plugins/coinflip/index.mjs");
  for (const value of [0, 1]) {
    const result = await run({ randomInt: (min: number, max: number) => { assert.equal(min, 0); assert.equal(max, 2); return value; } });
    assert.match(result.text, value ? /^Heads/ : /^Tails/); assert.ok(result.text.length <= 4000);
  }
  await assert.rejects(run({ randomInt: () => 0 }, { shell: "not allowed" }));
  await assert.rejects(run({ randomInt: () => 8 }));
});
