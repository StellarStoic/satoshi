import {englishWordlist} from './vendor/bip39.mjs';

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MOODS = [
  {name: 'After Hours', mode: 'minor', scale: [0, 2, 3, 5, 7, 8, 10], base: 48},
  {name: 'Rainy Window', mode: 'dorian', scale: [0, 2, 3, 5, 7, 9, 10], base: 46},
  {name: 'Quiet Morning', mode: 'major', scale: [0, 2, 4, 5, 7, 9, 11], base: 45},
  {name: 'Blue Hour', mode: 'minor', scale: [0, 2, 3, 5, 7, 9, 10], base: 43},
  {name: 'Sunday Tape', mode: 'major pentatonic', scale: [0, 2, 4, 7, 9], base: 48},
  {name: 'Desert Signal', mode: 'phrygian', scale: [0, 1, 3, 5, 7, 8, 10], base: 45},
  {name: 'Open Road', mode: 'mixolydian', scale: [0, 2, 4, 5, 7, 9, 10], base: 43},
  {name: 'Neon Minor', mode: 'harmonic minor', scale: [0, 2, 3, 5, 7, 8, 11], base: 48},
  {name: 'Electric Blue', mode: 'blues', scale: [0, 3, 5, 6, 7, 10], base: 46},
  {name: 'Floating Glass', mode: 'lydian', scale: [0, 2, 4, 6, 7, 9, 11], base: 45},
];
const SESSIONS = [
  {name: 'Boom bap', family: 'hip-hop', steps: 16, bpm: [70, 88], swing: [56, 66], kit: 0, kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [0], bass: [0, 8], melody: [0, 2, 6, 8, 10, 14], chordDuration: '1m'},
  {name: 'Lazy shuffle', family: 'shuffle', steps: 16, bpm: [62, 80], swing: [62, 68], kit: 3, kick: [0, 6, 11], snare: [4, 12], hat: [0, 3, 6, 9, 12, 15], chord: [0, 10], bass: [0, 6, 11], melody: [2, 6, 10, 14], chordDuration: '2n.'},
  {name: 'Half-time', family: 'downtempo', steps: 16, bpm: [56, 72], swing: [50, 58], kit: 2, kick: [0, 9], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [0, 8], bass: [0, 10], melody: [1, 5, 9, 13], chordDuration: '2n'},
  {name: 'Jazzhop', family: 'jazz', steps: 16, bpm: [74, 94], swing: [57, 66], kit: 3, kick: [0, 5, 11, 14], snare: [4, 12], hat: [0, 2, 5, 7, 10, 13, 15], chord: [0, 6, 11], bass: [0, 5, 11], melody: [1, 4, 7, 10, 13], chordDuration: '4n.'},
  {name: 'Bossa nova', family: 'latin', steps: 16, bpm: [78, 104], swing: [50, 54], kit: 3, kick: [0, 3, 8, 11], snare: [4, 7, 12, 15], hat: [0, 2, 5, 8, 10, 13], chord: [0, 5, 10], bass: [0, 3, 8, 11], melody: [2, 5, 7, 10, 14], chordDuration: '4n'},
  {name: 'Broken beat', family: 'broken beat', steps: 16, bpm: [82, 108], swing: [54, 63], kit: 2, kick: [0, 3, 10, 13], snare: [6, 12], hat: [0, 2, 3, 6, 8, 11, 14], chord: [0, 7, 13], bass: [0, 7, 10, 13], melody: [1, 3, 6, 9, 12, 15], chordDuration: '4n.'},
  {name: 'Ambient drift', family: 'ambient', steps: 16, bpm: [48, 66], swing: [50, 55], kit: 2, kick: [0, 12], snare: [8], hat: [3, 7, 11, 15], chord: [0], bass: [0, 12], melody: [4, 7, 12, 15], chordDuration: '1m'},
  {name: 'Neo soul', family: 'soul', steps: 16, bpm: [66, 86], swing: [55, 64], kit: 3, kick: [0, 7, 11], snare: [4, 12, 15], hat: [0, 3, 5, 8, 11, 13], chord: [0, 7], bass: [0, 7, 11], melody: [2, 5, 9, 13], chordDuration: '2n.'},
  {name: 'Deep house', family: 'house', steps: 16, bpm: [112, 124], swing: [50, 55], kit: 4, kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], chord: [0, 3, 8, 11], bass: [0, 4, 7, 8, 12], melody: [2, 6, 10, 14], chordDuration: '8n.'},
  {name: 'Dub', family: 'dub', steps: 16, bpm: [64, 82], swing: [52, 60], kit: 2, kick: [0, 10], snare: [4, 12], hat: [2, 6, 11, 15], chord: [0, 6, 13], bass: [0, 3, 10], melody: [3, 7, 11, 15], chordDuration: '4n'},
  {name: 'Detroit techno', family: 'techno', steps: 16, bpm: [124, 138], swing: [50, 52], kit: 4, kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14, 15], chord: [0, 6, 10], bass: [0, 3, 6, 8, 11, 14], melody: [1, 7, 9, 15], chordDuration: '8n'},
  {name: 'Synthwave drive', family: 'synthwave', steps: 16, bpm: [88, 112], swing: [50, 53], kit: 4, kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [0, 8], bass: [0, 3, 6, 8, 11, 14], melody: [2, 5, 9, 13], chordDuration: '2n'},
  {name: 'Funk pocket', family: 'funk', steps: 16, bpm: [94, 116], swing: [54, 61], kit: 5, kick: [0, 3, 7, 10, 14], snare: [4, 12], hat: [0, 2, 3, 5, 6, 8, 10, 11, 13, 14], chord: [0, 6, 10, 14], bass: [0, 3, 5, 7, 10, 14], melody: [1, 4, 7, 11, 15], chordDuration: '8n'},
  {name: 'Reggae one-drop', family: 'reggae', steps: 16, bpm: [72, 92], swing: [50, 57], kit: 2, kick: [8], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [2, 6, 10, 14], bass: [0, 7, 10], melody: [3, 7, 11, 15], chordDuration: '8n'},
  {name: 'Afrobeat weave', family: 'afrobeat', steps: 16, bpm: [98, 120], swing: [52, 59], kit: 5, kick: [0, 3, 8, 11, 14], snare: [4, 7, 12, 15], hat: [0, 2, 5, 6, 8, 10, 13, 14], chord: [0, 6, 10], bass: [0, 3, 7, 11, 14], melody: [1, 4, 6, 9, 12, 15], chordDuration: '4n'},
  {name: 'Drum and bass', family: 'drum and bass', steps: 16, bpm: [160, 176], swing: [50, 54], kit: 6, kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 3, 6, 8, 10, 11, 14], chord: [0, 8], bass: [0, 3, 7, 10, 14], melody: [1, 5, 9, 13], chordDuration: '2n'},
  {name: 'Jungle break', family: 'jungle', steps: 16, bpm: [150, 172], swing: [51, 57], kit: 6, kick: [0, 6, 10, 15], snare: [4, 7, 12], hat: [0, 2, 3, 5, 8, 9, 11, 14], chord: [0, 10], bass: [0, 5, 8, 11, 14], melody: [2, 6, 10, 13, 15], chordDuration: '4n'},
  {name: 'Trip-hop', family: 'trip-hop', steps: 16, bpm: [70, 94], swing: [54, 63], kit: 0, kick: [0, 6, 11], snare: [4, 12], hat: [1, 4, 7, 10, 13], chord: [0, 9], bass: [0, 6, 11], melody: [3, 7, 10, 15], chordDuration: '2n.'},
  {name: 'Waltz', family: 'waltz', steps: 12, bpm: [72, 102], swing: [50, 54], kit: 3, kick: [0], snare: [4, 8], hat: [0, 2, 4, 6, 8, 10], chord: [0, 4, 8], bass: [0, 8], melody: [2, 5, 7, 10], chordDuration: '4n.'},
  {name: 'Six-eight sway', family: '6/8', steps: 12, bpm: [76, 108], swing: [50, 53], kit: 3, kick: [0, 6], snare: [3, 9], hat: [0, 2, 4, 6, 8, 10], chord: [0, 6], bass: [0, 5, 8], melody: [1, 4, 7, 10], chordDuration: '4n.'},
  {name: 'Five-four motion', family: '5/4', steps: 20, bpm: [82, 112], swing: [50, 56], kit: 9, kick: [0, 6, 10, 16], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], chord: [0, 10, 16], bass: [0, 6, 10, 16], melody: [2, 5, 9, 13, 17], chordDuration: '2n'},
  {name: 'Seven-eight circuit', family: '7/8', steps: 14, bpm: [104, 132], swing: [50, 53], kit: 8, kick: [0, 6, 10], snare: [4, 11], hat: [0, 2, 4, 6, 8, 10, 12], chord: [0, 8], bass: [0, 5, 10], melody: [1, 4, 7, 11, 13], chordDuration: '4n'},
  {name: 'Disco floor', family: 'disco', steps: 16, bpm: [112, 128], swing: [50, 54], kit: 7, kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], chord: [0, 6, 10, 14], bass: [0, 3, 4, 7, 8, 11, 12, 15], melody: [2, 5, 9, 13], chordDuration: '8n'},
  {name: 'UK garage', family: 'garage', steps: 16, bpm: [126, 140], swing: [55, 63], kit: 7, kick: [0, 6, 8, 14], snare: [4, 12], hat: [0, 2, 5, 7, 10, 13, 15], chord: [0, 7, 11], bass: [0, 3, 7, 10, 14], melody: [1, 5, 9, 13], chordDuration: '8n.'},
  {name: 'Latin clave', family: 'latin', steps: 16, bpm: [94, 122], swing: [50, 55], kit: 5, kick: [0, 6, 10], snare: [3, 6, 10, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [0, 6, 10], bass: [0, 3, 8, 11, 14], melody: [2, 5, 7, 10, 13, 15], chordDuration: '4n'},
  {name: 'Blues shuffle', family: 'blues', steps: 16, bpm: [68, 104], swing: [62, 68], kit: 3, kick: [0, 6, 10], snare: [4, 12], hat: [0, 3, 6, 9, 12, 15], chord: [0, 6, 10], bass: [0, 3, 6, 10, 13], melody: [1, 4, 7, 10, 13], chordDuration: '4n.'},
  {name: 'Acid pulse', family: 'acid', steps: 16, bpm: [118, 138], swing: [50, 54], kit: 8, kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14, 15], chord: [0, 8], bass: [0, 3, 4, 7, 10, 11, 14], melody: [1, 5, 9, 13], chordDuration: '8n'},
  {name: 'Dub techno', family: 'dub techno', steps: 16, bpm: [108, 126], swing: [51, 57], kit: 4, kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 11, 14], chord: [3, 10], bass: [0, 7, 11], melody: [5, 13], chordDuration: '8n.'},
  {name: 'Electro break', family: 'electro', steps: 16, bpm: [108, 132], swing: [50, 57], kit: 7, kick: [0, 3, 8, 11, 14], snare: [4, 12], hat: [0, 2, 5, 7, 10, 13, 15], chord: [0, 7, 11], bass: [0, 3, 7, 10, 14], melody: [1, 4, 9, 12, 15], chordDuration: '8n'},
  {name: 'Cinematic pulse', family: 'cinematic', steps: 16, bpm: [56, 86], swing: [50, 53], kit: 9, kick: [0, 8, 11], snare: [12], hat: [2, 6, 10, 14], chord: [0, 8], bass: [0, 8], melody: [3, 7, 11, 15], chordDuration: '1m'},
  {name: 'Vapor drift', family: 'vaporwave', steps: 16, bpm: [58, 82], swing: [52, 60], kit: 0, kick: [0, 10], snare: [4, 12], hat: [2, 6, 10, 14], chord: [0, 6, 12], bass: [0, 7, 11], melody: [1, 5, 9, 14], chordDuration: '2n.'},
  {name: 'Samba motion', family: 'samba', steps: 16, bpm: [96, 126], swing: [50, 55], kit: 5, kick: [0, 3, 8, 11], snare: [3, 6, 10, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [0, 5, 10, 13], bass: [0, 3, 7, 8, 11, 14], melody: [1, 4, 6, 9, 12, 15], chordDuration: '4n'},
];
const PROGRESSIONS = [
  [0, 5, 3, 6],
  [0, 3, 5, 4],
  [0, 6, 5, 3],
  [0, 4, 5, 3],
  [0, 2, 5, 4],
  [0, 3, 6, 5],
  [0, 5, 4, 3],
  [0, 6, 3, 4],
  [0, 2, 3, 5],
  [0, 4, 2, 5],
];
const BIP39_BASE = englishWordlist.length;
const BIP39_WORD_INDEX = new Map(englishWordlist.map((word, index) => [word, index]));
const BIP39_BIG_BASE = BigInt(BIP39_BASE);
const HALVING_INTERVAL = 210_000;

export function blockHeightToBip39Code(value) {
  const height = Number(value);
  if (!Number.isSafeInteger(height) || height < 0) return null;
  if (height === 0) return 'genesis';

  const indexes = [];
  let remaining = BigInt(height - 1);
  let wordCount = 1;
  let capacity = BIP39_BIG_BASE;
  while (remaining >= capacity) {
    remaining -= capacity;
    wordCount += 1;
    capacity *= BIP39_BIG_BASE;
  }
  while (indexes.length < wordCount) {
    indexes.unshift(Number(remaining % BIP39_BIG_BASE));
    remaining /= BIP39_BIG_BASE;
  }
  return indexes.map(index => englishWordlist[index]).join(' ');
}

export function bip39CodeToBlockHeight(value) {
  const input = String(value || '').trim().toLowerCase();
  const code = input.includes('·') ? input.split('·').at(-1).trim() : input;
  if (code === 'genesis') return 0;
  const words = code.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return null;
  const indexes = words.map(word => BIP39_WORD_INDEX.get(word));
  if (indexes.some(index => index === undefined)) return null;
  let offset = 1n;
  let capacity = BIP39_BIG_BASE;
  for (let length = 1; length < words.length; length += 1) {
    offset += capacity;
    capacity *= BIP39_BIG_BASE;
  }
  const encoded = indexes.reduce((total, index) => total * BIP39_BIG_BASE + BigInt(index), 0n);
  const decoded = offset + encoded;
  if (decoded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const height = Number(decoded);
  if (!Number.isSafeInteger(height) || blockHeightToBip39Code(height) !== words.join(' ')) return null;
  return height;
}

export function halvingEraFromHeight(value) {
  const height = Number(value);
  if (!Number.isSafeInteger(height) || height < 0) return null;
  const index = Math.floor(height / HALVING_INTERVAL);
  return {
    index,
    number: index + 1,
    start: index * HALVING_INTERVAL,
    end: (index + 1) * HALVING_INTERVAL - 1,
    anchor: index,
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function quadraticPoint(start, control, end, progress) {
  const inverse = 1 - progress;
  return inverse * inverse * start + 2 * inverse * progress * control + progress * progress * end;
}

export function transactionGravityPoint(options = {}) {
  const cx = Number(options.cx) || 0;
  const cy = Number(options.cy) || 0;
  const radius = Math.max(1, Number(options.radius) || 1);
  const edgeDistance = Math.max(radius, Number(options.edgeDistance) || radius);
  const entryAngle = Number(options.entryAngle) || 0;
  const targetAngle = Number(options.targetAngle) || 0;
  const orbit = Number(options.orbit) < 0 ? -1 : 1;
  const bend = clamp(options.bend, -1, 1);
  const feeMotion = clamp(options.feeMotion, 0, 1);
  const progress = clamp(options.progress, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 2.4);
  const startX = cx + Math.cos(entryAngle) * edgeDistance;
  const startY = cy + Math.sin(entryAngle) * edgeDistance;
  const targetX = cx + Math.cos(targetAngle) * radius * .78;
  const targetY = cy + Math.sin(targetAngle) * radius * .78;

  if (!options.crossesCenter) {
    const curveDistance = radius * (1.12 + Math.abs(bend) * .72);
    const controlAngle = entryAngle + orbit * (Math.PI * .48 + bend * .34);
    return {
      x: quadraticPoint(startX, cx + Math.cos(controlAngle) * curveDistance, targetX, eased),
      y: quadraticPoint(startY, cy + Math.sin(controlAngle) * curveDistance, targetY, eased),
    };
  }

  const captureAt = .68;
  const overshootDistance = radius * (.1 + feeMotion * .24);
  const flybyX = cx - Math.cos(entryAngle) * overshootDistance;
  const flybyY = cy - Math.sin(entryAngle) * overshootDistance;
  if (eased <= captureAt) {
    const flybyProgress = eased / captureAt;
    return {
      x: quadraticPoint(startX, cx, flybyX, flybyProgress),
      y: quadraticPoint(startY, cy, flybyY, flybyProgress),
    };
  }

  const returnProgress = (eased - captureAt) / (1 - captureAt);
  const tangentAngle = targetAngle - orbit * Math.PI / 2;
  const returnControlDistance = radius * (.32 + feeMotion * .12);
  const returnControlX = cx + Math.cos(tangentAngle) * returnControlDistance;
  const returnControlY = cy + Math.sin(tangentAngle) * returnControlDistance;
  return {
    x: quadraticPoint(flybyX, returnControlX, targetX, returnProgress),
    y: quadraticPoint(flybyY, returnControlY, targetY, returnProgress),
  };
}

export function cleanHash(value) {
  const hash = String(value || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  return (hash + '0000000000000000000000000000000000000000000000000000000000000000').slice(0, 64);
}

export function hashBytes(value) {
  return cleanHash(value).match(/../g).map(part => Number.parseInt(part, 16));
}

export function trackTitleFromBlock(hash, height = 0) {
  const normalizedHash = cleanHash(hash);
  const blockHeight = Math.max(0, Math.trunc(Number(height) || 0));
  if (!blockHeight) return `Hash Replay ${normalizedHash.slice(-12)}`;
  return blockHeightToBip39Code(blockHeight)
    .split(' ')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

export const REPLAY_ENGINE_VERSION = 'v5';
export const REPLAY_HASH_ROLES = [
  {name: 'Harmony', start: 24, end: 32, color: '#f2a900'},
  {name: 'Groove', start: 32, end: 40, color: '#32d583'},
  {name: 'Ensemble', start: 40, end: 48, color: '#4da3ff'},
  {name: 'Texture', start: 48, end: 56, color: '#e45fb2'},
];

export function normalizeReplayHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

export function normalizeReplayHeight(value) {
  const height = String(value ?? '').trim();
  if (!/^\d+$/.test(height)) return null;
  const parsed = Number(height);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeReplayEngine(value) {
  return ['v1', 'v4', REPLAY_ENGINE_VERSION].includes(value) ? value : REPLAY_ENGINE_VERSION;
}

export function replayHashRoleAt(characterIndex) {
  return REPLAY_HASH_ROLES.find(role => characterIndex >= role.start && characterIndex < role.end) || null;
}

export function replaySoundStateFromHash(value) {
  const hash = normalizeReplayHash(value);
  if (!hash) throw new TypeError('A replay requires a 64-character hexadecimal block hash');
  const random = seededRandom(hash, `replay-sound:${REPLAY_ENGINE_VERSION}`);
  const bytes = Array.from({length: 6}, () => Math.floor(random() * 256));
  return {
    hash,
    height: 0,
    fee: 2 + bytes[0] % 72,
    vsize: 3_000_000 + (bytes[1] * 131071 + bytes[2] * 8191),
    count: 8_000 + bytes[3] * 257 + bytes[4],
    projectedBlocks: 1 + bytes[5] % 7,
    connected: false,
  };
}

function legacySeededRandom(seed) {
  let state = hashBytes(seed).reduce((total, value, index) => (total ^ (value << (index % 24))) >>> 0, 0x9e3779b9);
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function seedWords(seed, domain) {
  const input = `${domain}\u0000${seed}`;
  const words = [0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344];
  for (let index = 0; index < input.length; index += 1) {
    const slot = index & 3;
    words[slot] ^= input.charCodeAt(index) + Math.imul(index + 1, 0x9e3779b1);
    words[slot] = Math.imul(words[slot] ^ (words[slot] >>> 16), 0x85ebca6b) >>> 0;
    words[slot] = rotateLeft(words[slot], 13);
    words[(slot + 1) & 3] ^= words[slot];
  }
  for (let round = 0; round < 8; round += 1) {
    const slot = round & 3;
    words[slot] = Math.imul(words[slot] ^ (words[slot] >>> 16), 0x7feb352d) >>> 0;
    words[slot] = Math.imul(words[slot] ^ (words[slot] >>> 15), 0x846ca68b) >>> 0;
    words[slot] ^= words[slot] >>> 16;
    words[(slot + 1) & 3] ^= rotateLeft(words[slot], 7 + slot);
  }
  if (words.every(value => value === 0)) words[0] = 1;
  return words;
}

// xoshiro128** keeps four independent 32-bit words. V4 used one 32-bit word;
// retaining that generator separately keeps old replay URLs reproducible.
export function seededRandom(seed, domain = '21fm:v5') {
  const state = seedWords(String(seed), String(domain));
  return () => {
    const result = Math.imul(rotateLeft(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (state[1] << 9) >>> 0;
    state[2] ^= state[0];
    state[3] ^= state[1];
    state[1] ^= state[2];
    state[0] ^= state[3];
    state[2] ^= t;
    state[3] = rotateLeft(state[3], 11);
    return result / 4294967296;
  };
}

function midiToNote(midi) {
  const pitch = ROOTS[((midi % 12) + 12) % 12];
  return `${pitch}${Math.floor(midi / 12) - 1}`;
}

function scaleMidi(mood, root, degree, octave = 0) {
  const length = mood.scale.length;
  const wrapped = ((degree % length) + length) % length;
  const register = Math.floor(degree / length);
  return mood.base + root + mood.scale[wrapped] + (register + octave) * 12;
}

const VOICINGS = [
  {name: 'seventh chords', steps: [0, 2, 4, 6]},
  {name: 'soft triads', steps: [0, 2, 4]},
  {name: 'open ninths', steps: [0, 4, 6, 8]},
  {name: 'shell voicings', steps: [0, 2, 6]},
  {name: 'wide fifths', steps: [0, 4, 7]},
];
const TEXTURES = [
  {name: 'warm vinyl', noiseBias: 0, filterBias: -120},
  {name: 'worn cassette', noiseBias: 3, filterBias: -320},
  {name: 'quiet room', noiseBias: -5, filterBias: 180},
  {name: 'late-night radio', noiseBias: 1, filterBias: -480},
  {name: 'clean tape', noiseBias: -8, filterBias: 320},
];
const CHORD_VOICES = ['felt upright piano', 'room acoustic guitar', 'warm drawbar organ', 'worn upright piano', 'tape organ', 'muted acoustic guitar', 'reed harmonium', 'nylon guitar'];
const BASS_VOICES = ['fingered electric bass', 'round sub bass', 'dub electric bass', 'short electric bass', 'soft finger bass', 'rubber synth bass', 'low cello'];
const LEAD_VOICES = ['breathy flute', 'soft xylophone', 'muted guitar', 'hollow flute', 'felt mallet', 'low flute', 'wooden bell', 'night guitar', 'velvet saxophone', 'bowed cello', 'soft harp'];
const DRUM_KITS = ['dust kit', 'tight kit', 'soft kit', 'brush kit', 'machine kit', 'funk kit', 'breakbeat kit', 'club kit', 'electronic kit', 'cinematic kit'];
const PAD_VOICES = ['tape strings', 'airy choir', 'warm organ', 'bowed glass', 'night drone'];
const ARP_VOICES = ['nylon pluck', 'soft harp', 'kalimba', 'music box', 'wooden mallet', 'glass drop', 'concert harp', 'nylon pattern'];
const MALLET_VOICES = ['vibraphone', 'marimba', 'celesta', 'low bell', 'chime cluster'];
const PERCUSSION_VOICES = ['muted tick', 'rimshot', 'soft knock', 'low clave', 'tape click', 'low tom', 'bongo', 'woodblock'];
const ROOM_TEXTURES = ['vinyl room', 'tape hiss', 'rain room', 'quiet air'];
const SPACES = ['small room', 'warm plate', 'long hall', 'spring haze'];
const MOTIONS = ['slow chorus', 'soft phaser', 'tape tremolo', 'still air'];
const PRODUCTION_SCENES = [
  {name: 'Dusty Piano Pocket', sessions: [0, 3], voices: [0, 0, 1, 0, 0, 0, 0, 1, 0]},
  {name: 'Rainy Guitar Study', sessions: [1, 6], voices: [1, 4, 0, 3, 4, 1, 3, 2, 2]},
  {name: 'Cassette Organ Soul', sessions: [7, 9], voices: [2, 2, 2, 4, 2, 2, 1, 5, 1]},
  {name: 'Late-Night Upright', sessions: [2, 6], voices: [3, 1, 3, 3, 3, 3, 2, 3, 3]},
  {name: 'Muted Bossa Room', sessions: [4, 1], voices: [5, 4, 7, 3, 1, 0, 0, 6, 2]},
  {name: 'Tape Organ Dub', sessions: [9, 5], voices: [4, 2, 5, 4, 2, 4, 3, 5, 1]},
  {name: 'Wooden Jazzhop', sessions: [3, 5], voices: [1, 3, 6, 0, 4, 2, 1, 7, 0]},
  {name: 'Sunday Piano Haze', sessions: [6, 7], voices: [0, 0, 4, 2, 0, 1, 4, 4, 3]},
  {name: 'Harmonium Hearth', sessions: [7, 9], voices: [6, 6, 8, 3, 2, 6, 3, 6, 1]},
  {name: 'Nylon Moonlight', sessions: [4, 6], voices: [7, 4, 9, 2, 4, 7, 0, 2, 2]},
  {name: 'Velvet Sax Lounge', sessions: [3, 1], voices: [3, 0, 8, 3, 1, 6, 1, 1, 0]},
  {name: 'Harp and Cello Drift', sessions: [6, 2], voices: [6, 6, 10, 2, 0, 6, 4, 4, 3]},
];
const MELODIC_FORMS = [
  {name: 'question and answer', question: [0, 1, 2, 4, 3, 2, 1, 2], answer: [2, 3, 4, 2, 1, 0, -1, 0]},
  {name: 'slow ascent', question: [0, 0, 1, 2, 2, 3, 4, 5], answer: [2, 2, 3, 4, 5, 6, 5, 4]},
  {name: 'falling line', question: [6, 5, 4, 3, 2, 2, 1, 0], answer: [4, 3, 2, 1, 0, -1, 0, 0]},
  {name: 'wide arch', question: [0, 2, 4, 6, 7, 5, 3, 1], answer: [1, 3, 5, 7, 6, 4, 2, 0]},
  {name: 'valley response', question: [5, 3, 2, 0, -1, 1, 3, 4], answer: [4, 2, 0, -2, 0, 2, 1, 0]},
  {name: 'pedal and flight', question: [0, 0, 4, 0, 5, 0, 3, 0], answer: [0, 2, 0, 6, 0, 4, 1, 0]},
  {name: 'broken thirds', question: [0, 2, 1, 3, 2, 4, 3, 5], answer: [5, 3, 4, 2, 3, 1, 2, 0]},
  {name: 'fifth leaps', question: [0, 4, 1, 5, 2, 6, 3, 1], answer: [3, -1, 4, 0, 5, 1, 2, 0]},
  {name: 'circling phrase', question: [0, 2, 1, 3, 2, 1, -1, 0], answer: [2, 4, 3, 1, 2, 0, 1, 0]},
  {name: 'two-note conversation', question: [0, 0, 3, 3, 0, 3, 0, 3], answer: [2, 2, -1, -1, 2, -1, 2, 0]},
  {name: 'stair-step release', question: [0, 1, 1, 2, 2, 3, 3, 5], answer: [5, 4, 4, 2, 2, 1, 1, 0]},
  {name: 'wandering intervals', question: [0, 3, -1, 4, 1, 5, 2, -2], answer: [2, 5, 0, 3, -1, 2, 1, 0]},
];
const LEAD_RHYTHMS = [
  {name: 'spacious statements', slots: [0, 6, 10, 14]},
  {name: 'offbeat replies', slots: [2, 5, 9, 13]},
  {name: 'long-short conversation', slots: [0, 3, 8, 10, 15]},
  {name: 'syncopated steps', slots: [1, 4, 7, 11, 14]},
  {name: 'three-note calls', slots: [0, 2, 5, 9, 11, 14]},
  {name: 'late answers', slots: [3, 6, 10, 12, 15]},
  {name: 'forward pulse', slots: [0, 4, 6, 8, 12, 14]},
  {name: 'broken line', slots: [1, 3, 7, 8, 13]},
  {name: 'held phrases', slots: [0, 7, 11]},
  {name: 'quick exchanges', slots: [0, 2, 4, 7, 10, 12, 15]},
  {name: 'backbeat melody', slots: [2, 6, 10, 14]},
  {name: 'uneven breaths', slots: [0, 5, 7, 12, 15]},
];

function scaleLeadSlots(slots, stepsPerBar) {
  return [...new Set(slots.map(slot => Math.min(stepsPerBar - 1, Math.round(slot / 16 * stepsPerBar))))];
}

function buildLeadPattern(formIndex, rhythmIndex, alternateRhythmIndex, stepsPerBar, barCount, bytes, random, legacy = false) {
  const totalSteps = stepsPerBar * barCount;
  const pattern = Array(totalSteps).fill(false);
  const economyPattern = Array(totalSteps).fill(false);

  for (let bar = 0; bar < barCount; bar += 1) {
    const section = Math.floor(bar / 4);
    const selectedRhythm = section % 3 === 1 ? alternateRhythmIndex : rhythmIndex;
    const baseSlots = LEAD_RHYTHMS[selectedRhythm].slots;
    const responseShift = bar % 2 ? 1 + (bytes[(18 + bar) % 32] % 3) : 0;
    const phraseShift = legacy
      ? ((formIndex + bar + bytes[(21 + bar) % 32]) % 3) - 1
      : ((formIndex + bar + section + bytes[(21 + bar) % 32]) % 5) - 2;
    const positions = scaleLeadSlots(baseSlots, stepsPerBar)
      .map(position => Math.max(0, Math.min(stepsPerBar - 1, position + phraseShift + responseShift)))
      .filter((position, index, all) => all.indexOf(position) === index)
      .filter((position, index) => index === 0 || random() > .12);
    if (bar % 4 === 2 && (bytes[(14 + section) % 32] + section) % 4 === 0) positions.splice(1);
    if (!positions.length) positions.push(bytes[(8 + bar) % 32] % stepsPerBar);
    positions.forEach(position => { pattern[bar * stepsPerBar + position] = true; });

    const economyCount = 1 + (bytes[(24 + bar) % 32] % 2);
    const economyOffset = bytes[(12 + bar) % 32] % positions.length;
    for (let index = 0; index < Math.min(economyCount, positions.length); index += 1) {
      const position = positions[(economyOffset + index * Math.max(1, Math.floor(positions.length / economyCount))) % positions.length];
      economyPattern[bar * stepsPerBar + position] = true;
    }
  }

  return {pattern, economyPattern};
}

function chordForDegree(mood, root, degree, voicing) {
  return voicing.steps.map(step => midiToNote(scaleMidi(mood, root, degree + step, 1)));
}

function expandPattern(base, random, stepsPerBar, barCount, addChance = .08) {
  return Array.from({length: stepsPerBar * barCount}, (_, step) => {
    const position = step % stepsPerBar;
    const bar = Math.floor(step / stepsPerBar);
    const section = Math.floor(bar / 4);
    const shifted = section % 3 === 2 && position > 0 ? position - 1 : position;
    if (base.includes(shifted)) return true;
    const fillZone = bar % 4 === 3 && position >= stepsPerBar - 3;
    const sectionEnergy = section % 4 === 1 ? 1.35 : section % 4 === 3 ? .7 : 1;
    return (fillZone || position % 4 !== 0) && random() < addChance * sectionEnergy;
  });
}

export function compositionFromBlock(hash, height = 0, previousComposition = null, decisionOverrides = null, engine = REPLAY_ENGINE_VERSION) {
  const normalizedEngine = normalizeReplayEngine(engine);
  const legacy = normalizedEngine === 'v1' || normalizedEngine === 'v4';
  const normalizedHash = cleanHash(hash);
  const random = legacy
    ? legacySeededRandom(`${normalizedHash}${Number(height).toString(16)}`)
    : seededRandom(normalizedHash, `composition:${normalizedEngine}`);
  const bytes = Array.from({length: 32}, () => Math.floor(random() * 256));
  if (decisionOverrides) {
    Object.entries(decisionOverrides).forEach(([index, value]) => {
      bytes[Number(index)] = Number(value) & 255;
    });
  }
  const moodIndex = bytes[0] % MOODS.length;
  const mood = MOODS[moodIndex];
  let sceneIndex = bytes[27] % PRODUCTION_SCENES.length;
  if (legacy && previousComposition && sceneIndex === previousComposition.sceneIndex) {
    sceneIndex = (sceneIndex + 1 + (bytes[28] % (PRODUCTION_SCENES.length - 1))) % PRODUCTION_SCENES.length;
  }
  const scene = PRODUCTION_SCENES[sceneIndex];
  const session = SESSIONS[bytes[28] % (legacy ? 25 : SESSIONS.length)];
  const stepsPerBar = session.steps || 16;
  const barCount = legacy ? 4 : [16, 24, 32, 48, 64][bytes[8] % 5];
  const sectionCount = Math.ceil(barCount / 4);
  const totalSteps = stepsPerBar * barCount;
  const meter = stepsPerBar === 20 ? '5/4' : stepsPerBar === 14 ? '7/8' : stepsPerBar === 12 && session.family === 'waltz' ? '3/4' : stepsPerBar === 12 ? '6/8' : '4/4';
  const voicing = VOICINGS[bytes[19] % VOICINGS.length];
  const texture = TEXTURES[bytes[18] % TEXTURES.length];
  const root = bytes[1] % 12;
  const baseProgression = PROGRESSIONS[bytes[2] % PROGRESSIONS.length];
  const progression = Array.from({length: barCount}, (_, bar) => {
    const section = Math.floor(bar / 4);
    const baseDegree = baseProgression[bar % baseProgression.length];
    if (legacy || section === 0) return baseDegree;
    const movement = ((bytes[(22 + section) % 32] + section) % 5) - 2;
    if (bar % 4 === 3) return baseDegree + movement;
    if (section % 4 === 2 && bar % 4 === 1) return baseDegree + Math.sign(movement || 1);
    return baseDegree;
  });
  const chords = progression.map(degree => chordForDegree(mood, root, degree, voicing));
  const bass = progression.map(degree => midiToNote(scaleMidi(mood, root, degree, -1)));
  const melodyRegister = bytes[17] % 3 === 0 ? 1 : 0;
  const palette = Array.from({length: 21}, (_, degree) => midiToNote(scaleMidi(mood, root, degree, melodyRegister)));
  const melodicFormIndex = bytes[5] % MELODIC_FORMS.length;
  const melodicForm = MELODIC_FORMS[melodicFormIndex];
  const leadRhythmIndex = bytes[6] % LEAD_RHYTHMS.length;
  const alternateFormIndex = legacy ? melodicFormIndex : (melodicFormIndex + 1 + bytes[21] % (MELODIC_FORMS.length - 1)) % MELODIC_FORMS.length;
  const alternateRhythmIndex = legacy ? leadRhythmIndex : (leadRhythmIndex + 1 + bytes[22] % (LEAD_RHYTHMS.length - 1)) % LEAD_RHYTHMS.length;
  const leadRhythm = LEAD_RHYTHMS[leadRhythmIndex];
  const {pattern: melodyPattern, economyPattern: economyMelodyPattern} = buildLeadPattern(melodicFormIndex, leadRhythmIndex, alternateRhythmIndex, stepsPerBar, barCount, bytes, random, legacy);
  const melody = Array.from({length: totalSteps}, (_, step) => {
    const bar = Math.floor(step / stepsPerBar);
    const position = step % stepsPerBar;
    const section = Math.floor(bar / 4);
    const activeForm = !legacy && section % 3 === 1 ? MELODIC_FORMS[alternateFormIndex] : melodicForm;
    const contour = bar % 2 ? activeForm.answer : activeForm.question;
    const contourIndex = Math.min(contour.length - 1, Math.floor(position / stepsPerBar * contour.length));
    const cadence = bar % 4 === 3 && position > stepsPerBar * .7 ? -1 : 0;
    const variation = (bytes[(step + 7) % 32] + step) % 11 === 0 ? (bar % 2 ? -1 : 1) : 0;
    const registerTurn = bar % 4 === 2 && (bytes[16] + section) % 3 === 0 ? -mood.scale.length : 0;
    const degree = progression[bar] + contour[contourIndex] + cadence + variation + registerTurn;
    return midiToNote(scaleMidi(mood, root, degree, melodyRegister));
  });
  const leadDurations = Array.from({length: totalSteps}, (_, step) => {
    const position = step % stepsPerBar;
    const choice = (bytes[(step + 10) % 32] + position + melodicFormIndex) % 5;
    return ['16n', '8n', '8n', '8n.', '4n'][choice];
  });
  const leadVelocities = Array.from({length: totalSteps}, (_, step) => .16 + ((bytes[(step + 15) % 32] + step * 7) % 21) / 100);
  const kickPattern = expandPattern(session.kick, random, stepsPerBar, barCount, .025);
  const snarePattern = expandPattern(session.snare, random, stepsPerBar, barCount, .018);
  const hatPattern = expandPattern(session.hat, random, stepsPerBar, barCount, .07);
  const chordPattern = expandPattern(session.chord, random, stepsPerBar, barCount, .015);
  const bassPattern = expandPattern(session.bass, random, stepsPerBar, barCount, .045);
  const breakBar = 1 + (bytes[14] % 3);
  const breakMode = bytes[15] % 3;
  const arrangementMode = bytes[13] % 5;
  const arrangementNames = ['drop and return', 'slow build', 'call and response', 'rhythm first', 'full ensemble'];
  const formLabels = ['intro', 'A', 'A variation', 'B', 'break', 'A return', 'C', 'outro'];
  const songForm = Array.from({length: sectionCount}, (_, section) => section === sectionCount - 1 ? 'outro' : formLabels[section % (formLabels.length - 1)]);
  const arrangement = Array.from({length: barCount}, (_, bar) => {
    const localBar = bar % 4;
    const section = Math.floor(bar / 4);
    const isIntro = !legacy && section === 0;
    const isBreak = !legacy && (songForm[section] === 'break' || (section + bytes[23]) % 7 === 5);
    const isOutro = !legacy && section === sectionCount - 1;
    if (isIntro) return {harmony: true, bass: localBar > 0, drums: localBar > 1, melody: localBar >= 2};
    if (isBreak) return {harmony: localBar !== 2, bass: localBar < 2, drums: localBar === 3, melody: true};
    if (isOutro) return {harmony: true, bass: localBar < 3, drums: localBar < 2, melody: localBar === 0 || localBar === 2};
    if (arrangementMode === 1) return {harmony: true, bass: localBar > 0, drums: localBar > 0, melody: localBar >= 2};
    if (arrangementMode === 2) return {harmony: localBar % 2 === 0, bass: true, drums: true, melody: localBar % 2 === 1};
    if (arrangementMode === 3) return {harmony: localBar !== 2, bass: true, drums: true, melody: localBar === 3};
    if (arrangementMode === 4) return {harmony: true, bass: true, drums: true, melody: Boolean(bytes[17] & (1 << localBar)) || localBar === 0};
    return {
      harmony: !(localBar === breakBar && breakMode === 0),
      bass: !(localBar === breakBar && breakMode === 1),
      drums: !(localBar === breakBar && breakMode === 2),
      melody: localBar === 0 || Boolean(bytes[13] & (1 << localBar)),
    };
  });
  const voiceAt = (slot, choices) => ((Number(scene.voices[slot]) || 0) % choices.length + choices.length) % choices.length;
  const chordVoice = voiceAt(0, CHORD_VOICES);
  const bassVoice = voiceAt(1, BASS_VOICES);
  const leadVoice = voiceAt(2, LEAD_VOICES);
  const drumKit = ((Number(session.kit) || 0) % DRUM_KITS.length + DRUM_KITS.length) % DRUM_KITS.length;
  const padVoice = voiceAt(4, PAD_VOICES);
  const arpVoice = voiceAt(5, ARP_VOICES);
  const malletVoice = voiceAt(6, MALLET_VOICES);
  const percussionVoice = voiceAt(7, PERCUSSION_VOICES);
  const textureVoice = voiceAt(8, ROOM_TEXTURES);
  return {
    hash: cleanHash(hash),
    height: Number(height) || 0,
    mood: mood.name,
    key: `${ROOTS[root]} ${mood.mode}`,
    session: session.name,
    family: session.family,
    arrangementName: arrangementNames[arrangementMode],
    meter,
    engine: normalizedEngine,
    barCount,
    songForm,
    stepsPerBar,
    totalSteps,
    voicing: voicing.name,
    texture: texture.name,
    scene: scene.name,
    sceneIndex,
    bpm: session.bpm[0] + (bytes[3] % (session.bpm[1] - session.bpm[0] + 1)),
    swing: (session.swing[0] + (bytes[4] % (session.swing[1] - session.swing[0] + 1))) / 100,
    chords,
    bass,
    palette,
    melody,
    melodyForm: legacy ? melodicForm.name : `${melodicForm.name} / ${MELODIC_FORMS[alternateFormIndex].name}`,
    leadRhythm: legacy ? leadRhythm.name : `${leadRhythm.name} / ${LEAD_RHYTHMS[alternateRhythmIndex].name}`,
    leadDurations,
    leadVelocities,
    economyMelodyPattern,
    rhythm: {
      kick: kickPattern,
      snare: snarePattern,
      hat: hatPattern,
      chord: chordPattern,
      bass: bassPattern,
      melody: melodyPattern,
      chordDuration: session.chordDuration,
    },
    arrangement,
    sound: {
      chordVoice,
      chordName: CHORD_VOICES[chordVoice],
      leadVoice,
      leadName: LEAD_VOICES[leadVoice],
      bassVoice,
      bassName: BASS_VOICES[bassVoice],
      drumKit,
      drumName: DRUM_KITS[drumKit],
      padVoice,
      padName: PAD_VOICES[padVoice],
      arpVoice,
      arpName: ARP_VOICES[arpVoice],
      arpPattern: bytes[7] % 3,
      malletVoice,
      malletName: MALLET_VOICES[malletVoice],
      percussionVoice,
      percussionName: PERCUSSION_VOICES[percussionVoice],
      textureVoice,
      textureName: ROOM_TEXTURES[textureVoice],
      kickNote: ['C1', 'D1', 'E1'][bytes[24] % 3],
      chordVelocity: 0.3 + (bytes[25] % 24) / 100,
      melodyVelocity: 0.2 + (bytes[26] % 20) / 100,
      filterBase: 900 + bytes[29] * 6,
      delayTime: ['16n', '8n', '8n.', '4t'][bytes[30] % 4],
      delayFeedback: .12 + (bytes[31] % 22) / 100,
      delayMode: legacy ? 'feedback' : ['feedback', 'ping-pong'][bytes[23] % 2],
      modulationType: legacy ? 'phaser' : ['phaser', 'auto-filter', 'auto-pan'][bytes[21] % 3],
      effectProfile: legacy ? 'v4 studio' : ['tape room', 'wide echoes', 'filter motion', 'dub space', 'dry close-up', 'slow orbit'][bytes[22] % 6],
      chorusDepth: .08 + (bytes[20] % 28) / 100,
      space: SPACES[bytes[12] % SPACES.length],
      motion: MOTIONS[bytes[11] % MOTIONS.length],
      reverbDecay: 1.2 + (bytes[12] % 38) / 10,
      reverbWet: .04 + (bytes[13] % 18) / 100,
      phaserWet: bytes[11] % 4 === 1 ? .13 + (bytes[10] % 12) / 100 : 0,
      tremoloWet: bytes[11] % 4 === 2 ? .1 + (bytes[9] % 12) / 100 : 0,
      distortionWet: .015 + (bytes[15] % 7) / 100,
      stereoWidth: .18 + (bytes[16] % 48) / 100,
      noiseBias: texture.noiseBias,
      filterBias: texture.filterBias,
    },
    visual: bytes.slice(5, 21),
  };
}

function replayDecisionOverrides(hash) {
  const source = hashBytes(hash);
  const overrides = {};
  const assign = (sourceStart, targets) => targets.forEach((target, index) => {
    overrides[target] = source[sourceStart + index % 4];
  });
  assign(12, [0, 1, 2, 19]);
  assign(16, [3, 4, 28, 7, 24]);
  assign(20, [27, 17, 13, 14, 15, 16]);
  assign(24, [18, 29, 30, 31, 20, 12, 11, 10, 9]);
  return overrides;
}

export function replayCompositionFromHash(value, engine = REPLAY_ENGINE_VERSION) {
  const hash = normalizeReplayHash(value);
  if (!hash) throw new TypeError('A replay requires a 64-character hexadecimal block hash');
  const normalizedEngine = normalizeReplayEngine(engine);
  if (normalizedEngine === 'v1') return compositionFromBlock(hash, 0, null, null, 'v1');
  return compositionFromBlock(hash, 0, null, replayDecisionOverrides(hash), normalizedEngine);
}

export function latestBlockFromFrame(frame = {}) {
  const candidates = [frame.block, ...(Array.isArray(frame.blocks) ? frame.blocks : [])]
    .filter(block => block && Number.isFinite(Number(block.height)));
  return candidates.reduce((best, block) => !best || Number(block.height) > Number(best.height) ? block : best, null);
}

export function foldTransactionIds(seed, txids, sequence = 0) {
  const state = hashBytes(seed);
  const cleanIds = Array.isArray(txids) ? txids.map(cleanHash) : [];
  cleanIds.forEach((txid, txIndex) => {
    const bytes = hashBytes(txid);
    bytes.forEach((value, index) => {
      const target = (index * 7 + txIndex * 11 + Number(sequence)) % 32;
      const neighbor = state[(target + 13) % 32];
      state[target] = ((state[target] ^ value ^ neighbor) + index + txIndex + Number(sequence)) & 255;
    });
  });
  return state.map(value => value.toString(16).padStart(2, '0')).join('');
}

const SCRIPT_GROUPS = {
  v1_p2tr: 'taproot',
  v0_p2wpkh: 'segwit',
  v0_p2wsh: 'segwit',
  p2sh: 'legacy',
  p2pkh: 'legacy',
  p2pk: 'legacy',
  multisig: 'legacy',
  op_return: 'data',
};

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function describeTransaction(transaction = {}) {
  const vin = Array.isArray(transaction.vin) ? transaction.vin : [];
  const vout = Array.isArray(transaction.vout) ? transaction.vout : [];
  const vsize = Math.max(1, numeric(transaction.vsize, numeric(transaction.weight) / 4 || numeric(transaction.size, 1)));
  const fee = Math.max(0, numeric(transaction.fee));
  const feeRate = Math.max(0, numeric(transaction.feePerVsize, fee / vsize));
  const value = vout.reduce((total, output) => total + Math.max(0, numeric(output?.value)), 0);
  const scriptTypes = [...vin.map(input => input?.prevout?.scriptpubkey_type), ...vout.map(output => output?.scriptpubkey_type)]
    .map(type => SCRIPT_GROUPS[type] || 'other');
  const groups = Object.fromEntries(['taproot', 'segwit', 'legacy', 'data', 'other'].map(group => [group, scriptTypes.filter(type => type === group).length]));
  const hasData = groups.data > 0;
  const isBatch = vout.length >= 8;
  const isConsolidation = vin.length >= 4 && vin.length > vout.length * 2;
  const rbf = Boolean(transaction.rbf) || vin.some(input => numeric(input?.sequence, 0xffffffff) < 0xfffffffe);
  let type = 'Mixed';
  if (hasData) type = 'Data';
  else if (isBatch) type = 'Batch';
  else if (isConsolidation) type = 'Consolidation';
  else if (groups.taproot > 0 && groups.taproot >= groups.segwit + groups.legacy) type = 'Taproot';
  else if (groups.segwit > 0 && groups.segwit >= groups.legacy) type = 'SegWit';
  else if (groups.legacy > 0) type = 'Legacy';
  return {
    txid: cleanHash(transaction.txid),
    vsize,
    fee,
    feeRate,
    value,
    inputs: vin.length,
    outputs: vout.length,
    type,
    rbf,
    hasData,
    scriptGroups: groups,
  };
}

export function summarizeTransactions(transactions = []) {
  const items = Array.isArray(transactions) ? transactions.map(describeTransaction) : [];
  const totals = items.reduce((summary, item) => {
    summary.vsize += item.vsize;
    summary.fees += item.fee;
    summary.value += item.value;
    summary.inputs += item.inputs;
    summary.outputs += item.outputs;
    summary.rbf += Number(item.rbf);
    summary.data += Number(item.hasData);
    summary.types[item.type] = (summary.types[item.type] || 0) + 1;
    return summary;
  }, {vsize: 0, fees: 0, value: 0, inputs: 0, outputs: 0, rbf: 0, data: 0, types: {}});
  const count = items.length;
  const dominantType = Object.entries(totals.types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
  return {
    count,
    items,
    totalVsize: totals.vsize,
    totalFees: totals.fees,
    totalValue: totals.value,
    averageValue: count ? totals.value / count : 0,
    averageVsize: count ? totals.vsize / count : 0,
    averageFeeRate: totals.vsize ? totals.fees / totals.vsize : 0,
    averageInputs: count ? totals.inputs / count : 0,
    averageOutputs: count ? totals.outputs / count : 0,
    rbfShare: count ? totals.rbf / count : 0,
    dataShare: count ? totals.data / count : 0,
    dominantType,
    types: totals.types,
  };
}

export function flowFromTransactions(seed, composition, summary = {}) {
  const bytes = hashBytes(seed);
  const palette = composition?.palette?.length ? composition.palette : ['C4', 'D#4', 'F4', 'G4', 'A#4'];
  const feeEnergy = clamp(Math.log2(Math.max(1, numeric(summary.averageFeeRate, 1))) / 8, 0, 1);
  const sizeWeight = clamp(Math.log2(Math.max(80, numeric(summary.averageVsize, 180)) / 80) / 6, 0, 1);
  const complexity = clamp((numeric(summary.averageInputs, 1) + numeric(summary.averageOutputs, 2) - 2) / 14, 0, 1);
  const dataShare = clamp(summary.dataShare, 0, 1);
  const rbfShare = clamp(summary.rbfShare, 0, 1);
  const valueWeight = clamp(Math.log10(Math.max(1, numeric(summary.averageValue, 10000))) / 9, 0, 1);
  const voiceOffsetByType = {Taproot: 0, SegWit: 1, Legacy: 2, Data: 3, Batch: 4, Consolidation: 2, Mixed: 1};
  const phraseLength = Math.max(16, composition?.totalSteps || 16);
  const phrase = Array.from({length: phraseLength}, (_, step) => {
    const value = bytes[step % bytes.length];
    const restModulo = complexity > .55 ? 7 : sizeWeight > .55 ? 4 : 5;
    if ((value + step) % restModulo === 0) return null;
    if (step % 3 === 0 && composition?.melody?.[step]) return composition.melody[step];
    return palette[(value + bytes[(step + 9) % 32] + Math.round(valueWeight * 13) + Math.floor(step / 8)) % palette.length];
  });
  const stepsPerBar = composition.stepsPerBar || 16;
  return {
    seed: cleanHash(seed),
    phrase,
    velocities: Array.from({length: phraseLength}, (_, step) => 0.16 + (bytes[(step + 16) % 32] % 23) / 100),
    chordInversions: Array.from({length: composition.barCount || 4}, (_, bar) => bytes[(bar + 3) % 32] % 3),
    leadVoice: (composition.sound.leadVoice + (voiceOffsetByType[summary.dominantType] ?? bytes[8])) % LEAD_VOICES.length,
    chordVoice: (composition.sound.chordVoice + (complexity > .65 ? 1 : 0)) % CHORD_VOICES.length,
    bassVoice: (composition.sound.bassVoice + (summary.dominantType === 'Consolidation' ? 1 : 0)) % BASS_VOICES.length,
    bassPickup: bytes[10] % 4 === 0 || complexity > .7,
    hatOffset: bytes[11] % 4,
    brightness: clamp((bytes[12] - 128) / 128 + feeEnergy * .7, -1, 1),
    noteLength: sizeWeight > .68 ? '4n' : sizeWeight > .3 ? '8n' : '16n',
    kickVelocity: .58 + feeEnergy * .2,
    chordWeight: .82 + sizeWeight * .28,
    rhythmicDetail: clamp(complexity * .45 + rbfShare * .25 + dataShare * .2 + feeEnergy * .35, 0, 1),
    extraKicks: [bytes[13] % stepsPerBar, bytes[14] % stepsPerBar],
    extraSnares: [bytes[15] % stepsPerBar],
    melodyTranspose: valueWeight > .72 ? 12 : valueWeight < .32 ? -12 : 0,
    summary,
  };
}

export function mempoolToSound({fee = 1, vsize = 0, count = 0, projectedBlocks = 1} = {}) {
  const pressure = clamp(Math.log2(clamp(fee, 1, 512)) / 9, 0, 1);
  const weight = clamp(vsize / 250_000_000, 0, 1);
  const activity = clamp(count / 500_000, 0, 1);
  const depth = clamp(projectedBlocks / 12, 0, 1);
  return {
    pressure,
    weight,
    activity,
    depth,
    tempoLift: Math.round(pressure * 4),
    filterHz: Math.round(1150 + pressure * 1200 + activity * 500),
    noiseDb: -40 + weight * 8,
    delayWet: 0.08 + depth * 0.12,
    percussionChance: 0.1 + activity * 0.25,
  };
}

export function fallbackChainState() {
  return {
    height: 0,
    hash: '0000000000000000000000000000000000000000000000000000000000000000',
    fee: 1,
    vsize: 0,
    count: 0,
    projectedBlocks: 1,
    connected: false,
  };
}
