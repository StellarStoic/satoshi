import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizationExpiry, currentMailboxCheckpoint, redactLogValue, validateDelegation} from '../src/validation.mjs';

function body(now, overrides = {}) {
  const mailbox = Buffer.concat([Buffer.from([2]), Buffer.alloc(32, 7)]);
  const authorization = Buffer.alloc(105);
  mailbox.copy(authorization);
  authorization.writeBigInt64LE(BigInt(now + 3600), 33);
  return {
    network: 'signet',
    serverAddress: 'https://ark.signet.2nd.dev',
    mailboxIdentifier: mailbox.toString('hex'),
    authorization: authorization.toString('hex'),
    subscription: {endpoint: 'https://fcm.googleapis.com/wp/sub', keys: {p256dh: 'key', auth: 'auth'}},
    ...overrides,
  };
}

test('validates a short-lived matching mailbox delegation', () => {
  const now = 2_000_000_000;
  const result = validateDelegation(body(now), now);
  assert.equal(authorizationExpiry(result.authorization), now + 3600);
});

test('rejects mismatched mailbox identifiers and long authorization windows', () => {
  const now = 2_000_000_000;
  assert.throws(() => validateDelegation(body(now, {mailboxIdentifier: Buffer.alloc(33, 1).toString('hex')}), now), /does not match/);
  const request = body(now);
  const auth = Buffer.from(request.authorization, 'hex');
  auth.writeBigInt64LE(BigInt(now + 90000), 33);
  assert.throws(() => validateDelegation({...request, authorization: auth.toString('hex')}, now), /24-hour/);
});

test('rejects mismatched networks and arbitrary push destinations', () => {
  const now = 2_000_000_000;
  assert.throws(() => validateDelegation(body(now, {network: 'mainnet'}), now), /do not match/);
  const request = body(now);
  request.subscription.endpoint = 'https://127.0.0.1/private';
  assert.throws(() => validateDelegation(request, now), /Unsupported Web Push provider/);
});

test('refuses sensitive wallet material instead of silently ignoring it', () => {
  const now = 2_000_000_000;
  assert.throws(() => validateDelegation({...body(now), mnemonic: 'never accept this'}, now), /forbidden: mnemonic/);
  assert.throws(() => validateDelegation({...body(now), xprv: 'never accept this'}, now), /forbidden: xprv/);
  assert.throws(() => validateDelegation({...body(now), extra: {recovery_phrase: 'never accept this'}}, now), /forbidden: recovery_phrase/);
});

test('redacts capabilities, bearer tokens, and URLs from future log messages', () => {
  const authorization = 'a'.repeat(210);
  const output = redactLogValue(`failed ${authorization} Bearer abc_123 https://push.example/private`);
  assert.equal(output, 'failed [redacted-mailbox-authorization] Bearer [redacted] [redacted-url]');
});

test('starts a subscription cursor at the current Bark time-based checkpoint', () => {
  assert.equal(currentMailboxCheckpoint(31_234), (1234n << 20n).toString());
});
