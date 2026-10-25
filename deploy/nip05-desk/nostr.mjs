// Nostr event verification for the sticky payment service.
//
// Why this file exists at all: the desk must refuse a published sticky whose
// signature, author or commitment does not match what was paid for. That check
// happens *before* anything reaches the relay, so it cannot lean on the relay's
// own signature validation.
//
// No dependencies on purpose. A payment service that pulls an npm tree in to
// verify one signature inherits that tree's whole supply chain for the life of
// the box, so this is BIP-340 verification (and, for tests, signing) written
// against node:crypto and BigInt. Correctness is pinned by the official BIP-340
// test vectors in test/sticky.test.mjs — if this file is ever "optimised", those
// vectors are what stands between a wrong signature and a paid note.

import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------- secp256k1
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

const mod = (a, m = P) => ((a % m) + m) % m;

/** Modular inverse by Fermat's little theorem (P is prime). */
function inv(a, m = P) {
  let base = mod(a, m);
  let exp = m - 2n;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = mod(result * base, m);
    base = mod(base * base, m);
    exp >>= 1n;
  }
  return result;
}

const INF = { x: 0n, y: 0n, inf: true };

/** Affine point addition. Enough for the handful of operations we do per event. */
function add(p1, p2) {
  if (p1.inf) return p2;
  if (p2.inf) return p1;
  if (p1.x === p2.x) {
    if (mod(p1.y + p2.y) === 0n) return INF;
    return dbl(p1);
  }
  const lambda = mod((p2.y - p1.y) * inv(p2.x - p1.x));
  const x = mod(lambda * lambda - p1.x - p2.x);
  const y = mod(lambda * (p1.x - x) - p1.y);
  return { x, y };
}

function dbl(p) {
  if (p.inf || p.y === 0n) return INF;
  const lambda = mod(3n * p.x * p.x * inv(2n * p.y));
  const x = mod(lambda * lambda - 2n * p.x);
  const y = mod(lambda * (p.x - x) - p.y);
  return { x, y };
}

function mul(k, p = { x: Gx, y: Gy }) {
  let result = INF;
  let base = p;
  let n = mod(k, N);
  while (n > 0n) {
    if (n & 1n) result = add(result, base);
    base = dbl(base);
    n >>= 1n;
  }
  return result;
}

/** BIP-340 lift_x: the point with this x and an even y, or null if none exists. */
function liftX(x) {
  if (x <= 0n || x >= P) return null;
  const c = mod(x * x * x + 7n);
  // P % 4 == 3, so the square root is c^((P+1)/4) when one exists.
  let y = mod(powmod(c, (P + 1n) / 4n));
  if (mod(y * y) !== c) return null;
  if (y & 1n) y = mod(-y);
  return { x, y };
}

function powmod(base, exp) {
  let b = base;
  let e = exp;
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = mod(r * b);
    b = mod(b * b);
    e >>= 1n;
  }
  return r;
}

// ------------------------------------------------------------------ hashing
// ------------------------------------------------------------------- bech32
// NIP-19 npub, so the desk can tell whether a note's text really names the key
// its ["p", ...] tag claims. The board writes `nostr:npub1...` (NIP-27); the desk
// has to agree that the token is exactly that key's npub and not merely similar.
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1) {
      if ((top >> index) & 1) checksum ^= BECH32_GENERATORS[index];
    }
  }
  return checksum;
}

function bech32HrpExpand(hrp) {
  const expanded = [];
  for (const character of hrp) expanded.push(character.charCodeAt(0) >> 5);
  expanded.push(0);
  for (const character of hrp) expanded.push(character.charCodeAt(0) & 31);
  return expanded;
}

function convertBits(values, from, to, pad) {
  let accumulator = 0;
  let bits = 0;
  const out = [];
  const maxValue = (1 << to) - 1;
  for (const value of values) {
    if (value < 0 || value >> from !== 0) return null;
    accumulator = (accumulator << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((accumulator >> bits) & maxValue);
    }
  }
  if (pad) {
    if (bits > 0) out.push((accumulator << (to - bits)) & maxValue);
  } else if (bits >= from || ((accumulator << (to - bits)) & maxValue)) {
    return null;
  }
  return out;
}

/** hex pubkey -> "npub1...", or null if the input is not a 64-character hex key. */
export function npubEncode(pubkeyHex) {
  const hex = String(pubkeyHex || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const bytes = [];
  for (let index = 0; index < hex.length; index += 2) bytes.push(parseInt(hex.slice(index, index + 2), 16));
  const words = convertBits(bytes, 8, 5, true);
  if (!words) return null;
  const hrp = 'npub';
  const checksumInput = [...bech32HrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(checksumInput) ^ 1;
  const checksum = [];
  for (let index = 0; index < 6; index += 1) checksum.push((polymod >> (5 * (5 - index))) & 31);
  return hrp + '1' + [...words, ...checksum].map(word => BECH32_CHARSET[word]).join('');
}

/** The npub tokens a note's text actually names: "nostr:npub1..." or a bare npub. */
export function mentionTokens(content) {
  const text = String(content || '');
  const found = new Set();
  const pattern = /(?:nostr:)?npub1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}/gi;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const npub = token.startsWith('nostr:') ? token.slice(6) : token;
    // A bech32 character right in front of it makes this part of a longer word,
    // not a mention of its own.
    const before = text[match.index - 1] || '';
    const after = text[match.index + token.length] || '';
    if (/[qpzry9x8gf2tvdw0s3jn54khce6mua7l]/i.test(before) || /[qpzry9x8gf2tvdw0s3jn54khce6mua7l]/i.test(after)) continue;
    found.add(npub.toLowerCase());
  }
  return found;
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function taggedHash(tag, ...parts) {
  const tagHash = createHash('sha256').update(tag, 'utf8').digest();
  const h = createHash('sha256');
  h.update(tagHash);
  h.update(tagHash);
  for (const part of parts) h.update(part);
  return h.digest();
}

const hexToBytes = (hex) => Buffer.from(hex, 'hex');
const bytesToBig = (buf) => BigInt('0x' + (buf.toString('hex') || '0'));
const bigTo32 = (value) => Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
const isHex = (s, len) => typeof s === 'string' && s.length === len && /^[0-9a-fA-F]+$/.test(s);

// --------------------------------------------------------------- BIP-340
/**
 * Verify a schnorr signature over a 32-byte message.
 * @param {string} pubkeyHex 32-byte x-only public key
 * @param {string} msgHex 32-byte message
 * @param {string} sigHex 64-byte signature
 */
export function verifySchnorr(pubkeyHex, msgHex, sigHex) {
  if (!isHex(pubkeyHex, 64) || !isHex(msgHex, 64) || !isHex(sigHex, 128)) return false;
  const px = bytesToBig(hexToBytes(pubkeyHex));
  const P_ = liftX(px);
  if (!P_) return false;
  const sig = hexToBytes(sigHex);
  const r = bytesToBig(sig.subarray(0, 32));
  const s = bytesToBig(sig.subarray(32, 64));
  if (r >= P || s >= N) return false;
  const e = mod(bytesToBig(taggedHash('BIP0340/challenge', sig.subarray(0, 32),
    hexToBytes(pubkeyHex), hexToBytes(msgHex))), N);
  const R = add(mul(s), mul(mod(N - e), P_));
  if (R.inf) return false;
  if (R.y & 1n) return false;
  return R.x === r;
}

/**
 * Sign with the BIP-340 algorithm. Used by tests to build real, valid events.
 *
 * Two independent parity fixups are required and it is easy to conflate them:
 * d is negated when *P* has an odd y (we publish x-only keys, i.e. the even-y
 * representative), while k is negated when *R* has an odd y. Conflating them
 * still round-trips against a sloppy verifier but produces signatures that are
 * invalid roughly half the time — pinned by the official signing vectors.
 *
 * @param {string} auxRandHex optional 32 bytes; when given the signature is
 *   deterministic and must match the BIP-340 vectors byte for byte.
 */
export function signSchnorr(privkeyHex, msgHex, auxRandHex = null) {
  if (!isHex(privkeyHex, 64) || !isHex(msgHex, 64)) throw new Error('bad key or message');
  if (auxRandHex !== null && !isHex(auxRandHex, 64)) throw new Error('bad aux_rand');
  let d = mod(bytesToBig(hexToBytes(privkeyHex)), N);
  if (d === 0n) throw new Error('zero private key');
  const Ppoint = mul(d);
  if (Ppoint.y & 1n) d = mod(N - d);            // even-y representative
  const px = bigTo32(Ppoint.x);

  let k;
  if (auxRandHex !== null) {
    const t = Buffer.alloc(32);
    const dBytes = bigTo32(d);
    const auxHash = taggedHash('BIP0340/aux', hexToBytes(auxRandHex));
    for (let i = 0; i < 32; i++) t[i] = dBytes[i] ^ auxHash[i];
    const rand = taggedHash('BIP0340/nonce', t, px, hexToBytes(msgHex));
    k = mod(bytesToBig(rand), N);
    if (k === 0n) throw new Error('bad nonce');
  } else {
    k = mod(bytesToBig(randomBytes(32)), N);
    if (k === 0n) k = 1n;
  }

  const R = mul(k);
  if (R.y & 1n) k = mod(N - k);                 // even-y nonce
  const e = mod(bytesToBig(taggedHash('BIP0340/challenge', bigTo32(R.x), px, hexToBytes(msgHex))), N);
  const s = mod(k + e * d, N);
  return { pubkey: px.toString('hex'), sig: bigTo32(R.x).toString('hex') + bigTo32(s).toString('hex') };
}

export function pubkeyFromPrivkey(privkeyHex) {
  const d = mod(bytesToBig(hexToBytes(privkeyHex)), N);
  return bigTo32(mul(d).x).toString('hex');
}

// ------------------------------------------------------------ nostr events
/** NIP-01 event id: sha256 of the canonical serialisation. */
export function eventId(event) {
  const serialised = JSON.stringify([
    0, event.pubkey, event.created_at, event.kind, event.tags, event.content,
  ]);
  return sha256Hex(serialised);
}

/**
 * Full event check: shape, id, then the signature over that id.
 * Returns {ok:true} or {ok:false, error}.
 */
export function verifyEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { ok: false, error: 'event must be an object' };
  }
  const { id, pubkey, created_at: createdAt, kind, tags, content, sig } = event;
  if (!isHex(id, 64)) return { ok: false, error: 'event.id must be 64 hex characters' };
  if (!isHex(pubkey, 64)) return { ok: false, error: 'event.pubkey must be 64 hex characters' };
  if (!Number.isInteger(createdAt) || createdAt <= 0) return { ok: false, error: 'event.created_at must be a positive integer' };
  if (!Number.isInteger(kind) || kind < 0) return { ok: false, error: 'event.kind must be a non-negative integer' };
  if (!Array.isArray(tags) || tags.some(t => !Array.isArray(t) || t.some(v => typeof v !== 'string'))) {
    return { ok: false, error: 'event.tags must be arrays of strings' };
  }
  if (typeof content !== 'string') return { ok: false, error: 'event.content must be a string' };
  if (!isHex(sig, 128)) return { ok: false, error: 'event.sig must be 128 hex characters' };

  const expected = eventId({ pubkey, created_at: createdAt, kind, tags, content });
  if (expected !== id.toLowerCase()) {
    return { ok: false, error: 'event id does not match its contents' };
  }
  if (!verifySchnorr(pubkey, id, sig)) {
    return { ok: false, error: 'event signature is invalid' };
  }
  return { ok: true, event };
}
