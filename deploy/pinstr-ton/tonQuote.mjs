// TON payment quoting for the Pinstr Telegram door.
// Deploy-only: nothing here is served by satoshi.si.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function crc16(bytes) {
  let reg = 0;
  for (const b of bytes) {
    reg ^= b << 8;
    for (let i = 0; i < 8; i += 1) {
      reg = reg & 0x8000 ? ((reg << 1) ^ 0x1021) & 0xffff : (reg << 1) & 0xffff;
    }
  }
  return reg;
}

function decodeFriendly(str) {
  if (typeof str !== 'string') return null;
  const t = str.trim();
  if (t.length !== 48) return null;
  const out = [];
  let bits = 0;
  let acc = 0;
  for (const ch of t) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return out.length === 36 ? out : null;
}

export function parseTonAddress(address) {
  const bytes = decodeFriendly(address);
  if (!bytes) return { valid: false, reason: 'not a 48-character friendly address' };
  const tag = bytes[0];
  const known = new Set([0x11, 0x51, 0x91, 0xd1]);
  if (!known.has(tag)) return { valid: false, reason: 'unknown address tag 0x' + tag.toString(16) };
  const workchain = bytes[1] > 127 ? bytes[1] - 256 : bytes[1];
  const hashHex = Buffer.from(bytes.slice(2, 34)).toString('hex');
  const checksum = (bytes[34] << 8) | bytes[35];
  if (crc16(bytes.slice(0, 34)) !== checksum) return { valid: false, reason: 'checksum does not match' };
  return {
    valid: true,
    raw: `${workchain}:${hashHex}`,
    workchain,
    hashHex,
    bounceable: tag === 0x51 || tag === 0xd1,
    testnet: tag === 0x91 || tag === 0xd1,
  };
}

// One sat is 1e-8 BTC and one TON is 1e9 nanoTON, so nanoTON per sat
// is 10 * btcUsd / tonUsd. Cents keep the division exact without floats.
export function satsToNano(sats, btcUsd, tonUsd) {
  if (!(sats > 0) || !(btcUsd > 0) || !(tonUsd > 0)) throw new Error('sats, btcUsd and tonUsd must be positive');
  const btcCents = BigInt(Math.round(btcUsd * 100));
  const tonCents = BigInt(Math.round(tonUsd * 100));
  const numerator = 10n * btcCents * BigInt(Math.round(sats));
  // Ceiling division: rounding down can leave a payment a few nanoTON short.
  const nano = (numerator + tonCents - 1n) / tonCents;
  return nano === 0n ? 1n : nano;
}

export function tonQuote({ sats, btcUsd, tonUsd, ttlMs = 300_000, now = Date.now() }) {
  const nano = satsToNano(sats, btcUsd, tonUsd);
  return {
    sats,
    nano: nano.toString(),
    ton: Number(nano) / 1e9,
    rateSatsPerTon: Math.round((tonUsd / btcUsd) * 1e8),
    quotedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  };
}

// TON has no invoice object: the order id travels in the transfer comment.
export function paymentMatches({ comment, orderId, amountNano, expectedNano, toleranceBps = 200 }) {
  if (typeof comment !== 'string' || !orderId) return false;
  if (comment.trim() !== orderId) return false;
  if (expectedNano === undefined || expectedNano === null) return true;
  const got = BigInt(amountNano);
  const want = BigInt(expectedNano);
  const low = (want * BigInt(10_000 - toleranceBps)) / 10_000n;
  return got >= low;
}
