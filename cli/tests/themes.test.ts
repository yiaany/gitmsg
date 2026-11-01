import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, themeById } from "../src/themes";
import { command, commandSuggestions, HELP } from "../src/commands";

function luminance(hex: string) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

test("themes cover all surfaces with readable foregrounds, and Mono stays truly monochrome", () => {
  assert.equal(new Set(THEMES.map(theme => theme.id)).size, 5);
  for (const { colors: c } of THEMES) {
    for (const color of Object.values(c)) assert.match(color, /^#[0-9a-f]{6}$/i);
    for (const bg of [c.bg, c.panel, c.own, c.elevated]) {
      assert.ok(contrast(c.text, bg) >= 4.5, `text ${c.text} / ${bg}`);
      assert.ok(contrast(c.accent, bg) >= 4.5, `accent ${c.accent} / ${bg}`);
      assert.ok(contrast(c.muted, bg) >= 4.5, `muted ${c.muted} / ${bg}`);
    }
  }
  for (const color of Object.values(themeById("mono").colors)) assert.equal(color.slice(1, 3), color.slice(3, 5));
  assert.equal(themeById("unknown").id, "mono");
  assert.equal(themeById("paper").name, "Paper");
});

test("slash suggestions share the command registry and never match literal messages or arguments", () => {
  assert.deepEqual(commandSuggestions("/"), HELP);
  assert.deepEqual(commandSuggestions("/th").map(([usage]) => usage), ["/themes"]);
  for (const input of ["//", "//themes", "hello /", "/invite bob", "/unknown"]) assert.equal(commandSuggestions(input).length, 0);
  assert.equal(command("/themes")?.name, "themes");
  assert.equal(command("//themes"), null);
});
