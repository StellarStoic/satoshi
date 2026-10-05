import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {estimateTransaction, feeShare} from '../bitcoinTxCostModel.mjs';
import {estimateRoute} from '../txCostRouteModel.mjs';

const page = await readFile(new URL('../bitcoinTxCost.html', import.meta.url), 'utf8');
const controller = await readFile(new URL('../bitcoinTxCost.mjs', import.meta.url), 'utf8');

test('estimates a common one-input two-output native SegWit transaction', () => {
  const result = estimateTransaction({
    inputType: 'p2wpkh', outputType: 'p2wpkh', inputCount: 1, recipientCount: 1, includeChange: true, feeRate: 2,
  });
  assert.equal(result.weight, 562);
  assert.equal(result.vbytes, 141);
  assert.equal(result.fee, 282);
});

test('Legacy transactions do not include witness marker weight', () => {
  const result = estimateTransaction({
    inputType: 'p2pkh', outputType: 'p2pkh', inputCount: 1, recipientCount: 1, includeChange: false, feeRate: 1,
  });
  assert.equal(result.weight, 768);
  assert.equal(result.vbytes, 192);
});

test('Taproot key-path inputs use their discounted witness weight', () => {
  const result = estimateTransaction({
    inputType: 'p2tr', outputType: 'p2tr', inputCount: 2, recipientCount: 1, includeChange: true, feeRate: 1.5,
  });
  assert.equal(result.weight, 846);
  assert.equal(result.vbytes, 212);
  assert.equal(result.fee, 318);
});

test('fee share is optional and based on payment amount', () => {
  assert.equal(feeShare(20000, 200), 1);
  assert.equal(feeShare(0, 200), null);
});

test('offers visible live-fee targets and a directly editable custom rate', () => {
  for (const target of ['economyFee', 'hourFee', 'halfHourFee', 'fastestFee']) {
    assert.match(page, new RegExp(`data-fee-speed="${target}"`));
  }
  assert.match(page, /id="feeRate"[^>]*min="0\.01"/);
  assert.doesNotMatch(page, /id="feeRate"[^>]*readonly/);
  assert.match(controller, /selectedSpeed = 'custom'/);
  assert.match(controller, /api\/v1\/fees\/precise/);
});

test('combines Ark service pricing with destination-specific on-chain size', () => {
  const segwit = estimateRoute({source: 'ark', destination: 'p2wpkh', amount: 20000, feeRate: 2});
  const taproot = estimateRoute({source: 'ark', destination: 'p2tr', amount: 20000, feeRate: 2});
  assert.equal(segwit.vbytes, 250);
  assert.equal(segwit.min, 540);
  assert.equal(segwit.max, 600);
  assert.equal(taproot.vbytes, 262);
  assert.equal(taproot.min, 564);
});

test('estimates boarding and rejects Lightning without an Ark source', () => {
  const boarding = estimateRoute({source: 'p2wpkh', destination: 'ark', amount: 20000, feeRate: 2});
  assert.equal(boarding.route, 'onchain-to-ark');
  assert.equal(boarding.vbytes, 153);
  assert.equal(boarding.min, 306);
  assert.throws(
    () => estimateRoute({source: 'p2wpkh', destination: 'lightning', amount: 20000, feeRate: 2}),
    /require an Ark source/,
  );
});

test('hides Lightning and falls back to Ark when an on-chain source is used', () => {
  assert.match(controller, /lightningOption\.hidden = sourceOnchain/);
  assert.match(controller, /lightningOption\.disabled = sourceOnchain/);
  assert.match(controller, /fields\.destination\.value === 'lightning'\) fields\.destination\.value = 'ark'/);
});
