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
const walletCss = readFileSync(new URL('../wallet.css', import.meta.url), 'utf8');

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

test('keeps onboarding simple and puts Ark expiry and recovery in the required explainer', () => {
  const onboarding = walletHtml.slice(walletHtml.indexOf('<section class="wallet-onboarding"'), walletHtml.indexOf('<section class="wallet-dashboard"'));
  const explainer = walletHtml.slice(walletHtml.indexOf('id="barkHelpDialog"'), walletHtml.indexOf('id="backupDialog"'));
  assert.match(onboarding, /Bitcoin wallet built with Bark/);
  assert.match(onboarding, /Signet.*free test sats/);
  assert.match(onboarding, /Mainnet.*real Bitcoin payments over the Ark Layer 2 network/);
  assert.doesNotMatch(onboarding, /VTXOs expire/);
  assert.match(explainer, /ELI5: what is Bark/);
  assert.match(explainer, /Technical details/);
  assert.match(explainer, /VTXOs expire/);
  assert.match(explainer, /https:\/\/second\.tech\/blog\/ark-liquidity-research-01\//);
  assert.match(explainer, /https:\/\/second\.tech\/blog\/hark-explained\//);
  assert.match(explainer, /https:\/\/second\.tech\/terms/);
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
  assert.match(walletCss, /\.wallet-privacy[\s\S]*filter:\s*blur\(14px\)/);
  assert.match(walletCss, /\.wallet-privacy[\s\S]*opacity:\s*\.42/);
});

test('receive requests identify their network and copy the specific payment item', () => {
  assert.match(walletSource, /copyLabel:\s*`\$\{activeNetwork\.shortLabel\} Ark address`/);
  assert.match(walletSource, /copyLabel:\s*`\$\{activeNetwork\.shortLabel\} Bitcoin address`/);
  assert.match(walletSource, /copyLabel:\s*`\$\{activeNetwork\.shortLabel\} Lightning invoice`/);
  assert.match(walletSource, /dataset\.copyLabel \|\| 'Payment request'/);
});

test('balance moves explain costs and distinguish a cooperative withdrawal from an emergency exit', () => {
  assert.match(walletHtml, /Cooperative withdrawal and emergency exit/);
  assert.match(walletHtml, /Use an ordinary on-chain payment whenever the server is cooperating/);
  assert.match(walletHtml, /Cost: the Bitcoin mining fee/);
  assert.match(walletHtml, /server's withdrawal quote/);
  assert.match(walletSource, /normal cooperative withdrawal, not an emergency exit/);
  assert.match(walletHtml, /id="offboardAll"/);
  assert.match(walletSource, /estimateOffboardAllFee\(destination\)/);
  assert.match(walletSource, /Choose “Move my entire Ark balance” to deduct the fee instead/);
  assert.match(walletSource, /\['Ark service fee', payment\.fee \? formatSats\(payment\.fee\) : 'None'\]/);
  assert.match(walletSource, /\['Bitcoin mining fee', 'Calculated by the on-chain wallet when submitted'\]/);
});

test('unlocked wallet home keeps only primary actions and moves history into a bottom sheet', () => {
  assert.match(walletHtml, /class="wallet-actions"[\s\S]*data-wallet-view="send"[\s\S]*data-wallet-view="receive"/);
  assert.doesNotMatch(walletHtml, /data-wallet-view="(?:move|activity)"/);
  assert.match(walletHtml, /id="openWalletActivity"/);
  assert.match(walletHtml, /id="activityDialog"/);
  assert.match(walletHtml, /id="nextRoundCountdown"/);
  assert.match(walletSource, /wallet\.nextRoundStartTime\(\)/);
  assert.match(walletHtml, /data-scan-target="ark"/);
  assert.match(walletHtml, /data-scan-target="onchain"/);
});

test('wallet settings use Bark refresh and complete emergency-exit APIs', () => {
  assert.match(walletSource, /vtxoRefreshExpiryThreshold:\s*readRefreshThresholdBlocks/);
  assert.match(walletSource, /estimateEmergencyExitFee\(\[\], null, null\)/);
  assert.match(walletSource, /startExitForEntireWallet\(\)/);
  assert.match(walletSource, /progressExits\(\{\}\)/);
  assert.match(walletSource, /drainExits\(\{vtxoIds: \[\], drainAll: true, address\}\)/);
  assert.match(walletSource, /extractTxFromPsbt\(claim\.psbtBase64\)/);
});

test('wallet exposes live fees and persistent transaction references', () => {
  assert.match(walletHtml, /id="walletFeeSlow"/);
  assert.match(walletHtml, /id="walletFeeRegular"/);
  assert.match(walletHtml, /id="walletFeeFast"/);
  assert.match(walletSource, /onchain\.feeRates\(\)/);
  assert.match(walletSource, /metadata\.offboard_txid/);
  assert.match(walletSource, /movement\.paymentHash/);
  assert.match(walletSource, /movement\.inputVtxoIds/);
  assert.match(walletSource, /transaction\.onchainFeeSats/);
  assert.match(walletSource, /transactionExplorerUrl\(txid\)/);
  assert.match(walletHtml, /id="paymentResultDialog"/);
});

test('wallet reconciles an explicitly spent VTXO without repeating the payment', () => {
  assert.match(walletSource, /spentVtxoIdsFromError\(error\)/);
  assert.match(walletSource, /await wallet\.recoverVtxos\(spentVtxoIds, null\)/);
  assert.match(walletSource, /local balance has been repaired/);
  assert.doesNotMatch(walletSource, /recoverVtxos\(spentVtxoIds, null\)[\s\S]{0,200}executePayment\(payment\)/);
});
