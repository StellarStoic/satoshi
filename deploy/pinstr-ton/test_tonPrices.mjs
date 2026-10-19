
import test from 'node:test';
import assert from 'node:assert/strict';
import { tonPriceFor, TON_PRICES, TON_TRANSFER_FEE_NANO } from './tonQuote.mjs';

test('the ladder is 0.5 / 1 / 3 TON', () => {
  assert.equal(TON_PRICES.anonymous, 500_000_000n);
  assert.equal(TON_PRICES.week, 1_000_000_000n);
  assert.equal(TON_PRICES.year, 3_000_000_000n);
});

test('the fee is always added, never absorbed', () => {
  for (const action of ['anonymous', 'week', 'year']) {
    const quote = tonPriceFor(action);
    assert.equal(BigInt(quote.nano), TON_PRICES[action] + TON_TRANSFER_FEE_NANO);
    assert.ok(Number(quote.ton) > Number(quote.priceTon), `${action} must exceed its price`);
  }
});

test('the displayed amounts are what a reader pays', () => {
  assert.equal(tonPriceFor('anonymous').ton, 0.51);
  assert.equal(tonPriceFor('week').ton, 1.01);
  assert.equal(tonPriceFor('year').ton, 3.01);
});

test('an unknown action is refused rather than quoted at zero', () => {
  assert.throws(() => tonPriceFor('monthly'), /no TON price/u);
});
