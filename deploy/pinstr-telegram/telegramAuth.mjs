// Verifying Telegram identity for the Pinstr Telegram door.
// Deploy-only: served by api.pinstr.si, never by satoshi.si.

import crypto from 'node:crypto';

const DEFAULT_MAX_AGE_S = 3600;

function hmac(key, message) {
  return crypto.createHmac('sha256', key).update(message, 'utf8').digest();
}

function dataCheckString(params, exclude) {
  return [...params.entries()]
    .filter(([key]) => !exclude.has(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
}

function equalHex(a, b) {
  const ba = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

function parseUser(raw) {
  if (!raw) return null;
  try {
    const u = JSON.parse(raw);
    if (!u || typeof u.id !== 'number') return null;
    return {
      id: u.id,
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      username: u.username || null,
      languageCode: u.language_code || null,
      isPremium: Boolean(u.is_premium),
      photoUrl: u.photo_url || null,
    };
  } catch {
    return null;
  }
}

// Mini App initData. Telegram signs it with a key derived from the bot token:
// secret = HMAC_SHA256("WebAppData", bot_token), hash = HMAC_SHA256(secret, data_check_string).
// Recent clients add a `signature` field that some validators exclude from the
// data-check-string, so both readings are accepted rather than guessing.
export function verifyInitData(initData, botToken, { now = Date.now(), maxAgeS = DEFAULT_MAX_AGE_S } = {}) {
  if (typeof initData !== 'string' || initData.length === 0) return { valid: false, reason: 'empty init data' };
  if (typeof botToken !== 'string' || botToken.length < 10) return { valid: false, reason: 'no bot token configured' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, reason: 'no hash' };
  const secret = hmac('WebAppData', botToken);
  const readings = [new Set(['hash']), new Set(['hash', 'signature'])];
  const sigOk = readings.some((exclude) => equalHex(crypto.createHmac('sha256', secret).update(dataCheckString(params, exclude), 'utf8').digest('hex'), hash));
  if (!sigOk) return { valid: false, reason: 'signature does not match' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) return { valid: false, reason: 'no auth_date' };
  const ageS = Math.floor(now / 1000) - authDate;
  if (ageS > maxAgeS) return { valid: false, reason: 'expired', ageS };
  if (ageS < -60) return { valid: false, reason: 'auth_date in the future', ageS };

  const user = parseUser(params.get('user'));
  if (!user) return { valid: false, reason: 'no user in payload' };
  return {
    valid: true,
    user,
    authDate: new Date(authDate * 1000).toISOString(),
    queryId: params.get('query_id') || null,
    startParam: params.get('start_param') || null,
    chatType: params.get('chat_type') || null,
  };
}

// The web Login Widget signs with a plain sha256 of the bot token instead.
export function verifyLoginWidget(fields, botToken, { now = Date.now(), maxAgeS = 300 } = {}) {
  if (!fields || typeof fields !== 'object') return { valid: false, reason: 'no fields' };
  if (typeof botToken !== 'string' || botToken.length < 10) return { valid: false, reason: 'no bot token configured' };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && key !== 'hash') params.append(key, String(value));
  }
  const hash = fields.hash;
  if (!hash) return { valid: false, reason: 'no hash' };
  const secret = crypto.createHash('sha256').update(botToken, 'utf8').digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString(params, new Set()), 'utf8').digest('hex');
  if (!equalHex(expected, hash)) return { valid: false, reason: 'signature does not match' };

  const authDate = Number(fields.auth_date);
  if (!Number.isFinite(authDate) || authDate <= 0) return { valid: false, reason: 'no auth_date' };
  const ageS = Math.floor(now / 1000) - authDate;
  if (ageS > maxAgeS) return { valid: false, reason: 'expired', ageS };
  if (!fields.id) return { valid: false, reason: 'no user id' };
  return {
    valid: true,
    user: {
      id: Number(fields.id),
      firstName: fields.first_name || '',
      lastName: fields.last_name || '',
      username: fields.username || null,
      languageCode: fields.language_code || null,
      isPremium: Boolean(fields.is_premium),
      photoUrl: fields.photo_url || null,
    },
    authDate: new Date(authDate * 1000).toISOString(),
  };
}
