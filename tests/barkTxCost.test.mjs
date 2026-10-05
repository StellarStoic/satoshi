import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_PRICING, estimateBarkCost, normalizeAmount} from '../barkTxCostModel.mjs';

test('normalizes transaction amounts without fractions or negative sats', () => {
  assert.equal(normalizeAmount('20000.9'), 20000);
  assert.equal(normalizeAmount(-2), 0);
});

test('Ark transfers use the published zero fee', () => {
  assert.deepEqual(estimateBarkCost({amount: 20000, destination: 'ark'}), {
    kind: 'exact', min: 0, max: 0, serviceMin: 0, serviceMax: 0, mining: 0,
  });
});

test('Lightning applies the published percentage range and minimum', () => {
  assert.deepEqual(estimateBarkCost({amount: 1000, destination: 'lightning'}), {
    kind: 'range', min: 20, max: 20, serviceMin: 20, serviceMax: 20, mining: 0,
  });
  assert.equal(estimateBarkCost({amount: 100000, destination: 'lightning'}).max, 500);
});

test('on-chain estimate separates service and illustrative mining fees', () => {
  const result = estimateBarkCost({amount: 20000, destination: 'onchain', pricing: DEFAULT_PRICING, feeRate: 2});
  assert.equal(result.serviceMin, 40);
  assert.equal(result.serviceMax, 100);
  assert.equal(result.mining, 500);
  assert.equal(result.min, 540);
  assert.equal(result.max, 600);
});
