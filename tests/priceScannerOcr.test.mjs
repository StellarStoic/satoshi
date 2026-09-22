import test from 'node:test';
import assert from 'node:assert/strict';
import {paddleBlocks, createScannerOcr} from '../priceScannerOcr.mjs';
import {detectPrices} from '../priceScannerModel.mjs';

const item = (text, x = 10) => ({text, score: 0.98, poly: [[x, 20], [x + 80, 18], [x + 80, 60], [x, 62]]});
test('PaddleOCR polygons preserve price, currency, confidence, and image coordinates', () => {
    for (const text of ['$9.30', '9.30$', '9.30 USD']) {
        const [price] = detectPrices(paddleBlocks([item(text)]), 'EUR');
        assert.equal(price.value, 9.3); assert.equal(price.currency, 'USD');
        assert.equal(price.confidence, 98);
        assert.deepEqual(price.bbox, {x0: 10, y0: 18, x1: 90, y1: 62});
    }
    assert.equal(detectPrices(paddleBlocks([item('9.30'), item('USD', 100)]), 'EUR')[0].currency, 'USD');
    assert.equal(detectPrices(paddleBlocks([item('9.30%')]), 'EUR').length, 0);
    assert.equal(detectPrices(paddleBlocks([{...item('9.30'), poly: [[NaN, 0]]}]), 'EUR').length, 0);
});

test('OCR worker transfers only local pixel bytes and closes outstanding jobs on Stop', async () => {
    const original = globalThis.Worker;
    let thread;
    globalThis.Worker = class {
        constructor(url, options) { thread = this; this.url = url; assert.equal(options.type, 'module'); }
        postMessage(message, transfers) {
            this.last = {message, transfers};
            if (message.type === 'init') queueMicrotask(() => this.onmessage({data: {id: message.id, result: true}}));
        }
        terminate() { this.closed = true; }
    };
    try {
        const engine = createScannerOcr(); await engine.ready;
        const pixels = {data: new Uint8ClampedArray(16), width: 2, height: 2};
        const canvas = {getContext: () => ({getImageData: () => pixels}), width: 2, height: 2};
        const job = engine.recognize(canvas);
        assert.equal(thread.last.transfers[0], pixels.data.buffer);
        thread.onmessage({data: {id: thread.last.message.id, result: {items: [item('4')]}}});
        assert.equal(detectPrices((await job).data.blocks, 'EUR')[0].value, 4);
        const cancelled = assert.rejects(engine.recognize(canvas), /stopped/);
        await engine.terminate(); await cancelled;
        assert.equal(thread.closed, true);
        await assert.rejects(engine.recognize(canvas), /stopped/);
    } finally { globalThis.Worker = original; }
});
