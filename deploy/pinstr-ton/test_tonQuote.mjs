import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTonAddress, satsToNano, tonQuote, paymentMatches } from './tonQuote.mjs';

const WALLET = 'UQBabpCfz6dDmTfDIw1TDOdt13pRAEMD35V3hgHFI_7ETxRf';

test('parses the configured wallet address', () => {
  const a = parseTonAddress(WALLET);
  assert.equal(a.valid, true, a.reason);
  assert.equal(a.workchain, 0);
  assert.equal(a.raw, '0:5a6e909fcfa7439937c3230d530ce76dd77a51004303df95778601c523fec44f');
  assert.equal(a.testnet, false);
});

test('rejects an address with a broken checksum', () => {
  const broken = WALLET.slice(0, 47) + (WALLET[47] === 'A' ? 'B' : 'A');
  assert.equal(parseTonAddress(broken).valid, false);
});

test('rejects rubbish', () => {
  for (const bad of ['', 'not-an-address', null, 'EQ' + 'x'.repeat(46)]) {
    assert.equal(parseTonAddress(bad).valid, false);
  }
});

test('69 sats at 81149 usd/btc and 1.33 usd/ton is about 0.0421 TON, and never rounds below', () => {
  const nano = satsToNano(69, 81149, 1.33);
  assert.ok(nano > 41_000_000n && nano < 43_000_000n, String(nano));
  assert.ok(nano >= 42_000_000n);
});

test('quote carries sats, nano, rate and expiry', () => {
  const q = tonQuote({ sats: 411, btcUsd: 81149, tonUsd: 1.33, now: 1_700_000_000_000 });
  assert.equal(q.sats, 411);
  assert.ok(Number(q.nano) > 0);
  assert.ok(q.rateSatsPerTon > 1000 && q.rateSatsPerTon < 2500, String(q.rateSatsPerTon));
  assert.equal(new Date(q.expiresAt).getTime() - new Date(q.quotedAt).getTime(), 300_000);
});

test('non-positive inputs are refused rather than producing a free order', () => {
  assert.throws(() => satsToNano(0, 81149, 1.33));
  assert.throws(() => satsToNano(69, 0, 1.33));
});

test('payment matches only on the exact order id', () => {
  const want = '4271000000';
  assert.equal(paymentMatches({ comment: 'pin_abc', orderId: 'pin_abc', amountNano: want, expectedNano: want }), true);
  assert.equal(paymentMatches({ comment: ' pin_abc ', orderId: 'pin_abc', amountNano: want, expectedNano: want }), true);
  assert.equal(paymentMatches({ comment: 'pin_ABC', orderId: 'pin_abc', amountNano: want, expectedNano: want }), false);
  assert.equal(paymentMatches({ comment: 'pin_abc hi', orderId: 'pin_abc', amountNano: want, expectedNano: want }), false);
  assert.equal(paymentMatches({ comment: '', orderId: 'pin_abc', amountNano: want, expectedNano: want }), false);
});

test('a payment two percent short is still refused beyond tolerance', () => {
  assert.equal(paymentMatches({ comment: 'o1', orderId: 'o1', amountNano: '970', expectedNano: '1000', toleranceBps: 100 }), false);
  assert.equal(paymentMatches({ comment: 'o1', orderId: 'o1', amountNano: '995', expectedNano: '1000', toleranceBps: 100 }), true);
});
