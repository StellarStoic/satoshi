import test from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceTotal,
  classifyPaymentDestination,
  describeBackgroundNotificationError,
  formatSats,
  notificationLifetimeLabel,
  notificationMovement,
  normalizeMnemonic,
  parseBolt11AmountSats,
  receivedMovementAmount,
  selectAuthorizationSeconds,
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

test('names the exact Brave setting when Brave blocks the push service', () => {
  const advice = describeBackgroundNotificationError(new Error('Registration failed - push service error'), {isBrave: true});
  assert.equal(advice.reason, 'brave-push-disabled');
  assert.match(advice.message, /Google services for push messaging/);
  assert.match(advice.message, /brave:\/\/settings\/privacy/);
  assert.match(advice.hint, /brave:\/\/settings\/privacy/);
});

test('keeps an actionable message for browsers without a reachable push service', () => {
  const advice = describeBackgroundNotificationError(
    Object.assign(new Error('Registration failed - push service error'), {name: 'AbortError'}),
    {isBrave: false});
  assert.equal(advice.reason, 'push-service-unreachable');
  assert.doesNotMatch(advice.message, /brave:\/\/settings/);
  assert.match(advice.message, /push service/);
  assert.match(advice.message, /Possible causes/);
  assert.doesNotMatch(advice.message, /AbortError|Registration failed/);
  assert.match(advice.detail, /AbortError/);
});

test('does not misattribute unrelated failures to the push service or to Brave', () => {
  const denied = describeBackgroundNotificationError(new Error('Notification permission was not granted.'), {isBrave: true});
  assert.equal(denied.reason, 'other');
  assert.equal(denied.message, 'Notification permission was not granted.');
  assert.doesNotMatch(denied.message, /Google services/);
  assert.equal(denied.hint, '');
});

test('lets the user choose any lifetime the service offers', () => {
  const service = {
    authorizationSeconds: 31_536_000,
    authorizationOptions: [{seconds: 86_400}, {seconds: 7_776_000}, {seconds: 15_552_000}, {seconds: 31_536_000}],
  };
  assert.equal(selectAuthorizationSeconds(service, {requested: 7_776_000}), 7_776_000);
  assert.equal(selectAuthorizationSeconds(service, {requested: 31_536_000}), 31_536_000);
  // A renewal has nothing on screen, so it reuses the period already granted.
  assert.equal(selectAuthorizationSeconds(service, {stored: 15_552_000}), 15_552_000);
  // No choice and nothing stored falls back to the longest period offered.
  assert.equal(selectAuthorizationSeconds(service), 31_536_000);
});

test('clamps a stale page instead of refusing to register alerts', () => {
  const service = {authorizationSeconds: 31_536_000, authorizationOptions: [{seconds: 86_400}, {seconds: 7_776_000}]};
  assert.equal(selectAuthorizationSeconds(service, {requested: 10_000_000}), 7_776_000);
  assert.equal(selectAuthorizationSeconds(service, {requested: 3_000_000}), 86_400);
  // A service advertising no list keeps the old behaviour rather than breaking.
  assert.equal(selectAuthorizationSeconds({}), 86_400);
  assert.equal(selectAuthorizationSeconds({authorizationSeconds: 86_400}, {requested: 99_999_999}), 86_400);
});

test('names the chosen period for the confirmation notice', () => {
  assert.equal(notificationLifetimeLabel(86_400), '24 hours');
  assert.equal(notificationLifetimeLabel(7_776_000), '3 months');
  assert.equal(notificationLifetimeLabel(15_552_000), '6 months');
  assert.equal(notificationLifetimeLabel(31_536_000), '1 year');
  assert.equal(notificationLifetimeLabel(172_800), '2 days');
});
