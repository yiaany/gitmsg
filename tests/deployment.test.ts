import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

test("Vercel uses the pinned Node version and reproducible npm install", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(pkg.engines.node, "22.x");
  assert.equal(config.framework, "nextjs");
  assert.match(config.installCommand, /npm ci/);
  assert.match(config.installCommand, /--include=optional/);
  assert.match(config.installCommand, /--include=dev/);
  assert.equal(config.buildCommand, "npm run build");
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
});

test("Linux build binaries are locked for both Vercel CPU architectures", () => {
  for (const cpu of ["x64", "arm64"]) {
    for (const [parent, name] of [
      ["@tailwindcss/oxide", `@tailwindcss/oxide-linux-${cpu}-gnu`],
      ["lightningcss", `lightningcss-linux-${cpu}-gnu`],
      ["next", `@next/swc-linux-${cpu}-gnu`],
      ["sharp", `@img/sharp-linux-${cpu}`],
      ["sharp", `@img/sharp-libvips-linux-${cpu}`],
    ]) {
      const record = lock.packages[`node_modules/${name}`];
      assert.ok(record, `${name} must be in the lockfile, not just local node_modules`);
      assert.equal(record.version, lock.packages[`node_modules/${parent}`].optionalDependencies[name]);
      assert.ok(record.os.includes("linux"));
      assert.ok(record.cpu.includes(cpu));
      assert.equal(record.optional, true);
      assert.match(record.integrity, /^sha512-/);
    }
  }
});
