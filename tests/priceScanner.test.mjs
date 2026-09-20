import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrice, detectPrices, fiatToBtc, containedBox, stableDetections, readSharedRates, parseFxResponse, BTC_MAX_AGE, FX_MAX_AGE} from '../priceScannerModel.mjs';
import {ScannerRates} from '../priceScannerRates.mjs';

test('currency conversion uses fiat per USD and USD per BTC, never the inverse', () => {
    assert.equal(fiatToBtc(20, 100000, 0.8), 0.00025);
    for (const value of [0, -1, NaN, Infinity, null]) assert.equal(fiatToBtc(20, value, 0.8), null);
});

test('prices handle decimal commas, thousands, currency symbols and whole prices', () => {
    for (const [text, currency, expected] of [
        ['12.99', 'EUR', 12.99], ['12,99', 'EUR', 12.99], ['EUR 1.234,56', 'EUR', 1234.56],
        ['$1,234.56', 'USD', 1234.56], ['1 234,56 €', 'EUR', 1234.56], ["CHF 1'234.50", 'CHF', 1234.5],
        ['€ 20', 'EUR', 20], ['20,-', 'EUR', 20], ['¥ 1,500', 'JPY', 1500], ['$1,234', 'USD', 1234],
    ]) assert.equal(parsePrice(text, currency), expected, text);
    for (const text of ['1234567890123', '500', '20%', '2026-09-20', '20/09/2026', '12.09.2026', '1.5 kg', '-12.99', '1.234', '1,2,3', '0.00', '$12.99', 'USD 12.99']) {
        assert.equal(parsePrice(text, 'EUR'), null, text);
    }
});

const word = (text, x0, height = 40) => ({text, confidence: 95, bbox: {x0, y0: 100, x1: x0 + 70, y1: 100 + height}});
const blocks = words => [{paragraphs: [{lines: [{words}]}]}];
test('OCR bounding boxes filter quantities, join superscript cents and require repeat detections', () => {
    assert.equal(detectPrices(blocks([word('1.50', 10), word('kg', 90)]), 'EUR').length, 0);
    assert.equal(detectPrices(blocks([word('$', 10), word('12.99', 90)]), 'EUR').length, 0);
    const detected = detectPrices(blocks([word('12', 10), word('99', 83, 22)]), 'EUR');
    assert.equal(detected[0].value, 12.99);
    assert.equal(detected[0].bbox.x1, 153);
    assert.deepEqual(stableDetections(detected, [], 1280, 720), []);
    assert.equal(stableDetections(detected, detected, 1280, 720).length, 1);
    assert.equal(stableDetections(detected, [{...detected[0], value: 13.99}], 1280, 720).length, 0);
});

test('overlay geometry follows contained video, including portrait letterboxing', () => {
    const box = containedBox({x0: 100, y0: 100, x1: 200, y1: 200}, {width: 1000, height: 500}, {width: 400, height: 600});
    assert.deepEqual(box, {left: 40, top: 240, width: 40, height: 40});
});

const storage = data => ({getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; }});
test('fresh converter FX cache can be reused, corrupt/expired/wrong-base rates cannot', () => {
    const now = 100000;
    const data = {exchangeRatesCache: JSON.stringify({USD: 1, EUR: 0.8, BTC: 0.00001, JPY: -1}), exchangeRatesCacheExpiry: String(now + 1000)};
    assert.deepEqual(readSharedRates(storage(data), now).rates, {USD: 1, EUR: 0.8});
    for (const expiry of [String(now - 1), 'garbage', String(now + FX_MAX_AGE + 1)]) {
        assert.equal(readSharedRates(storage({...data, exchangeRatesCacheExpiry: expiry}), now), null);
    }
    assert.equal(readSharedRates(storage({...data, exchangeRatesCache: 'broken'}), now), null);
    assert.equal(readSharedRates(storage({...data, exchangeRatesCache: '{"USD":2}'}), now), null);
    assert.equal(readSharedRates({getItem() { throw new Error('blocked storage'); }}, now), null);
});

test('Frankfurter validation rejects stale dates, incorrect bases and invalid rates', () => {
    const now = Date.parse('2026-09-20T12:00:00Z');
    const fx = parseFxResponse([
        {date: '2026-09-18', base: 'USD', quote: 'EUR', rate: 0.8},
        {date: '2020-01-01', base: 'USD', quote: 'JPY', rate: 150},
        {date: '2026-09-18', base: 'EUR', quote: 'GBP', rate: 0.7},
        {date: '2026-09-18', base: 'USD', quote: 'CAD', rate: 0},
    ], now);
    assert.deepEqual(fx.rates, {USD: 1, EUR: 0.8});
    assert.throws(() => parseFxResponse([], now));
});

test('expired BTC or fiat rates cannot produce a live conversion', () => {
    const feed = new ScannerRates(() => {}, storage({}));
    const now = Date.now();
    feed.btc = {usd: 100000, at: now};
    feed.fx = {rates: {USD: 1, EUR: 0.8}, expiresAt: now + FX_MAX_AGE};
    assert.equal(feed.snapshot('EUR', now).ready, true);
    assert.equal(feed.snapshot('EUR', now + BTC_MAX_AGE + 1).ready, false);
    assert.equal(feed.snapshot('CAD', now).ready, false);
    feed.fx.expiresAt = now - 1;
    assert.equal(feed.snapshot('EUR', now).ready, false);
    assert.equal(feed.snapshot('USD', now).ready, true);
    feed.btc.at = now + 100;
    assert.equal(feed.snapshot('USD', now).ready, false);
});
