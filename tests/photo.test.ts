import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { photoDisplaySize } from "../src/lib/photo";

test("photo bounds preserve portrait and landscape ratios with no letterboxing", () => {
  for (const [width, height] of [[1200, 800], [800, 1600], [3000, 500], [10, 6], [200, 1000]]) {
    const result = photoDisplaySize(width, height);
    assert.ok(result.width <= 480 && result.height <= 432.00001);
    assert.ok(Math.abs(result.width / result.height - width / height) < .00001);
  }
  assert.deepEqual(photoDisplaySize(10, 6), { width: 192, height: 115.19999999999999 });
});
test("invalid image dimensions cannot generate invalid CSS", () => {
  for (const pair of [[0, 20], [-1, 20], [NaN, 20], [20, Infinity]]) assert.deepEqual(photoDisplaySize(...pair as [number, number]), { width: 320, height: 240 });
});
test("photo caption follows media and no-caption receipts overlay the image", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const app = read("src/components/messenger.tsx");
  assert.ok(app.indexOf('message.attachments?.map(attachment => <MediaMessage') < app.indexOf('className="photo-caption"'));
  const css = read("src/app/messenger.css");
  assert.match(css, /\.message \.message-content\.photo-message[^}]*padding: 0/);
  assert.match(css, /\.photo-message:not\(:has\(\.photo-caption\)\) > \.message-meta-bottom[^}]*position: absolute/);
});
