
import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedNanoFor } from './tonwatcher.mjs';

test('a pin expects the anonymous rung plus the fee', () => {
  assert.equal(expectedNanoFor({ action: 'pin' }), '510000000');
  assert.equal(expectedNanoFor({}), '510000000');
});

test('a subscription expects its plan', () => {
  assert.equal(expectedNanoFor({ action: 'subscribe', plan: 'week' }), '1010000000');
  assert.equal(expectedNanoFor({ action: 'subscribe', plan: 'year' }), '3010000000');
});

test('a plan the ladder does not carry falls back to the weekly rung rather than quoting nothing', () => {
  assert.equal(expectedNanoFor({ action: 'subscribe', plan: 'month' }), '1010000000');
});
