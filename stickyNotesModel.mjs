export const STICKY_EVENT_KIND = 1;
export const STICKY_TOPIC = 'pinstr';
export const STICKY_HASHTAG_MAX = 3;
export const STICKY_VERSION = 'v1';
// Posting is what a subscription buys. There is no per-note price for a
// registered key any more: while a subscription is active, pins are
// included, and a note it covers is created already settled, so the board never
// shows a payment step for one. The only per-note price left is the single-use
// anonymous identity's, which can never subscribe.
export const STICKY_SUB_WEEK_SATS = 10;
export const STICKY_SUB_YEAR_SATS = 411;
export const STICKY_SUB_MEMBER_WEEK_SATS = 5;
export const STICKY_SUB_MEMBER_YEAR_SATS = 205;
export const STICKY_SUB_WEEKS_PER_YEAR = 52;
export const STICKY_SUB_YEAR_DISCOUNT = 0.21;
export const STICKY_SUB_PLANS = Object.freeze(['week', 'year']);
export const STICKY_ANONYMOUS_PRICE_SATS = 69;

/** All prices this service charges, so nothing else can be displayed as one. */
export const STICKY_KNOWN_PRICES = Object.freeze([
  0,
  STICKY_ANONYMOUS_PRICE_SATS,
  STICKY_SUB_WEEK_SATS,
  STICKY_SUB_YEAR_SATS,
  STICKY_SUB_MEMBER_WEEK_SATS,
  STICKY_SUB_MEMBER_YEAR_SATS,
]);
export const STICKY_MAX_CHARACTERS = 501;
export const STICKY_COLORS = Object.freeze(['yellow', 'pink', 'blue', 'green', 'orange']);

// The pins that hold a note down, and which one holds which note. The colour is taken from the
// note's own event id, so it looks random between notes while staying fixed for a given note:
// it survives a reload, and every reader of a board sees the same pins. Nothing about the
// colour travels in the note itself.
export const STICKY_PIN_COLOURS = Object.freeze(['red', 'blue', 'yellow', 'green', 'white', 'purple', 'magenta', 'black']);
export const STICKY_PIN_LEFT_MIN = 27;
export const STICKY_PIN_LEFT_MAX = 73;

const NOTE_ID_PATTERN = /^[0-9a-f]{64}$/i;

function pinSeedValue(seed, idSlice = -8) {
  const text = String(seed ?? '');
  if (NOTE_ID_PATTERN.test(text)) {
    const word = idSlice === -8 ? text.slice(-8) : text.slice(idSlice, idSlice + 8);
    return parseInt(word, 16);
  }
  let value = 2166136261;                  // FNV-1a
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619) >>> 0;
  }
  return value;
}

export function pinColourFor(seed) {
  // A note's id is already a sha256, and its bytes are uniform, so they are used directly:
  // hashing a hash again only mixes it worse, and three ordinary notes were seen landing on
  // one colour that way. Anything else (the fallback seed) is hashed first.
  const value = pinSeedValue(seed);
  return STICKY_PIN_COLOURS[value % STICKY_PIN_COLOURS.length];
}

/** A stable, random-looking horizontal pin position that stays clear of both paper edges. */
export function pinLeftFor(seed) {
  // Use a different event-id word from the colour, so a pin's colour and position do not move
  // in lockstep. Salt fallback seeds for the same reason.
  const text = NOTE_ID_PATTERN.test(String(seed ?? '')) ? seed : `pin-position:${String(seed ?? '')}`;
  const value = pinSeedValue(text, -16);
  return STICKY_PIN_LEFT_MIN + (value % (STICKY_PIN_LEFT_MAX - STICKY_PIN_LEFT_MIN + 1));
}

export const STICKY_FONTS = Object.freeze([
  'typewriter', 'handwritten', 'patrick-hand', 'kalam', 'comfortaa',
  'noto-sans', 'noto-serif', 'noto-mono', 'roboto', 'mono', 'roboto-slab',
  'open-sans', 'source-sans', 'ubuntu', 'pt-sans', 'pt-serif', 'fira-mono',
  'ibm-plex-mono', 'merriweather', 'atkinson', 'serif',
]);
// A note here is a temporary thing. Every one carries the NIP-40 expiration
// tag, and the relay drops it once that moment passes — so the ladder below is
// the whole life of a note, not a preference. The payment service enforces the
// same range at publish time, so a client cannot hand itself a note that
// outlives a year.
export const STICKY_LIVELINESS = Object.freeze([
  Object.freeze({key: '1d', label: '1 day', short: '1d', seconds: 86400}),
  Object.freeze({key: '1w', label: '1 week', short: '1w', seconds: 7 * 86400}),
  Object.freeze({key: '1m', label: '1 month', short: '1m', seconds: 30 * 86400}),
  Object.freeze({key: '6m', label: '6 months', short: '6m', seconds: 180 * 86400}),
  Object.freeze({key: '12m', label: '1 year', short: '12m', seconds: 365 * 86400}),
]);
export const STICKY_DEFAULT_LIVELINESS = '1m';
export const STICKY_MIN_LIVELINESS_SECONDS = 86400;                 // the shortest rung
export const STICKY_MAX_LIVELINESS_SECONDS = 365 * 86400;           // a year: the longest
export const EXPIRATION_TAG = 'expiration';
// NIP-27 mentions. A note may tag people who own a satoshi.si name — the only
// keys the board's @ picker offers — and the text has to name the key's own
// npub, which is what makes the tag more than an assertion. The desk enforces
// the same rules, in the same order; a change here has to be made there too.
export const MENTION_TAG = 'p';
export const MENTION_MAX = 5;
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

/** hex public key -> "npub1...", or null when it is not a 64-character hex key. */
export function npubEncode(pubkey) {
  const hex = String(pubkey || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const bytes = [];
  for (let index = 0; index < hex.length; index += 2) bytes.push(parseInt(hex.slice(index, index + 2), 16));
  const words = convertBits(bytes, 8, 5, true);
  if (!words) return null;
  const checksumInput = [...bech32HrpExpand('npub'), ...words, 0, 0, 0, 0, 0, 0];
  const polymod = bech32Polymod(checksumInput) ^ 1;
  const checksum = [];
  for (let index = 0; index < 6; index += 1) checksum.push((polymod >> (5 * (5 - index))) & 31);
  return `npub1${[...words, ...checksum].map(word => BECH32_CHARSET[word]).join('')}`;
}

export function isPubkey(value) {
  return /^[0-9a-f]{64}$/.test(String(value || '').toLowerCase());
}

/** The npub tokens a note's text names: "nostr:npub1..." or a bare npub. */
export function mentionTokens(content) {
  return [...new Set(mentionMatches(String(content || '')).map(match => match.npub.toLowerCase()))];
}

function mentionMatches(content) {
  const matches = [];
  const pattern = /(?:nostr:)?npub1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}/gi;
  for (const match of content.matchAll(pattern)) {
    const token = match[0];
    // A bech32 character on either side makes this part of a longer word rather
    // than a mention of its own.
    const before = content[match.index - 1] || '';
    const after = content[match.index + token.length] || '';
    if (/[qpzry9x8gf2tvdw0s3jn54khce6mua7l]/i.test(before) || /[qpzry9x8gf2tvdw0s3jn54khce6mua7l]/i.test(after)) continue;
    matches.push({ npub: token.startsWith('nostr:') ? token.slice(6) : token, index: match.index, length: token.length });
  }
  return matches;
}

/** How much of an address the note's confirmation shows before the rest waits behind the arrow. */
export const LINK_DISPLAY_MAX = 200;
export const LINK_LABEL = 'link';

/**
 * What the character limit and the counter count: the note as the reader will see it. An
 * address is machine data that can run to thousands of characters, while the paper shows the
 * word "link" in its place, so a link counts as that word. Mentions still count as the npub
 * they travel as. The desk measures a note the same way, which is what the frontend contract
 * check holds together.
 */
export function stickyNoteLength(content) {
  let length = 0;
  for (const part of stickyTextParts(content)) {
    if (part.type === 'link') length += LINK_LABEL.length;
    else if (part.type === 'mention') length += [...part.token].length; // travels as its npub
    else length += [...part.text].length;
  }
  return length;
}

const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
/** Punctuation a sentence leaves outside its link. */
const LINK_TRAILING_JUNK = ['.', ',', ';', ':', '!', '?', '…', '"', "'", '`', '*', '_'];

/**
 * The absolute form of a link, or '' when it is not one this board will open.
 * Only http(s) survives: a javascript:, data: or nostr: run stays plain note text.
 */
export function linkHref(url) {
  const raw = String(url || '').trim();
  if (/^https?:\/\/[^\s]+$/i.test(raw)) return raw;
  if (/^www\.[^\s]+$/i.test(raw)) return `https://${raw}`;
  return '';
}

/** An address cut into what the confirmation shows at once and what waits behind the arrow. */
export function linkDisplay(url, max = LINK_DISPLAY_MAX) {
  const text = String(url || '');
  if (text.length <= max) return {head: text, tail: '', truncated: false, total: text.length};
  return {head: text.slice(0, max), tail: text.slice(max), truncated: true, total: text.length};
}

/**
 * Links written into a note: http(s) and bare www. runs, with the sentence's own trailing
 * punctuation left out (a closing bracket stays when the link opened one itself).
 */
/**
 * Whether the editor is holding a finished address rather than one still being typed: it stops
 * before the text does, or the caret is somewhere else. A finished address is drawn as the word the
 * paper prints, so a copied query string cannot fill a note it never appears on. `force` is for a
 * paste, where the address arrives whole with the caret at its end.
 */
export function linkRunIsComplete(match, textLength, {caret = null, force = false} = {}) {
  if (!match) return false;
  const end = match.index + match.length;
  if (typeof caret === 'number' && caret > match.index && caret < end) return false;
  return end < textLength || force;
}

export function linkMatches(content) {
  const text = String(content || '');
  const matches = [];
  const count = (haystack, needle) => haystack.split(needle).length - 1;
  for (const found of text.matchAll(LINK_PATTERN)) {
    let url = found[0];
    while (url && LINK_TRAILING_JUNK.includes(url.slice(-1))) url = url.slice(0, -1);
    while (url.endsWith(')') && count(url, ')') > count(url, '(')) url = url.slice(0, -1);
    while (url.endsWith(']') && count(url, ']') > count(url, '[')) url = url.slice(0, -1);
    const href = linkHref(url);
    if (!href) continue;
    matches.push({index: found.index, length: url.length, url, href});
  }
  return matches;
}

/**
 * A note's text, cut into the pieces the board draws: plain runs, mentions and links.
 * Mentions and links are found together and placed by position, so a run can only be one of them.
 * The wire form of a mention is the npub; the label is resolved from the person's profile,
 * falling back to their satoshi.si name, and only then to the shortened npub.
 */
export function stickyTextParts(content) {
  const text = String(content || '');
  const parts = [];
  let cursor = 0;
  const found = [...mentionMatches(text), ...linkMatches(text)].sort((a, b) => a.index - b.index);
  for (const match of found) {
    if (match.index < cursor) continue;
    if (match.index > cursor) parts.push({type: 'text', text: text.slice(cursor, match.index)});
    if (match.npub) parts.push({type: 'mention', npub: match.npub, token: `nostr:${match.npub}`});
    else parts.push({type: 'link', url: match.url, href: match.href});
    cursor = match.index + match.length;
  }
  if (cursor < text.length) parts.push({type: 'text', text: text.slice(cursor)});
  return parts;
}

/** The people a note tags: one entry per key, in the order the tags carry them. */
export function mentionPubkeys(tags = []) {
  const keys = [];
  tags.forEach(tag => {
    if (tag?.[0] !== MENTION_TAG) return;
    const key = String(tag[1] || '').toLowerCase();
    if (isPubkey(key) && !keys.includes(key)) keys.push(key);
  });
  return keys;
}

/** Every mention in the text must be a key the note tags, and the other way round. */
export function mentionIssue(content, mentions = []) {
  const keys = mentions.map(key => String(key || '').toLowerCase());
  if (keys.length > MENTION_MAX) return `A note can tag up to ${MENTION_MAX} people.`;
  if (new Set(keys).size !== keys.length) return 'Each person can only be tagged once.';
  const named = new Set(mentionTokens(content));
  for (const key of keys) {
    if (!isPubkey(key)) return 'That is not a valid Nostr public key.';
    if (!named.has(npubEncode(key))) {
      return 'A tagged note has to name the person: the mention is the text, the tag only marks it.';
    }
  }
  return '';
}

/** Who can use the tag filter, and what to tell anyone who cannot. */
export function mentionFilterAvailability(session) {
  if (!session) {
    return {available: false, reason: 'Log in to Nostr to see the notes that tag you.'};
  }
  if (session.anonymous || session.method === 'anonymous') {
    return {available: false,
      reason: 'Only people with a satoshi.si name can be tagged, so a temporary identity has nothing to filter.'};
  }
  return {available: true, reason: 'Show only the notes that tag you'};
}

/** Does this note tag me? */
export function noteMentions(sticky, pubkey) {
  const key = String(pubkey || '').toLowerCase();
  if (!key) return false;
  return (sticky?.mentions || []).some(mention => String(mention).toLowerCase() === key);
}

export const STICKY_NOTE_VIEWS = Object.freeze(['all', 'last5', 'last15', 'day', 'week', 'mentions']);

/** IDs visible under the board's local view and optional Nostr follow filter. */
export function stickyVisibleNoteIds(notes = [], options = {}) {
  const view = STICKY_NOTE_VIEWS.includes(options.view) ? options.view : 'all';
  const pubkey = String(options.pubkey || '').toLowerCase();
  const follows = new Set([...(options.follows || [])].map(key => String(key || '').toLowerCase()));
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000);
  let visible = [...notes]
    .filter(note => note && typeof note.id === 'string')
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));

  if (options.followsOnly) visible = visible.filter(note => follows.has(String(note.pubkey || '').toLowerCase()));
  if (view === 'mentions') visible = visible.filter(note => noteMentions(note, pubkey));
  else if (view === 'day') visible = visible.filter(note => Number(note.createdAt || 0) >= now - 86400);
  else if (view === 'week') visible = visible.filter(note => Number(note.createdAt || 0) >= now - 7 * 86400);
  else if (view === 'last5') visible = visible.slice(0, 5);
  else if (view === 'last15') visible = visible.slice(0, 15);
  return visible.map(note => note.id);
}

/** First usable label, in priority order: profile name, profile nip05, board name, npub. */
export function mentionLabel(candidates, npub = '') {
  for (const candidate of candidates) {
    const label = String(candidate || '').trim().replace(/\s+/g, ' ');
    if (label) return label;
  }
  return npub ? `@${npub.slice(0, 12)}…` : '@someone';
}

export function stickyLiveliness(key) {
  return STICKY_LIVELINESS.find(rung => rung.key === key) || null;
}

/** The NIP-40 moment a note written then, to live that long, disappears. */
export function stickyExpiration(createdAt = Math.floor(Date.now() / 1000), liveliness = STICKY_DEFAULT_LIVELINESS) {
  const rung = stickyLiveliness(liveliness) || stickyLiveliness(STICKY_DEFAULT_LIVELINESS);
  return createdAt + rung.seconds;
}

/** A relay should not send an expired note, and the board should not draw one. */
export function isStickyExpired(note, now = Math.floor(Date.now() / 1000)) {
  return Number.isFinite(note?.expiration) && note.expiration > 0 && note.expiration <= now;
}

export function stickyExpiryCountdown(expiration, now = Date.now() / 1000) {
  const remaining = Math.max(0, Math.ceil(Number(expiration) - Number(now)));
  if (!Number.isFinite(remaining) || remaining <= 0) return '[expired]';
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  if (days || hours || minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return `[${parts.join(' ')} left]`;
}

// Codes are 3 to 9 characters: below 3 the cell is a region rather than a
// useful board, and 9 is as deep as the grid is useful. Within that range a board may
// be a clump of touching cells, which is what lets one note cover a building
// that straddles two or three cells — a cell is what a note is pinned to, and
// a clump is still one note on one price.
export const GEOHASH_MIN_LENGTH = 3;
export const GEOHASH_MAX_LENGTH = 9;
export const GEOHASH_MAX_CELLS = 9;
export const GEOHASH_PATTERN = new RegExp(`^[0123456789bcdefghjkmnpqrstuvwxyz]{${GEOHASH_MIN_LENGTH},${GEOHASH_MAX_LENGTH}}$`);
const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

export function normaliseGeohash(value, fallback = '') {
  const geohash = String(value || '').trim().toLowerCase();
  if (!geohash) return fallback;
  return GEOHASH_PATTERN.test(geohash) ? geohash : fallback;
}

export function geohashPrefixes(value) {
  const geohash = normaliseGeohash(value);
  if (!geohash) return [];
  return Array.from({length: geohash.length}, (_, index) => geohash.slice(0, geohash.length - index));
}

/** One cell, or a list of them: both are accepted wherever a board is given. */
function geohashCells(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map(cell => normaliseGeohash(cell)).filter(Boolean);
}

/**
 * The eight cells that touch this one. Latitude has edges, longitude wraps, so
 * the neighbours of a cell on the antimeridian are still eight (or six at a pole).
 */
export function geohashNeighbours(value) {
  const geohash = normaliseGeohash(value);
  if (!geohash) return [];
  const bounds = geohashBounds(geohash);
  const latStep = bounds.north - bounds.south;
  const lonStep = bounds.east - bounds.west;
  const neighbours = [];
  for (const latOffset of [-1, 0, 1]) {
    for (const lonOffset of [-1, 0, 1]) {
      if (!latOffset && !lonOffset) continue;
      const lat = bounds.center.lat + latOffset * latStep;
      if (lat <= -90 || lat >= 90) continue;
      const lng = ((bounds.center.lng + lonOffset * lonStep + 540) % 360) - 180;
      const neighbour = encodeGeohash(lat, lng, geohash.length);
      if (neighbour && neighbour !== geohash && !neighbours.includes(neighbour)) neighbours.push(neighbour);
    }
  }
  return neighbours;
}

/**
 * The same area on a different grid. The zoom decides how coarse the cells are, so zooming out
 * can carry what the reader chose by cutting characters off each cell — the same place, one grid
 * up. Zooming in cannot be carried over: a finer cell is not derivable from a coarser one, and
 * choosing whatever sits under the map's centre instead puts a cell on the map nobody tapped.
 * `lost` says exactly that case, so the page can hand the choosing back to the reader.
 */
export function geohashCellsForPrecision(cells = [], precision = 0) {
  const chosen = geohashCells(cells);
  const depth = Number(precision);
  if (!Number.isFinite(depth) || depth < GEOHASH_MIN_LENGTH || depth > GEOHASH_MAX_LENGTH) {
    return {cells: [], lost: chosen.length > 0};
  }
  const carried = [];
  for (const cell of chosen) {
    if (cell.length < depth) continue;
    const coarser = cell.slice(0, depth);
    if (!carried.includes(coarser)) carried.push(coarser);
  }
  return {cells: carried, lost: chosen.length > 0 && !carried.length};
}

/** Two cells stick together when they share a side or a corner. */
export function geohashTouches(left, right) {
  const a = normaliseGeohash(left);
  const b = normaliseGeohash(right);
  if (!a || !b || a === b || a.length !== b.length) return false;
  return geohashNeighbours(a).includes(b);
}

/** Is every cell reachable from the first one by stepping between neighbours? */
export function geohashCellsConnected(cells) {
  const list = geohashCells(cells);
  if (list.length < 2) return list.length === 1;
  const seen = new Set([list[0]]);
  const queue = [list[0]];
  while (queue.length) {
    const neighbours = geohashNeighbours(queue.pop());
    for (const cell of list) {
      if (!seen.has(cell) && neighbours.includes(cell)) {
        seen.add(cell);
        queue.push(cell);
      }
    }
  }
  return seen.size === list.length;
}

/**
 * Why a set of cells cannot be used, as a sentence for the reader, or '' when it
 * is fine. The rules: at least one cell, no more than nine, all cut to the same
 * depth, each chosen once, and the whole clump stuck together.
 */
export function geohashSetIssue(value) {
  const list = (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(cell => String(cell ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (!list.length) return 'Choose at least one cell.';
  if (list.length > GEOHASH_MAX_CELLS) return `A note can sit on at most ${GEOHASH_MAX_CELLS} cells.`;
  if (new Set(list).size !== list.length) return 'Each cell can be chosen once.';
  if (!list.every(cell => normaliseGeohash(cell))) {
    return `A geohash is ${GEOHASH_MIN_LENGTH} to ${GEOHASH_MAX_LENGTH} characters from 0-9 and b-h, j, k, m, n, p-z.`;
  }
  if (new Set(list.map(cell => cell.length)).size !== 1) return 'Every cell has to be cut to the same depth.';
  if (!geohashCellsConnected(list)) return 'Cells have to stick together — pick ones that touch.';
  return '';
}

/** The usable cells, or [] when the set breaks a rule. Keeps the chosen order. */
export function normaliseGeohashes(value) {
  if (geohashSetIssue(value)) return [];
  return [...new Set(geohashCells(value))];
}

/**
 * Does a note belong on a board? Either side may be a clump, because a note or a
 * board can cover several touching cells: a note is on the board when any of its
 * cells is the board cell or deeper inside it, within the board's depth — and an
 * exact note is only ever on the cells it names.
 */
export function geohashMatchesBoard(noteGeohash, boardGeohash, depth = 0, exactOnly = false) {
  const notes = geohashCells(noteGeohash);
  const boards = geohashCells(boardGeohash);
  if (!notes.length || !boards.length) return false;
  const levels = Math.max(0, Math.min(11, Number.parseInt(depth, 10) || 0));
  return notes.some(note => boards.some(board => {
    if (!note.startsWith(board)) return false;
    if (note === board) return true;
    if (exactOnly) return false;
    return note.length - board.length <= levels;
  }));
}

export function encodeGeohash(latitude, longitude, precision = 9) {
  const length = Math.max(1, Math.min(12, Number.parseInt(precision, 10) || 1));
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let evenBit = true;
  let bit = 0;
  let value = 0;
  let geohash = '';
  const lat = Math.max(-90, Math.min(90, Number(latitude)));
  const lon = Math.max(-180, Math.min(180, Number(longitude)));
  while (geohash.length < length) {
    if (evenBit) {
      const middle = (lonMin + lonMax) / 2;
      if (lon >= middle) { value = value * 2 + 1; lonMin = middle; }
      else { value *= 2; lonMax = middle; }
    } else {
      const middle = (latMin + latMax) / 2;
      if (lat >= middle) { value = value * 2 + 1; latMin = middle; }
      else { value *= 2; latMax = middle; }
    }
    evenBit = !evenBit;
    bit += 1;
    if (bit === 5) {
      geohash += GEOHASH_ALPHABET[value];
      bit = 0;
      value = 0;
    }
  }
  return geohash;
}

export function geohashBounds(value) {
  const geohash = normaliseGeohash(value);
  if (!geohash) return null;
  let south = -90;
  let north = 90;
  let west = -180;
  let east = 180;
  let evenBit = true;
  for (const character of geohash) {
    const index = GEOHASH_ALPHABET.indexOf(character);
    for (const mask of [16, 8, 4, 2, 1]) {
      if (evenBit) {
        const middle = (west + east) / 2;
        if (index & mask) west = middle;
        else east = middle;
      } else {
        const middle = (south + north) / 2;
        if (index & mask) south = middle;
        else north = middle;
      }
      evenBit = !evenBit;
    }
  }
  return {south, west, north, east, center: {lat: (south + north) / 2, lng: (west + east) / 2}};
}

/**
 * How much of the world one cell of a given precision covers, in degrees.
 */
export function geohashCellDimensions(precision) {
  const length = Math.max(
    GEOHASH_MIN_LENGTH,
    Math.min(GEOHASH_MAX_LENGTH, Number.parseInt(precision, 10) || GEOHASH_MIN_LENGTH),
  );
  const bits = 5 * length;
  return {width: 360 / 2 ** Math.ceil(bits / 2), height: 180 / 2 ** Math.floor(bits / 2)};
}

// A cell smaller than this cannot be read or tapped, and a grid of more cells than this blocks
// the map while it is built. Three characters is the shortest geohash a board takes, so there is
// no coarser grid to fall back on at a world zoom: the grid is simply not drawn there.
export const GRID_MIN_CELL_PX = 24;
export const GRID_MAX_CELLS = 4000;

/**
 * Whether the cell grid is worth drawing at this size: every cell big enough to tap, and few
 * enough that building them does not stall the map. Callers keep drawing whatever is already
 * chosen when this says no, so a reader never loses sight of their own area.
 */
export function geohashGridFits(candidate = {}) {
  const pixels = Number(candidate.cellPixels) || 0;
  const cells = (Number(candidate.columns) || 0) * (Number(candidate.rows) || 0);
  if (!cells) return false;
  return pixels >= GRID_MIN_CELL_PX && cells <= GRID_MAX_CELLS;
}

export function geohashPrecisionForZoom(zoom) {
  const level = Math.max(0, Math.min(21, Number(zoom) || 0));
  // A three-character cell is about 109 x 156 km at Slovenia's latitude — the country
  // scale, and the shortest code a board now takes. Shallow zooms go there;
  // geohashGridFits still refuses any grid whose cells are too small to read, so
  // zooming further out leaves the chosen cell alone instead of drawing a mush.
  if (level <= 6) return 3;
  if (level <= 10) return 4;
  if (level <= 12) return 5;
  if (level <= 14) return 6;
  if (level <= 17) return 7;
  if (level <= 20) return 8;
  return 9;
}

export function mapZoomForGeohashPrecision(precision) {
  const index = Math.max(
    GEOHASH_MIN_LENGTH,
    Math.min(GEOHASH_MAX_LENGTH, Number.parseInt(precision, 10) || GEOHASH_MIN_LENGTH),
  );
  return [0, 2, 4, 6, 8, 11, 13, 15, 18, 21][index];
}

/**
 * Searching a place by name lands on a grid a reader can recognise: four characters is about
 * 39 x 20 km, coarse enough to cover a district and fine enough that two towns are not one board.
 */
export const MAP_SEARCH_PRECISION = 4;
/** Photon is komoot's open-source geocoder over OpenStreetMap; it takes no key and allows any origin. */
export const MAP_SEARCH_URL = 'https://photon.komoot.io/api/';
export const MAP_SEARCH_LIMIT = 5;
export const MAP_SEARCH_MIN_QUERY = 3;

/** The request a name search makes, built here so what we send can be asserted. */
export function placeSearchUrl(query, {limit = MAP_SEARCH_LIMIT, base = MAP_SEARCH_URL} = {}) {
  const text = String(query || '').replace(/\s+/g, ' ').trim();
  if (text.length < MAP_SEARCH_MIN_QUERY) return '';
  const url = new URL(base);
  url.searchParams.set('q', text);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'en');
  return url.href;
}

/** What kind of thing a result is, in words: a village, a winter sports area. */
export function placeSearchKind(osmValue) {
  const value = String(osmValue || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  return value === 'yes' || value === 'unclassified' ? '' : value;
}

/**
 * What to call a result: its name, then the parts that place it. A part that merely repeats the
 * name is dropped, and the kind is added only when two results would otherwise read the same.
 */
export function placeSearchLabel(properties = {}, {kind = false, max = 90} = {}) {
  const text = value => String(value ?? '').trim();
  const name = text(properties.name) || text(properties.street);
  const pieces = [name];
  if (kind) pieces.push(placeSearchKind(properties.osm_value));
  pieces.push(text(properties.city || properties.district), text(properties.state), text(properties.country));
  const seen = new Set();
  const label = pieces.filter(piece => {
    const key = piece.toLowerCase();
    if (!piece || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}\u2026` : label;
}

/** Photon's answer as the picker needs it: where the place is, and what to call it. */
export function placeSearchResults(payload, {limit = MAP_SEARCH_LIMIT} = {}) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const found = [];
  const seen = new Set();
  for (const feature of features) {
    const coordinates = feature?.geometry?.coordinates;
    const lng = Number(coordinates?.[0]);
    const lat = Number(coordinates?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    const properties = feature?.properties || {};
    const label = placeSearchLabel(properties);
    if (!label) continue;
    const key = `${label}@${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({label, lat, lng, properties});
    if (found.length >= limit) break;
  }
  // Photon answers "Kranjska Gora" with a municipality, a village and a ski area. Where two
  // results would read the same, each also says what kind of place it is.
  const count = new Map();
  for (const item of found) count.set(item.label, (count.get(item.label) || 0) + 1);
  return found.map(item => ({
    label: count.get(item.label) > 1 ? placeSearchLabel(item.properties, {kind: true}) : item.label,
    lat: item.lat,
    lng: item.lng,
  }));
}

/** What a plan costs this buyer: NIP-05 members pay half. Null for no such plan. */
export function stickySubscriptionPrice(plan, { member = false } = {}) {
  if (plan === 'week') return member ? STICKY_SUB_MEMBER_WEEK_SATS : STICKY_SUB_WEEK_SATS;
  if (plan === 'year') return member ? STICKY_SUB_MEMBER_YEAR_SATS : STICKY_SUB_YEAR_SATS;
  return null;
}

export function stickyOrderPrice(value, fallback = STICKY_SUB_WEEK_SATS) {
  const sats = Number(value?.sats ?? value?.priceSats ?? value);
  return Number.isInteger(sats) && STICKY_KNOWN_PRICES.includes(sats) ? sats : fallback;
}

/** A UTC day, so the same order shows the same day wherever it is read. */
export function stickyDay(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  return new Date(value * 1000).toISOString().slice(0, 10);
}

/**
 * What the composer's buttons say. Kept as a pure function of the desk's
 * /pinstr/v1/subscription answer so the wording can be tested without a DOM.
 *
 * `anonymous` is the identity mode in play, and `plan` is the plan the picker is
 * on — a buyer with no subscription is offered "subscribe and post" as one action
 * rather than a detour they have to repeat.
 */
export function describeStickyAction({ anonymous = false, subscription = null, plan = 'week' } = {}) {
  const prices = subscription?.prices || {};
  const member = Boolean(prices.member);
  const week = (Number.isInteger(prices.weekSats) ? prices.weekSats : null) ?? stickySubscriptionPrice('week', { member });
  const year = (Number.isInteger(prices.yearSats) ? prices.yearSats : null) ?? stickySubscriptionPrice('year', { member });
  const active = Boolean(subscription?.active);
  const until = stickyDay(subscription?.expiresAt);
  const discount = member
    ? 'Your satoshi.si NIP-05 discount is applied: 50% off.'
    : 'Satoshi.si NIP-05 owners get 50% off.';

  if (anonymous) {
    return {
      label: `Post anonymously · ${STICKY_ANONYMOUS_PRICE_SATS} sats`,
      state: `Anonymous post: ${STICKY_ANONYMOUS_PRICE_SATS} sats. One key can post one note and cannot buy a weekly or yearly subscription.`,
      needsSubscription: false,
      price: STICKY_ANONYMOUS_PRICE_SATS,
      active: false,
      member: false,
      week,
      year,
    };
  }

  if (active) {
    return {
      label: 'Place your note',
      state: `Subscription active${until ? ` until ${until}` : ''}. Posting is included. ${discount}`,
      needsSubscription: false,
      price: 0,
      active: true,
      member,
      week,
      year,
    };
  }

  const price = stickySubscriptionPrice(plan, { member });
  return {
    label: `Subscribe & pin · ${price} sats`,
    state: `Posting needs a subscription: ${week} sats a week or ${year} sats a year. ${discount}`,
    needsSubscription: true,
    price,
    active: false,
    member,
    week,
    year,
  };
}

export const STICKY_RAILS = Object.freeze(['bark', 'lightning']);

/**
 * The rails this order can be paid on, in the order to offer them: Bark first (the
 * native rail) then Lightning.
 *
 * A rail appears only when the payment service actually handed back a destination
 * for it, so a Bark-only or Lightning-only order keeps a single-rail checkout
 * instead of showing a tab that cannot pay. `uri` is what the QR encodes, and
 * `copyValue` is what the buyer pastes into a wallet.
 */
export function stickyPaymentRails(order) {
  const payment = order?.payment || {};
  const rails = [];
  const bark = String(payment.paymentLink || payment.arkAddress || payment.ark || '').trim();
  if (bark) rails.push({ id: 'bark', label: 'Bark', uri: bark, copyValue: bark });

  const lightningUri = String(payment.lightningUri || '');
  const bolt11 = String(payment.bolt11 || '').trim()
    || (lightningUri.toLowerCase().startsWith('lightning:') ? lightningUri.slice('lightning:'.length) : '');
  if (bolt11) {
    rails.push({
      id: 'lightning',
      label: 'Lightning',
      uri: lightningUri.toLowerCase().startsWith('lightning:') ? lightningUri : `lightning:${bolt11}`,
      copyValue: bolt11,
    });
  }
  return rails;
}

export function normaliseStickyText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

/**
 * The framed sheet is the whole world.
 *
 * A board coordinate lands on screen at `view.x + coordinate * scale`, so the rail's outer
 * edge (`-frame` on the left, `canvasWidth + frame` on the right) may sit on the window
 * edge but never inside it - otherwise a reader is looking at board that past the board does
 * not exist. When the framed sheet cannot fill the window, as on a phone at low zoom, it is
 * centred instead of pinned to one edge.
 */
export function clampBoardView(view, viewport, options = {}) {
  const canvasWidth = options.canvasWidth ?? 2600;
  const canvasHeight = options.canvasHeight ?? 1800;
  const frame = options.frame ?? 90;
  const scale = view.scale || 1;
  const minX = -frame;
  const minY = -frame;
  const maxX = canvasWidth + frame;
  const maxY = canvasHeight + frame;
  const spanX = (maxX - minX) * scale;
  const spanY = (maxY - minY) * scale;
  const axis = (position, span, extent, min, max) => {
    if (span <= extent) return (extent - span) / 2 - min * scale;
    return Math.min(-min * scale, Math.max(extent - max * scale, position));
  };
  return {
    scale,
    x: axis(view.x, spanX, viewport.width, minX, maxX),
    y: axis(view.y, spanY, viewport.height, minY, maxY),
  };
}

export function clampPlacement(value, fallback = 0.5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

// A note may be pinned as crooked as this either way. The payment desk enforces the same
// range when it publishes the event, so a tilt the board offers and the desk refuses is a
// pin that fails after the reader has paid — which is why the desk repo's
// deploy/check-frontend-contract.mjs compares these two bounds.
export const ROTATION_MIN = -75;
export const ROTATION_MAX = 75;

export function clampRotation(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(ROTATION_MAX, Math.max(ROTATION_MIN, number)) : 0;
}

function hashtagParts(input) {
  return Array.isArray(input) ? input.map(String) : String(input || '').split(',');
}

/** Why a comma-separated hashtag field cannot publish, or an empty string when it can. */
export function stickyHashtagIssue(input) {
  const tags = [];
  for (const raw of hashtagParts(input)) {
    const tag = raw.trim().replaceAll('#', '').trim();
    if (!tag) continue;
    if (/\s/u.test(tag)) return `“${tag}” has spaces. Use one word for each hashtag.`;
    if (!/^[\p{L}\p{N}_-]+$/u.test(tag)) return `“${tag}” can only use letters, numbers, hyphens, or underscores.`;
    const lower = tag.toLowerCase();
    if (lower !== STICKY_TOPIC && !tags.includes(lower)) tags.push(lower);
  }
  return tags.length > STICKY_HASHTAG_MAX ? `Use no more than ${STICKY_HASHTAG_MAX} hashtags.` : '';
}

/** Clean, unique Nostr t-tag values. Call stickyHashtagIssue() before using the result. */
export function normaliseStickyHashtags(input) {
  if (stickyHashtagIssue(input)) return [];
  return [...new Set(hashtagParts(input)
    .map(raw => raw.trim().replaceAll('#', '').trim().toLowerCase())
    .filter(tag => tag && tag !== STICKY_TOPIC))];
}

export function makeStickyTemplate({content, color, font = 'typewriter', x, y, rotation, geohash, geohashes, exactGeohash = false, anonymous = false, mentions = [], hashtags = [], liveliness = STICKY_DEFAULT_LIVELINESS, createdAt = Math.floor(Date.now() / 1000)}) {
  const text = normaliseStickyText(content);
  if (!text) throw new Error('Write something on the note first.');
  if (stickyNoteLength(text) > STICKY_MAX_CHARACTERS) throw new Error('The note is full.');
  if (!STICKY_COLORS.includes(color)) throw new Error('Choose an available note color.');
  if (!STICKY_FONTS.includes(font)) throw new Error('Choose an available note font.');
  // Mandatory on purpose: a note with no expiry would sit on the relay forever,
  // and the desk refuses one.
  const rung = stickyLiveliness(liveliness);
  if (!rung) throw new Error('Choose how long the note should live: a day, a week, a month, six months or a year.');
  const wanted = mentions.map(key => String(key || '').toLowerCase());
  if (wanted.some(key => !isPubkey(key))) throw new Error('That is not a valid Nostr public key.');
  const mentionProblem = mentionIssue(text, wanted);
  if (mentionProblem) throw new Error(mentionProblem);
  const mentionList = mentionPubkeys(wanted.map(key => [MENTION_TAG, key]));
  const hashtagProblem = stickyHashtagIssue(hashtags);
  if (hashtagProblem) throw new Error(hashtagProblem);
  const hashtagList = normaliseStickyHashtags(hashtags);
  const choice = geohashes ?? geohash;
  const issue = geohashSetIssue(choice);
  if (issue) {
    throw new Error(issue === 'Choose at least one cell.' ? 'Choose a valid geohash board first.' : issue);
  }
  const cells = normaliseGeohashes(choice);
  const primary = cells[0];
  // An exact note names only the cells it sits on; otherwise the boards above each
  // of them are named too, so the note is findable on the wider boards as well.
  // Parents shallower than the shallowest code are not boards and are not named:
  // below three characters a code is a region, and the desk refuses one outright.
  const namedCells = exactGeohash
    ? cells
    : [...new Set(cells.flatMap(cell => geohashPrefixes(cell)))]
      .filter(prefix => prefix.length >= GEOHASH_MIN_LENGTH)
      .sort((left, right) => right.length - left.length);
  const tags = [
    ['t', STICKY_TOPIC],
    ...hashtagList.map(tag => ['t', tag]),
    ['client', 'satoshi.si'],
    ...namedCells.map(prefix => ['g', prefix]),
    ['i', `geo:${primary}`],
    ['k', 'geo'],
    ['geohash', exactGeohash ? 'exact' : 'prefix'],
    ['sticky', STICKY_VERSION, color, clampPlacement(x).toFixed(5), clampPlacement(y).toFixed(5), clampRotation(rotation).toFixed(2), font],
    ...mentionList.map(key => [MENTION_TAG, key]),
    // NIP-40: the moment this note stops existing, relay-side.
    [EXPIRATION_TAG, String(createdAt + rung.seconds)],
    ['alt', 'A Pinstr note pinned on satoshi.si'],
  ];
  if (anonymous) tags.push(['anonymous', '24h-local-key']);
  return {
    kind: STICKY_EVENT_KIND,
    created_at: createdAt,
    content: text,
    tags,
  };
}

export function parseStickyEvent(event) {
  if (!event || event.kind !== STICKY_EVENT_KIND || typeof event.content !== 'string') return null;
  if (event.tags?.filter(tag => tag?.[0] === 't' && tag[1] === STICKY_TOPIC).length !== 1) return null;
  const sticky = event.tags.find(tag => tag?.[0] === 'sticky' && tag[1] === STICKY_VERSION);
  if (!sticky || !STICKY_COLORS.includes(sticky[2])) return null;
  const font = sticky[6] || 'typewriter';
  if (!STICKY_FONTS.includes(font)) return null;
  const content = normaliseStickyText(event.content);
  if (!content || stickyNoteLength(content) > STICKY_MAX_CHARACTERS) return null;
  const named = event.tags.filter(tag => tag?.[0] === 'g').map(tag => normaliseGeohash(tag[1])).filter(Boolean);
  if (!named.length) return null;
  // The deepest tags are the cells the note was pinned to; anything shallower is a
  // board above them, named so the note surfaces there too. Matching the shorter
  // ones as if they were cells would put every note on every ancestor board.
  const depth = Math.max(...named.map(value => value.length));
  const geohashes = [...new Set(named.filter(value => value.length === depth))];
  const uri = event.tags.find(tag => tag?.[0] === 'i' && String(tag[1] || '').startsWith('geo:'))?.[1];
  const namedPrimary = normaliseGeohash(String(uri || '').slice(4));
  const geohash = geohashes.includes(namedPrimary) ? namedPrimary : geohashes[0];
  const scope = event.tags.find(tag => tag?.[0] === 'geohash')?.[1];
  // A note that names no moment is not a note this board shows. Every note is
  // temporary (NIP-40), so one without an expiration tag is either older than the
  // rule or written past the desk — either way it would sit on the relay forever,
  // which is the one thing this board does not publish. Ignored on the way in.
  const expires = Number(event.tags.find(tag => tag?.[0] === EXPIRATION_TAG)?.[1]);
  if (!Number.isFinite(expires) || expires <= 0) return null;
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content,
    color: sticky[2],
    font,
    x: clampPlacement(sticky[3]),
    y: clampPlacement(sticky[4]),
    rotation: clampRotation(sticky[5]),
    geohash,
    geohashes,
    exactGeohash: scope !== 'prefix',
    expiration: Number.isFinite(expires) && expires > 0 ? expires : null,
    anonymous: event.tags.some(tag => tag?.[0] === 'anonymous' && tag[1] === '24h-local-key'),
    mentions: mentionPubkeys(event.tags),
    hashtags: [...new Set(event.tags.filter(tag => tag?.[0] === 't')
      .map(tag => String(tag[1] || '').toLowerCase())
      .filter(tag => tag && tag !== STICKY_TOPIC))].slice(0, STICKY_HASHTAG_MAX),
  };
}

export async function stickyContentHash(content, color, font = 'typewriter', cryptoObject = globalThis.crypto) {
  const text = normaliseStickyText(content);
  if (!text || !STICKY_COLORS.includes(color) || !STICKY_FONTS.includes(font)) throw new Error('The note is incomplete.');
  const bytes = new TextEncoder().encode(`${STICKY_VERSION}\n${color}\n${font}\n${text}`);
  const digest = await cryptoObject.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}


/**
 * What the board texture is made of: the board pixels one tile of the image covers, and the image's
 * own size. Board space is presentation-independent, so the tile is 600 board px at every zoom.
 */
export const BOARD_TILE_PX = 600;
export const BOARD_IMAGE_PX = 400;
/**
 * The board bitmap's own bounds, and the point of this whole exercise: 2048x2048 is 4.2M pixels,
 * which every mobile GPU holds, where a board-sized texture at a phone's 3x ratio is 6144x6144 =
 * 37.7M pixels and comes back from the browser with parts of it empty - the blank, tile-sized
 * squares a phone shows when the whole board is in view. The floor is a floor on redraws, not on
 * quality: below it the bitmap is smaller than any screen the board fills.
 */
export const BOARD_BITMAP_MIN = 1024;
export const BOARD_BITMAP_MAX = 2048;
export const BOARD_BITMAP_STEP = 256;

/**
 * The side of the board bitmap that covers a board of `boardSide` board pixels. It only has to serve
 * the pixels actually on screen - board pixels x the view's scale x the device pixel ratio -
 * rounded to a step so a continuous pinch does not resize it every frame, then bounded above.
 */
export function boardBitmapSize(scale, pixelRatio = 1, boardSide = 2048) {
  const demand = boardSide * Math.max(0, Number(scale) || 0) * Math.max(1, Number(pixelRatio) || 1);
  const stepped = Math.round(demand / BOARD_BITMAP_STEP) * BOARD_BITMAP_STEP;
  return Math.min(BOARD_BITMAP_MAX, Math.max(BOARD_BITMAP_MIN, stepped));
}

/**
 * How far the board image has to be scaled for a bitmap of this side: the tile's spacing in bitmap
 * pixels over the image's own width. Drawing the pattern with it reproduces the 600px tile the sheet
 * used to ask for, so the board keeps its scale and its alignment in board space.
 */
export function boardPatternScale(bitmapSide, boardSide = 2048, imageWidth = BOARD_IMAGE_PX,
                               tile = BOARD_TEXTURE_TILE_PX) {
  const width = Number(imageWidth) > 0 ? Number(imageWidth) : BOARD_IMAGE_PX;
  return (tile / width) * (bitmapSide / boardSide);
}

/**
 * The patterns a reader can put on the board. The first entry is the default: its file sits in
 * img/ beside its own attribution, and any pattern added here needs the same, because a
 * texture's licence travels with the image.
 */
export const BOARD_TEXTURES = Object.freeze([
  Object.freeze({id: 'cork', label: 'Cork', url: '/img/board-cork.png'}),
  Object.freeze({id: 'cartographer', label: 'Cartographer', url: '/img/board-cartographer.png'}),
  Object.freeze({id: 'carbon-fibre', label: 'Carbon fibre', url: '/img/board-carbon-fibre.png', tile: 96}),
  Object.freeze({id: 'christmas-dark', label: 'Christmas dark', url: '/img/board-christmas-dark.png'}),
  Object.freeze({id: 'christmas', label: 'Christmas', url: '/img/board-christmas.png'}),
  Object.freeze({id: 'dot-grid', label: 'Dot grid', url: '/img/board-dot-grid.jpg'}),
  Object.freeze({id: 'natural-black', label: 'Natural black', url: '/img/board-natural-black.png'}),
]);

export const DEFAULT_BOARD_TEXTURE_URL = BOARD_TEXTURES[0].url;

/**
 * The board pixels one tile of a pattern covers. A pattern painted at its file's own size would
 * tile as densely as its file happens to be - a 24px weave repeating twenty-five times inside one
 * cork tile - so a pattern may name the size it is painted at, and everything else keeps the 600
 * board px the board has tiled at since it was built.
 */
export const BOARD_TEXTURE_TILE_PX = 600;

/** The tile a pattern is painted at: its own if it names one, else the board's usual tile. */
export function boardTextureTile(texture) {
  const tile = Number(texture?.tile);
  return Number.isFinite(tile) && tile > 0 ? tile : BOARD_TEXTURE_TILE_PX;
}

/** Long enough for a real image address, short enough that a paste of a file cannot get in. */
export const BOARD_TEXTURE_URL_MAX = 2048;

/**
 * A pattern address a reader typed, or '' when it is not one this page will paint with. Only
 * http(s) and this site's own paths pass through: a `data:` URL is a hole in the shape of an
 * image, a `javascript:` one is not an image at all, and neither belongs in a style rule. The
 * value goes through the URL parser, which also resolves what a bare string hides - a newline
 * inside a scheme included.
 */
export function boardTextureUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > BOARD_TEXTURE_URL_MAX) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
  return parsed.href;
}

/**
 * What to call a pattern: the name in the catalogue, the file name for a path on this site, and
 * the host for a pattern linked from somewhere else.
 */
export function boardTextureLabel(url) {
  const named = BOARD_TEXTURES.find(texture => texture.url === url);
  if (named) return named.label;
  let parsed;
  try {
    parsed = new URL(String(url), 'https://satoshi.si');
  } catch {
    return 'That pattern';
  }
  const file = parsed.pathname.split('/').filter(Boolean).pop();
  if (!file) return parsed.host || 'That pattern';
  return parsed.host === 'satoshi.si' ? file : `${file} on ${parsed.host}`;
}


/**
 * The engraved line on the board's plate is one size for the whole string. The plate is a small,
 * fixed plaque, so the cells are set as large as they go and then cut down together until the line
 * fits: a board covering more cells gets smaller letters, never a bigger plate.
 */
export function boardPlateFontSize(innerWidth, measuredWidth, maximum) {
  if (!(innerWidth > 0) || !(measuredWidth > 0)) return maximum;
  return Math.min(maximum, maximum * (innerWidth / measuredWidth));
}
