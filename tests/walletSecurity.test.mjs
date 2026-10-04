import test from 'node:test';
import assert from 'node:assert/strict';
import {decryptWalletSecret, encryptWalletSecret, validateWalletPassword, walletProfileKey} from '../walletSecurity.mjs';

test('wallet secret round-trips through password encryption', async () => {
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const profile = await encryptWalletSecret(phrase, 'a strong test password', {iterations: 10_000});
  assert.equal(await decryptWalletSecret(profile, 'a strong test password'), phrase);
  assert.doesNotMatch(profile.ciphertext, /abandon/);
});

test('wallet secret rejects the wrong password', async () => {
  const profile = await encryptWalletSecret('secret words', 'a strong test password', {iterations: 10_000});
  await assert.rejects(() => decryptWalletSecret(profile, 'a different password'), /Incorrect password/);
});

test('wallet password must be at least twelve characters', () => {
  assert.match(validateWalletPassword('short'), /12 characters/);
  assert.equal(validateWalletPassword('long enough password'), '');
});

test('mainnet and signet profiles are isolated', async () => {
  const mainnet = await encryptWalletSecret('mainnet words', 'a strong test password', {iterations: 10_000, network: 'mainnet'});
  const signet = await encryptWalletSecret('signet words', 'a strong test password', {iterations: 10_000, network: 'signet'});
  assert.notEqual(walletProfileKey('mainnet'), walletProfileKey('signet'));
  assert.equal(await decryptWalletSecret(signet, 'a strong test password', {network: 'signet'}), 'signet words');
  await assert.rejects(() => decryptWalletSecret(mainnet, 'a strong test password', {network: 'signet'}), /Incorrect password/);
});
