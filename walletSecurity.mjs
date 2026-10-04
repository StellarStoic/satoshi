export const LEGACY_WALLET_PROFILE_KEY = 'satoshiBarkEncryptedWalletV1';
export const AUTO_LOCK_KEY = 'satoshiBarkAutoLockMinutes';
export const DEFAULT_AUTO_LOCK_MINUTES = 5;
export const PBKDF2_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const profileNetwork = network => network === 'signet' ? 'signet' : 'mainnet';
const additionalData = network => encoder.encode(`satoshi.si Bark ${profileNetwork(network)} wallet v1`);

export function walletProfileKey(network) {
  const label = profileNetwork(network) === 'signet' ? 'Signet' : 'Mainnet';
  return `satoshiBarkEncrypted${label}WalletV1`;
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
  try {
    const normalizedNetwork = profileNetwork(network);
    if (profile.network && profileNetwork(profile.network) !== normalizedNetwork) throw new Error('Wallet network mismatch.');
    const iterations = Number(profile.iterations);
    if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 2_000_000) throw new Error('Invalid KDF parameters.');
    const salt = base64ToBytes(profile.salt);
    const iv = base64ToBytes(profile.iv);
    const key = await deriveKey(password, salt, iterations);
    const plaintext = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv, additionalData: additionalData(normalizedNetwork)},
      key,
      base64ToBytes(profile.ciphertext),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error('Incorrect password or damaged wallet profile.');
  }
}

export function readAutoLockMinutes(storage = localStorage) {
  const value = Number.parseInt(storage.getItem(AUTO_LOCK_KEY) || '', 10);
  return [0, 1, 5, 15, 30, 60].includes(value) ? value : DEFAULT_AUTO_LOCK_MINUTES;
}
