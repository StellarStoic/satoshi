// Minimal bech32 decoder, enough to read an nsec into 32 raw bytes.
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i += 1) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function hrpExpand(hrp) {
  const out = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    return null;
  }
  return out;
}

export function decodeBech32(str) {
  if (typeof str !== 'string' || str.length < 8) return null;
  const lower = str.toLowerCase();
  if (str !== lower && str !== str.toUpperCase()) return null;
  const pos = lower.lastIndexOf('1');
  if (pos < 1 || pos + 7 > lower.length) return null;
  const hrp = lower.slice(0, pos);
  const data = [];
  for (const ch of lower.slice(pos + 1)) {
    const v = CHARSET.indexOf(ch);
    if (v < 0) return null;
    data.push(v);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) return null;
  const payload = data.slice(0, -6);
  return { hrp, words: payload };
}

// nsec: 32 bytes of secret key, bech32 with no witness version byte.
export function nsecToBytes(nsec) {
  const decoded = decodeBech32(nsec);
  if (!decoded || decoded.hrp !== 'nsec') throw new Error('not an nsec');
  const bytes = convertBits(decoded.words, 5, 8, false);
  if (!bytes || bytes.length !== 32) throw new Error('nsec did not decode to 32 bytes');
  return Uint8Array.from(bytes);
}

export function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}
