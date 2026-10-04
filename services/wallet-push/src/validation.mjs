import crypto from 'node:crypto';

// Mailbox authorizations are read capabilities that cannot be revoked at the Ark
// server before they expire, so this ceiling is a deliberate trade: long enough
// that background alerts keep working for someone who does not open the wallet
// every day, short enough that no single grant outlives a year. The wallet offers
// the four lifetimes below; anything in between is accepted, so a client cannot
// quietly ask for ten years and the server never has to trust the UI.
export const MAX_AUTH_SECONDS = 365 * 24 * 60 * 60;
export const AUTH_LIFETIME_OPTIONS = Object.freeze([
  {seconds: 24 * 60 * 60, label: '24 hours'},
  {seconds: 90 * 24 * 60 * 60, label: '3 months'},
  {seconds: 180 * 24 * 60 * 60, label: '6 months'},
  {seconds: MAX_AUTH_SECONDS, label: '1 year'},
]);

// setTimeout truncates any delay above 2^31-1 ms (about 24.8 days) and fires
// almost immediately instead, which would tear down a one-year watcher the moment
// it started. Long expiries are therefore re-armed in slices this long.
export const MAX_TIMER_DELAY_MS = 6 * 60 * 60 * 1000;

export const ALLOWED_SERVERS = new Set([
  'https://ark.second.tech',
  'https://ark.signet.2nd.dev',
]);
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
];
const SENSITIVE_BODY_FIELDS = new Set([
  'mnemonic', 'seed', 'seedphrase', 'recoveryphrase', 'xprv', 'privatekey', 'nsec',
]);

export function rejectSensitiveFields(body) {
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 4) return null;
    for (const [field, nested] of Object.entries(value)) {
      const normalized = field.replace(/[-_]/g, '').toLowerCase();
      if (SENSITIVE_BODY_FIELDS.has(normalized)) return field;
      const found = visit(nested, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const found = visit(body);
  if (found) throw new Error(`Sensitive wallet field is forbidden: ${found}`);
}

export function redactLogValue(value) {
  return String(value ?? '')
    .replace(/\b[0-9a-f]{210}\b/gi, '[redacted-mailbox-authorization]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/https:\/\/[^\s)\]}]+/gi, '[redacted-url]')
    .slice(0, 500);
}

export function decodeHex(value, expectedBytes, label) {
  if (typeof value !== 'string' || value.length !== expectedBytes * 2 || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error(`${label} must be ${expectedBytes} bytes of hexadecimal data`);
  }
  return Buffer.from(value, 'hex');
}

export function authorizationExpiry(authorization) {
  if (!Buffer.isBuffer(authorization) || authorization.length !== 105) throw new Error('Invalid mailbox authorization');
  return Number(authorization.readBigInt64LE(33));
}

export function validateDelegation(body, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!body || typeof body !== 'object') throw new Error('Request body is required');
  rejectSensitiveFields(body);
  if (!ALLOWED_SERVERS.has(body.serverAddress)) throw new Error('Unsupported Ark server');
  if (!['mainnet', 'signet'].includes(body.network)) throw new Error('Unsupported Bitcoin network');
  if ((body.network === 'mainnet') !== (body.serverAddress === 'https://ark.second.tech')) {
    throw new Error('Bitcoin network and Ark server do not match');
  }

  const mailboxId = decodeHex(body.mailboxIdentifier, 33, 'Mailbox identifier');
  const authorization = decodeHex(body.authorization, 105, 'Mailbox authorization');
  if (!crypto.timingSafeEqual(mailboxId, authorization.subarray(0, 33))) {
    throw new Error('Mailbox authorization does not match its identifier');
  }
  const expiresAt = authorizationExpiry(authorization);
  if (expiresAt <= nowSeconds + 60) throw new Error('Mailbox authorization expires too soon');
  if (expiresAt > nowSeconds + MAX_AUTH_SECONDS + 60) throw new Error('Mailbox authorization exceeds the 1-year limit');

  const subscription = body.subscription;
  if (!subscription || typeof subscription.endpoint !== 'string' || !/^https:\/\//.test(subscription.endpoint)) {
    throw new Error('A secure Web Push endpoint is required');
  }
  let pushHost;
  try { pushHost = new URL(subscription.endpoint).hostname.toLowerCase(); } catch { throw new Error('Invalid Web Push endpoint'); }
  if (!PUSH_HOST_SUFFIXES.some(suffix => pushHost === suffix || pushHost.endsWith(`.${suffix}`))) {
    throw new Error('Unsupported Web Push provider');
  }
  if (typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') {
    throw new Error('Web Push encryption keys are required');
  }

  return {mailboxId, authorization, expiresAt, subscription};
}

export function currentMailboxCheckpoint(nowMs = Date.now()) {
  // A short overlap tolerates clock skew between this host and the Ark server.
  return (BigInt(Math.max(0, nowMs - 30_000)) << 20n).toString();
}

// How long the watcher may sleep before it has to re-check the expiry. Returns 0
// when the authorization is already finished, so the caller can tear the watcher
// down instead of scheduling an immediate, pointless wake-up.
export function expiryTimerDelay(expiresAtSeconds, nowMs = Date.now()) {
  const remaining = Number(expiresAtSeconds) * 1000 - nowMs;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  return Math.min(remaining, MAX_TIMER_DELAY_MS);
}

export function publicRecord(record) {
  return {id: record.id, expiresAt: record.expiresAt};
}
