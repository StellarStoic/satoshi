import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup() {
    const selection = { value: 'EUR' };
    let socket;
    const updates = [];
    const context = vm.createContext({
        document: { addEventListener() {}, getElementById: () => selection },
        window: {}, console: { log() {}, warn() {}, error() {} }, setTimeout() {},
        WebSocket: class { constructor() { socket = this; } }
    });
    vm.runInContext(readFileSync(new URL('../chart.js', import.meta.url), 'utf8'), context);
    context.updateSatsDisplay = (...args) => updates.push(args);
    context.updateChartLegend = () => {};
    context.initializeSintraFeed();
    const send = prices => socket.onmessage({ data: JSON.stringify({ event: 'data', data: { prices } }) });
    return { context, selection, updates, send, socket: () => socket };
}

test('live feed respects EUR initially and subsequent fiat selections', () => {
    const { selection, updates, send } = setup();
    send({ usd: 100000, eur: 90000 });
    assert.equal(updates[0][0], 'EUR');
    assert.equal(updates[0][2], 90000);
    selection.value = 'GBP';
    send({ usd: 100000, gbp: 80000 });
    assert.equal(updates[1][0], 'GBP');
});

test('non-fiat assets are never overwritten by the fiat feed', () => {
    const { selection, updates, send } = setup();
    for (const code of ['GCF', 'AAPL', 'GSPC', 'TLT']) {
        selection.value = code;
        send({ usd: 100000, eur: 90000 });
    }
    assert.equal(updates.length, 0);
});

test('missing rates preserve existing display; valid FX rates convert USD', () => {
    const { context, selection, updates, send } = setup();
    selection.value = 'JPY';
    send({ usd: 100000 });
    assert.equal(updates.length, 0);
    vm.runInContext('eucbRates = {JPY: 150}', context);
    send({ usd: 100000 });
    assert.equal(updates[0][0], 'JPY');
    assert.equal(updates[0][2], 15000000);
});

test('malformed messages and invalid prices do not update the display', () => {
    const { updates, send, socket } = setup();
    socket().onmessage({ data: 'invalid JSON' });
    for (const eur of [null, 0, -1, 'Infinity', 'invalid']) send({ eur });
    assert.equal(updates.length, 0);
});
