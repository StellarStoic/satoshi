const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MOODS = [
  {name: 'After Hours', scale: [0, 2, 3, 5, 7, 8, 10], base: 48},
  {name: 'Rainy Window', scale: [0, 2, 3, 5, 7, 9, 10], base: 46},
  {name: 'Quiet Morning', scale: [0, 2, 4, 5, 7, 9, 11], base: 45},
  {name: 'Blue Hour', scale: [0, 2, 3, 5, 7, 9, 10], base: 43},
  {name: 'Sunday Tape', scale: [0, 2, 4, 7, 9], base: 48},
];
const SESSIONS = [
  {name: 'Dusty boom bap', bpm: [70, 84], kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [0], bass: [0, 8], melody: [0, 2, 6, 8, 10, 14], chordDuration: '1m'},
  {name: 'Lazy shuffle', bpm: [62, 76], kick: [0, 6, 11], snare: [4, 12], hat: [0, 3, 6, 9, 12, 15], chord: [0, 10], bass: [0, 6, 11], melody: [2, 6, 10, 14], chordDuration: '2n.'},
  {name: 'Half-time haze', bpm: [58, 70], kick: [0, 9], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14], chord: [0, 8], bass: [0, 10], melody: [1, 5, 9, 13], chordDuration: '2n'},
  {name: 'Jazzhop skip', bpm: [74, 90], kick: [0, 5, 11, 14], snare: [4, 12], hat: [0, 2, 5, 7, 10, 13, 15], chord: [0, 6, 11], bass: [0, 5, 11], melody: [1, 4, 7, 10, 13], chordDuration: '4n.'},
  {name: 'Tape bossa', bpm: [76, 92], kick: [0, 3, 8, 11], snare: [4, 7, 12, 15], hat: [0, 2, 5, 8, 10, 13], chord: [0, 5, 10], bass: [0, 3, 8, 11], melody: [2, 5, 7, 10, 14], chordDuration: '4n'},
  {name: 'Broken beat', bpm: [68, 86], kick: [0, 3, 10, 13], snare: [6, 12], hat: [0, 2, 3, 6, 8, 11, 14], chord: [0, 7, 13], bass: [0, 7, 10, 13], melody: [1, 3, 6, 9, 12, 15], chordDuration: '4n.'},
  {name: 'Ambient drift', bpm: [56, 68], kick: [0, 12], snare: [8], hat: [3, 7, 11, 15], chord: [0], bass: [0, 12], melody: [4, 7, 12, 15], chordDuration: '1m'},
  {name: 'Cassette soul', bpm: [66, 80], kick: [0, 7, 11], snare: [4, 12, 15], hat: [0, 3, 5, 8, 11, 13], chord: [0, 7], bass: [0, 7, 11], melody: [2, 5, 9, 13], chordDuration: '2n.'},
  {name: 'Lo-Fi house', bpm: [92, 106], kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], chord: [0, 3, 8, 11], bass: [0, 4, 7, 8, 12], melody: [2, 6, 10, 14], chordDuration: '8n.'},
  {name: 'Dub study', bpm: [64, 78], kick: [0, 10], snare: [4, 12], hat: [2, 6, 11, 15], chord: [0, 6, 13], bass: [0, 3, 10], melody: [3, 7, 11, 15], chordDuration: '4n'},
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

export const REPLAY_ENGINE_VERSION = 'v1';

export function normalizeReplayHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

export function replaySoundStateFromHash(value) {
  const hash = normalizeReplayHash(value);
  if (!hash) throw new TypeError('A replay requires a 64-character hexadecimal block hash');
  const random = seededRandom(`${hash}:replay-sound:${REPLAY_ENGINE_VERSION}`);
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

export function seededRandom(seed) {
  let state = hashBytes(seed).reduce((total, value, index) => (total ^ (value << (index % 24))) >>> 0, 0x9e3779b9);
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
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
const DRUM_KITS = ['dust kit', 'tight kit', 'soft kit', 'brush kit', 'machine kit'];
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
  {name: 'Wooden Jazzhop', sessions: [3, 5], voices: [1, 3, 6, 0, 5, 2, 1, 7, 0]},
  {name: 'Sunday Piano Haze', sessions: [6, 7], voices: [0, 0, 4, 2, 0, 1, 4, 4, 3]},
  {name: 'Harmonium Hearth', sessions: [7, 9], voices: [6, 6, 8, 3, 2, 6, 3, 6, 1]},
  {name: 'Nylon Moonlight', sessions: [4, 6], voices: [7, 4, 9, 2, 4, 7, 0, 2, 2]},
  {name: 'Velvet Sax Lounge', sessions: [3, 1], voices: [3, 0, 8, 3, 1, 6, 1, 1, 0]},
  {name: 'Harp and Cello Drift', sessions: [6, 2], voices: [6, 6, 10, 2, 0, 6, 4, 4, 3]},
];

function chordForDegree(mood, root, degree, voicing) {
  return voicing.steps.map(step => midiToNote(scaleMidi(mood, root, degree + step, 1)));
}

function expandPattern(base, random, addChance = .08) {
  return Array.from({length: 64}, (_, step) => {
    const sixteenth = step % 16;
    const bar = Math.floor(step / 16);
    if (base.includes(sixteenth)) return true;
    const fillZone = bar === 3 && sixteenth >= 13;
    return (fillZone || sixteenth % 4 !== 0) && random() < addChance;
  });
}

export function compositionFromBlock(hash, height = 0, previousComposition = null) {
  const random = seededRandom(`${cleanHash(hash)}${Number(height).toString(16)}`);
  const bytes = Array.from({length: 32}, () => Math.floor(random() * 256));
  const moodIndex = bytes[0] % MOODS.length;
  const mood = MOODS[moodIndex];
  let sceneIndex = bytes[27] % PRODUCTION_SCENES.length;
  if (previousComposition && sceneIndex === previousComposition.sceneIndex) {
    sceneIndex = (sceneIndex + 1 + (bytes[28] % (PRODUCTION_SCENES.length - 1))) % PRODUCTION_SCENES.length;
  }
  const scene = PRODUCTION_SCENES[sceneIndex];
  const session = SESSIONS[scene.sessions[bytes[28] % scene.sessions.length]];
  const voicing = VOICINGS[bytes[19] % VOICINGS.length];
  const texture = TEXTURES[bytes[18] % TEXTURES.length];
  const root = bytes[1] % 12;
  const progression = PROGRESSIONS[bytes[2] % PROGRESSIONS.length];
  const chords = progression.map(degree => chordForDegree(mood, root, degree, voicing));
  const bass = progression.map(degree => midiToNote(scaleMidi(mood, root, degree, -1)));
  const palette = Array.from({length: 21}, (_, degree) => midiToNote(scaleMidi(mood, root, degree, 1)));
  const melodyRegister = 1 + (bytes[17] % 2);
  const motif = Array.from({length: 8}, (_, step) => {
    if (random() < (step % 4 === 0 ? .12 : .38)) return null;
    return Math.floor(random() * mood.scale.length) + (random() > .86 ? 7 : 0);
  });
  const melody = Array.from({length: 32}, (_, step) => {
    const degree = motif[step % motif.length];
    if (degree === null || (step >= 16 && random() < .16)) return null;
    const phraseLift = step >= 24 && bytes[16] % 2 ? 1 : 0;
    return midiToNote(scaleMidi(mood, root, degree + phraseLift, melodyRegister));
  });
  const kickPattern = expandPattern(session.kick, random, .025);
  const snarePattern = expandPattern(session.snare, random, .018);
  const hatPattern = expandPattern(session.hat, random, .07);
  const chordPattern = expandPattern(session.chord, random, .015);
  const bassPattern = expandPattern(session.bass, random, .045);
  const melodyPattern = expandPattern(session.melody, random, .08);
  const breakBar = 1 + (bytes[14] % 3);
  const breakMode = bytes[15] % 3;
  const arrangement = Array.from({length: 4}, (_, bar) => ({
    harmony: !(bar === breakBar && breakMode === 0),
    bass: !(bar === breakBar && breakMode === 1),
    drums: !(bar === breakBar && breakMode === 2),
    melody: bar === 0 || Boolean(bytes[13] & (1 << bar)),
  }));
  return {
    hash: cleanHash(hash),
    height: Number(height) || 0,
    mood: mood.name,
    key: `${ROOTS[root]} ${moodIndex === 2 ? 'major' : moodIndex === 1 ? 'dorian' : 'minor'}`,
    session: session.name,
    voicing: voicing.name,
    texture: texture.name,
    scene: scene.name,
    sceneIndex,
    bpm: session.bpm[0] + (bytes[3] % (session.bpm[1] - session.bpm[0] + 1)),
    swing: 0.5 + (bytes[4] % 19) / 100,
    chords,
    bass,
    palette,
    melody,
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
      chordVoice: scene.voices[0],
      chordName: CHORD_VOICES[scene.voices[0]],
      leadVoice: scene.voices[2],
      leadName: LEAD_VOICES[scene.voices[2]],
      bassVoice: scene.voices[1],
      bassName: BASS_VOICES[scene.voices[1]],
      drumKit: scene.voices[3],
      drumName: DRUM_KITS[scene.voices[3]],
      padVoice: scene.voices[4],
      padName: PAD_VOICES[scene.voices[4]],
      arpVoice: scene.voices[5],
      arpName: ARP_VOICES[scene.voices[5]],
      arpPattern: bytes[7] % 3,
      malletVoice: scene.voices[6],
      malletName: MALLET_VOICES[scene.voices[6]],
      percussionVoice: scene.voices[7],
      percussionName: PERCUSSION_VOICES[scene.voices[7]],
      textureVoice: scene.voices[8],
      textureName: ROOM_TEXTURES[scene.voices[8]],
      kickNote: ['C1', 'D1', 'E1'][bytes[24] % 3],
      chordVelocity: 0.3 + (bytes[25] % 24) / 100,
      melodyVelocity: 0.2 + (bytes[26] % 20) / 100,
      filterBase: 900 + bytes[29] * 6,
      delayTime: ['16n', '8n', '8n.', '4t'][bytes[30] % 4],
      delayFeedback: .12 + (bytes[31] % 22) / 100,
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

export function replayCompositionFromHash(value) {
  const hash = normalizeReplayHash(value);
  if (!hash) throw new TypeError('A replay requires a 64-character hexadecimal block hash');
  return compositionFromBlock(hash, 0, null);
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
  const phrase = Array.from({length: 16}, (_, step) => {
    const value = bytes[step];
    const restModulo = complexity > .55 ? 7 : sizeWeight > .55 ? 4 : 5;
    if ((value + step) % restModulo === 0) return null;
    return palette[(value + bytes[(step + 9) % 32] + Math.round(valueWeight * 13)) % palette.length];
  });
  return {
    seed: cleanHash(seed),
    phrase,
    velocities: Array.from({length: 16}, (_, step) => 0.18 + (bytes[(step + 16) % 32] % 25) / 100),
    chordInversions: Array.from({length: 4}, (_, bar) => bytes[bar + 3] % 3),
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
    extraKicks: [bytes[13] % 16, bytes[14] % 16],
    extraSnares: [bytes[15] % 16],
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
