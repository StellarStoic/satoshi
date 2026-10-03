const BASE = '/audio/lofi/real/';
const pair = name => [`${BASE}${name}-1.mp3`, `${BASE}${name}-2.mp3`];

export const REAL_HITS = Object.freeze({
  kickSoft: pair('kick'),
  kickDeep: [`${BASE}kick-3.mp3`, `${BASE}kick-4.mp3`],
  snareSoft: pair('snare'),
  snareHard: [`${BASE}snare-3.mp3`, `${BASE}snare-4.mp3`],
  stick: pair('stick'),
  hatClosed: pair('hat-closed'),
  hatOpen: pair('hat-open'),
  cajon: pair('cajon'),
  conga: pair('conga'),
  bongo: pair('bongo'),
  shaker: pair('shaker'),
  claves: pair('claves'),
  tambourine: pair('tambourine'),
  woodblock: pair('woodblock'),
});

// Electronic kits intentionally remain synthesized. Recorded samples are used
// where physical instruments support the selected groove.
export const REAL_DRUM_KITS = Object.freeze([
  {name: 'recorded dusty kit', kick: REAL_HITS.kickSoft, snare: REAL_HITS.snareSoft, hat: REAL_HITS.hatClosed},
  {name: 'recorded tight kit', kick: REAL_HITS.kickSoft, snare: REAL_HITS.snareHard, hat: REAL_HITS.hatClosed},
  {name: 'recorded cajon kit', kick: REAL_HITS.cajon, snare: REAL_HITS.conga, hat: REAL_HITS.shaker},
  {name: 'recorded brush-room kit', kick: REAL_HITS.kickSoft, snare: REAL_HITS.stick, hat: REAL_HITS.shaker},
  null,
  {name: 'recorded funk kit', kick: REAL_HITS.cajon, snare: REAL_HITS.snareHard, hat: REAL_HITS.hatClosed},
  {name: 'recorded breakbeat kit', kick: REAL_HITS.kickDeep, snare: REAL_HITS.snareHard, hat: REAL_HITS.hatOpen},
  null,
  null,
  {name: 'recorded cinematic kit', kick: REAL_HITS.kickDeep, snare: REAL_HITS.snareSoft, hat: REAL_HITS.tambourine},
]);

export const REAL_PERCUSSION = Object.freeze([
  {name: 'recorded woodblock', urls: REAL_HITS.woodblock},
  {name: 'recorded sidestick', urls: REAL_HITS.stick},
  {name: 'recorded cajon', urls: REAL_HITS.cajon},
  {name: 'recorded claves', urls: REAL_HITS.claves},
  {name: 'recorded tambourine', urls: REAL_HITS.tambourine},
  {name: 'recorded conga', urls: REAL_HITS.conga},
  {name: 'recorded bongos', urls: REAL_HITS.bongo},
  {name: 'recorded shaker', urls: REAL_HITS.shaker},
]);

export const REAL_SOUND_FILES = Object.freeze([...new Set([
  ...Object.values(REAL_HITS).flat(),
])]);
