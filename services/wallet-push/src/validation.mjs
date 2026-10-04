import crypto from 'node:crypto';

export const MAX_AUTH_SECONDS = 24 * 60 * 60;
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
  if (expiresAt > nowSeconds + MAX_AUTH_SECONDS + 60) throw new Error('Mailbox authorization exceeds the 24-hour limit');

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

export function publicRecord(record) {
  return {id: record.id, expiresAt: record.expiresAt};
}
