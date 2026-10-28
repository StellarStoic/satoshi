// Pinstr payment rules for the satoshi.si payment service.
//
// Two payable actions, priced server-side and never from the browser:
//   pin       {action, pubkey, contentHash}  -> publish a Pinstr note
//   subscribe {action, pubkey, plan}         -> buy the time that covers pins
//
// The amount lives here and nowhere else: a subscription for a named key, and a
// flat per-note price for a 24-hour anonymous one. A caller that sends an amount
// is ignored.
//
// The note format is the board's, not this file's: kind 1, tagged
// ["t","pinstr"] exactly once, plus up to three hashtags, and one
// ["sticky","v1",color,x,y,rotation,font] tag for the note's appearance.
// Placement is part of the *event* but not of the paid commitment, because the
// buyer picks it after paying — it is validated for bounds instead.
//
// Pure logic on purpose — no sockets, no HTTP, no file system. That keeps the
// money rules testable (test/sticky.test.mjs) and keeps the socket code in
// server.mjs / relay.mjs where it can be reasoned about separately.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyEvent, npubEncode, mentionTokens } from './nostr.mjs';

// There is no per-note price for a registered key any more: a subscription is
// what buys the right to post, and a note it covers is created already settled.
// The one exception is a 24-hour anonymous identity, which pays per message and
// can never subscribe. See the SUB_* block below for the subscription prices.
// A note published from a throwaway 24-hour identity is priced on its own:
// 10 sats flat, and never discounted. An anonymous identity cannot hold a
// NIP-05 name, so it can never be a member — the flat price is the whole point
// of the tier, not a discount waiting to be applied. It gets one note, and only
// one; there is no second price for it.
// The figure is deliberately above the price of a week (10 sats): posting one note
// without an identity must not be the cheap way to belong, or a key anyone can mint
// in a second would undercut the only thing that funds the board. So a throwaway
// note costs about two weeks, and an agent — which can mint a key per note — pays
// the same and is quoted it whatever name its key carries.
export const STICKY_ANON_SATS = 21;
/** Removing the one note an anonymous key posted, priced apart from posting it. */
export const ANON_REASON = 'anonymous 24-hour identity — no NIP-05 discount';
/** A second note from the same throwaway key: it has spent its one note. */
export const ANON_KEY_USED = 'anonymous_key_used';
/** A throwaway key may never hold a subscription, weekly or yearly. */
export const ANON_NO_SUBSCRIPTION = 'anonymous_no_subscription';
/**
 * Why a key the big relays have never seen is priced as a throwaway.
 *
 * The board mints a key in a second, so "no satoshi.si name" cannot be the test for
 * who may subscribe: it would make the cheapest week the cheapest way to post
 * forever. Membership stays the name — that is what a name is bought for — and relay
 * presence is what separates a real Nostr user who never bought one from a key that
 * exists only on this desk.
 */
export const STRANGER_REASON = 'unknown key — no satoshi.si name and no profile on the big relays';
// The subscription that replaced the per-note price for registered users. The
// numbers are derived, not typed, so the yearly figure cannot drift from the
// weekly one: a year is 52 weeks, and paying for a year up front takes 21% off.
export const SUB_WEEKS_PER_YEAR = 52;
export const SUB_YEAR_DISCOUNT = 0.21;          // 21% off for paying for a year
export const SUB_WEEK_SATS = 10;
export const SUB_YEAR_SATS = Math.round(SUB_WEEK_SATS * SUB_WEEKS_PER_YEAR * (1 - SUB_YEAR_DISCOUNT));   // 411

// Holding a satoshi.si NIP-05 name is what makes a key a member, and **how short
// that name is decides how much of the subscription it pays** — the name is what
// was bought, and it is priced the same way round: three characters cost 50,000
// sats, four cost 21,000, five or more cost 5,000. So three characters post for
// nothing, four pay half, five or more pay three quarters.
//
// Every tier is a fraction of the LIST price, floored, so no tier can round up
// past its own share. Keep `maxNameLength: null` for the open-ended top tier
// rather than Infinity: this table is published to clients as JSON.
export const MEMBER_TIERS = [
  { maxNameLength: 3, offPercent: 100, reason: '3-character satoshi.si name — Pinstr is free' },
  { maxNameLength: 4, offPercent: 50, reason: '4-character satoshi.si name — 50% off' },
  { maxNameLength: null, offPercent: 25, reason: '5+ character satoshi.si name — 25% off' },
];
export const NO_NAME_REASON = 'no satoshi.si NIP-05 name for this pubkey';

// The other way to pay for a single note: work instead of sats (NIP-13).
//
// A note's id is the sha256 of the event itself, so a difficulty is a price with a
// strange property — it is paid to nobody, it cannot be refunded, and it proves the
// miner spent the effort on THIS note rather than on any other, because the id is a
// hash of the content, the tags, the pubkey and the timestamp together. That is what
// makes it safe to accept from a key this desk has never heard of, on a domain it
// cannot resolve: the work is checked here, in this process, from the event alone.
//
// 25 bits is 2^25 = 33,554,432 sha256 tries, expected. Measured against the miner the
// board runs (four workers, a synchronous sha256 each), that is roughly half a minute
// on a desktop and two to five minutes on a phone. It is one constant to change, and
// /config publishes it, so the board always offers the difficulty the desk will check.
export const POW_TAG = 'nonce';
export const POW_BITS = 29;
export const POW_NAME_MAX = 128;
/** One note paid for by work rather than money. */
export const POW_REASON = 'paid for with NIP-13 proof of work';
/**
 * Why a note costs nothing: the writer's own NIP-05 name answers for their key.
 *
 * A name on any domain, not only this service's: a NIP-05 is a promise a domain makes about a
 * pubkey, and a domain that keeps it is as good a floor as this one. The verification itself is a
 * network question and lives in nip05.mjs; this module is told the answer.
 */
export const NIP05_REASON = 'free — a NIP-05 name that answers for this key';
/**
 * Why an agent pays even when it carries a name.
 *
 * The free door is for a person: a key somebody holds, with a name on a domain they run or are
 * known on. A program that can mint a key per note and point it at a name it just published is not
 * the thing that door is for, so a client that says it is an agent says it pays per note — and the
 * MCP server says so on every order it places.
 */
export const AGENT_PIN_REASON = 'agents pay per note, name or no name';
/**
 * How many free notes a name buys in a day.
 *
 * A free door with no meter is not a door, it is a hole: a domain costs a few sats and a name is a
 * DNS record, so "free for anyone with a NIP-05" would be free for anyone who can type. Ten notes is
 * a real day of writing on a board — enough to say what happened, where it happened, and to correct
 * yourself twice — and not enough to run a wire service.
 *
 * The meter is also the edge of the subscription, which is what it is for: ten notes a day for
 * nothing, or unlimited notes for a week at ten sats. A subscriber is never counted here — the
 * subscription is decided before this door in `createStickyOrder`, so a covered note is not a free
 * one and cannot spend the allowance.
 */
export const NIP05_DAILY_MAX = 10;
/**
 * The window a free note is counted in: a rolling 24 hours.
 *
 * Not a calendar day, because a calendar day has a midnight and a midnight belongs to a time zone
 * the writer may not be in — a limit that resets at somebody else's midnight is a limit that is
 * twice as generous once a day and unexplainable the rest of it.
 */
export const NIP05_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * How much of today's free allowance a key has spent, and when the oldest of it falls off.
 *
 * Counted from the stored orders rather than from a counter, because the orders are the record that
 * cannot drift: a cached count survives neither a restart nor a restored backup, and a quota that
 * resets when the service restarts is a quota an agent can spend by crashing it. Only the free ones
 * count — a subscribed pin and a mined note were paid for in another currency — and a note counts
 * from the moment it was ordered, since on this door the order *is* the note.
 *
 * `resetsAt` is when the oldest free note of the window ages out, which is when a full allowance
 * starts coming back, not when it is empty.
 */
export function freeNoteUsage(orders, pubkey, now = Math.floor(Date.now() / 1000),
  { limit = NIP05_DAILY_MAX, windowSeconds = NIP05_WINDOW_SECONDS, subscribed = false } = {}) {
  const key = String(pubkey || '').toLowerCase();
  const since = now - windowSeconds;
  const times = Object.values(orders || {})
    .filter(order => order && order.nip05Free === true
      && String(order.pubkey || '').toLowerCase() === key)
    .map(order => Number(order.createdAt) || 0)
    .filter(at => at > since && at <= now)
    .sort((a, b) => a - b);
  const used = times.length;
  // A subscription removes the meter rather than raising it. The count is still reported beside
  // `unlimited: true`, so a client can say "unlimited while it runs, 4 free ones today" without
  // inventing either half of that sentence.
  if (subscribed) {
    return { limit, used, remaining: null, unlimited: true, windowSeconds, allowed: true, resetsAt: null };
  }
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    unlimited: false,
    windowSeconds,
    allowed: used < limit,
    // A full allowance comes back one note at a time, starting when the oldest one ages out.
    resetsAt: used >= limit ? times[0] + windowSeconds : null,
  };
}
/** A throwaway identity may not mine its way in either: it pays per note. */
export const ANON_NO_POW = 'anonymous_no_pow';
/** The tag a note uses to say how it was paid for, and the words allowed in it. */
export const PAYMENT_TAG = 'paid';
export const PAYMENT_BADGES = ['pow', 'bitcoin', 'cash'];

/**
 * How this order was paid for, as one of PAYMENT_BADGES, or null when the desk cannot say.
 *
 * The desk is the only side that knows what an order actually cost, so the badge word is
 * decided here and handed to the board with the order; the board draws it and echoes it in
 * the event, and this same function is what the publish gate checks the echo against. That
 * is what makes the icon on a note's foot worth believing: it is not the writer's claim.
 *
 * A note covered by a pass, a plan the name's length makes free, and a per-note anonymous
 * post are all 'bitcoin': every rail this desk sells on is Bitcoin, which is the fact the
 * badge is about. `paymentMethod` is the extension point — the first rail that is not
 * Bitcoin adds one word here and one icon on the board, and nothing else changes.
 */
export function paymentBadge(order) {
  if (!order) return null;
  if (order.powFree === true) return 'pow';
  if (order.covered === true || order.freeTier === true || order.anonymous === true) return 'bitcoin';
  if (order.status === 'paid' || order.status === 'published') {
    return order.paymentMethod === 'cash' ? 'cash' : 'bitcoin';
  }
  return null;
}

/** A NIP-05 claim: name@domain, on any domain. Recorded, not resolvable from here. */
const POW_NAME_RE = /^[^@\s]{1,64}@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** A tier's price for a plan, floored: a tier never rounds up past its own share. */
export function tierPriceSats(baseSats, offPercent) {
  const off = Number.isFinite(offPercent) ? Math.min(Math.max(offPercent, 0), 100) : 0;
  return Math.floor(baseSats * (100 - off) / 100);
}

/**
 * How much work an event id carries: its leading zero BITS, counted as NIP-13
 * counts them — across the 64 hex characters, four bits at a time, stopping at
 * the first nibble that is not zero.
 *
 * A nibble's own leading zeros are `Math.clz32(nibble) - 28`: clz32 counts a
 * 32-bit word, and a hex digit is four bits, so 1 (0001) is 3, 2 (0010) is 2, 8
 * (1000) is 0. Returns -1 for a value that is not an event id at all, so a caller
 * comparing against a difficulty cannot mistake a typo for 256 bits of work.
 */
export function leadingZeroBits(id) {
  const value = String(id || '');
  if (!/^[0-9a-f]{64}$/i.test(value)) return -1;
  let bits = 0;
  for (const character of value) {
    const nibble = parseInt(character, 16);
    if (nibble === 0) {
      bits += 4;
      continue;
    }
    return bits + Math.clz32(nibble) - 28;
  }
  return bits;   // a 64-zero id, which no hash will ever be
}

/**
 * A NIP-05 name someone claims, normalised, or null when it is not a name.
 *
 * Claimed is the word: this desk serves satoshi.si's own names, and a name on
 * somebody else's domain can only be checked by fetching that domain, which is a
 * thing a client may do and a desk selling posting rights should not (it would be
 * a way to make this process fetch an address a stranger chose). So the claim is
 * recorded on the order and the work is checked instead — which is the part that
 * cannot be faked, and the only part that decides whether a note is published.
 */
export function powNameClaim(value) {
  const name = String(value ?? '').trim().toLowerCase();
  if (!name || name.length > POW_NAME_MAX) return null;
  return POW_NAME_RE.test(name) ? name : null;
}

// The four-character tier's prices, still exported by name because the public
// payloads and the older board read them. Derived from the table, never typed:
// floor(411 x 0.5) is 205, which is what the old derivation arrived at too, so
// no four-character member's price moves.
const FOUR_CHARACTER_TIER = MEMBER_TIERS.find(tier => tier.maxNameLength === 4);
export const SUB_MEMBER_WEEK_SATS = tierPriceSats(SUB_WEEK_SATS, FOUR_CHARACTER_TIER.offPercent);   // 5
export const SUB_MEMBER_YEAR_SATS = tierPriceSats(SUB_YEAR_SATS, FOUR_CHARACTER_TIER.offPercent);   // 205
export const SUB_PLANS = ['week', 'year'];
export const SUB_WEEK_SECONDS = 7 * 24 * 60 * 60;
export const SUB_YEAR_SECONDS = 365 * 24 * 60 * 60;   // a year of access for 52 weeks of money
export const SUB_REASON = 'covered by an active sticky subscription';
export const NO_SUB_REASON = 'no active sticky subscription for this pubkey';
// Geohash binding. Every pin belongs to a clump of cells on the board's geohash
// grid: one cell for a spot, or that cell together with the neighbours it touches
// when what is being pinned straddles two or three of them — a building on a
// corner, a market square, a stretch of river. The order is priced and bound to
// the whole clump, the publish token is derived from every cell of it, and the
// note that lands must carry every one of them back.
//
// Codes are 4 to 9 characters: below 4 a cell is a region rather than a place, and
// 9 is as deep as the grid is useful. Both floors matter — a clump of 4-character
// cells is a neighbourhood, a clump of 9-character cells is a building.
// The alphabet is geohash's own (base32, minus a, i, l and o).
export const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
export const GEOHASH_MIN_LENGTH = 3;
export const GEOHASH_MAX_LENGTH = 9;
export const GEOHASH_MAX_CELLS = 9;            // a cell and its eight neighbours
export const GEO_TAG = 'g';                    // ["g", "<geohash>"]
export const GEO_URI_TAG = 'i';                // ["i", "geo:<geohash>"]
export const GEO_URI_PREFIX = 'geo:';
export const GEO_KIND_TAG = 'k';               // ["k", "geo"]
export const GEO_KIND_VALUE = 'geo';
// ["geohash", <depth>] — how far above its own cell a note may surface, carried as
// the digits '0' to '6': 0 is the note's own cell alone, 6 is the whole column of
// boards above it (the deepest step there is). Optional on the wire.
export const GEO_SCOPE_TAG = 'geohash';
// The two words the board used before the depth was a number, and what they mean:
// "exact" is its own cell (0), "prefix" is the deepest step there is (6). They must
// keep working, because notes and orders already exist in that form.
export const GEOHASH_MODE_VALUES = ['exact', 'prefix'];
export const GEOHASH_MODE_EXACT = 'exact';
export const GEOHASH_MODE_PREFIX = 'prefix';
// The depth a pin may surface at. A cell runs GEOHASH_MIN_LENGTH to GEOHASH_MAX_LENGTH
// characters, so the deepest cell has GEOHASH_MAX_LENGTH - GEOHASH_MIN_LENGTH boards
// above it; the ceiling is derived from those bounds rather than typed, so the two
// cannot drift apart.
export const GEOHASH_DEPTH_MIN = 0;
export const GEOHASH_DEPTH_MAX = GEOHASH_MAX_LENGTH - GEOHASH_MIN_LENGTH;   // 6
export const BAD_GEOHASH_MODE = 'bad_geohash_mode';
export const GEOHASH_DEPTH_ERROR = 'geohashMode must be a depth from 0 to 6, as digits'
  + ' — or the words "exact" (0) and "prefix" (6)';
export const CLIENT_TAG = 'client';            // ["client", "satoshi.si"]
// An agent may declare itself. ["agent", "pinstr-mcp/1.0"] is optional, at most one, and shaped
// like a client name — a label, not a paragraph. It is a declaration and nothing more: the desk
// cannot verify who typed the words, so the board draws it as the writer's own claim.
export const AGENT_TAG = 'agent';
export const AGENT_LABEL_RE = /^[a-z0-9][a-z0-9._/-]{0,47}$/;
export const CLIENT_VALUE = 'satoshi.si';
export const ANON_TAG = 'anonymous';           // ["anonymous", "24h-local-key"]
export const ANON_TAG_VALUE = '24h-local-key';
// NIP-40. Every note on this board is temporary: it names the moment it stops
// existing and the relay deletes it then. The board offers a day, a week, a month,
// six months or a year; the desk enforces the range rather than the exact rungs,
// so a client may compute a month its own way but cannot outlive a year.
export const EXPIRATION_TAG = 'expiration';    // ["expiration", "<unix seconds>"]
// NIP-27 mentions. Anyone with a NIP-05 identity can be tagged, on any domain, so
// this is not a list the desk can keep; what it can insist on is that the note's
// own text names the key it tags, so a ["p", ...] tag cannot point at somebody the
// note never mentioned.
export const MENTION_TAG = 'p';
export const MENTION_MAX = 5;
// The ladder the board's slider offers, and the one the desk publishes at
// /sticky/v1/config. The bounds are its ends rather than numbers typed twice, so
// the rule cannot drift away from the terms a writer can actually choose.
export const STICKY_LIVELINESS = Object.freeze([
  Object.freeze({ key: '1d', label: '1 day', seconds: 86400 }),
  Object.freeze({ key: '1w', label: '1 week', seconds: 7 * 86400 }),
  Object.freeze({ key: '1m', label: '1 month', seconds: 30 * 86400 }),
  Object.freeze({ key: '6m', label: '6 months', seconds: 180 * 86400 }),
  Object.freeze({ key: '12m', label: '1 year', seconds: 365 * 86400 }),
]);
export const STICKY_DEFAULT_LIVELINESS = '1m';
export const STICKY_MIN_LIVELINESS_SECONDS = Math.min(...STICKY_LIVELINESS.map(rung => rung.seconds));
export const STICKY_MAX_LIVELINESS_SECONDS = Math.max(...STICKY_LIVELINESS.map(rung => rung.seconds));
export const LIVELINESS_GRACE_SECONDS = 120;                 // for a clock that disagrees
const GEOHASH_RE = new RegExp(
  `^[${GEOHASH_ALPHABET}]{${GEOHASH_MIN_LENGTH},${GEOHASH_MAX_LENGTH}}$`,
);
export function isGeohash(value) {
  return typeof value === 'string' && GEOHASH_RE.test(value);
}

/** The rectangle a cell covers, decoded from its code. */
export function geohashCell(value) {
  if (!isGeohash(value)) return null;
  let south = -90;
  let north = 90;
  let west = -180;
  let east = 180;
  let evenBit = true;
  for (const character of value) {
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
  return {
    south, north, west, east,
    latStep: north - south,
    lonStep: east - west,
    center: {lat: (south + north) / 2, lng: (west + east) / 2},
  };
}

/**
 * Where a cell sits in the grid, as whole steps from the south-west corner. Working
 * in steps rather than degrees keeps the comparison exact at every depth, and lets
 * longitude be wrapped the way the grid itself wraps.
 */
function geohashSteps(value) {
  const cell = geohashCell(value);
  if (!cell) return null;
  return {
    lat: Math.round((cell.south + 90) / cell.latStep),
    lon: Math.round((cell.west + 180) / cell.lonStep),
    latCount: Math.round(180 / cell.latStep),
    lonCount: Math.round(360 / cell.lonStep),
  };
}

/** Do two cells of the same depth share a side or a corner? */
export function geohashTouches(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (left === right || left.length !== right.length) return false;
  const a = geohashSteps(left);
  const b = geohashSteps(right);
  if (!a || !b) return false;
  const latGap = Math.abs(a.lat - b.lat);
  const lonGap = Math.abs(a.lon - b.lon);
  return latGap <= 1 && Math.min(lonGap, a.lonCount - lonGap) <= 1;
}

/** Is every cell reachable from the first by stepping between cells that touch? */
export function geohashCellsConnected(cells) {
  if (cells.length < 2) return cells.length === 1;
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    const current = queue.pop();
    for (const cell of cells) {
      if (!seen.has(cell) && geohashTouches(current, cell)) {
        seen.add(cell);
        queue.push(cell);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * The cells a pin pays for, from either wire shape: `geohashes` for a clump, or
 * the older single `geohash`. One to nine cells, all cut to the same depth, each
 * listed once, and the whole clump stuck together — a note is one note on one
 * price whether it sits on one cell or on a corner spread over three.
 *
 * @returns {{ok: true, cells: string[], primary: string, sorted: string[]}
 *          | {ok: false, code: string, error: string}}
 */
export function normaliseGeohashSet(value) {
  const list = (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(cell => (typeof cell === 'string' ? cell.trim() : cell))
    .filter(cell => typeof cell === 'string' && cell !== '');
  const bad = error => ({ok: false, code: 'bad_geohash', error});
  if (!list.length) {
    return bad('a pin needs the cells it sits on: geohash (one cell) or geohashes (one or more), '
      + `${GEOHASH_MIN_LENGTH}-${GEOHASH_MAX_LENGTH} characters from "${GEOHASH_ALPHABET}" (lowercase)`);
  }
  if (list.length > GEOHASH_MAX_CELLS) {
    return bad(`a pin can sit on at most ${GEOHASH_MAX_CELLS} cells: one cell and the neighbours it touches`);
  }
  if (new Set(list).size !== list.length) {
    return bad('each cell may be listed only once');
  }
  if (!list.every(cell => isGeohash(cell))) {
    return bad(`every cell must be ${GEOHASH_MIN_LENGTH}-${GEOHASH_MAX_LENGTH} characters from `
      + `"${GEOHASH_ALPHABET}" (lowercase)`);
  }
  if (new Set(list.map(cell => cell.length)).size !== 1) {
    return bad('every cell must be cut to the same depth');
  }
  if (!geohashCellsConnected(list)) {
    return bad('the cells of a pin must stick together: each of them has to touch another cell of the same order');
  }
  return {ok: true, cells: list, primary: list[0], sorted: [...list].sort()};
}
export const MEMBER_REASON = 'satoshi.si NIP-05 member';
export const NOT_MEMBER_REASON = 'no active satoshi.si NIP-05 entry for this pubkey';
export const PIN_KIND = 1;              // an ordinary note, as the board renders it
export const STICKY_VERSION = 'v1';
export const STICKY_TOPIC = 'pinstr';           // the ["t", …] tag that marks a note, exactly once

/** How many hashtags may accompany the reserved topic marker. */
export const HASHTAG_MAX = 3;

/** A hashtag is lowercase Unicode letters, numbers, "_" or "-". */
const HASHTAG_RE = /^[\p{L}\p{N}_-]+$/u;

/**
 * The note's filing tags, without the reserved marker.
 *
 * `pinstr` itself is the marker and may not be repeated as a hashtag, so the
 * values are checked as a set: unique, lowercase, and each one a plain word.
 * A hashtag that looks the same as another one after lowercasing is a duplicate,
 * which is why the check runs on the normalised value.
 */
export function validateHashtags(values) {
  if (values.length > HASHTAG_MAX) {
    return { ok: false, error: `a note may carry at most ${HASHTAG_MAX} hashtags, this one has ${values.length}` };
  }
  const seen = new Set();
  for (const raw of values) {
    const value = typeof raw === 'string' ? raw : '';
    if (!value) {
      return { ok: false, error: 'a hashtag cannot be empty' };
    }
    if (value !== value.toLowerCase()) {
      return { ok: false, error: `hashtag "${value}" is not lowercase` };
    }
    if (!HASHTAG_RE.test(value)) {
      return { ok: false, error: `hashtag "${value}" may only contain letters, numbers, "_" or "-"` };
    }
    if (value === STICKY_TOPIC) {
      return { ok: false, error: `"${STICKY_TOPIC}" is the reserved topic marker and cannot be repeated as a hashtag` };
    }
    if (seen.has(value)) {
      return { ok: false, error: `hashtag "${value}" appears twice` };
    }
    seen.add(value);
  }
  return { ok: true, hashtags: [...seen] };
}
export const STICKY_TAG = 'sticky';             // the tag carrying color/placement/font
export const MAX_CONTENT_CHARS = 501;
export const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange'];
export const FONTS = ['typewriter', 'handwritten', 'patrick-hand', 'kalam', 'comfortaa', 'noto-sans', 'noto-serif', 'noto-mono', 'roboto', 'mono', 'roboto-slab', 'open-sans', 'source-sans', 'ubuntu', 'pt-sans', 'pt-serif', 'fira-mono', 'ibm-plex-mono', 'merriweather', 'atkinson', 'serif',];
export const PLACEMENT_MIN = 0;         // x and y are fractions of the board
export const PLACEMENT_MAX = 1;
export const ROTATION_MIN = -75;        // degrees; the board offers the same range
export const ROTATION_MAX = 75;
export const TOKEN_TTL_SECONDS = 900;   // a publish token is good for 15 minutes
export const PIN_TTL_DAYS = 30;         // how long a pin counts as live (relay write access)
export const ORDER_TTL_SECONDS = 3600;  // unpaid orders are pruned after an hour
// Freshness window for a published event's created_at. This is deliberately not
// "must be newer than the order": the ordinary client flow is compose -> hash ->
// sign -> pay -> publish, so a perfectly good note is often signed seconds or
// minutes *before* the order exists. What matters is that the material is recent
// and not stamped in the future.
export const EVENT_MAX_AGE_SECONDS = 3600;      // signed up to an hour before publishing
export const EVENT_FUTURE_TOLERANCE_SECONDS = 300;  // allow for clock skew

// The rails a sticky order can be paid on. Bark first (it is the native rail and
// the one the board leads with), Lightning second: both are the same 21/11 sats,
// so a buyer pays with whichever wallet is already open.
export const PAYMENT_METHOD = 'BARK';
export const PAYMENT_METHODS = ['BARK', 'BTC-LN'];
export const BOLT11_PREFIXES = ['lnbc', 'lntb', 'lnbcrt', 'lnsb'];

const HEX64 = /^[0-9a-f]{64}$/;
const isHex64 = (v) => typeof v === 'string' && HEX64.test(v.toLowerCase()) && v.length === 64;

/** Code-point length: an emoji in a sticky counts as one character, as the UI shows it.
 *  The board counts UTF-16 units, which is stricter, so anything the board accepts
 *  a buyer can publish here. */

/** Is this a usable placement fraction, as the board sends ("0.50000")? */
function isFraction(value) {
  return Number.isFinite(value) && value >= PLACEMENT_MIN && value <= PLACEMENT_MAX;
}
const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
export const LINK_LABEL = 'link';         // what the board prints in place of an address

/**
 * What a note's limit counts: the note as a reader will see it. An address is machine data
 * that can run to thousands of characters, while the board prints the word "link" in its
 * place, so a link counts as that word. The board measures the same way, and
 * deploy/check-frontend-contract.mjs holds the two together.
 */
export function contentLength(content) {
  const text = String(content || '');
  let length = 0;
  let cursor = 0;
  for (const found of text.matchAll(LINK_PATTERN)) {
    length += [...text.slice(cursor, found.index)].length + LINK_LABEL.length;
    cursor = found.index + found[0].length;
  }
  return length + [...text.slice(cursor)].length;
}

/**
 * The paid commitment. The buyer hashes exactly this string in the browser and
 * pays for the 64-hex result; at publish time the desk recomputes it from the
 * event it was handed, so the note that lands cannot differ from the note that
 * was paid for.
 *
 * Deliberately a newline-joined string rather than JSON: no key ordering, no
 * escaping differences between the browser and Node. content is last so its own
 * newlines are unambiguous.
 *
 *   sha256hex(utf8("v1\n" + color + "\n" + font + "\n" + normalisedText))
 *
 * Placement is deliberately absent: the board lets the buyer drag the note after
 * paying, so a position cannot be part of what was bought. It is bounds-checked
 * at publish time instead.
 *
 * normaliseStickyText must stay identical to the board's, or the two sides hash
 * different strings for the same note.
 */
export function normaliseStickyText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

export function stickyFingerprint(content, color, font) {
  const payload = `${STICKY_VERSION}\n${color}\n${font}\n${normaliseStickyText(content)}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function randomId(bytes = 16) {
  return randomBytes(bytes).toString('hex');
}

// ----------------------------------------------------------------- membership

/**
 * Does this pubkey currently own a name in the desk's authoritative names
 * database?
 *
 * That database is the desk's own names.json snapshot of satoshi.si's
 * .well-known/nostr.json, refreshed by the worker. Membership therefore means
 * "owns an active @satoshi.si entry right now": a name that is removed drops out
 * of the snapshot and its key stops qualifying, and a name that is reassigned
 * moves the discount to the new key. Comparison is case-insensitive on both
 * sides because keys are hex and the file has historically been inconsistent.
 */
export function isMember(pubkey, names) {
  return memberName(pubkey, names) !== null;
}

/**
 * The name this pubkey owns in the desk's snapshot, or null.
 *
 * One key holds one name — the store refuses a key that already owns one — but this
 * is written to survive a file that says otherwise: the SHORTEST name wins, because
 * that is the one that was paid for dearest and so carries the deepest discount.
 */
export function memberName(pubkey, names) {
  if (!isHex64(pubkey) || !names || typeof names !== 'object') return null;
  const wanted = pubkey.toLowerCase();
  let best = null;
  for (const [name, value] of Object.entries(names)) {
    if (typeof value !== 'string' || value.toLowerCase() !== wanted) continue;
    if (best === null || name.length < best.length) best = name;
  }
  return best;
}

/**
 * The tier a pubkey's name puts it in, and what that makes both plans cost.
 *
 * The name's length is the whole decision: three characters post free, four pay
 * half, five or more pay three quarters. A key with no name is not a member and
 * pays the list price, and a name removed from the snapshot drops its key back to
 * it — membership is a fact about the file *now*, never a stored flag.
 */
export function memberTierFor(pubkey, names) {
  const name = memberName(pubkey, names);
  if (name === null) {
    return {
      member: false, name: null, nameLength: null, offPercent: 0, reason: NO_NAME_REASON,
      weekSats: SUB_WEEK_SATS, yearSats: SUB_YEAR_SATS,
    };
  }
  const tier = MEMBER_TIERS.find(t => t.maxNameLength === null || name.length <= t.maxNameLength)
    || MEMBER_TIERS[MEMBER_TIERS.length - 1];
  return {
    member: true, name, nameLength: name.length, offPercent: tier.offPercent, reason: tier.reason,
    weekSats: tierPriceSats(SUB_WEEK_SATS, tier.offPercent),
    yearSats: tierPriceSats(SUB_YEAR_SATS, tier.offPercent),
  };
}

/** The published ladder. JSON-safe: `maxNameLength: null` is the open-ended top tier. */
export function memberTierTable() {
  return MEMBER_TIERS.map(tier => ({
    maxNameLength: tier.maxNameLength,
    offPercent: tier.offPercent,
    weekSats: tierPriceSats(SUB_WEEK_SATS, tier.offPercent),
    yearSats: tierPriceSats(SUB_YEAR_SATS, tier.offPercent),
  }));
}

/**
 * True when nothing is due on this order and there is no rail to pay it on.
 *
 * A note a subscription already covers, and a plan the name's tier makes free,
 * both mean the same thing to a client: settle it, do not look for an invoice.
 */
export function hasNothingToPay(order) {
  return Boolean(order && (order.covered === true || order.freeTier === true
    || order.powFree === true));
}

/**
 * The price for one pubkey, in the shape the page consumes.
 *
 * Returned by GET /sticky/v1/quote and used internally when an order is created,
 * so the number a buyer is shown and the number they are invoiced come from the
 * same function.
 */
export function quoteForPubkey(pubkey, names) {
  if (!isHex64(pubkey)) {
    return { ok: false, error: 'pubkey must be 64 hexadecimal characters (a Nostr x-only pubkey)' };
  }
  return quoteSubscription(pubkey, 'week', names);
}

/**
 * Price one subscription plan for one pubkey. Same contract as the per-note
 * quote used to have: the number shown and the number invoiced come from here.
 */
export function quoteSubscription(pubkey, plan = 'week', names = null) {
  if (!isHex64(pubkey)) {
    return { ok: false, error: 'pubkey must be 64 hexadecimal characters (a Nostr x-only pubkey)' };
  }
  if (!SUB_PLANS.includes(plan)) {
    return { ok: false, code: 'bad_plan', error: 'plan must be "week" or "year"' };
  }
  const tier = memberTierFor(pubkey, names);
  const baseSats = plan === 'week' ? SUB_WEEK_SATS : SUB_YEAR_SATS;
  const sats = plan === 'week' ? tier.weekSats : tier.yearSats;
  return {
    ok: true,
    plan,
    seconds: plan === 'week' ? SUB_WEEK_SECONDS : SUB_YEAR_SECONDS,
    baseSats,
    sats,
    // The tier travels with the quote so a client can say *why* this price, and so
    // a free plan is visibly free rather than a zero the page has to interpret.
    nameLength: tier.nameLength,
    offPercent: tier.offPercent,
    free: sats === 0,
    discount: {
      applied: tier.member,
      offPercent: tier.offPercent,
      name: tier.name,
      nameLength: tier.nameLength,
      reason: tier.member ? tier.reason : NOT_MEMBER_REASON,
    },
  };
}

/** Is this pubkey covered right now? `subscriptions` is {pubkey: record}. */
export function hasActiveSubscription(subscriptions, pubkey, now = Math.floor(Date.now() / 1000)) {
  return activeSubscription(subscriptions, pubkey, now) != null;
}

/** The active record for a pubkey, or null. */
export function activeSubscription(subscriptions, pubkey, now = Math.floor(Date.now() / 1000)) {
  if (!subscriptions || typeof subscriptions !== 'object' || !isHex64(pubkey)) return null;
  const record = subscriptions[pubkey.toLowerCase()];
  if (!record || typeof record !== 'object') return null;
  return Number.isInteger(record.expiresAt) && now < record.expiresAt ? record : null;
}

/** What the page shows about a subscription, without inventing one. */
export function subscriptionView(subscriptions, pubkey, now = Math.floor(Date.now() / 1000)) {
  const active = activeSubscription(subscriptions, pubkey, now);
  const record = subscriptions?.[String(pubkey || '').toLowerCase()] ?? null;
  return {
    active: Boolean(active),
    plan: active?.plan ?? null,
    expiresAt: active?.expiresAt ?? null,
    secondsLeft: active ? Math.max(0, active.expiresAt - now) : 0,
    renewBy: active ? active.expiresAt : null,
    lastPlan: record?.plan ?? null,
    lastExpiresAt: record?.expiresAt ?? null,
    // What the reader paid and when, so the account dialog can say more than "active": the record
    // already held these and the view was throwing them away.
    paidSats: active && Number.isInteger(active.sats) ? active.sats : null,
    startedAt: active && Number.isInteger(active.startedAt) ? active.startedAt : null,
    paidAt: active && Number.isInteger(active.extendedAt) ? active.extendedAt : null,
  };
}

/**
 * Apply a settled subscription order.
 *
 * Time is added, never replaced: paying again while still covered extends what is
 * left rather than restarting the clock, which is what "renew" has to mean for a
 * user who pays early.
 */
export function activateSubscription(subscriptions, order, now = Math.floor(Date.now() / 1000)) {
  const current = subscriptions && typeof subscriptions === 'object' ? {...subscriptions} : {};
  const pubkey = String(order.pubkey || '').toLowerCase();
  const plan = order.plan === 'year' ? 'year' : 'week';
  const seconds = Number.isInteger(order.seconds) && order.seconds > 0
    ? order.seconds
    : (plan === 'year' ? SUB_YEAR_SECONDS : SUB_WEEK_SECONDS);
  const existing = activeSubscription(current, pubkey, now);
  const from = existing ? existing.expiresAt : now;
  const record = {
    pubkey,
    plan,
    sats: Number.isInteger(order.sats) ? order.sats : 0,
    startedAt: existing ? existing.startedAt : now,
    extendedAt: now,
    expiresAt: from + seconds,
    orderId: order.id ?? null,
    anonymous: false,
  };
  current[pubkey] = record;
  return { subscriptions: current, subscription: record };
}

// ----------------------------------------------------------------- ordering
/**
 * Read a geohash depth off the wire, or refuse it.
 *
 * Three forms reach this: nothing at all, which is the note's own cell; the two
 * words the board used before the depth was a number; and the depth itself as a
 * digit '0' to '6'. A claim outside the range, or one that is not a whole number
 * at all ('03', '3.5', '-1', true), is refused rather than rounded into range: the
 * depth is part of what the buyer paid for, so a depth the desk cannot verify is a
 * depth it must not accept. A JSON number in range is the same claim as its digits.
 */
export function geohashDepthOf(value) {
  if (value === undefined) return { ok: true, depth: GEOHASH_DEPTH_MIN, wire: GEOHASH_MODE_EXACT };
  if (value === GEOHASH_MODE_EXACT) return { ok: true, depth: GEOHASH_DEPTH_MIN, wire: GEOHASH_MODE_EXACT };
  if (value === GEOHASH_MODE_PREFIX) return { ok: true, depth: GEOHASH_DEPTH_MAX, wire: GEOHASH_MODE_PREFIX };
  const text = typeof value === 'number' ? (Number.isInteger(value) ? String(value) : '') : value;
  if (typeof text === 'string' && /^[0-9]$/.test(text) && Number(text) <= GEOHASH_DEPTH_MAX) {
    return { ok: true, depth: Number(text), wire: text };
  }
  return { ok: false, code: BAD_GEOHASH_MODE, error: GEOHASH_DEPTH_ERROR };
}

/**
 * The depth a stored order was bought at, from whichever form it carries.
 *
 * Orders written since the depth became a number hold it as one; orders written
 * before that hold only the word. Everything else — no field at all — is the
 * note's own cell, which is what the board defaulted to and what a pin that says
 * nothing was always charged for.
 */
export function orderGeohashDepth(order) {
  if (order && order.geohashDepth !== undefined && order.geohashDepth !== null) {
    return geohashDepthOf(order.geohashDepth);
  }
  return geohashDepthOf(order ? order.geohashMode : undefined);
}

/**
 * Validate what the browser is allowed to ask for. Everything monetary and
 * everything structural is decided here; the browser only chooses the action
 * and identifies itself.
 */
export function validateOrderInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const { action, pubkey } = input;
  if (action !== 'pin' && action !== 'subscribe') {
    return { ok: false, error: 'action must be "pin" or "subscribe"' };
  }
  if (!isHex64(pubkey)) {
    return { ok: false, error: 'pubkey must be 64 hex characters (a Nostr x-only pubkey)' };
  }
  const out = { action, pubkey: pubkey.toLowerCase() };

  // A subscription is itself the thing being bought: it carries no note, no cell
  // and no identity mode, and a field sent by mistake is refused rather than
  // quietly ignored.
  if (action === 'subscribe') {
    if (!SUB_PLANS.includes(input.plan)) {
      return { ok: false, code: 'bad_plan', error: 'plan must be "week" or "year"' };
    }
    // A throwaway identity can never hold a subscription: it has no name to
    // attach one to, the desk prices it per note, and a plan bought from one is
    // sats spent on nothing. This has its own reason rather than the generic
    // "a subscription carries no anonymous" below, so that a client can tell a
    // refused identity apart from a field sent by mistake.
    if (input.anonymous === true) {
      return {
        ok: false,
        code: ANON_NO_SUBSCRIPTION,
        error: 'A temporary anonymous identity cannot hold a subscription — it pays per note '
          + `(${STICKY_ANON_SATS} sats to pin one). Log in with your own key to subscribe.`,
      };
    }
    for (const field of ['geohash', 'contentHash', 'anonymous', 'pow', 'powName', 'nip05', 'agent']) {
      if (input[field] !== undefined) {
        return { ok: false, code: 'bad_subscription', error: `a subscription carries no ${field}` };
      }
    }
    out.plan = input.plan;
    return { ok: true, order: out };
  }

  if (action === 'pin') {
    if (!isHex64(input.contentHash)) {
      return { ok: false, error: 'contentHash must be 64 hex characters (sha256 of the note you will publish)' };
    }
    out.contentHash = input.contentHash.toLowerCase();
    // `imageHash` is the desk's own record that it stored a print for this order. It is written
    // only by a successful upload, and it is the one thing that lets a wordless note be published
    // at all (see verifyPublishEvent), so a client must never be able to set it. It is dropped
    // here rather than copied: a pin that arrives claiming one gets no print out of it, and the
    // note it publishes is refused as empty exactly as if the field had not been sent. Dropped
    // rather than refused on purpose — this desk has been broken mid-season by a strict reading
    // of its own request fields (see the removal field in the order-input test).
    // The picture's own digest, when the note has one, travels as `pictureHash` below: the
    // reader's claim about their own file, used only by the pay-once rule.
    if (input.pictureHash !== undefined && input.pictureHash !== null && !isHex64(input.pictureHash)) {
      return {
        ok: false,
        code: 'bad_picture_hash',
        error: 'pictureHash must be 64 hex characters (sha256 of the picture file) when it is present',
      };
    }
    out.pictureHash = isHex64(input.pictureHash) ? input.pictureHash.toLowerCase() : null;
    // A pin without cells is not a pin: the cells are what bind the note to a
    // place on the board, and the note must carry every one of them back.
    const cells = normaliseGeohashSet(input.geohashes ?? input.geohash);
    if (!cells.ok) return cells;
    if (input.geohash !== undefined && input.geohashes !== undefined && input.geohash !== cells.primary) {
      return {
        ok: false,
        code: 'bad_geohash',
        error: 'geohash must be the first entry of geohashes when both are sent',
      };
    }
    out.geohash = cells.primary;          // the cell the note is written on
    out.geohashes = cells.sorted;         // every cell this pin pays for
    // How far above its own cell the note may surface is part of the order,
    // because it is part of what the buyer paid for: a depth of 0 may not be
    // spread upwards later, and a deeper claim has to be one the desk can verify
    // before it is written to the order. Both the depth as a number and the form
    // it arrived in are kept, so the note keeps what was bought while an older
    // reader still finds the word it knows.
    const depth = geohashDepthOf(input.geohashMode);
    if (!depth.ok) return depth;
    out.geohashMode = depth.wire;
    out.geohashDepth = depth.depth;
    if (input.anonymous !== undefined && typeof input.anonymous !== 'boolean') {
      return { ok: false, code: 'bad_anonymous', error: 'anonymous must be true or false when it is present' };
    }
    out.anonymous = input.anonymous === true;
    // Work instead of money. A throwaway identity cannot take this route: its price is
    // per note and flat, and the point of that tier is that posting without a name costs
    // sats rather than a key's own time. A named key may — of any domain — because the
    // work is the half that can be checked here, from the event alone.
    if (input.pow !== undefined && typeof input.pow !== 'boolean') {
      return { ok: false, code: 'bad_pow', error: 'pow must be true or false when it is present' };
    }
    out.pow = input.pow === true;
    if (out.pow && out.anonymous) {
      return {
        ok: false,
        code: ANON_NO_POW,
        error: 'A temporary anonymous identity cannot post by mining — it pays per note '
          + `(${STICKY_ANON_SATS} sats to pin one), which is the whole of that tier. `
          + 'Log in with your own key to mine your note instead.',
      };
    }
    // The name a writer offers for the free door. Checked for shape here and for truth by the
    // route, which asks the domain and passes the answer back in as `nip05Verified`: a model that
    // fetches addresses on request is a model that cannot be reasoned about, so it does not.
    if (input.nip05 !== undefined && input.nip05 !== null) {
      const claim = powNameClaim(input.nip05);
      if (!claim) {
        return {
          ok: false,
          code: 'bad_nip05',
          error: 'nip05 must be your own NIP-05 name as name@domain — the name a domain publishes '
            + 'for your pubkey in /.well-known/nostr.json',
        };
      }
      // A throwaway identity has no name to offer: the desk would have to ask a domain about a key
      // that was minted a minute ago on this board, and the answer could only ever be no. An agent
      // is the exception: its name has no bearing on its price, so the name is simply not recorded
      // rather than turning a pin it would have paid for into a refusal.
      if (out.anonymous && input.agent === true) {
        out.nip05 = null;
      } else if (out.anonymous) {
        return {
          ok: false,
          code: 'anon_nip05',
          error: 'A temporary anonymous identity carries no NIP-05 name. Log in with your own key — '
            + `if it has a name that answers for it, pinning is free; otherwise a note is ${STICKY_ANON_SATS} sats.`,
        };
      }
      out.nip05 = claim;
    } else {
      out.nip05 = null;
    }
    // Whether the caller is a program. Not a security boundary — a client that lies about this
    // takes a door meant for people — but the MCP server sets it on every order it places, so
    // automation pays by its own statement rather than by being guessed at from its address.
    if (input.agent !== undefined && typeof input.agent !== 'boolean') {
      return { ok: false, code: 'bad_agent', error: 'agent must be true or false when it is present' };
    }
    out.agent = input.agent === true;
    if (out.pow) {
      const claim = powNameClaim(input.powName);
      if (!claim) {
        return {
          ok: false,
          code: 'bad_pow_name',
          error: 'a note paid for with work carries powName: your own NIP-05 name as name@domain, '
            + 'on any domain. It is recorded on the order so the work has a name beside it.',
        };
      }
      out.powName = claim;
    } else if (input.powName !== undefined) {
      return { ok: false, code: 'bad_pow_name', error: 'powName only travels with pow: true' };
    }
    return { ok: true, order: out };
  }

  // Every other action is refused by the action check above.
  return { ok: false, error: `action "${action}" is not supported` };
}

/** Order states that are the same order still in flight, not a new one. */
export const ANON_PENDING_STATUSES = Object.freeze(['awaiting_invoice', 'awaiting_payment', 'paid']);

/**
 * The one-note rule for a throwaway identity, decided on the stored orders alone.
 *
 * A 24-hour key spends its one note: once a pin under it has been published,
 * another pin from that key is refused (`anonymous_key_used`). What must not be
 * refused is a retry — an order still waiting for payment, or paid and not yet
 * published, is the *same* note, so it is handed back rather than invoiced again.
 *
 * `orders` is the whole order map, read and written in one synchronous stretch by
 * the caller, which is what makes this atomic: two orders racing for one key
 * cannot both get past it.
 */
export function anonymousPinGate(orders, pubkey) {
  const key = String(pubkey || '').toLowerCase();
  const mine = Object.values(orders || {}).filter(o => o && o.anonymous === true
    && o.action === 'pin' && String(o.pubkey || '').toLowerCase() === key);
  const byNewest = (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  const published = mine.filter(o => o.status === 'published').sort(byNewest)[0];
  if (published) return { ok: false, code: ANON_KEY_USED, order: published };
  const pending = mine.filter(o => ANON_PENDING_STATUSES.includes(o.status)).sort(byNewest)[0];
  if (pending) return { ok: true, reused: true, order: pending };
  return { ok: true, reused: false, order: null };
}

/**
 * @param {{now?: number, names?: object|null, subscriptions?: object|null}} options
 *   names and subscriptions are the authoritative records the price is read from.
 */
export function createStickyOrder(input, { now = Math.floor(Date.now() / 1000), names = null, subscriptions = null,
  nip05Verified = false } = {}) {
  const validated = validateOrderInput(input);
  if (!validated.ok) return validated;
  const { action, pubkey, contentHash, pictureHash = null, geohash = null, geohashes = null, geohashMode = null,
          geohashDepth = null, anonymous = false, plan = null, pow = false, powName = null,
          nip05 = null, agent = false } = validated.order;
  // Priced here, from the names database and the subscription records, every
  // single time. Whatever the browser was shown (or claims) has no bearing on
  // what it is charged.
  const anonymousPin = action === 'pin' && anonymous === true;
  const powPin = action === 'pin' && pow === true && !anonymousPin;
  // The free door. `nip05Verified` is the route's answer to "does this name answer for this key",
  // asked of the domain and cached; here it only decides the price. An agent never walks through
  // it, whatever name it carries — that is the whole of the difference between a person and a
  // program, and it is the caller's own statement about itself.
  const nip05Free = action === 'pin' && !anonymousPin && agent !== true && nip05Verified === true && Boolean(nip05);
  let quote;
  let covered = false;
  let freeTier = false;
  let powFree = false;
  let nip05Settled = false;
  if (action === 'subscribe') {
    quote = quoteSubscription(pubkey, plan, names);
    if (!quote.ok) return quote;
    // A three-character name pays nothing, and a zero-sat invoice is not something
    // BTCPay can be asked for: there is no invoice and no rail, so the order is
    // settled as it is created and the desk hands out the time itself (see the
    // orders route in server.mjs). The note path is untouched by this.
    freeTier = quote.sats === 0;
  } else if (anonymousPin) {
    // A 24-hour throwaway identity cannot hold a name, so it can never be a
    // member and can never subscribe: it pays per note, flat, and may pin one.
    quote = { sats: STICKY_ANON_SATS, baseSats: STICKY_ANON_SATS, discount: { applied: false, reason: ANON_REASON } };
  } else if (hasActiveSubscription(subscriptions, pubkey, now)) {
    // Already paid for: no invoice, and the order is settled here so the note can
    // be published straight away.
    // Decided **before** the free door on purpose. A subscriber who sends their NIP-05 name would
    // otherwise settle as a free note, which is the metered door — and removing that meter is
    // exactly what a subscription buys. A covered note must never spend the allowance.
    covered = true;
    quote = { sats: 0, baseSats: 0, discount: { applied: true, reason: SUB_REASON } };
  } else if (nip05Free) {
    // Nothing to pay: the name answered for this key, so the note is settled here and the token is
    // fresh the moment it is asked for. `baseSats` stays 0 rather than quoting a price it did not
    // cost, and the reason travels with the order so the board can say why it was free. Free notes
    // are the only ones the daily meter counts — see `freeNoteUsage`.
    nip05Settled = true;
    quote = { sats: 0, baseSats: 0, discount: { applied: true, reason: NIP05_REASON } };
  } else if (powPin) {
    // One note, paid for with work rather than sats, and only for a key that claims a
    // NIP-05 name — its own, on any domain, because a name on another domain can only be
    // checked by asking that domain, and a desk that fetches a stranger's address on
    // request is a desk with a new way to be turned against the network. The claim is
    // recorded; the difficulty below is what actually decides whether the note lands.
    // `baseSats` is the money this order did *not* cost: the weekly price for this key's
    // own tier, so the board can say what the work was worth without inventing a number.
    const weekly = quoteSubscription(pubkey, 'week', names);
    powFree = true;
    quote = {
      sats: 0,
      baseSats: weekly.ok ? weekly.sats : SUB_WEEK_SATS,
      discount: { applied: true, reason: POW_REASON },
    };
  } else if (agent === true) {
    // A program with a per-note price, whether or not the big relays know its key. An agent that is
    // not anonymous in the board's sense still has nobody to bill a week to, and the MCP server says
    // what it is on every order, so it is priced as one note — the same as a throwaway key. That is
    // the whole of "an agent pays per note": the free door is a door for a person with a name, and
    // paying by the note is what a program can do instead. Mining is above this, because work is
    // work whoever does it.
    quote = { sats: STICKY_ANON_SATS, baseSats: STICKY_ANON_SATS, discount: { applied: false, reason: AGENT_PIN_REASON } };
  } else {
    return {
      ok: false,
      code: 'subscription_required',
      error: 'Pinning to a board needs an active subscription: '
        + `${SUB_WEEK_SATS} sats a week or ${SUB_YEAR_SATS} sats a year — free for a 3-character satoshi.si `
        + 'name, half for 4 characters, three quarters for 5 or more. '
        + `A 24-hour anonymous identity pays per note instead: ${STICKY_ANON_SATS} sats to pin one. `
        + `A key with a NIP-05 name on any domain may instead mine the note: ${POW_BITS} bits of work.`,
    };
  }
  // Everything that settles an order without an invoice: a paid subscription, a free tier, a mined
  // note and a verified name. One name for it, so a new door cannot be added and then half-wired.
  const settledNow = covered || freeTier || powFree || nip05Settled;
  return {
    ok: true,
    order: {
      id: randomId(12),
      action,
      pubkey,
      contentHash: contentHash ?? null,
      pictureHash: pictureHash ?? null,   // the reader's own digest of the file they picked
      geohash: geohash ?? null,           // the cell this pin was written on
      geohashes: geohashes ?? null,       // every cell this pin paid for, sorted
      geohashMode: action === 'pin' ? (geohashMode ?? GEOHASH_MODE_EXACT) : null,   // the form the buyer sent it in
      geohashDepth: action === 'pin' ? (geohashDepth ?? GEOHASH_DEPTH_MIN) : null,  // how far above its cell it may surface
      anonymous: anonymousPin,               // identity mode, priced above
      plan: plan ?? null,                 // the subscription plan, on a subscribe order
      seconds: quote.seconds ?? null,     // how much time it buys
      covered,                            // true when a subscription already paid for it
      freeTier,                           // true when the name's tier makes this plan free
      powFree,                            // true when the note is paid for with work, not sats
      nip05Free: nip05Settled,            // true when the writer's own NIP-05 name paid instead
      nip05: nip05 ?? null,               // the name offered, verified when nip05Free is true
      agent: agent === true,              // the caller says it is a program, and pays accordingly
      powBits: powFree ? POW_BITS : null, // the difficulty the note's id must reach
      powName: powFree ? powName : null,  // the NIP-05 name the writer claimed, on any domain
      sats: quote.sats,                   // fixed here, never from the caller
      baseSats: quote.baseSats,
      discount: quote.discount,
      paymentMethod: nip05Settled ? 'nip05' : (covered ? 'subscription' : (powFree ? 'pow' : PAYMENT_METHOD)),
      status: settledNow ? 'paid' : 'awaiting_invoice',
      invoiceId: null,
      payment: nip05Settled ? { method: 'nip05', sats: 0 }
        : (covered ? { method: 'subscription', sats: 0 } : null),   // {arkAddress, paymentLink}
      createdAt: now,
      expiresAt: now + ORDER_TTL_SECONDS,
      paidAt: settledNow ? now : null,
      // A free plan and a mined note are settled here as well as a covered one: the
      // buyer has already paid, so the token has to be fresh the moment they poll.
      publishTokenExpiresAt: settledNow ? now + TOKEN_TTL_SECONDS : null,
      publishTokenUsedAt: null,
      publishedEventId: null,
      pinExpiresAt: null,
    },
  };
}

/**
 * Attach the invoice the worker created. BARK is required: an order with no Bark
 * rail is not payable and is refused rather than shown as pending forever.
 */
/**
 * The sat amount a BOLT11 invoice asks for, or null when it cannot be read.
 *
 * BOLT11 puts the amount in the human-readable part: the digits after the
 * network prefix, with an optional multiplier — m (milli), u (micro), n (nano),
 * p (pico) — before the separator. `lnbc210n1…` is 210 nano-BTC = 21 sats, which
 * is exactly what a 21-sat sticky invoice looks like.
 *
 * Returns null for an amount-less invoice (nothing between prefix and separator)
 * or a sub-satoshi amount. A desk that sells at a fixed price has no use for
 * either, so attachInvoice refuses those rather than guessing.
 */
export function bolt11Sats(invoice) {
  if (typeof invoice !== 'string') return null;
  const match = invoice.trim().toLowerCase().match(/^(lnbc|lntb|lnbcrt|lnsb)(\d+)([munp]?)1/);
  if (!match) return null;
  const value = Number(match[2]) * { '': 1, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 }[match[3]];
  const sats = value * 100_000_000;
  return Number.isInteger(sats) && sats > 0 ? sats : null;
}

export function attachInvoice(order, invoice) {
  if (!invoice || typeof invoice !== 'object') return { ok: false, error: 'invoice must be an object' };
  // Only an order that is actually waiting for one. A note covered by a
  // subscription is settled the moment it is created, and an order that already
  // has its price settled must never quietly take a second invoice.
  if (order.status !== 'awaiting_invoice') {
    return { ok: false, error: `this order is not waiting for an invoice (status: ${order.status})` };
  }
  const arkAddress = typeof invoice.arkAddress === 'string' ? invoice.arkAddress.trim() : '';
  const bolt11 = typeof invoice.bolt11 === 'string' ? invoice.bolt11.trim() : '';
  // One rail is enough; a rail-less invoice is not payable at all.
  if (!arkAddress && !bolt11) {
    return { ok: false, error: 'no payable rail: invoice carried neither an ark address nor a BOLT11 invoice' };
  }
  if (bolt11) {
    // The Lightning rail is checked here, not just taken from the worker's report:
    // a BOLT11 that asks for anything other than this order's price is refused.
    const lightningSats = bolt11Sats(bolt11);
    if (lightningSats === null) {
      return { ok: false, error: 'the Lightning rail is amount-less or unreadable, so it cannot be a fixed price' };
    }
    if (lightningSats !== order.sats) {
      return { ok: false, error: `the Lightning invoice asks for ${lightningSats} sats but this order was created at ${order.sats}` };
    }
  }
  // If the worker tells us what it actually invoiced, it has to be the price the
  // order was created at — a discounted order must not be invoiced at the base
  // price (or the other way round) and then quietly accepted.
  const amountSats = Number.isInteger(invoice.amountSats) ? invoice.amountSats : null;
  if (amountSats !== null && amountSats !== order.sats) {
    return { ok: false, error: `invoice is for ${amountSats} sats but this order was created at ${order.sats}` };
  }
  const paymentLink = typeof invoice.paymentLink === 'string' ? invoice.paymentLink.trim() : null;
  return {
    ok: true,
    order: {
      ...order,
      status: 'awaiting_payment',
      invoiceId: typeof invoice.invoiceId === 'string' ? invoice.invoiceId : order.invoiceId,
      payment: {
        arkAddress: arkAddress || null,
        bolt11: bolt11 || null,
        lightningUri: bolt11 ? `lightning:${bolt11}` : null,
        paymentLink: paymentLink || null,
        methods: [
          ...(arkAddress ? [PAYMENT_METHOD] : []),
          ...(bolt11 ? ['BTC-LN'] : []),
        ],
      },
      expiresAt: Number.isInteger(invoice.expiresAt) ? invoice.expiresAt : order.expiresAt,
    },
  };
}

// --------------------------------------------------------------- publishing
/** A pin is live while it is paid, unexpired and not removed. Drives relay write access. */
export function isPinLive(order, now = Math.floor(Date.now() / 1000)) {
  return order.status === 'published'
    && order.action === 'pin'
    && Number.isInteger(order.pinExpiresAt)
    && now < order.pinExpiresAt;
}

/**
 * The live pin that makes a new order for the same note a double charge.
 *
 * A note is identified by what was paid for — the words, the paper and the font, hashed into
 * `contentHash` — and, when it carries a picture, by the reader's own digest of the file they
 * picked (`pictureHash`). That second half is not decoration: a wordless picture note commits to
 * the paper and the font alone, so without it every picture on the same paper would be the same
 * note and a reader could not pin a second one while the first was still live. Two orders from
 * the same key, for the same commitment and the same picture, are the same note; anything else
 * is a new one. `pictureHash` is a claim the reader makes about their own file, and all it can
 * affect is this rule — being generous with it just means paying for the same note twice.
 */
export function duplicateLivePin(orders, order, now = Math.floor(Date.now() / 1000)) {
  if (!order || order.action !== 'pin') return null;
  const pictureHash = order.pictureHash ?? null;
  return Object.values(orders || {}).find(o => o && o.action === 'pin'
    && o.pubkey === order.pubkey
    && o.contentHash === order.contentHash
    && (o.pictureHash ?? null) === pictureHash
    && isPinLive(o, now)) || null;
}

export function settleOrder(order, now = Math.floor(Date.now() / 1000)) {
  if (order.status === 'published') return { ok: true, order };
  return {
    ok: true,
    order: {
      ...order,
      status: 'paid',
      paidAt: now,
      publishTokenExpiresAt: now + TOKEN_TTL_SECONDS,
    },
  };
}

function tokenSecret() {
  const secret = process.env.PUBLISH_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('PUBLISH_TOKEN_SECRET is missing or too short');
  }
  return secret;
}

function binding(order) {
  // Every order is a pin, so the token is derived from the note's commitment,
  // the cells it paid for and its identity mode.
  // A token bought for one clump of cells cannot be spent publishing in another,
  // and a named order cannot be spent on an anonymous note (or the reverse), so
  // every cell and the identity mode are part of what the token is derived from.
  const mode = order.anonymous ? 'anonymous' : (order.powFree ? 'pow' : 'named');
  const cells = order.geohashes?.length ? order.geohashes : (order.geohash ? [order.geohash] : []);
  return `${order.contentHash}|${cells.join(',')}|${mode}`;
}

/**
 * The publish token is derived, not stored: HMAC(secret, order|pubkey|action|binding|expiry).
 * Deriving it means the desk can hand the buyer the same token on every poll
 * (requirement 8) without keeping a bearer capability in its state file, while
 * still binding it to this order, this pubkey, this action and this commitment.
 */
export function publishToken(order) {
  const mac = createHmac('sha256', tokenSecret())
    .update(`${order.id}|${order.pubkey}|${order.action}|${binding(order)}|${order.publishTokenExpiresAt}`)
    .digest('base64url');
  return mac;
}

/** Req 8: publishToken only after BTCPay reports Settled, and then only while fresh and unused. */
export function statusView(order, now = Math.floor(Date.now() / 1000)) {
  const paid = order.status === 'paid' || order.status === 'published';
  const fresh = Number.isInteger(order.publishTokenExpiresAt) && now < order.publishTokenExpiresAt;
  const unused = !order.publishTokenUsedAt;
  const token = paid && fresh && unused ? publishToken(order) : null;
  return {
    id: order.id,
    action: order.action,
    status: order.status,
    paid,
    sats: order.sats,
    paymentMethod: order.paymentMethod,
    powFree: order.powFree === true,
    powBits: order.powBits ?? null,
    // How this note was paid for, for the badge its own foot carries.
    paidBadge: paymentBadge(order),
    expiresAt: order.expiresAt,
    publishToken: token,
    publishTokenExpiresAt: token ? order.publishTokenExpiresAt : null,
    publishedEventId: order.publishedEventId ?? null,
  };
}

export function consumePublishToken(order, presented, now = Math.floor(Date.now() / 1000)) {
  if (order.status !== 'paid' && order.status !== 'published') {
    return { ok: false, code: 'not_paid', error: 'This order is not paid yet.' };
  }
  if (order.publishTokenUsedAt) {
    return { ok: false, code: 'token_used', error: 'This publish token has already been used.' };
  }
  if (!Number.isInteger(order.publishTokenExpiresAt) || now >= order.publishTokenExpiresAt) {
    return { ok: false, code: 'token_expired', error: 'This publish token has expired.' };
  }
  if (typeof presented !== 'string' || presented.length === 0) {
    return { ok: false, code: 'token_missing', error: 'A publish token is required.' };
  }
  const expected = Buffer.from(publishToken(order));
  const given = Buffer.from(presented);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, code: 'token_invalid', error: 'This publish token is not valid for this order.' };
  }
  return { ok: true };
}

function tagValues(event, name) {
  return event.tags.filter(t => t[0] === name).map(t => t.slice(1));
}

function exactlyOneTag(event, name, arity) {
  const found = tagValues(event, name);
  if (found.length !== 1) return { ok: false, error: `event must carry exactly one "${name}" tag` };
  if (found[0].length !== arity) return { ok: false, error: `tag "${name}" must have ${arity} value(s)` };
  return { ok: true, values: found[0] };
}

/**
 * Req 10. Every check runs before the event is handed to the relay:
 * signature + id, signer, the Pinstr tags, the paid content/style/placement
 * commitment and the 501-character limit.
 *
 * @param {{order: object, event: object, now?: number}} args
 */
/**
 * The print a picture address names: the last path step of `.../i/<64 hex>.webp`.
 *
 * Compared as this token rather than as a whole string because the two sides spell the same
 * picture differently of their own accord — the desk hands back the address its own base URL
 * makes, and the board rewrites any print address to its own origin before it writes one into
 * an event. The token is the part that neither may change.
 */
/** A note names its picture in this tag, beside the address it carries as its content. */
export const IMAGE_TAG = 'image';

/**
 * The print a picture address names: the 64-hex hash in `https://<print host>/i/<hash>.webp`.
 *
 * The host is checked as well, so a note cannot put *its* own address in a paid note's content
 * and have every reader's browser fetch that picture from a stranger. It is the same door the
 * board reads an event's picture through, which is what keeps the two sides agreeing on what an
 * address is. The hash is returned rather than the whole address because the two sides spell the
 * same picture differently of their own accord — the desk hands back the address its own base
 * URL makes, and the board rewrites any print address to its own origin before writing one into
 * an event — and the hash is the part that neither may change.
 */
export function stickyPictureToken(value) {
  const match = /^https:\/\/(?:www\.)?(?:pinstr\.si|satoshi\.si)\/i\/([0-9a-f]{64})\.webp$/i
    .exec(String(value || '').trim());
  return match ? match[1].toLowerCase() : '';
}

export function verifyPublishEvent({ order, event, now = Math.floor(Date.now() / 1000) }) {
  const fail = (error, code) => ({ ok: false, code: code || 'rejected', error });

  const verified = verifyEvent(event);
  if (!verified.ok) return fail(`event rejected: ${verified.error}`, 'bad_event');
  if (event.pubkey.toLowerCase() !== order.pubkey) {
    return fail('event is signed by a different pubkey than the one that paid', 'wrong_signer');
  }
  // Freshness, not ordering — see EVENT_MAX_AGE_SECONDS for why.
  if (event.created_at < order.createdAt - EVENT_MAX_AGE_SECONDS) {
    return fail('event was created too long before this order to be published', 'stale_event');
  }
  if (event.created_at > now + EVENT_FUTURE_TOLERANCE_SECONDS) {
    return fail('event timestamp is too far in the future', 'future_event');
  }

  // How the note says it was paid for, when it says so at all. The board draws a small badge
  // from this word, so it is checked against what the order actually cost: a note cannot claim
  // to have been mined when it was paid for, nor to have been paid for when it was mined, and
  // a word this desk does not sell under is not a badge. A note that says nothing is still
  // published — a board that predates the badge has none to send, and refusing a note somebody
  // has already paid for over a missing decoration would be a worse desk than one that draws
  // no decoration.
  const paidTags = tagValues(event, PAYMENT_TAG);
  if (paidTags.length) {
    const mine = paymentBadge(order);
    if (paidTags.length !== 1 || paidTags[0].length !== 1) {
      return fail(`a note carries at most one ["${PAYMENT_TAG}","<how it was paid for>"] tag`,
        'bad_payment');
    }
    const said = String(paidTags[0][0] || '').toLowerCase();
    if (!PAYMENT_BADGES.includes(said)) {
      return fail(`"${said}" is not a way this desk sells a note: ${PAYMENT_BADGES.join(', ')}`,
        'bad_payment');
    }
    if (said !== mine) {
      return fail(`this note says it was paid for with "${said}"; the order it was published `
        + `against was paid with "${mine}"`, 'bad_payment');
    }
  }

  // Work, when that is what paid for this note. Two things are checked and both matter:
  // the nonce tag, because NIP-13 requires it and a reader rebuilding the work needs it,
  // and the id, because the id IS the work — it is the hash of this note's own content,
  // tags, pubkey and timestamp, and the id above was just verified against the signature.
  // So a note cannot be mined at one difficulty and published at another, cannot be mined
  // cheaply and swapped for different words, and cannot be passed off as mined at all:
  // the desk recomputes the difficulty of the id it is about to hand to the relay.
  if (order.powFree === true) {
    const bits = Number.isInteger(order.powBits) ? order.powBits : POW_BITS;
    const nonce = exactlyOneTag(event, POW_TAG, 2);
    if (!nonce.ok) {
      return fail(`a note paid for with work must carry exactly one `
        + `["${POW_TAG}","<value>","<bits>"] tag, and this event carries `
        + `${tagValues(event, POW_TAG).length} of them`, 'bad_pow');
    }
    const claimed = Number(nonce.values[1]);
    if (!Number.isInteger(claimed) || claimed < bits) {
      return fail(`the ["${POW_TAG}", …, ${nonce.values[1]}] tag must claim at least ${bits} bits `
        + '— the difficulty this note was ordered at', 'bad_pow');
    }
    const worked = leadingZeroBits(event.id);
    if (worked < bits) {
      return fail(`this note's id carries ${worked} leading zero bit${worked === 1 ? '' : 's'} and `
        + `the order was for ${bits}: mine it longer and publish that one`, 'insufficient_pow');
    }
  }

  if (order.action === 'pin') {
    if (event.kind !== PIN_KIND) {
      return fail(`a pin must be kind ${PIN_KIND}, got ${event.kind}`, 'wrong_kind');
    }
    // The marker is the reserved value, not the count of ["t", …] tags: a note
    // may carry up to HASHTAG_MAX hashtags beside it, which are ["t", …] tags
    // too. What must be exactly one is the "pinstr" value itself.
    const marker = tagValues(event, 't').map(values => values[0]).filter(value => value === STICKY_TOPIC);
    if (marker.length !== 1) {
      return fail(`a Pinstr note must carry exactly one ["t","${STICKY_TOPIC}"] tag`, 'bad_marker');
    }
    // Everything else the note is filed under is a hashtag: at most
    // HASHTAG_MAX of them, each lowercase and unambiguous, and the reserved
    // marker itself cannot be repeated as one of them.
    const hashtags = tagValues(event, 't').map(values => values[0]).filter(v => v !== STICKY_TOPIC);
    const hashtagCheck = validateHashtags(hashtags);
    if (!hashtagCheck.ok) return fail(hashtagCheck.error, 'bad_hashtag');
    // NIP-40: the note must name when it disappears, live no longer than the
    // rule allows, and still be alive at the moment it is published — the relay
    // drops an expired event, so one that arrives expired was paid for and lost.
    // The term is measured from created_at, which is when the writer chose it, so
    // it does not drift while the note waits to be paid for.
    const expiryTag = exactlyOneTag(event, EXPIRATION_TAG, 1);
    const expiresAt = expiryTag.ok ? Number(expiryTag.values[0]) : NaN;
    if (!expiryTag.ok || !Number.isInteger(expiresAt) || expiresAt <= 0) {
      return fail(`a pin must carry exactly one ["${EXPIRATION_TAG}","<unix seconds>"] tag`
        + ' — every note on this board disappears', 'bad_expiration');
    }
    const liveliness = expiresAt - event.created_at;
    if (expiresAt <= now) {
      // Checked before the range: a note whose moment has passed is best described
      // as expired, whatever term it claims.
      return fail('this note has already expired — write it again', 'bad_expiration');
    }
    if (liveliness < STICKY_MIN_LIVELINESS_SECONDS - LIVELINESS_GRACE_SECONDS
      || liveliness > STICKY_MAX_LIVELINESS_SECONDS + LIVELINESS_GRACE_SECONDS) {
      return fail(`a note may live from ${STICKY_MIN_LIVELINESS_SECONDS / 86400} day to `
        + `${STICKY_MAX_LIVELINESS_SECONDS / 86400} days from the moment it was written`, 'bad_expiration');
    }
    // How deep the note was bought. A depth the desk cannot read is not one it may
    // publish against, so it fails closed rather than defaulting to the loosest.
    const depth = orderGeohashDepth(order);
    if (!depth.ok) {
      return fail('this order carries a geohash depth the desk cannot read, so what it paid for '
        + 'cannot be checked', 'geohash_mismatch');
    }
    // The cells: every cell the order paid for must be among the ["g",…] tags, and
    // any other one may only be a board above one of them — that is how a note
    // shows up on the wider boards without paying for each. How far above is the
    // depth that was bought: a board `n` steps above a paid cell may be named only
    // while `n` is within that depth, so a note ordered 0 carries its own cells and
    // nothing else, and one ordered 6 may name any board above them. Spreading a
    // note past the depth that was paid for is what was not bought. tagValues
    // returns the value arrays, so take the cell out of each of them.
    const paid = order.geohashes?.length ? order.geohashes : (order.geohash ? [order.geohash] : []);
    const paidSet = new Set(paid);
    const geoValues = tagValues(event, GEO_TAG).map(values => values[0]);
    const withinDepth = (cell, value) => cell.startsWith(value) && cell.length - value.length <= depth.depth;
    const geoBad = !paid.every(cell => geoValues.includes(cell))          // every paid cell, named
      || new Set(geoValues).size !== geoValues.length                     // one tag per cell
      || geoValues.some(value => !isGeohash(value)
        || (!paidSet.has(value) && !paid.some(cell => withinDepth(cell, value))))
      || (depth.depth === GEOHASH_DEPTH_MIN && geoValues.length !== paid.length);
    const geoUri = exactlyOneTag(event, GEO_URI_TAG, 1);
    const geoKind = exactlyOneTag(event, GEO_KIND_TAG, 1);
    // If the note declares its depth, the declaration has to be the depth that was
    // bought — spelled either way, because "exact" and "0" are the same claim and so
    // are "prefix" and "6". A declaration the desk cannot read is a mismatch too.
    const geoScopes = tagValues(event, GEO_SCOPE_TAG).map(values => values[0]);
    const declared = geoScopes.length ? geohashDepthOf(geoScopes[0]) : null;
    const scopeBad = geoScopes.length > 0
      && !(geoScopes.length === 1 && declared.ok && declared.depth === depth.depth);
    if (geoBad || scopeBad
      || !geoUri.ok || !paid.some(cell => geoUri.values[0] === `${GEO_URI_PREFIX}${cell}`)
      || !geoKind.ok || geoKind.values[0] !== GEO_KIND_VALUE) {
      return fail('a pin must carry '
        + `["${GEO_TAG}","${paid.join('"] and ["' + GEO_TAG + '","')}"]`
        + (depth.depth > GEOHASH_DEPTH_MIN
          ? ` (and the boards at most ${depth.depth} step${depth.depth === 1 ? '' : 's'} above those cells`
            + ' may be listed beside them)'
          : ' and no other cell')
        + `, ["${GEO_URI_TAG}","${GEO_URI_PREFIX}${order.geohash}"] and `
        + `["${GEO_KIND_TAG}","${GEO_KIND_VALUE}"] — the cells the order was paid for`,
        'geohash_mismatch');
    }
    // The identity mode is paid for as well, and it shows in the tags: an
    // anonymous pin says so, a named one must not pretend to.
    const anonTag = exactlyOneTag(event, ANON_TAG, 1);
    if (order.anonymous) {
      if (!anonTag.ok || anonTag.values[0] !== ANON_TAG_VALUE) {
        return fail(`an anonymous pin must carry exactly one ["${ANON_TAG}","${ANON_TAG_VALUE}"] tag`,
          'identity_mismatch');
      }
    } else if (tagValues(event, ANON_TAG).length !== 0) {
      return fail(`a named pin must not carry an ["${ANON_TAG}", …] tag`, 'identity_mismatch');
    }
    // NIP-27 mentions. A tag is only worth anything if the note's own text names
    // that key, so nobody can be dragged into a note that never mentioned them.
    // Tagging itself is open: anyone with a NIP-05 identity on any domain may be
    // tagged, so the desk cannot hold the list — a name lives on its own domain
    // and only the writer's @ picker can resolve it. What the desk can check it
    // checks; an anonymous note tags nobody, because a throwaway key has no name
    // for a tag to resolve to.
    const mentionTags = tagValues(event, MENTION_TAG).map(values => (values[0] || '').toLowerCase());
    if (mentionTags.length) {
      if (order.anonymous) {
        return fail(`an anonymous note must not carry ["${MENTION_TAG}", …] tags:`
          + ' only keys with a satoshi.si name can be tagged', 'bad_mention');
      }
      if (mentionTags.length > MENTION_MAX) {
        return fail(`a note may tag at most ${MENTION_MAX} people, this one tags ${mentionTags.length}`,
          'bad_mention');
      }
      if (new Set(mentionTags).size !== mentionTags.length) {
        return fail('the same key is tagged twice: one ["p", …] tag per person', 'bad_mention');
      }
      const named = mentionTokens(event.content);
      for (const tagged of mentionTags) {
        if (!isHex64(tagged)) {
          return fail(`["${MENTION_TAG}","${tagged}"] is not a 64-character hex public key`, 'bad_mention');
        }
        if (!named.has(npubEncode(tagged))) {
          return fail('the note text does not name the npub of every key it tags: write the mention'
            + ` as nostr:${npubEncode(tagged)}`, 'bad_mention');
        }
      }
    }
    // The client marker names the writer, exactly once.
    const client = exactlyOneTag(event, CLIENT_TAG, 1);
    if (!client.ok || client.values[0] !== CLIENT_VALUE) {
      return fail(`a pin must carry exactly one ["${CLIENT_TAG}","${CLIENT_VALUE}"] tag`, 'bad_marker');
    }
    // An agent that posts a note may say so, once, with a name short enough to draw. Optional:
    // a note without the tag is simply a note that said nothing about who wrote it.
    const agentTags = tagValues(event, AGENT_TAG);
    if (agentTags.length > 1) {
      return fail(`a note may carry at most one ["${AGENT_TAG}","<who>"] tag`, 'bad_agent_tag');
    }
    if (agentTags.length === 1) {
      const label = agentTags[0].length === 1 ? String(agentTags[0][0]) : '';
      if (!AGENT_LABEL_RE.test(label)) {
        return fail(`the ["${AGENT_TAG}", …] tag must be one lowercase name like `
          + `"pinstr-mcp/1.0", got ${agentTags[0].length} value(s)`, 'bad_agent_tag');
      }
    }
    // ["sticky","v1",color,x,y,rotation,font]
    const sticky = exactlyOneTag(event, STICKY_TAG, 6);
    if (!sticky.ok) return fail(sticky.error, 'bad_sticky_tag');
    const [version, color, xRaw, yRaw, rotationRaw, font] = sticky.values;
    if (version !== STICKY_VERSION) {
      return fail(`sticky tag version "${version}" is not ${STICKY_VERSION}`, 'bad_sticky_tag');
    }
    if (!COLORS.includes(color)) {
      return fail(`color "${color}" is not one of ${COLORS.join(', ')}`, 'bad_color');
    }
    if (!FONTS.includes(font)) {
      return fail(`font "${font}" is not one of ${FONTS.join(', ')}`, 'bad_font');
    }
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!isFraction(x) || !isFraction(y)) {
      return fail(`placement must be two numbers between ${PLACEMENT_MIN} and ${PLACEMENT_MAX}`, 'bad_placement');
    }
    const rotation = Number(rotationRaw);
    if (!Number.isFinite(rotation) || rotation < ROTATION_MIN || rotation > ROTATION_MAX) {
      return fail(`rotation must be between ${ROTATION_MIN} and ${ROTATION_MAX} degrees`, 'bad_rotation');
    }
    const text = normaliseStickyText(event.content);
    // A written note is words; a pinned picture is the note itself, so it may go out with none.
    // What decides which is the desk's OWN record that it stored a print for this order —
    // `order.imageHash`, written by the upload and never by a client (validateOrderInput refuses
    // a pin that tries to set it). So no order can publish an empty note unless this desk really
    // holds a picture behind it, and an empty note can never be pinned at all.
    if (order.imageHash) {
      // A pinned picture carries its own print's address as its content, which is what makes any
      // other Nostr client show the picture rather than an empty note. The address must name the
      // print THIS desk stored for this order, compared by the hash inside it, so a note cannot
      // point at somebody else's picture, nor at an address this desk never handed out. Nothing
      // at all is still accepted, which is what a board that predates the address sends; both
      // ways the picture is the desk's own record and neither can be forged into a blank note.
      const address = stickyPictureToken(text);
      if (text && address !== order.imageHash.toLowerCase()) {
        return fail('a pinned picture carries the address of the print this desk stored, or nothing',
          'picture_mismatch');
      }
      // When the note names the print twice - in the content and in its picture tag - the two must
      // be the same print, or the board would draw one picture and the rest of the world another.
      const tagged = stickyPictureToken((event.tags.find(tag => Array.isArray(tag) && tag[0] === IMAGE_TAG) || [])[1]);
      if (tagged && tagged !== order.imageHash.toLowerCase()) {
        return fail('the picture tag names a different print than this order holds', 'picture_mismatch');
      }
      return { ok: true, kind: 'pin', contentHash: order.contentHash, color, font,
               placement: { x, y, rotation } };
    }
    if (!text) return fail('a Pinstr note cannot be empty', 'empty_note');
    if (contentLength(text) > MAX_CONTENT_CHARS) {
      return fail(`content is ${contentLength(text)} characters, the limit is ${MAX_CONTENT_CHARS}`, 'too_long');
    }
    // The commitment: recomputed from the event, so the note that lands cannot
    // differ from the note that was paid for.
    const fingerprint = stickyFingerprint(text, color, font);
    if (fingerprint !== order.contentHash) {
      return fail('the note does not hash to the content/color/font that was paid for', 'fingerprint_mismatch');
    }
    return { ok: true, kind: 'pin', contentHash: order.contentHash, color, font,
             placement: { x, y, rotation } };
  }
  // Every Pinstr event is a pin: kind 1 is checked before this point, and there
  // is no second action for a grant or a token to authorize.
  return fail(`a Pinstr event must be kind ${PIN_KIND}, got ${event.kind}`, 'wrong_kind');
}

export function markPublished(order, eventId, now = Math.floor(Date.now() / 1000)) {
  const pinTtl = PIN_TTL_DAYS * 24 * 60 * 60;
  return {
    ...order,
    status: 'published',
    publishTokenUsedAt: now,
    publishedEventId: eventId,
    pinExpiresAt: now + pinTtl,
  };
}

/** Req 13: never let a token or an ark address reach a log line verbatim. */
export function redact(value) {
  if (typeof value !== 'string' || value.length === 0) return value;
  if (value.length <= 12) return '[redacted]';
  return `${value.slice(0, 6)}…${value.slice(-4)} [redacted]`;
}
