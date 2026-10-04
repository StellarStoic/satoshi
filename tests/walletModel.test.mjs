import test from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceTotal,
  classifyPaymentDestination,
  formatSats,
  notificationMovement,
  normalizeMnemonic,
  parseBolt11AmountSats,
  receivedMovementAmount,
} from '../walletModel.mjs';

test('normalizes mnemonic whitespace and case', () => {
  assert.equal(normalizeMnemonic('  ABANDON\nability   Able '), 'abandon ability able');
});

test('reads BOLT11 mainnet amounts including lightning URI prefixes', () => {
  assert.equal(parseBolt11AmountSats('lnbc21u1example'), 2100);
  assert.equal(parseBolt11AmountSats('LIGHTNING:lnbc2500n1example'), 250);
  assert.equal(parseBolt11AmountSats('lnbc1example'), null);
  assert.equal(parseBolt11AmountSats('lntb21u1example'), 2100);
});

test('reads signet BOLT11 amounts and classifies signet addresses', () => {
  assert.equal(parseBolt11AmountSats('lntb21u1example'), 2100);
  assert.equal(classifyPaymentDestination(`tb1q${'a'.repeat(38)}`), 'on-chain');
});

test('classifies supported payment destinations', () => {
  const arkAddress = 'ark1example';
  const isArk = value => value === arkAddress;
  assert.equal(classifyPaymentDestination(arkAddress, isArk), 'ark');
  assert.equal(classifyPaymentDestination('lightning:lnbc21u1example', isArk), 'lightning-invoice');
  assert.equal(classifyPaymentDestination('alice@example.com', isArk), 'lightning-address');
  assert.equal(classifyPaymentDestination(`bc1q${'a'.repeat(38)}`, isArk), 'on-chain');
  assert.equal(classifyPaymentDestination('', isArk), null);
  assert.equal(classifyPaymentDestination('not an address', isArk), null);
});

test('totals Bark balance buckets and formats sats', () => {
  assert.equal(balanceTotal({spendableSats: 100, pendingInRoundSats: 20, pendingExitSats: 3}), 123);
  assert.match(formatSats(1234), /1[,.\s]234 sats/);
});

test('detects credited movements from wallet notifications', () => {
  const movement = {id: 21, effectiveBalanceSats: 12_345, subsystemKind: 'LightningReceive'};
  assert.equal(notificationMovement({type: 'MovementUpdated', movement}), movement);
  assert.equal(receivedMovementAmount(movement), 12_345);
  assert.equal(receivedMovementAmount({effectiveBalanceSats: -500}), 0);
  assert.equal(receivedMovementAmount({intendedBalanceSats: 500, effectiveBalanceSats: 0}), 0);
  assert.equal(notificationMovement({type: 'ChannelLagging'}), null);
});
