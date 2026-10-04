export const LEGACY_WALLET_PROFILE_KEY = 'satoshiBarkEncryptedWalletV1';
export const AUTO_LOCK_KEY = 'satoshiBarkAutoLockMinutes';
export const PRIVACY_MODE_KEY = 'satoshiBarkPrivacyMode';
export const REFRESH_THRESHOLD_KEY_PREFIX = 'satoshiBarkRefreshThresholdBlocks:';
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
export const PBKDF2_ITERATIONS = 600_000;
export const REFRESH_THRESHOLD_OPTIONS = Object.freeze([12, 72, 144, 288, 1008]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const profileNetwork = network => network === 'signet' ? 'signet' : 'mainnet';
const additionalData = network => encoder.encode(`satoshi.si Bark ${profileNetwork(network)} wallet v1`);

export function walletProfileKey(network) {
  const label = profileNetwork(network) === 'signet' ? 'Signet' : 'Mainnet';
  return `satoshiBarkEncrypted${label}WalletV1`;
}

export function walletDatabaseBelongsToNetwork(name, network) {
  const value = String(name || '');
  return profileNetwork(network) === 'signet'
    ? /^satoshi-bark-(?:chain-)?signet-[a-f0-9]{20}$/.test(value)
    : /^satoshi-bark-(?:chain-)?[a-f0-9]{20}$/.test(value);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', hash: 'SHA-256', salt, iterations},
    material,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt'],
  );
}

export function validateWalletPassword(password) {
  if (typeof password !== 'string' || password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 256) return 'Use no more than 256 characters.';
  return '';
}

export async function encryptWalletSecret(secret, password, {iterations = PBKDF2_ITERATIONS, network = 'mainnet'} = {}) {
  const validation = validateWalletPassword(password);
  if (validation) throw new Error(validation);
  if (!secret) throw new Error('A wallet secret is required.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const normalizedNetwork = profileNetwork(network);
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: additionalData(normalizedNetwork)}, key, encoder.encode(secret));
  return {
    version: 1,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    network: normalizedNetwork,
    createdAt: new Date().toISOString(),
  };
}

export async function decryptWalletSecret(profile, password, {network = profile?.network || 'mainnet'} = {}) {
  if (!profile || profile.version !== 1 || profile.cipher !== 'AES-256-GCM' || profile.kdf !== 'PBKDF2-SHA-256') {
    throw new Error('This saved wallet profile is not supported.');
  }
  const normalizedNetwork = profileNetwork(network);
  if (profile.network && !['mainnet', 'signet'].includes(profile.network)) {
    throw new Error('This saved wallet profile contains an unknown Bitcoin network. Restore the wallet with its recovery words.');
  }
  if (profile.network && profileNetwork(profile.network) !== normalizedNetwork) {
    throw new Error('This saved wallet belongs to a different Bitcoin network.');
  }
  const iterations = Number(profile.iterations);
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 2_000_000) {
    throw new Error('This saved wallet profile is incomplete. Restore the wallet with its recovery words.');
  }
  let salt;
  let iv;
  let ciphertext;
  try {
    salt = base64ToBytes(profile.salt);
    iv = base64ToBytes(profile.iv);
    ciphertext = base64ToBytes(profile.ciphertext);
  } catch {
    throw new Error('This saved wallet profile is incomplete. Restore the wallet with its recovery words.');
  }
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length <= 16) {
    throw new Error('This saved wallet profile is incomplete. Restore the wallet with its recovery words.');
  }
  try {
    const key = await deriveKey(password, salt, iterations);
    const plaintext = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv, additionalData: additionalData(normalizedNetwork)},
      key,
      ciphertext,
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error('The password did not unlock this saved wallet. Check capitalization and spaces, or restore it with the recovery words.');
  }
}

export function readAutoLockMinutes(storage = localStorage) {
  const value = Number.parseInt(storage.getItem(AUTO_LOCK_KEY) || '', 10);
  return [0, 1, 5, 15, 30, 60].includes(value) ? value : DEFAULT_AUTO_LOCK_MINUTES;
}

export function readPrivacyMode(storage = localStorage) {
  return storage.getItem(PRIVACY_MODE_KEY) === 'true';
}

export function refreshThresholdKey(network) {
  return `${REFRESH_THRESHOLD_KEY_PREFIX}${profileNetwork(network)}`;
}

export function readRefreshThresholdBlocks(network, storage = localStorage) {
  const fallback = profileNetwork(network) === 'signet' ? 12 : 144;
  const value = Number.parseInt(storage.getItem(refreshThresholdKey(network)) || '', 10);
  return REFRESH_THRESHOLD_OPTIONS.includes(value) ? value : fallback;
}
