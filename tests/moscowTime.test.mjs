import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  SINTRA_CURRENCIES,
  normaliseSintraPrices,
  parseFrankfurterRates,
  moscowTimeValue,
} from '../MoscowTimeModel.mjs';

test('Sintra currencies use their direct Bitcoin prices', () => {
  assert.deepEqual(SINTRA_CURRENCIES, ['USD', 'EUR', 'GBP', 'CAD', 'AUD']);
  const prices = normaliseSintraPrices({usd: 100_000, eur: 80_000});
  assert.deepEqual(moscowTimeValue('EUR', prices, {}), {
    sats: 1_250,
    source: 'Provided by Sintra',
    direct: true,
  });
});

test('other currencies combine Sintra BTC/USD with Frankfurter rates', () => {
  const rates = parseFrankfurterRates([
    {date: '2026-10-05', base: 'USD', quote: 'JPY', rate: 150},
    {date: '2026-10-05', base: 'EUR', quote: 'CHF', rate: 0.9},
  ]);
  assert.deepEqual(rates, {USD: 1, JPY: 150});
  assert.deepEqual(moscowTimeValue('JPY', {USD: 100_000}, rates), {
    sats: 7,
    source: 'Sintra + Frankfurter',
    direct: false,
  });
});

test('Moscow Time settings expose source labels and persist the choice', async () => {
  const html = await readFile(new URL('../MoscowTime.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../MoscowTime.js', import.meta.url), 'utf8');
  const help = await readFile(new URL('../siteHelp.mjs', import.meta.url), 'utf8');

  assert.match(html, /id="openMoscowSettings"/);
  assert.match(html, /Provided by Sintra/);
  assert.match(html, /Frankfurter reference rates/);
  assert.match(script, /Sintra \+ Frankfurter/);
  assert.match(script, /localStorage\.setItem\(currencyKey, selectedCurrency\)/);
  assert.match(help, /'\/MoscowTime\.html': \{selector: '#openMoscowSettings'/);
});
