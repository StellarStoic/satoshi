import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  decryptWalletSecret,
  encryptWalletSecret,
  readPrivacyMode,
  readRefreshThresholdBlocks,
  refreshThresholdKey,
  validateWalletPassword,
  walletDatabaseBelongsToNetwork,
  walletProfileKey,
} from '../walletSecurity.mjs';

const walletSource = readFileSync(new URL('../wallet.mjs', import.meta.url), 'utf8');
const walletHtml = readFileSync(new URL('../wallet.html', import.meta.url), 'utf8');

test('wallet secret round-trips through password encryption', async () => {
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const profile = await encryptWalletSecret(phrase, 'a strong test password', {iterations: 10_000});
  assert.equal(await decryptWalletSecret(profile, 'a strong test password'), phrase);
  assert.doesNotMatch(profile.ciphertext, /abandon/);
});

test('wallet secret rejects the wrong password', async () => {
  const profile = await encryptWalletSecret('secret words', 'a strong test password', {iterations: 10_000});
  await assert.rejects(() => decryptWalletSecret(profile, 'a different password'), /password did not unlock/i);
});

test('wallet profile reports malformed local data separately from a password failure', async () => {
  const profile = await encryptWalletSecret('secret words', 'a strong test password', {iterations: 10_000});
  await assert.rejects(() => decryptWalletSecret({...profile, salt: 'not base64!'}, 'a strong test password'), /profile is incomplete/i);
});

test('authenticated ciphertext changes cannot be distinguished from a wrong password', async () => {
  const profile = await encryptWalletSecret('secret words', 'a strong test password', {iterations: 10_000});
  const ciphertext = Uint8Array.from(atob(profile.ciphertext), character => character.charCodeAt(0));
  ciphertext[0] ^= 1;
  const changed = btoa(String.fromCharCode(...ciphertext));
  await assert.rejects(() => decryptWalletSecret({...profile, ciphertext: changed}, 'a strong test password'), /password did not unlock/i);
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
  await assert.rejects(() => decryptWalletSecret(mainnet, 'a strong test password', {network: 'signet'}), /different Bitcoin network/);
});

test('wallet database deletion remains isolated to the selected network', () => {
  assert.equal(walletDatabaseBelongsToNetwork('satoshi-bark-signet-0123456789abcdef0123', 'signet'), true);
  assert.equal(walletDatabaseBelongsToNetwork('satoshi-bark-chain-signet-0123456789abcdef0123', 'signet'), true);
  assert.equal(walletDatabaseBelongsToNetwork('satoshi-bark-0123456789abcdef0123', 'mainnet'), true);
  assert.equal(walletDatabaseBelongsToNetwork('satoshi-bark-chain-0123456789abcdef0123', 'mainnet'), true);
  assert.equal(walletDatabaseBelongsToNetwork('satoshi-bark-0123456789abcdef0123', 'signet'), false);
  assert.equal(walletDatabaseBelongsToNetwork('satoshi-bark-signet-0123456789abcdef0123', 'mainnet'), false);
});

test('does not reveal legacy wallet databases before password unlock is configured', () => {
  assert.doesNotMatch(walletSource, /function hasLegacyWalletData/);
  assert.doesNotMatch(walletSource, /Existing .* wallet data found/);
  assert.match(walletSource, /async function removeWalletDatabases/);
});

test('warns about Ark expiry and recovery before wallet onboarding', () => {
  const onboarding = walletHtml.slice(walletHtml.indexOf('<section class="wallet-onboarding"'), walletHtml.indexOf('<section class="wallet-dashboard"'));
  assert.match(onboarding, /Ark is for active spending, not set-and-forget savings/);
  assert.match(onboarding, /Funds that have expired and been swept are not guaranteed to be recoverable/);
  assert.match(onboarding, /https:\/\/second\.tech\/blog\/ark-liquidity-research-01\//);
  assert.match(onboarding, /https:\/\/second\.tech\/blog\/hark-explained\//);
  assert.match(onboarding, /https:\/\/second\.tech\/terms/);
});

test('refresh thresholds are network-specific and reject unknown values', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null};
  assert.equal(readRefreshThresholdBlocks('mainnet', storage), 144);
  assert.equal(readRefreshThresholdBlocks('signet', storage), 12);
  values.set(refreshThresholdKey('mainnet'), '288');
  values.set(refreshThresholdKey('signet'), '999');
  assert.equal(readRefreshThresholdBlocks('mainnet', storage), 288);
  assert.equal(readRefreshThresholdBlocks('signet', storage), 12);
});

test('privacy mode is enabled only by its explicit stored value', () => {
  assert.equal(readPrivacyMode({getItem: () => 'true'}), true);
  assert.equal(readPrivacyMode({getItem: () => 'false'}), false);
  assert.equal(readPrivacyMode({getItem: () => null}), false);
});

test('wallet settings use Bark refresh and complete emergency-exit APIs', () => {
  assert.match(walletSource, /vtxoRefreshExpiryThreshold:\s*readRefreshThresholdBlocks/);
  assert.match(walletSource, /estimateEmergencyExitFee\(\[\], null, null\)/);
  assert.match(walletSource, /startExitForEntireWallet\(\)/);
  assert.match(walletSource, /progressExits\(\{\}\)/);
  assert.match(walletSource, /drainExits\(\{vtxoIds: \[\], drainAll: true, address\}\)/);
  assert.match(walletSource, /extractTxFromPsbt\(claim\.psbtBase64\)/);
});
