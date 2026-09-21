import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PriceTracker} from '../priceScannerTracking.mjs';
const cv = createRequire(import.meta.url)('../vendor/jsfeat/jsfeat-min.js');

const width = 320, height = 240;
const base = new Uint8Array(width * height);
base.fill(240);
for (let i = 0; i < 60; i++) {
    const x = 70 + (i * 37 % 115), y = 65 + (i * 23 % 70);
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) base[(y + dy) * width + x + dx] = 20 + ((dx * 13 + dy * 7 + i) % 50);
}
function image(angle = 0, scale = 1, dx = 0, dy = 0, blank = false) {
    const a = Math.cos(angle) * scale, b = Math.sin(angle) * scale;
    const tx = 130 - a * 130 + b * 100 + dx, ty = 100 - b * 130 - a * 100 + dy;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const xx = Math.round((a * (x - tx) + b * (y - ty)) / scale ** 2);
        const yy = Math.round((-b * (x - tx) + a * (y - ty)) / scale ** 2);
        const v = blank || xx < 0 || yy < 0 || xx >= width || yy >= height ? 240 : base[yy * width + xx];
        const i = (y * width + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v; pixels[i + 3] = 255;
    }
    return {pixels, pose: [a, b, -b, a, tx, ty]};
}
test('optical flow anchors follow translation, rotation and scale while OCR is pending', () => {
    const tracker = new PriceTracker(cv);
    tracker.update(image().pixels, width, height);
    const snapshot = tracker.snapshot();
    for (let i = 1; i <= 4; i++) tracker.update(image(i * 0.02, 1 + i * 0.01, i * 3, i * 2).pixels, width, height);
    const anchor = tracker.anchor(snapshot, {x0: 65, y0: 60, x1: 195, y1: 145}, {width, height});
    const result = tracker.project(anchor);
    assert.ok(result, 'the original OCR frame must map onto the current image');
    const expected = image(0.08, 1.04, 12, 8).pose;
    result.pose.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < (i < 4 ? 0.04 : 2), `matrix entry ${i}: ${value} versus ${expected[i]}`));
    tracker.update(image(0, 1, 0, 0, true).pixels, width, height);
    assert.equal(tracker.project(anchor), null, 'occluded tags must not retain a floating price');
    tracker.reset();
    assert.equal(tracker.project(anchor), null);
});
