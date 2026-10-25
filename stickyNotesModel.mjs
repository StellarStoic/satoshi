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
// One note from a key with no name to offer: the same 10 sats a week of posting costs, because the
// trade the tier offers is exactly that — put a name on your key and it is free, or pay for a note.
// Agents over MCP are priced here too: a program pays per note whatever name it carries.
export const STICKY_ANONYMOUS_PRICE_SATS = 10;
// D's ladder: how short a satoshi.si name is decides how much of a plan it pays.
// Three characters post free, four pay half, five or more pay three quarters. This
// is the board's copy of the desk's table, and `deploy/check-frontend-contract.mjs`
// compares the two rung by rung. `maxNameLength: null` is the open-ended top tier.
export const STICKY_MEMBER_TIERS = Object.freeze([
  Object.freeze({ maxNameLength: 3, offPercent: 100 }),
  Object.freeze({ maxNameLength: 4, offPercent: 50 }),
  Object.freeze({ maxNameLength: null, offPercent: 25 }),
]);

/** All prices this service charges, so nothing else can be displayed as one. */
export const STICKY_KNOWN_PRICES = Object.freeze([...new Set([
  0,
  STICKY_ANONYMOUS_PRICE_SATS,
  STICKY_SUB_WEEK_SATS,
  STICKY_SUB_YEAR_SATS,
  STICKY_SUB_MEMBER_WEEK_SATS,
  STICKY_SUB_MEMBER_YEAR_SATS,
  // Every tier's price for both plans. Leave one out and a member's own order is
  // read back as the list price: 7 and 308 are as real as 5 and 205.
  ...STICKY_MEMBER_TIERS.flatMap(tier => [
    stickyTierPrice('week', tier.offPercent),
    stickyTierPrice('year', tier.offPercent),
  ]),
])]);
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
// A note is temporary on this board. Every one carries the NIP-40 expiration
// tag, and our relay stops serving it once that moment passes. Other Nostr
// relays and clients may retain copies of the public event.
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

/** The NIP-40 moment a note written then stops being shown on this board. */
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

// ------------------------------------------------------------ pinned pictures
// A picture is pinned as an address, never as pixels: the desk downscales it, strips its
// metadata, writes a WebP and applies the vintage grade, and the note carries only the
// address the desk hands back. What travels in the note is therefore one small tag, and
// the board draws whatever that address serves — the same way a link is an address in the
// text rather than the page behind it.
export const STICKY_IMAGE_TAG = 'image';               // ["image", "<the address the desk handed back>"]
// The address a stored print is served from: hash-named, WebP, and deliberately NOT
// satoshi.si. satoshi.si is GitHub Pages, which serves files out of a repository and cannot
// run the desk, so /i/ there would 404 — the prints are served by the payment host's own
// origin instead, which is the one host that really has them. On the pinstr.si copy of this
// board that also makes the picture same-origin with the page that draws it.
export const STICKY_IMAGE_ORIGIN = 'https://pinstr.si';
export const STICKY_IMAGE_PATH = '/i/';
// What a picture may weigh before it is refused here, so a 40 MB phone photo never leaves
// the device and never occupies the reader's uplink while an order waits. The desk has its
// own ceiling; this is the guard the page owes the reader before it spends their bytes.
export const STICKY_IMAGE_MAX_BYTES = 7 * 1024 * 1024;
/**
 * The six grades a writer may choose between, in the order the composer offers them. The id
 * is the whole contract with the desk — it names the look and travels in the upload query —
 * and the label is what the reader reads. The desk bakes the grade into the stored picture,
 * so no note has to carry it and the board does not have to know it.
 *
 * `filter`, `grain` and `tint` are how the composer draws that grade on its own sample
 * picture: a mockup of the look, made in the browser, so the choice can be made before
 * anything is sent and with no picture of the reader's ever leaving the device.
 */
// Five looks, and no ungraded one: a print is a treated picture, so "as it was taken" is not a
// look a reader may pin. The desk refuses `original` for the same reason, and the two lists are
// checked against each other.
export const STICKY_IMAGE_GRADES = Object.freeze([
  Object.freeze({id: 'sepia', label: 'Sepia', filter: 'sepia(.78) contrast(1.05)', grain: .12, tint: 'rgba(112,74,32,.1)'}),
  Object.freeze({id: 'faded', label: 'Faded instant print', filter: 'sepia(.42) saturate(.7) brightness(1.16) contrast(.82)', grain: .1, tint: 'rgba(255,244,220,.16)'}),
  Object.freeze({id: 'grain', label: 'Heavy grain', filter: 'contrast(1.3) saturate(.6) brightness(1.04)', grain: .55, tint: ''}),
  Object.freeze({id: 'bw', label: 'Black and white', filter: 'grayscale(1) contrast(1.15)', grain: .18, tint: ''}),
  Object.freeze({id: 'cool', label: 'Cool cyan', filter: 'hue-rotate(-25deg) saturate(1.25) brightness(1.03)', grain: .1, tint: 'rgba(36,124,156,.18)'}),
]);
export const STICKY_IMAGE_DEFAULT_GRADE = 'sepia';

/** The grade with this id, or null when nothing here is called that. */
export function stickyImageGrade(id) {
  return STICKY_IMAGE_GRADES.find(grade => grade.id === String(id || '')) || null;
}

function imageMegabytes(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(1));
}

/**
 * Why a chosen picture may not be uploaded yet, or an empty string when it may. Measured
 * before a single byte is sent, so the refusal costs the reader nothing.
 */
export function stickyImageIssue(size, max = STICKY_IMAGE_MAX_BYTES) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'That picture is empty. Choose another one.';
  if (bytes > max) {
    return `That picture weighs ${imageMegabytes(bytes)} MB and the most one may weigh is ${imageMegabytes(max)} MB. Choose a smaller one.`;
  }
  return '';
}

/**
 * The address of a stored print, normalised, or '' when it is not one this board will draw.
 * Only an https address under the print host's own print path survives: a note is public and
 * its tag is whatever a signer was handed, so nothing else may be rendered as a picture here.
 * satoshi.si is accepted on the way in, because a note signed before the prints moved there
 * would have carried it, but it is normalised onto the host that actually serves them.
 */
export function stickyImageUrl(value) {
  const raw = String(value || '').trim();
  const match = /^https:\/\/(?:www\.)?(?:pinstr\.si|satoshi\.si)\/i\/([0-9a-z]+)\.webp$/i.exec(raw);
  return match ? `${STICKY_IMAGE_ORIGIN}${STICKY_IMAGE_PATH}${match[1].toLowerCase()}.webp` : '';
}

/**
 * The print a picture address names: the 64-hex hash in `https://<print host>/i/<hash>.webp`, or
 * an empty string for anything else.
 *
 * The desk's twin of this function decides whether a paid order may publish the note it is handed,
 * by comparing this hash against the print it stored for that order. So the two sides have to agree
 * on exactly what an address is, and they do: the same host list, the same shape, and a hash whose
 * case does not matter.
 */
export function stickyPictureToken(value) {
  const match = /^https:\/\/(?:www\.)?(?:pinstr\.si|satoshi\.si)\/i\/([0-9a-f]{64})\.webp$/i
    .exec(String(value || '').trim());
  return match ? match[1].toLowerCase() : '';
}

// Codes are 3 to 9 characters: below 3 the cell is a region rather than a
// useful board, and 9 is as deep as the grid is useful. Within that range a board may
// be a clump of touching cells, which is what lets one note cover a building
// that straddles two or three cells — a cell is what a note is pinned to, and
// a clump is still one note on one price.
export const GEOHASH_MIN_LENGTH = 3;
export const GEOHASH_MAX_LENGTH = 9;
export const GEOHASH_MAX_CELLS = 9;
// How far in the reader's own board setting lets a board look. A cell is three to nine characters,
// so six levels is the whole range a cell has under it and the deepest a board can reach: the eleven
// this used to allow was never a number of levels any cell could have, and a stored eleven comes back
// as the deepest real one rather than as a rung no board is.
export const GEOHASH_MAX_BOARD_DEPTH = GEOHASH_MAX_LENGTH - GEOHASH_MIN_LENGTH;
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
  const levels = Math.max(0, Math.min(GEOHASH_MAX_BOARD_DEPTH, Number.parseInt(depth, 10) || 0));
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

/** A plan's price at a discount, floored: a tier never rounds up past its own share. */
export function stickyTierPrice(plan, offPercent) {
  const base = plan === 'year' ? STICKY_SUB_YEAR_SATS : STICKY_SUB_WEEK_SATS;
  const off = Number.isFinite(offPercent) ? Math.min(Math.max(offPercent, 0), 100) : 0;
  return Math.floor(base * (100 - off) / 100);
}

/** The tier a name of this length is in, or null when there is no name. */
/**
 * How a free-tier name is described, or null when the reader's own price is not zero.
 *
 * A three-letter name never pays and never renews, and the account dialog used to say nothing about it: the
 * card read "Not active", which is true of a subscription and false of the plan the reader is actually on. The
 * desk decides this - `prices.free` comes from the reader's own quote, so the page never guesses a tier.
 */
export function subscriptionFreeOffer(prices = {}) {
  if (!prices || prices.free !== true) return null;
  const nameLength = Number.isInteger(prices.memberNameLength) ? prices.memberNameLength : null;
  return {
    label: 'Free for life',
    nameLength,
    sentence: nameLength
      ? `Your ${nameLength}-letter name is free for life: nothing to pay, and nothing to renew.`
      : 'Free for life: nothing to pay, and nothing to renew.',
  };
}

export function stickyMemberTier(nameLength) {
  if (!Number.isInteger(nameLength) || nameLength < 1) return null;
  return STICKY_MEMBER_TIERS.find(t => t.maxNameLength === null || nameLength <= t.maxNameLength)
    || STICKY_MEMBER_TIERS[STICKY_MEMBER_TIERS.length - 1];
}

/**
 * What a plan costs this buyer.
 *
 * `offPercent` is the desk's own answer for this pubkey and wins whenever it is
 * there. `member` alone is the older shape — half price — and is kept so the page
 * still shows the right number against a desk that has not been updated yet.
 * Null for a plan that does not exist.
 */
/**
 * The mining difficulty the desk published, or null.
 *
 * Read from the same config that carries the subscription prices, so the board offers the
 * number of bits that desk will actually check, and a board that cannot reach the config
 * simply does not offer mining rather than inventing a difficulty.
 */
export function stickyPowDifficulty(config) {
  const bits = config?.pow?.bits;
  return Number.isInteger(bits) && bits > 0 && bits <= 64 ? bits : null;
}

export function stickySubscriptionPrice(plan, { member = false, offPercent = null } = {}) {
  if (plan !== 'week' && plan !== 'year') return null;
  if (Number.isFinite(offPercent)) return stickyTierPrice(plan, offPercent);
  return stickyTierPrice(plan, member ? 50 : 0);
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
 * Why this buyer's price is what it is, in one sentence.
 *
 * `offPercent` is the desk's own answer for this key, so the sentence can never
 * claim a discount the desk will not charge.
 */
export function stickyDiscountSentence({ member = false, offPercent = 0 } = {}) {
  if (!member) {
    return 'Satoshi.si names pay less: a 3-character name posts free, 4 characters take 50% off, '
      + '5 or more take 25% off.';
  }
  if (offPercent >= 100) return 'Pinstr is free for a 3-character satoshi.si name.';
  if (offPercent === 50) return 'Your satoshi.si name takes 50% off.';
  return `Your satoshi.si name takes ${offPercent}% off.`;
}

/**
 * What the composer's buttons say. Kept as a pure function of the desk's
 * /pinstr/v1/subscription answer so the wording can be tested without a DOM.
 *
 * `anonymous` is the identity mode in play, and `plan` is the plan the picker is
 * on — a buyer with no subscription is offered "subscribe and post" as one action
 * rather than a detour they have to repeat.
 */
/**
 * Is this key priced as a throwaway?
 *
 * The desk decides: a key with no satoshi.si name and no profile on the big relays
 * comes back marked `anonymous`, because the board can mint such a key in a second
 * and the cheapest week would otherwise be the cheapest way to post forever. The
 * board's own anonymous mode counts too, and is the same thing to the pricing code.
 */
export function anonymousForQuote(session, subscription) {
  if (!session) return false;
  if (session.method === 'anonymous') return true;
  return Boolean(subscription && subscription.anonymous === true);
}

/**
 * Today's free allowance, said the way a reader needs it: what they have pinned, and what is left.
 *
 * The desk counts it (`freeNotes` on the subscription route) and this only puts it into words; a
 * missing or malformed count returns null, because a meter that invents a number is worse than no
 * meter at all. `tone` is for the styling only: a spent allowance should look spent, and a nearly
 * spent one should not look settled.
 */
export function stickyFreeNotesLine(freeNotes) {
  const limit = Number(freeNotes?.limit);
  const used = Number(freeNotes?.used);
  if (!Number.isInteger(limit) || !Number.isInteger(used) || limit <= 0 || used < 0) return null;
  const remaining = Number.isInteger(freeNotes?.remaining) ? freeNotes.remaining : Math.max(0, limit - used);
  const resetsAt = Number.isFinite(Number(freeNotes?.resetsAt)) && Number(freeNotes.resetsAt) > 0
    ? Number(freeNotes.resetsAt) : null;
  const clock = resetsAt ? new Date(resetsAt * 1000).toISOString().slice(11, 16) : '';
  const pinned = used === 1 ? 'You pinned 1 note' : `You pinned ${used} notes`;
  if (remaining <= 0) {
    return {
      used, limit, remaining: 0, tone: 'spent',
      head: `${used} of ${limit} used`,
      sentence: `${pinned} and the day's free allowance is spent.`
        + (clock ? ` The oldest falls off at ${clock} UTC, one note at a time.` : ''),
    };
  }
  return {
    used, limit, remaining,
    tone: remaining <= Math.ceil(limit / 10) ? 'low' : 'fine',
    head: `${used} of ${limit} used`,
    sentence: `${pinned} · ${remaining} left of ${limit} a day.`,
  };
}

export function describeStickyAction({ anonymous = false, stranger = false, subscription = null, plan = 'week',
  nip05 = '' } = {}) {
  const prices = subscription?.prices || {};
  const member = Boolean(prices.member);
  // The desk answers with this key's own tier. The board's ladder is only the
  // fallback, so a name length the desk did not send cannot invent a price.
  const offPercent = member
    ? (Number.isFinite(prices.memberOffPercent)
      ? prices.memberOffPercent
      : (stickyMemberTier(prices.memberNameLength) || STICKY_MEMBER_TIERS[1]).offPercent)
    : 0;
  const week = (Number.isInteger(prices.weekSats) ? prices.weekSats : null) ?? stickySubscriptionPrice('week', { offPercent });
  const year = (Number.isInteger(prices.yearSats) ? prices.yearSats : null) ?? stickySubscriptionPrice('year', { offPercent });
  const active = Boolean(subscription?.active);
  const until = stickyDay(subscription?.expiresAt);
  const discount = stickyDiscountSentence({ member, offPercent });

  if (anonymous) {
    // A key the desk does not recognise is priced like a throwaway, but calling it
    // "post anonymously" would be a lie: the reader is signed in with their own key,
    // the desk has simply never seen it anywhere else.
    return {
      label: stranger
        ? `One note · ${STICKY_ANONYMOUS_PRICE_SATS} sats`
        : `Post anonymously · ${STICKY_ANONYMOUS_PRICE_SATS} sats`,
      state: stranger
        ? `This key is new here: no satoshi.si name and no profile on the big relays. It can pin one note for ${STICKY_ANONYMOUS_PRICE_SATS} sats, and a subscription is not for sale to it.`
        : `Anonymous post: ${STICKY_ANONYMOUS_PRICE_SATS} sats. One key can post one note and cannot buy a weekly or yearly subscription.`,
      needsSubscription: false,
      price: STICKY_ANONYMOUS_PRICE_SATS,
      active: false,
      member: false,
      offPercent: 0,
      week,
      year,
    };
  }

  // A name that answers for this key is the free door, and it is the only thing a reader with no
  // subscription needs. The board cannot verify it itself — that is a question for the reader's own
  // domain, asked by the desk when the note is placed — so the copy promises the check rather than
  // the result, and the price that comes back with the order is the one that decides.
  // A subscription is the better thing to show when there is one: it was paid for, and the reader
  // should see the time it has left rather than a door they no longer need.
  const name = active ? '' : String(nip05 || '').trim();
  if (name) {
    return {
      label: 'Place your note',
      state: `${name} makes this note free: the site asks your domain when you place it, and nothing `
        + 'is charged when the answer names this key.',
      needsSubscription: false,
      price: 0,
      active: false,
      nip05: name,
      member,
      offPercent,
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
      offPercent,
      week,
      year,
    };
  }

  const price = stickySubscriptionPrice(plan, {offPercent});
  const freeTier = week === 0 && year === 0;
  return {
    // "0 sats" reads like a broken price; a free plan is free, and the desk says so.
    label: price === 0 ? 'Subscribe & pin · free' : `Subscribe & pin · ${price} sats`,
    state: freeTier
      ? `${discount} Press the button and the time is yours — nothing to pay.`
      : `Posting needs a subscription: ${week} sats a week or ${year} sats a year. ${discount}`,
    needsSubscription: true,
    price,
    active: false,
    member,
    offPercent,
    week,
    year,
  };
}

export const STICKY_RAILS = Object.freeze(['unified', 'ark', 'lightning', 'onchain']);

/**
 * The payment choices in display order: one combined request first, followed by
 * the individual Ark, Lightning, and on-chain fallbacks that the order supports.
 *
 * A rail appears only when the payment service actually handed back a destination
 * for it, so an Ark-only or Lightning-only order keeps a single-rail checkout
 * instead of showing a tab that cannot pay. `uri` is what the QR encodes, and
 * `copyValue` is what the buyer pastes into a wallet.
 */
/**
 * Whether this session may post by mining instead of paying, and what the board says.
 *
 * Mining is offered to a key with a NIP-05 name of its own — on any domain, not only
 * satoshi.si — and never to a throwaway anonymous identity, whose price is sats per note
 * and whose whole point is that it has no name to mine under. That is a presentation rule,
 * not an enforced one: no desk can resolve a name on somebody else's domain without
 * fetching a stranger's address on request. What the desk enforces is the work, and the
 * work is the part that cannot be faked — it is counted from the event's own id.
 *
 * `reason` is the honest answer when the offer does not appear, so the page can explain
 * rather than silently omit a route the reader has heard about.
 */
export function stickyPowOffer({ method = '', nip05 = '', bits = null } = {}) {
  if (method === 'anonymous') {
    return { offered: false, reason: 'anonymous',
      sentence: 'A temporary anonymous identity pays per note — mining is for NIP-05 names.' };
  }
  if (!getNip05Name(nip05)) {
    return { offered: false, reason: 'no_name',
      sentence: 'Add a NIP-05 name to your Nostr profile and you can post free by mining instead.' };
  }
  if (!Number.isInteger(bits) || bits <= 0 || bits > 64) {
    return { offered: false, reason: 'no_difficulty',
      sentence: 'The payment service has not published a mining difficulty, so it is not offered.' };
  }
  return { offered: true, reason: '', bits, name: getNip05Name(nip05).toLowerCase(), sentence: stickyPowSentence(bits) };
}

/** The label a NIP-05 name is shown under: the name and its domain, without the wildcard. */
function getNip05Name(value) {
  const name = String(value || '').trim().replace(/^https?:\/\//, '');
  return name.includes('@') && !name.startsWith('@') ? name : '';
}

/** What mining costs in plain words: the expected tries, and what that is worth in minutes. */
export function stickyPowSentence(bits) {
  const tries = Math.round(2 ** bits);
  const millions = tries >= 1e6 ? `${Math.round(tries / 1e6)} million` : `${tries}`;
  return `Free with POW: mine about ${millions} hashes on your own device — a few minutes `
    + 'with this page open, and nothing to pay.';
}

/**
 * The line shown while a note is being mined. Progress is honest about what is known: the
 * best difficulty seen so far, and an estimate that only appears once a rate can be measured.
 */
export function stickyPowProgress({ hashes = 0, rate = 0, secondsLeft = null, best = 0, bits = 25 } = {}) {
  const done = Number.isFinite(hashes) && hashes > 0 ? `${Math.round(hashes / 1000)}k hashes` : 'starting';
  const share = Number.isFinite(best) ? `best ${best} of ${bits} bits` : '';
  const wait = secondsLeft === 'a moment' || !secondsLeft ? ''
    : ` — about ${secondsLeft} left`;
  return `Mining this note: ${done}, ${share}${wait}. Keep this page open.`;
}

export function stickyPaymentRails(order) {
  const payment = order?.payment || {};
  const paymentLink = String(payment.paymentLink || '').trim();
  const match = paymentLink.match(/^bitcoin:([^?]*)(?:\?(.*))?$/i);
  const address = String(payment.onchainAddress || payment.bitcoinAddress || match?.[1] || '').trim();
  const linkParams = new URLSearchParams(match?.[2] || '');
  const arkAddress = String(payment.arkAddress || payment.ark || linkParams.get('ark') || '').trim();

  const lightningUri = String(payment.lightningUri || '');
  const bolt11 = String(payment.bolt11 || '').trim()
    || (lightningUri.toLowerCase().startsWith('lightning:') ? lightningUri.slice('lightning:'.length) : '')
    || String(linkParams.get('lightning') || '').trim();

  const explicitSats = Number(order?.sats ?? payment.sats ?? payment.amountSats);
  const amount = String(linkParams.get('amount') || (
    Number.isSafeInteger(explicitSats) && explicitSats > 0 ? (explicitSats / 1e8).toFixed(8) : ''
  ));
  const bitcoinUri = (baseAddress, params) => {
    const query = new URLSearchParams();
    if (amount) query.set('amount', amount);
    for (const [key, value] of params) if (value) query.set(key, value);
    const suffix = query.toString();
    return `bitcoin:${baseAddress || ''}${suffix ? `?${suffix}` : ''}`;
  };

  const rails = [];
  if (arkAddress) {
    const uri = bitcoinUri('', [['ark', arkAddress]]);
    rails.push({id: 'ark', label: 'Ark', uri, copyValue: uri});
  }
  if (bolt11) {
    rails.push({
      id: 'lightning',
      label: 'Lightning',
      uri: lightningUri.toLowerCase().startsWith('lightning:') ? lightningUri : `lightning:${bolt11}`,
      copyValue: bolt11,
    });
  }
  if (address) {
    const uri = bitcoinUri(address, []);
    rails.push({id: 'onchain', label: 'On-chain', uri, copyValue: uri});
  }

  if (rails.length > 1) {
    const combined = bitcoinUri(address, [['ark', arkAddress], ['lightning', bolt11]]);
    rails.unshift({id: 'unified', label: 'Any wallet', uri: combined, copyValue: combined, unified: true});
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

export function makeStickyTemplate({content, color, font = 'typewriter', x, y, rotation, geohash, geohashes, exactGeohash = false, anonymous = false, mentions = [], hashtags = [], image = '', liveliness = STICKY_DEFAULT_LIVELINESS, paid = '', createdAt = Math.floor(Date.now() / 1000)}) {
  const text = normaliseStickyText(content);
  // Words are what a written note is; a pinned picture is the note itself and needs none.
  // With neither the note would be blank paper, which is what the desk refuses too.
  if (!text && !image) throw new Error('Write something on the note first.');
  if (stickyNoteLength(text) > STICKY_MAX_CHARACTERS) throw new Error('The note is full.');
  if (!STICKY_COLORS.includes(color)) throw new Error('Choose an available note color.');
  if (!STICKY_FONTS.includes(font)) throw new Error('Choose an available note font.');
  // Mandatory on purpose: without it our board and relay would keep serving the note.
  const rung = stickyLiveliness(liveliness);
  if (!rung) throw new Error('Choose how long satoshi.si should show the note: a day, a week, a month, six months or a year.');
  const wanted = mentions.map(key => String(key || '').toLowerCase());
  if (wanted.some(key => !isPubkey(key))) throw new Error('That is not a valid Nostr public key.');
  const mentionProblem = mentionIssue(text, wanted);
  if (mentionProblem) throw new Error(mentionProblem);
  const mentionList = mentionPubkeys(wanted.map(key => [MENTION_TAG, key]));
  const hashtagProblem = stickyHashtagIssue(hashtags);
  if (hashtagProblem) throw new Error(hashtagProblem);
  const hashtagList = normaliseStickyHashtags(hashtags);
  // A picture rides in one tag beside the text, never inside it: the desk stored the WebP
  // this address names, so the note stays the small event it has always been and the reader's
  // browser fetches the picture from the site rather than from the relay. An address that is
  // not one the print host serves under /i/ is refused rather than written into a public event.
  const picture = image ? stickyImageUrl(image) : '';
  if (image && !picture) throw new Error(`That picture address is not one ${STICKY_IMAGE_ORIGIN} serves.`);
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
  // The badge word the desk handed over with the order, checked here where the writer's own
  // browser notices a mistake, and checked again by the desk in the published event. A word
  // this board does not draw is refused rather than published: an unreadable badge on a note
  // is worse than a missing one, because it looks like a payment.
  const badge = paid ? stickyPaymentBadge(paid) : null;
  if (paid && !badge) throw new Error(`"${paid}" is not a way this desk sells a note.`);
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
    ...(badge ? [[STICKY_PAYMENT_TAG, badge.id]] : []),
    ...(picture ? [[STICKY_IMAGE_TAG, picture]] : []),
    ...mentionList.map(key => [MENTION_TAG, key]),
    // NIP-40: the moment our relay stops serving its copy.
    [EXPIRATION_TAG, String(createdAt + rung.seconds)],
    ['alt', picture ? 'A picture pinned on this board' : 'A Pinstr note pinned on satoshi.si'],
  ];
  if (anonymous) tags.push(['anonymous', '24h-local-key']);
  return {
    kind: STICKY_EVENT_KIND,
    created_at: createdAt,
    content: text,
    tags,
  };
}

/**
 * The pins that are buried under other notes.
 *
 * A board piles notes up, so a note can end up with its paper behind a later one and its pin —
 * the only way into it — behind that pin too. This decides which notes are in that state from
 * geometry alone, so it can be checked without a browser: each note is passed its own box in
 * board coordinates and the order the board draws them in, and a note counts as covered when
 * the notes drawn after it (so, on top) hide at least `share` of it.
 *
 * The overlaps are summed pairwise and so may count one spot twice when two notes share it.
 * That is deliberate: a spot under two notes is more covered, not less, and this answers
 * whether a way in is needed rather than measuring paper. The boxes the page passes are the
 * notes' unrotated footprints — a rotation is not worth trigonometry here, because the answer
 * only decides which pins get a stand-in.
 */
export const PIN_COVERED_SHARE = 0.2;

/** How long one note stays in front after its pin is used, in milliseconds. */
export const PIN_RAISE_MS = 21000;

/** The ids of the notes hidden enough by the notes above them to need a reachable pin. */
export function coveredPinNotes(notes, {share = PIN_COVERED_SHARE} = {}) {
  const boxes = (notes || []).map((note, index) => ({id: note?.id || '', index, box: note?.box}))
    .filter(entry => entry.id && entry.box
      && ['left', 'top', 'width', 'height'].every(key => Number.isFinite(entry.box[key]))
      && entry.box.width > 0 && entry.box.height > 0);
  return boxes.filter(note => {
    const area = note.box.width * note.box.height;
    const hidden = boxes.reduce((sum, other) => (other.index > note.index
      ? sum + overlapArea(note.box, other.box) : sum), 0);
    return hidden >= area * share;
  }).map(note => note.id);
}

/** The area two boxes share, or zero when they do not meet. */
function overlapArea(a, b) {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * How a note was paid for, as the badge its own foot carries.
 *
 * The desk decides this word, not the board: the desk is the only side that knows what an
 * order actually cost, so it hands the word over with the order and checks the same word in
 * the event at publish time. This list is therefore the board's half of one vocabulary — an
 * icon per word, and a sentence saying what the word claims — and `stickyPaymentBadge`
 * refuses anything outside it, so a foreign client's invented badge draws nothing at all on
 * this board rather than drawing a payment that was never made.
 *
 * `icon` is a Lineicons class the page already loads; the font is shipped, not fetched.
 */
export const STICKY_PAYMENT_TAG = 'paid';
export const STICKY_PAYMENT_BADGES = [
  { id: 'pow', icon: 'lni-hammer-1', label: 'Mined',
    title: 'Mined, not bought: this note\u2019s own id carries the work instead of a payment.' },
  { id: 'bitcoin', icon: 'lni-bitcoin', label: 'Bitcoin',
    title: 'Paid for with Bitcoin: a subscription covering it, or a per-note post in sats.' },
  { id: 'cash', icon: 'lni-dollar-circle', label: 'Cash',
    title: 'Paid for in cash.' },
];

/** The badge for a word read out of an event, or null when this board does not draw it. */
export function stickyPaymentBadge(value) {
  const id = String(value || '').trim().toLowerCase();
  return STICKY_PAYMENT_BADGES.find(badge => badge.id === id) || null;
}

export function parseStickyEvent(event) {
  if (!event || event.kind !== STICKY_EVENT_KIND || typeof event.content !== 'string') return null;
  if (event.tags?.filter(tag => tag?.[0] === 't' && tag[1] === STICKY_TOPIC).length !== 1) return null;
  const sticky = event.tags.find(tag => tag?.[0] === 'sticky' && tag[1] === STICKY_VERSION);
  if (!sticky || !STICKY_COLORS.includes(sticky[2])) return null;
  const font = sticky[6] || 'typewriter';
  if (!STICKY_FONTS.includes(font)) return null;
  const content = normaliseStickyText(event.content);
  // The picture the note points at, read through the same door as it is written through:
  // an address outside the site's own print path is dropped, so a note drawn from an
  // untrusted relay cannot make this board fetch a picture from somewhere else.
  const image = stickyImageUrl(event.tags.find(tag => tag?.[0] === STICKY_IMAGE_TAG)?.[1]);
  // A published note carries words, or a picture, or both — a pinned picture is the note
  // itself and may have no words at all. Anything with neither is not a note this board shows.
  // A picture note carries its print's own address as its content, which is what makes any other
  // Nostr client show the picture rather than an empty note. On this board that address is not
  // words: a print is the picture and a signature with nothing printed on it. So a note whose
  // content is simply its own picture's address parses with no words at all, and every place that
  // draws a note's words — the paper, the note menu, the ledger — draws none for it. The picture
  // is required for this: without one there is no address for the content to be, and an empty
  // token would otherwise match an ordinary note's words and silence every note on the board.
  const words = image && content && stickyPictureToken(content) === stickyPictureToken(image)
    ? '' : content;
  if ((!words && !image) || stickyNoteLength(words) > STICKY_MAX_CHARACTERS) return null;
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
  // A note that names no cutoff is not a note this board shows. This is a local
  // display and relay-retention rule, not a claim that other Nostr copies vanish.
  const expires = Number(event.tags.find(tag => tag?.[0] === EXPIRATION_TAG)?.[1]);
  if (!Number.isFinite(expires) || expires <= 0) return null;
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content: words,
    color: sticky[2],
    font,
    x: clampPlacement(sticky[3]),
    y: clampPlacement(sticky[4]),
    rotation: clampRotation(sticky[5]),
    geohash,
    geohashes,
    image,
    exactGeohash: scope !== 'prefix',
    expiration: Number.isFinite(expires) && expires > 0 ? expires : null,
    anonymous: event.tags.some(tag => tag?.[0] === 'anonymous' && tag[1] === '24h-local-key'),
    // Null for a note that says nothing, and null for a word this board does not draw.
    paid: stickyPaymentBadge(event.tags.find(tag => tag?.[0] === STICKY_PAYMENT_TAG)?.[1])?.id || null,
    mentions: mentionPubkeys(event.tags),
    hashtags: [...new Set(event.tags.filter(tag => tag?.[0] === 't')
      .map(tag => String(tag[1] || '').toLowerCase())
      .filter(tag => tag && tag !== STICKY_TOPIC))].slice(0, STICKY_HASHTAG_MAX),
  };
}

export async function stickyContentHash(content, color, font = 'typewriter', cryptoObject = globalThis.crypto, { picture = false } = {}) {
  const text = normaliseStickyText(content);
  // The commitment that is paid for. A written note must say something; a pinned picture is
  // the note itself, so with no words it commits to the picture instead — the desk checks the
  // same emptiness on its side, against the order that already holds the stored print.
  if ((!text && !picture) || !STICKY_COLORS.includes(color) || !STICKY_FONTS.includes(font)) throw new Error('The note is incomplete.');
  const bytes = new TextEncoder().encode(`${STICKY_VERSION}\n${color}\n${font}\n${text}`);
  const digest = await cryptoObject.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The digest of the picture file the reader picked, as the desk's pay-once rule needs it.
 *
 * Deliberately not part of what is paid for, and never checked against the stored print:
 * uploading re-encodes the picture, so the stored bytes are not these bytes and the two digests
 * can never agree. It is sent for one reason — with no words a picture note commits to nothing
 * but the paper and the font, so without it the desk cannot tell two wordless pictures apart and
 * would refuse the second one as "already pinned" while the first was still live.
 */
export async function stickyPictureDigest(file, cryptoObject = globalThis.crypto) {
  const digest = await cryptoObject.subtle.digest('SHA-256', new Uint8Array(await file.arrayBuffer()));
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
  // Fifteen more from the same collection. A tile names the board pixels one repeat covers, chosen
  // near twice each file's own width and fenced at the 96 the carbon fibre already uses and at the
  // usual 600: a 42px weave blown up to 600 reads as cloth rather than weave, while a 400px photo at
  // 600 is the scale the collection is meant to be seen at. Entries keeping the usual tile name
  // none. img/board-textures.LICENSE.txt carries the credit each of these has to keep.
  Object.freeze({id: 'fancy-cushion', label: 'Fancy cushion', url: '/img/board-fancy-cushion.png'}),
  Object.freeze({id: 'wheat', label: 'Wheat', url: '/img/board-wheat.png'}),
  Object.freeze({id: 'folk-pattern-black', label: 'Folk black', url: '/img/board-folk-pattern-black.png'}),
  Object.freeze({id: 'folk-pattern', label: 'Folk', url: '/img/board-folk-pattern.png'}),
  Object.freeze({id: 'bananas', label: 'Bananas', url: '/img/board-bananas.png'}),
  Object.freeze({id: 'dark-grey-terrazzo', label: 'Dark terrazzo', url: '/img/board-dark-grey-terrazzo.png'}),
  Object.freeze({id: 'darkness', label: 'Darkness', url: '/img/board-darkness.png'}),
  Object.freeze({id: 'grey-washed-wall', label: 'Washed wall', url: '/img/board-grey-washed-wall.png'}),
  Object.freeze({id: 'gray-floral', label: 'Grey floral', url: '/img/board-gray-floral.png', tile: 300}),
  Object.freeze({id: 'tex2res4', label: 'Tex2res4', url: '/img/board-tex2res4.png'}),
  Object.freeze({id: 'perforated-white-leather', label: 'Perforated leather', url: '/img/board-perforated-white-leather.png'}),
  Object.freeze({id: 'graphy', label: 'Graphy', url: '/img/board-graphy.png', tile: 160}),
  Object.freeze({id: 'woven', label: 'Woven', url: '/img/board-woven.png', tile: 96}),
  Object.freeze({id: 'pool-table', label: 'Pool table', url: '/img/board-pool-table.png', tile: 512}),
  Object.freeze({id: 'green-dust-scratches', label: 'Green dust scratches', url: '/img/board-green-dust-scratches.png', tile: 592}),
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
 * A pattern the reader pasted as CSS — the shape css-pattern.com hands out — instead of a file.
 *
 * The pattern is painted by the reader's own browser on this page and nowhere else, so the job here
 * is not to decide what looks good but to refuse the three things a style rule can do that a pattern
 * has no business doing: name a property that is not a background, pull something in from a third
 * party, or be long enough to be a file. Everything else is passed through as written, because a
 * pattern with its numbers rounded to something the code approves of is not the pattern they chose.
 */
export const BOARD_PATTERN_CSS_MAX = 2000;
export const BOARD_PATTERN_CSS_VALUE_MAX = 400;
/** The declarations that paint, plus opacity - which dims the paint layer only, never the notes. */
export const BOARD_PATTERN_CSS_PROPERTIES = Object.freeze([
  'background', 'background-color', 'background-image', 'background-position',
  'background-repeat', 'background-size', 'background-blend-mode', 'opacity',
]);
/**
 * Anything that would make the pattern fetch, import or execute. `url(` is the one that matters: a
 * pattern is meant to be gradients, and a URL in one turns every reader's board into a beacon that
 * tells a stranger when and where it was opened.
 */
const BOARD_PATTERN_CSS_FORBIDDEN = Object.freeze([
  'url(', 'image-set(', 'src(', '@', '<', '>', 'expression(', 'javascript:',
  'behavior:', '\\', '/*', '*/',
]);

function clipped(text, limit = 40) {
  const value = String(text || '');
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/**
 * Validate a pasted pattern. Returns {ok: true, css, properties} with one canonical
 * `name:value;` spelling, or {ok: false, error} whose message names what was refused.
 */
export function boardPatternCss(text) {
  const raw = String(text ?? '').replace(/\/\*[\s\S]*?\*\//gu, ' ');
  const trimmed = raw.trim();
  if (!trimmed) {
    return {ok: false, error: 'Paste a pattern first — the CSS you copied from css-pattern.com.'};
  }
  if (trimmed.length > BOARD_PATTERN_CSS_MAX) {
    return {ok: false, error: `A pasted pattern may be at most ${BOARD_PATTERN_CSS_MAX} characters.`};
  }
  // A pattern pasted from a generator arrives as a whole rule — "html { ... }" — with the
  // selector and braces tangled into the first and last chunks. The board supplies the selector
  // itself, so unwrap one outer rule rather than refusing it: the braces say where the CSS came
  // from, not what it means. More than one rule is still refused, because a pattern is one set
  // of declarations and a second rule would be silently dropped.
  let body = trimmed;
  const outerRule = /^[^{}]*\{([^{}]*)\}[^{}]*$/u.exec(trimmed);
  if (outerRule) {
    body = outerRule[1].trim();
    if (!body) return {ok: false, error: 'That rule is empty — paste the declarations inside it.'};
  } else if (/[{}]/u.test(trimmed)) {
    return {ok: false, error: 'Paste one pattern, not several — a pattern is a single set of declarations.'};
  }
  const declarations = [];
  for (const chunk of body.split(';')) {
    const piece = chunk.trim();
    if (!piece) continue;
    const colon = piece.indexOf(':');
    if (colon <= 0) {
      return {ok: false, error: `“${clipped(piece)}” is not a declaration — each one reads like background-color: #eee.`};
    }
    const property = piece.slice(0, colon).trim().toLowerCase();
    const value = piece.slice(colon + 1).trim();
    const custom = property.startsWith('--');
    if (custom && !/^--[a-z0-9_-]+$/u.test(property)) {
      return {ok: false, error: `“${clipped(property)}” is not a usable variable name.`};
    }
    if (!custom && !BOARD_PATTERN_CSS_PROPERTIES.includes(property)) {
      return {
        ok: false,
        error: `${property} is not a board pattern — a pattern may set background declarations, `
          + 'opacity, and its own --variables.',
      };
    }
    if (!value) return {ok: false, error: `${property} has no value.`};
    if (value.length > BOARD_PATTERN_CSS_VALUE_MAX) {
      return {ok: false, error: `${property} is longer than ${BOARD_PATTERN_CSS_VALUE_MAX} characters.`};
    }
    const lower = value.toLowerCase();
    for (const bad of BOARD_PATTERN_CSS_FORBIDDEN) {
      if (lower.includes(bad)) {
        return {
          ok: false,
          error: `${property} contains “${bad}” — a pattern is painted by this page, so it may not `
            + 'fetch, import or embed anything.',
        };
      }
    }
    declarations.push(`${property}:${value}`);
  }
  if (!declarations.some(entry => entry.startsWith('background-image:') || entry.startsWith('background:'))) {
    return {ok: false, error: 'A pattern needs a background-image or a background shorthand; without one there is nothing to paint.'};
  }
  return {ok: true, css: `${declarations.join(';')};`, properties: declarations};
}

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

/**
 * The sockets a lamp plate always carries: one for each level a cell has under it. A cell is
 * GEOHASH_MIN_LENGTH to GEOHASH_MAX_LENGTH characters, so six levels lie below the shallowest board
 * and the plate is cut to that - the same six sockets on every board, so the plate never changes
 * length as the board deepens and the reader never has to count what is missing from it.
 */
export const BOARD_LAMP_SOCKETS = GEOHASH_MAX_LENGTH - GEOHASH_MIN_LENGTH;

/**
 * How many of those six sockets burn for a board's own cell: one for each level still open below it,
 * so a three-character board lights all six, a six-character one lights three and a nine-character
 * one lights none at all - the count is literally GEOHASH_MAX_LENGTH - cell.length, and the deepest
 * board is the one whose gauge reads empty rather than the one whose plate is gone. A cell that
 * cannot be read lights nothing.
 */
export function boardLampCount(cell) {
  const length = normaliseGeohash(cell).length;
  if (!length) return 0;
  return GEOHASH_MAX_LENGTH - length;
}

/**
 * Whether the socket at `index` burns, in the order the plate is built: index 0 is the socket at the
 * head of the plate and the last index is the one at its foot. Both rails build their plate in this
 * same order, so the two carry the same reading rather than one being the other's mirror.
 */
export function boardLampLit(index, lit) {
  return index >= BOARD_LAMP_SOCKETS - lit;
}

/**
 * The deepest a board of these cells can reach: a cell of `n` letters has 9 - n levels under it, so a board eight
 * letters long offers one level and a nine-letter board offers none. The shallowest cell decides, because the board
 * can only be as deep as the cell that has the most room left below it.
 */
export function boardDepthCeiling(cells = []) {
  const lengths = geohashCells(cells).map(cell => cell.length).filter(Boolean);
  if (!lengths.length) return GEOHASH_MAX_BOARD_DEPTH;
  return Math.max(0, Math.min(GEOHASH_MAX_BOARD_DEPTH, GEOHASH_MAX_LENGTH - Math.min(...lengths)));
}

/**
 * What one socket on a rail stands for, and whether the notes of that level are showing.
 *
 * The plate is the reader's own setting made visible, not a fact about the cell: the socket at the board's own
 * length is green because this board's notes always show, a deeper socket is green only while the chosen depth
 * reaches it, and every other socket is red - a note down there is hidden behind the board's filter. Sockets above
 * the board are red too: a board above this one is not what this board is showing.
 */
export function boardLampInfo(index, cells = [], depth = 0) {
  const step = Number(index);
  if (!Number.isInteger(step) || step < 0 || step >= BOARD_LAMP_SOCKETS) return null;
  const level = GEOHASH_MIN_LENGTH + 1 + step;
  // geohashCells, not normaliseGeohashes: the plate describes the board that is open, and a set the board itself
  // would refuse is not a reason to tell a reader there is no board.
  const own = geohashCells(cells);
  const cell = own[0] || '';
  const reached = Math.max(0, Math.min(GEOHASH_MAX_BOARD_DEPTH, Number.parseInt(depth, 10) || 0));
  const others = own.length > 1 ? ` (+${own.length - 1} more)` : '';
  let detail;
  let state;
  if (!cell) { detail = 'no board open'; state = 'none'; }
  else if (level === cell.length) { detail = `${cell} is this board's own cell${others}`; state = 'own'; }
  else if (level < cell.length) { detail = `${cell.slice(0, level)} is a board above this one${others}`; state = 'above'; }
  else {
    const deeper = level - cell.length;
    // A real cell down there rather than an ellipsis: the reader can see which board the light is about.
    detail = `notes from ${boardLampExampleCell(cell, level)} are ${deeper} level${deeper === 1 ? '' : 's'} deeper${others}`;
    state = deeper <= reached ? 'shown' : 'hidden';
  }
  // Only the levels BELOW the board burn, green when the depth reaches them and red when it hides them. The board's
  // own level and every board above it stay dark: they are not what this plate is measuring.
  const lit = state === 'shown';
  const hidden = state === 'hidden';
  const reading = lit ? ' — shown' : hidden ? ' — hidden' : '';
  return {index: step, level, lit, hidden, state, cell, detail, title: `Level ${level} · ${detail}${reading}`};
}

/**
 * A cell at `level` inside `cell`, so a tooltip can name a real board instead of trailing off in an ellipsis. The
 * first child of a cell is the cell plus a zero in geohash's base32, and the first child of that the same again.
 */
export function boardLampExampleCell(cell, level) {
  const length = normaliseGeohash(cell).length;
  const steps = Number(level) - length;
  if (!length || !Number.isFinite(steps) || steps <= 0) return '';
  return normaliseGeohash(cell) + '0'.repeat(steps);
}

/**
 * The one sentence the whole plate stands for: how many of the levels under this board are showing notes, and what
 * the two colours mean. The colours are the legend, so they are named here rather than discovered by hovering.
 */
export function boardLampSummary(cells = [], depth = 0) {
  const own = geohashCells(cells);
  const explainer = 'Green = notes from this level show here. Red = notes in this level are hidden.';
  if (!own.length) return explainer;
  const below = Math.max(0, GEOHASH_MAX_LENGTH - own[0].length);
  if (!below) return `This board is as deep as a cell goes, so no light burns. ${explainer}`;
  let shown = 0;
  for (let index = 0; index < BOARD_LAMP_SOCKETS; index += 1) {
    const lamp = boardLampInfo(index, own, depth);
    if (lamp && lamp.lit) shown += 1;
  }
  return `${shown} of ${below} level${below === 1 ? '' : 's'} below this board show notes here. ${explainer}`;
}

/**
 * The link a board is shared by: the page the desk serves for that board, which carries the board's
 * own picture so a chat unfurls the board itself instead of the site's generic card. An empty set
 * of cells has no board to point at, so there is no link.
 */
export const PINSTR_SHARE_ORIGIN = 'https://pinstr.si';

/**
 * Where a reader can keep their notes besides the board's own relay.
 *
 * Every note is published to `wss://nostr.satoshi.si` because that is where the board reads from;
 * the relays a reader adds here are written to as well, so a note lives somewhere they chose. The
 * limit is three: each one is a socket this page keeps, and a list nobody bounds becomes a page
 * that opens a dozen connections to show one note.
 */
export const USER_RELAY_LIMIT = 3;

/**
 * Whether a picture is one that moves.
 *
 * Only the address knows: a GIF served as `image/jpeg` or behind a query string is still a GIF, and
 * a photograph named `.gif` by a confused uploader is not. The board reads it from the path it was
 * given, which is what the note itself carries.
 */
/**
 * Whether a signature that came back from a signer was for a reaction or a zap.
 *
 * A gift is signed through the same hand-over as a note, and carries no order, so both flows have to
 * be able to tell them apart before either can claim the answer.
 */
export function isGiftAction(action) {
  return action === 'react' || action === 'zap';
}

/**
 * What one reaction is worth, in sats, when a note's score is worked out.
 *
 * One sat counted as one reaction made money speak far too loudly: the smallest zap the board offers is
 * twenty-one sats, so a single one of those outweighed twenty likes. A like is counted as though it
 * were a zap of this size instead. It sits at the middle of the board's own zap buttons - 21, 100,
 * 1,000, 5,000 - so a like stands level with the hundred-sat zap, six likes beat a twenty-one-sat zap
 * twenty-eight times over, and a five-thousand-sat zap is worth fifty likes. Raise it if a click should
 * count for more, lower it if money should lead harder; this is the whole of that judgement.
 */

/**
 * The board's stacking order: a note posted last lies on top of the notes already there.
 *
 * Time decides it, and nothing else. Reactions and sats used to raise a note over its neighbours, which meant
 * a note that had collected a few likes - and a signature is free to make - could sit over one its author had
 * paid to pin, and one large zap could hold the top for as long as nobody beat it. Payment buys a note's place
 * on the board and the tally it carries, not the right to cover newer notes.
 *
 * A note dated in the future is read as posted now, so a clock set forward cannot own the top for good, and
 * ties fall back to the order the notes arrived in, so the board only moves when something is actually posted.
 *
 * Returned back to front: the caller lays the elements down in this order, and the last one is on top.
 */
export function noteStackOrder(notes, now = Math.floor(Date.now() / 1000)) {
  const ceiling = Math.max(0, Number(now) || 0);
  const keyed = (notes || []).map((note, index) => {
    const createdAt = Number(note?.createdAt) || 0;
    // Ascending, because the first element laid down is the one at the back.
    const posted = ceiling > 0 ? Math.min(createdAt, ceiling) : createdAt;
    return {id: note?.id, posted, index};
  });
  keyed.sort((left, right) => (left.posted - right.posted) || (left.index - right.index));
  return keyed.map(entry => entry.id);
}

export function animatedPicture(url) {
  return /\.gif(?:[?#]|$)/i.test(String(url || '').trim());
}

/**
 * The lamps a relay's answer is read as, from quickest to slowest.
 *
 * A relay has no ping of its own, so what is measured is how long the socket took to open. That is
 * what a reader waiting on a connection actually feels, and it is honest about being a round trip
 * to *that* relay rather than to the network in general.
 */
export const RELAY_LAMPS = Object.freeze([
  {id: 'green', max: 400, label: 'quick'},
  {id: 'yellow', max: 900, label: 'fine'},
  {id: 'orange', max: 2000, label: 'slow'},
  {id: 'red', max: Number.POSITIVE_INFINITY, label: 'very slow'},
]);

/** The lamp for a measured answer, or the red one when there was no answer at all. */
export function relayLampFor(pingMs) {
  // Null and empty are "no answer", not zero: Number(null) is 0, and a relay that never replied
  // must not be shown as an instant one.
  if (pingMs === null || pingMs === undefined || pingMs === '') return {id: 'red', label: 'no answer', ms: null};
  const ms = Number(pingMs);
  if (!Number.isFinite(ms) || ms < 0) return {id: 'red', label: 'no answer', ms: null};
  const lamp = RELAY_LAMPS.find(step => ms < step.max) || RELAY_LAMPS[RELAY_LAMPS.length - 1];
  return {id: lamp.id, label: lamp.label, ms: Math.round(ms)};
}

/** The readable name of a relay: its host, without the scheme or the path. */
export function relayHostLabel(url) {
  const value = String(url || '').trim();
  const withoutScheme = value.replace(/^wss?:\/\//i, '');
  return withoutScheme.split('/')[0].toLowerCase();
}

/**
 * Whatever the reader typed, as a relay URL — or the reason it cannot be one.
 *
 * A bare hostname is taken as the intent it is (`relay.example.com` means the wss endpoint), and a
 * plain `ws://` is refused rather than quietly upgraded: a page is served over https, so a ws
 * socket is blocked as mixed content, and telling the reader that is better than a relay that
 * never answers.
 */
export function normaliseUserRelay(input, {defaultRelay = ''} = {}) {
  const raw = String(input || '').trim();
  if (!raw) return {ok: false, reason: 'Type a relay address first.'};
  if (raw.length > 300) return {ok: false, reason: 'That address is too long to be a relay.'};
  if (/\s/.test(raw)) return {ok: false, reason: 'A relay address has no spaces in it.'};

  const scheme = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme && scheme[1].toLowerCase() === 'ws') {
    return {ok: false, reason: 'This page is served over https, so only wss:// relays work.'};
  }
  if (scheme && scheme[1].toLowerCase() !== 'wss') {
    return {ok: false, reason: 'A relay address starts with wss://.'};
  }
  const body = scheme ? raw.slice(scheme[0].length) : raw;
  const [host, ...rest] = body.split('/');
  const name = host.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/.test(name)) {
    return {ok: false, reason: 'That does not look like a relay address.'};
  }
  const relay = `wss://${name}${rest.length ? `/${rest.join('/')}` : ''}`.replace(/\/+$/, '');
  if (defaultRelay && relayHostLabel(relay) === relayHostLabel(defaultRelay)) {
    return {ok: false, reason: 'That is the board\u2019s own relay \u2014 every note goes there already.'};
  }
  return {ok: true, relay};
}

/** The list with this relay on the end, or the reason it cannot be. */
export function addUserRelay(list, input, {defaultRelay = ''} = {}) {
  const current = (Array.isArray(list) ? list : []).filter(url => typeof url === 'string' && url);
  if (current.length >= USER_RELAY_LIMIT) {
    return {ok: false, reason: `That is the limit of ${USER_RELAY_LIMIT}. Remove one to add another.`};
  }
  const normalised = normaliseUserRelay(input, {defaultRelay});
  if (!normalised.ok) return normalised;
  if (current.some(url => relayHostLabel(url) === relayHostLabel(normalised.relay))) {
    return {ok: false, reason: 'That relay is already on the list.'};
  }
  return {ok: true, relays: [...current, normalised.relay]};
}

/** The list without that relay. */
export function removeUserRelay(list, url) {
  return (Array.isArray(list) ? list : []).filter(item => item !== url);
}

export function boardShareUrl(cells, origin = PINSTR_SHARE_ORIGIN) {
  const clean = (cells || []).filter(cell => typeof cell === 'string' && cell);
  if (!clean.length) return '';
  return `${String(origin || '').replace(/\/+$/, '')}/b/${clean.join(',')}`;
}

/**
 * The line the hand-over step shows while the signature is on the clipboard: what the reader has,
 * and the one button that hands it over. Three routes arrive at this state - the pin that sends the
 * request, the pin that loses its callback, and the page resumed before the callback lands - and one
 * of them grew its own wording once, so the sentence is written down here and every waiting-state
 * call site reads it from here. The failure lines that replace it are each written where they happen.
 */
export const AMBER_HAND_OVER_WAITING_LINE = 'Amber has it on your clipboard. Tap the button to hand it over.';

/**
 * The line the hand-over step shows for a signature that is already gone. A verified signature
 * spends the request that carried it, so a second tap has nothing to read and nothing to sign in
 * for, and the last line the hand-over left stands as it was.
 */
export const AMBER_HANDED_OVER_LINE = 'This signature was already handed over - there is nothing left to pin.';

/**
 * The line a tap on the hand-over button writes for a hand-over that has already been made - the
 * signature was verified and given to the desk, so the request that carried it is spent and there
 * is nothing parked for the tap to act on. Null for every other case: a request still in flight
 * decides the tap itself (hand its value over, or send it again), and a sign-in keeps the wording
 * the sign-in route owns.
 *
 * `parked` is the newest request still in flight, `handed` what the last clipboard hand-over was.
 * The hand-over's own last line is repeated rather than replaced: the desk's refusal is the most
 * recent thing that happened to this note, and "nothing left to pin" underneath it reads as a
 * second, quieter failure.
 */
/**
 * The headers for a call to the payment desk.
 *
 * A GET carries no body, and a `content-type` on one turns it into a request the browser must preflight
 * first. The desk answers OPTIONS for its GET routes with `access-control-allow-methods` but no
 * `access-control-allow-headers`, so every price quote was refused by CORS and the composer never got
 * the number it needed - the note then went to the desk with no valid amount and came back 402.
 */
export function apiHeaders(options = {}) {
  const headers = {...(options.headers || {})};
  const body = options.body;
  if (body !== undefined && body !== null) headers['content-type'] = 'application/json';
  return headers;
}


export function spentAmberHandOver({parked = null, handed = null} = {}) {
  if (parked || handed?.action !== 'sign') return null;
  return {
    message: handed.message || AMBER_HANDED_OVER_LINE,
    error: Boolean(handed.error),
  };
}


/**
 * A profile link is only a link if it really is http(s) once parsed. A bare domain gets https, and
 * anything else - javascript:, data:, ftp:, a sentence - is dropped rather than shown as clickable.
 */
export function safeProfileLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString().slice(0, 300);
  } catch { return ''; }
}

/** lud16 is a Lightning address and nothing else; anything that is not one is dropped. */
export function safeLightningAddress(value) {
  const raw = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw) ? raw.slice(0, 120) : '';
}


/**
 * The latest NIP-38 status a reader has set, or null.
 *
 * A status is a kind 30315 addressable event whose `d` tag is its type: `general` for "Hiking", `music`
 * for what is playing, and anything else the writer invented. An empty content is how a client clears a
 * status, so it counts as no status; a NIP-40 `expiration` in the past means the status is over even
 * though the event is still on the relay. `general` wins over the other types because it is the one a
 * reader means when they set a status at all, and the newest wins inside a type.
 */
export function pickUserStatus(events, now = Math.floor(Date.now() / 1000)) {
  const fresh = (Array.isArray(events) ? events : []).filter(event => {
    if (!event || Number(event.kind) !== 30315) return false;
    const text = String(event.content || '').trim();
    if (!text) return false;
    const tags = Array.isArray(event.tags) ? event.tags : [];
    const expiry = tags.find(tag => Array.isArray(tag) && tag[0] === 'expiration');
    const until = Number(expiry?.[1]);
    if (Number.isInteger(until) && until > 0 && until <= now) return false;
    return Number.isFinite(Number(event.created_at));
  });
  if (!fresh.length) return null;
  const typeOf = event => {
    const tag = (Array.isArray(event.tags) ? event.tags : []).find(entry => Array.isArray(entry) && entry[0] === 'd');
    const value = String(tag?.[1] ?? 'general').trim();
    return value || 'general';
  };
  const newestBy = new Map();
  for (const event of fresh) {
    const type = typeOf(event);
    const held = newestBy.get(type);
    if (!held || Number(event.created_at) > Number(held.created_at)) newestBy.set(type, event);
  }
  const chosen = newestBy.get('general')
    || [...newestBy.values()].sort((a, b) => Number(b.created_at) - Number(a.created_at))[0];
  const tags = Array.isArray(chosen.tags) ? chosen.tags : [];
  const link = tags.find(tag => Array.isArray(tag) && tag[0] === 'r');
  return {
    type: typeOf(chosen),
    text: String(chosen.content || '').trim().slice(0, 280),
    url: String(link?.[1] ?? '').trim().slice(0, 300),
    createdAt: Number(chosen.created_at),
  };
}


/**
 * How a note is worn, or null for the notes that are flat.
 *
 * Paper on a board does not all sit the same way: some sheets have lifted at a corner and hold a soft
 * shade there. The choice is derived from the note's own id rather than drawn at random, so a note wears
 * the same way every time it is redrawn - and notes are redrawn on every reorder, pan and filter.
 *
 * Roughly four in ten notes wear a corner; one in eight of those has cockled at the opposite corner as
 * well. The shade is written here as the gradient the stylesheet paints, because the corner and the depth
 * are the same decision.
 */
export function noteWear(id) {
  const key = String(id ?? '').trim();
  if (!key) return null;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const roll = (hash % 1000) / 1000;
  if (roll >= 0.42) return null;
  const at = {tl: '0% 0%', tr: '100% 0%', bl: '0% 100%', br: '100% 100%'};
  const order = ['tl', 'tr', 'bl', 'br'];
  const first = order[(hash >>> 8) % 4];
  const corners = [first];
  if (roll < 0.055) corners.push({tl: 'br', br: 'tl', tr: 'bl', bl: 'tr'}[first]);
  // Depth and reach vary with the note, never enough to darken the writing.
  const alpha = 0.11 + ((hash >>> 16) % 100) / 1000;
  // The radius is stated in pixels rather than left to the layer size: a gradient sized by its box is
  // cut off where the box ends, and that cut shows up as the straight edge of a square patch.
  const reach = corners.map((corner, index) => 62 + ((hash >>> (4 + index * 3)) % 58));
  const shade = corners.map((corner, index) => (
    `radial-gradient(circle ${reach[index]}px at ${at[corner]}, rgba(31,16,5,${alpha.toFixed(3)}) 0%, `
    + `rgba(31,16,5,${(alpha * 0.4).toFixed(3)}) 52%, rgba(31,16,5,0) 100%)`
  )).join(', ');
  const lift = 1 + ((hash >>> 12) % 3);
  return {corners, alpha, reach, lift, shade};
}

/** The hash both wear and texture placement are drawn from: stable per id, and never Math.random. */
function noteHash(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * How far through its own life a note is: 0 when it was pinned, 1 at the moment it disappears.
 * A note with no expiration, or one whose clock runs backwards, has no age at all.
 */
export function noteAgeFraction(createdAt, expiration, now = Math.floor(Date.now() / 1000)) {
  const born = Number(createdAt);
  const dies = Number(expiration);
  const at = Number(now);
  if (!Number.isFinite(born) || !Number.isFinite(dies) || !Number.isFinite(at) || dies <= born) return null;
  return Math.min(1, Math.max(0, (at - born) / (dies - born)));
}

/**
 * How visible the creases are at that age.
 *
 * A fresh note is unmarked paper, so nothing shows for the first sixth of its life; from there the texture
 * comes in with age and is at full by three quarters, which is what the board promises: 25% faint, 50%
 * half, 75% the whole paper.
 */
export function noteAgeTextureOpacity(fraction) {
  const value = Number(fraction);
  if (!Number.isFinite(value) || value <= 0.15) return 0;
  return Math.min(1, (value - 0.15) / 0.6);
}

/**
 * Where the crease picture sits on this note: an angle, a scale and a small offset, all from the id.
 *
 * Rotating the picture is what stops every note wearing identical creases, and the drawing is scaled a
 * little as well so the pattern does not line up between two notes anyway. The rotation is applied inside
 * a clipping wrapper that is a third larger than the note, so no corner of the note can go bare.
 */
export function noteTexturePlacement(id) {
  const key = String(id ?? '').trim();
  if (!key) return {angle: 0, scale: 1, shiftX: 0, shiftY: 0};
  const hash = noteHash(key);
  return {
    angle: (hash >>> 3) % 360,
    scale: 1 + ((hash >>> 11) % 29) / 100,
    shiftX: -14 + ((hash >>> 17) % 29),
    shiftY: -14 + ((hash >>> 23) % 29),
  };
}
