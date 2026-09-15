import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup() {
    const context = vm.createContext({
        console: { log() {}, warn() {} },
        document: { addEventListener() {} },
        AbortController, setTimeout, clearTimeout
    });
    vm.runInContext(readFileSync(new URL('../memedBitcoinMood.js', import.meta.url), 'utf8'), context);
    vm.runInContext(`
        updateActiveButton = showLoading = hideError = hideMoodDisplay = updateATHFromPrice = () => {};
        globalThis.displays = [];
        displayMood = (...args) => displays.push(args);
        showError = message => { globalThis.error = message; };
    `, context);
    return context;
}

test('malformed primary data falls back, preserving a zero weekly change', async () => {
    const c = setup();
    c.fetch = async url => ({ ok: true, json: async () => url.includes('coingecko')
        ? { prices: [] }
        : { quotes: { USD: { price: 70000, percent_change_7d: 0, percent_change_24h: 5 } } } });
    await c.fetchMood('weekly');
    assert.equal(c.displays.length, 1);
    assert.equal(c.displays[0][1], 0);
    assert.equal(c.displays[0][5], 'CoinPaprika');
});

test('longer periods never substitute Binance daily data after failures', async () => {
    const c = setup();
    const urls = [];
    c.fetch = async url => { urls.push(url); throw new Error('offline'); };
    await c.fetchMood('yearly');
    assert.equal(urls.length, 2);
    assert.ok(urls.every(url => !url.includes('binance') && !url.includes('coinstats')));
    assert.match(c.error, /temporarily unavailable/);
});

test('latest timeframe wins when a previous request finishes later', async () => {
    const c = setup();
    let release;
    vm.runInContext('FALLBACK_APIS.splice(1)', c);
    c.provider = async timeframe => {
        if (timeframe === 'daily') await new Promise(resolve => { release = resolve; });
        return { currentPrice: 70000, priceChange: 0, volatility: 0, source: 'test' };
    };
    vm.runInContext('FALLBACK_APIS[0].func = provider', c);
    const first = c.fetchMood('daily');
    await c.fetchMood('weekly');
    release();
    await first;
    assert.equal(c.displays.length, 1);
    assert.equal(c.displays[0][4], 'weekly');
});

test('rendering failures are not mislabeled as API failures', async () => {
    const c = setup();
    c.fetch = async () => ({ ok: true, json: async () => ({ bitcoin: { usd: 70000, usd_24h_change: 1 } }) });
    c.displayMood = () => { throw new Error('render failed'); };
    await assert.rejects(c.fetchMood('daily'), /render failed/);
    assert.equal(c.error, undefined);
});
