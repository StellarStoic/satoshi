export const STICKY_EVENT_KIND = 1;
export const STICKY_TOPIC = 'satoshi-sticky';
export const STICKY_VERSION = 'v1';
// Posting is what a subscription buys. There is no per-note price for a
// registered key any more: while a subscription is active, pins and removals are
// included, and a note it covers is created already settled, so the board never
// shows a payment step for one. The only per-message price left is the 24-hour
// anonymous identity's, which can never subscribe.
export const STICKY_SUB_WEEK_SATS = 10;
export const STICKY_SUB_YEAR_SATS = 411;
export const STICKY_SUB_MEMBER_WEEK_SATS = 5;
export const STICKY_SUB_MEMBER_YEAR_SATS = 205;
export const STICKY_SUB_WEEKS_PER_YEAR = 52;
export const STICKY_SUB_YEAR_DISCOUNT = 0.21;
export const STICKY_SUB_PLANS = Object.freeze(['week', 'year']);
export const STICKY_ANONYMOUS_PRICE_SATS = 42;

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
export const STICKY_FONTS = Object.freeze([
  'typewriter', 'handwritten', 'patrick-hand', 'kalam', 'comfortaa',
  'noto-sans', 'noto-serif', 'noto-mono', 'roboto', 'mono', 'roboto-slab',
  'open-sans', 'source-sans', 'ubuntu', 'pt-sans', 'pt-serif', 'fira-mono',
  'ibm-plex-mono', 'merriweather', 'atkinson', 'serif',
]);
export const GEOHASH_PATTERN = /^[0123456789bcdefghjkmnpqrstuvwxyz]{1,12}$/;
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

export function geohashMatchesBoard(noteGeohash, boardGeohash, depth = 0, exactOnly = false) {
  const note = normaliseGeohash(noteGeohash);
  const board = normaliseGeohash(boardGeohash);
  if (!note || !board || !note.startsWith(board)) return false;
  if (note === board) return true;
  if (exactOnly) return false;
  const levels = Math.max(0, Math.min(11, Number.parseInt(depth, 10) || 0));
  return note.length - board.length <= levels;
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

export function geohashPrecisionForZoom(zoom) {
  const level = Math.max(0, Math.min(21, Number(zoom) || 0));
  if (level <= 3) return 1;
  if (level <= 5) return 2;
  if (level <= 7) return 3;
  if (level <= 10) return 4;
  if (level <= 12) return 5;
  if (level <= 14) return 6;
  if (level <= 17) return 7;
  if (level <= 20) return 8;
  return 9;
}

export function mapZoomForGeohashPrecision(precision) {
  const index = Math.max(1, Math.min(9, Number.parseInt(precision, 10) || 1));
  return [0, 2, 4, 6, 8, 11, 13, 15, 18, 21][index];
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
 * /sticky/v1/subscription answer so the wording can be tested without a DOM.
 *
 * `anonymous` is the identity mode in play, and `plan` is the plan the picker is
 * on — a buyer with no subscription is offered "subscribe and post" as one action
 * rather than a detour they have to repeat.
 */
export function describeStickyAction({ action = 'pin', anonymous = false, subscription = null, plan = 'week' } = {}) {
  const prices = subscription?.prices || {};
  const member = Boolean(prices.member);
  const week = (Number.isInteger(prices.weekSats) ? prices.weekSats : null) ?? stickySubscriptionPrice('week', { member });
  const year = (Number.isInteger(prices.yearSats) ? prices.yearSats : null) ?? stickySubscriptionPrice('year', { member });
  const active = Boolean(subscription?.active);
  const until = stickyDay(subscription?.expiresAt);

  if (anonymous) {
    return {
      label: action === 'remove'
        ? `Remove · ${STICKY_ANONYMOUS_PRICE_SATS} sats`
        : `Post anonymously · ${STICKY_ANONYMOUS_PRICE_SATS} sats`,
      state: `Anonymous identity: ${STICKY_ANONYMOUS_PRICE_SATS} sats per message. A subscription never applies to it.`,
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
      label: `${action === 'remove' ? 'Remove' : 'Pin it'} · included`,
      state: `Subscription active${until ? ` until ${until}` : ''}. Posting and removals are included.`,
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
    label: `Subscribe & ${action === 'remove' ? 'remove' : 'pin'} · ${price} sats`,
    state: `Posting needs a subscription: ${week} sats a week or ${year} sats a year`
      + (member ? ', half price with your satoshi.si name' : '')
      + '.',
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

export function clampPlacement(value, fallback = 0.5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

export function clampRotation(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(12, Math.max(-12, number)) : 0;
}

export function makeStickyTemplate({content, color, font = 'typewriter', x, y, rotation, geohash, exactGeohash = false, anonymous = false, createdAt = Math.floor(Date.now() / 1000)}) {
  const text = normaliseStickyText(content);
  if (!text) throw new Error('Write something on the note first.');
  if (text.length > STICKY_MAX_CHARACTERS) throw new Error('The note is full.');
  if (!STICKY_COLORS.includes(color)) throw new Error('Choose an available note color.');
  if (!STICKY_FONTS.includes(font)) throw new Error('Choose an available note font.');
  const boardGeohash = normaliseGeohash(geohash);
  if (!boardGeohash) throw new Error('Choose a valid geohash corkboard first.');
  const tags = [
    ['t', STICKY_TOPIC],
    ['client', 'satoshi.si'],
    ...geohashPrefixes(boardGeohash).slice(0, exactGeohash ? 1 : undefined).map(prefix => ['g', prefix]),
    ['i', `geo:${boardGeohash}`],
    ['k', 'geo'],
    ['geohash', exactGeohash ? 'exact' : 'prefix'],
    ['sticky', STICKY_VERSION, color, clampPlacement(x).toFixed(5), clampPlacement(y).toFixed(5), clampRotation(rotation).toFixed(2), font],
    ['alt', 'A sticky note pinned on satoshi.si'],
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
  if (!event.tags?.some(tag => tag?.[0] === 't' && tag[1] === STICKY_TOPIC)) return null;
  const sticky = event.tags.find(tag => tag?.[0] === 'sticky' && tag[1] === STICKY_VERSION);
  if (!sticky || !STICKY_COLORS.includes(sticky[2])) return null;
  const font = sticky[6] || 'typewriter';
  if (!STICKY_FONTS.includes(font)) return null;
  const content = normaliseStickyText(event.content);
  if (!content || content.length > STICKY_MAX_CHARACTERS) return null;
  const geohashes = event.tags.filter(tag => tag?.[0] === 'g').map(tag => normaliseGeohash(tag[1])).filter(Boolean);
  const geohash = geohashes.sort((left, right) => right.length - left.length)[0] || '';
  if (!geohash) return null;
  const scope = event.tags.find(tag => tag?.[0] === 'geohash')?.[1];
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
    exactGeohash: scope !== 'prefix',
    anonymous: event.tags.some(tag => tag?.[0] === 'anonymous' && tag[1] === '24h-local-key'),
  };
}

export async function stickyContentHash(content, color, font = 'typewriter', cryptoObject = globalThis.crypto) {
  const text = normaliseStickyText(content);
  if (!text || !STICKY_COLORS.includes(color) || !STICKY_FONTS.includes(font)) throw new Error('The note is incomplete.');
  const bytes = new TextEncoder().encode(`${STICKY_VERSION}\n${color}\n${font}\n${text}`);
  const digest = await cryptoObject.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function makeDeletionTemplate({eventId, createdAt = Math.floor(Date.now() / 1000)}) {
  if (!/^[0-9a-f]{64}$/.test(String(eventId || ''))) throw new Error('The note ID is invalid.');
  return {
    kind: 5,
    created_at: createdAt,
    content: 'Remove sticky note',
    tags: [
      ['e', eventId, 'wss://nostr.satoshi.si'],
      ['k', '1'],
      ['t', 'satoshi-sticky-delete'],
      ['alt', 'A request to remove a sticky note from satoshi.si'],
    ],
  };
}
