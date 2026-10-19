
import test from 'node:test';
import assert from 'node:assert/strict';
import { tonQuote, satsToNano, TON_TRANSFER_FEE_NANO } from './tonQuote.mjs';

const RATES = { btcUsd: 81149, tonUsd: 1.33 };

test('the quote is the converted price plus the transfer fee', () => {
  const price = satsToNano(69, RATES.btcUsd, RATES.tonUsd);
  const quote = tonQuote({ sats: 69, ...RATES });
  assert.equal(BigInt(quote.priceNano), price);
  assert.equal(BigInt(quote.feeNano), TON_TRANSFER_FEE_NANO);
  assert.equal(BigInt(quote.nano), price + TON_TRANSFER_FEE_NANO);
});

test('the fee is part of every price, not just single pins', () => {
  for (const sats of [69, 10, 411]) {
    const quote = tonQuote({ sats, ...RATES });
    assert.equal(BigInt(quote.nano), satsToNano(sats, RATES.btcUsd, RATES.tonUsd) + TON_TRANSFER_FEE_NANO,
      `sats ${sats} must carry the fee`);
  }
});

test('the reader can see the split', () => {
  const quote = tonQuote({ sats: 69, ...RATES });
  assert.ok(Number(quote.feeTon) > 0);
  assert.ok(Number(quote.ton) > Number(quote.priceTon));
});

test('a bigger fee can be passed in without changing the price maths', () => {
  const quote = tonQuote({ sats: 411, ...RATES, feeNano: 20_000_000n });
  assert.equal(BigInt(quote.feeNano), 20_000_000n);
  assert.equal(BigInt(quote.priceNano), satsToNano(411, RATES.btcUsd, RATES.tonUsd));
});
