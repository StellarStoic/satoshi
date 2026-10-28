// The free door, and the two prices beside it.
//
// A note is 21 sats when nobody is paying attention to who wrote it, nothing when the writer's own
// NIP-05 name answers for their key, and 10 again when the client says it is a program — because a
// door that opens for a name is a door for a person, and a program can publish a name as easily as
// it can mint a key. The verification is a network question, so it is tested here against a stub
// that never touches the network, and the model is tested with the answer passed in.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStickyOrder, validateOrderInput, STICKY_ANON_SATS, SUB_WEEK_SATS, NIP05_REASON, AGENT_PIN_REASON,
  freeNoteUsage, NIP05_DAILY_MAX, NIP05_WINDOW_SECONDS,
} from '../deploy/nip05-desk/sticky.mjs';
import {
  parseNip05Name, isPrivateHost, verifyNip05Name, createNip05Cache, NIP05_INFLIGHT_MAX,
} from '../deploy/nip05-desk/nip05.mjs';

const PUBKEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);
const HASH = 'c'.repeat(64);
const NOW = 1_800_000_000;

/** A pin order body, the way the board sends one. */
function pinBody(extra = {}) {
  return {
    action: 'pin',
    pubkey: PUBKEY,
    contentHash: HASH,
    geohash: 'u267tn',
    geohashes: ['u267tn'],
    geohashMode: 'exact',
    ...extra,
  };
}

/** A fetch that answers like a domain publishing one name. */
function domainSays(names, { status = 200, body = null, error = null, calls = [] } = {}) {
  return async (url) => {
    calls.push(url);
    if (error) throw error;
    const text = body !== null ? body : JSON.stringify({ names });
    return {
      status,
      body: null,
      text: async () => text,
    };
  };
}

/** A pin that nobody has paid for: the price the desk asks when no door opens. */
function costOf(order) {
  return order.ok ? order.order.sats : null;
}

test('an anonymous note costs a week of belonging, and one note per key is what keeps the tier from undercutting', () => {
  assert.equal(STICKY_ANON_SATS, 10, 'the anonymous price is 10 sats');
  // D set this equal to a week on purpose. The comparison a reader makes is "the same sats buy one note, or seven
  // days of unlimited ones", which is the trade the tier offers — and what stops a key anyone can mint in a second
  // from undercutting the board is that such a key may pin exactly one note, ever (asserted below and in
  // 'a paying agent is never throttled to one note, and a throwaway key still is').
  assert.equal(STICKY_ANON_SATS, SUB_WEEK_SATS, 'one note costs what a week of posting costs');
  const created = createStickyOrder(pinBody({ anonymous: true }), { now: NOW });
  assert.equal(created.ok, true);
  assert.equal(created.order.sats, STICKY_ANON_SATS);
  assert.equal(created.order.baseSats, STICKY_ANON_SATS);
  assert.equal(created.order.status, 'awaiting_invoice', 'nothing is settled until the invoice pays');
  assert.equal(created.order.discount.applied, false);
});

test('a name that answers for the key costs nothing, and the note is settled on the spot', () => {
  const created = createStickyOrder(pinBody({ nip05: 'd@example.com' }), { now: NOW, nip05Verified: true });
  assert.equal(created.ok, true, 'a verified name is the free door, not a refusal');
  assert.equal(created.order.sats, 0);
  assert.equal(created.order.status, 'paid');
  assert.equal(created.order.paidAt, NOW);
  assert.equal(created.order.nip05Free, true);
  assert.equal(created.order.nip05, 'd@example.com');
  assert.equal(created.order.paymentMethod, 'nip05');
  assert.deepEqual(created.order.payment, { method: 'nip05', sats: 0 });
  assert.equal(created.order.discount.reason, NIP05_REASON);
  assert.ok(created.order.publishTokenExpiresAt > NOW,
    'the token is fresh the moment the order exists, or the writer waits for a payment that was never asked for');
});

test('the same name on an agent order is not free: a program pays per note, name or no name', () => {
  const created = createStickyOrder(pinBody({ nip05: 'd@example.com', agent: true }),
    { now: NOW, nip05Verified: true });
  assert.equal(created.ok, true);
  assert.equal(created.order.agent, true);
  assert.equal(created.order.nip05Free, false, 'an agent never walks through the free door');
  assert.equal(created.order.sats, STICKY_ANON_SATS, 'and it is charged the per-note price');
  assert.equal(created.order.status, 'awaiting_invoice');
  assert.equal(created.order.paidAt, null);
  assert.equal(created.order.discount.reason, AGENT_PIN_REASON);
});

test('an agent is charged per note even when its key is one the relays know', () => {
  // No `anonymous` flag: this is a key with a life of its own, which the board would otherwise ask
  // for a subscription from. An agent has nobody to bill a week to, so it buys one note.
  const created = createStickyOrder(pinBody({ agent: true }), { now: NOW });
  assert.equal(created.ok, true, 'an agent is never left without a price it can pay');
  assert.equal(created.order.sats, STICKY_ANON_SATS);
  assert.equal(created.order.anonymous, false);
});

test('a paying agent is never throttled to one note, and a throwaway key still is', () => {
  const agentNote = createStickyOrder(pinBody({ agent: true }), { now: NOW });
  const throwaway = createStickyOrder(pinBody({ anonymous: true }), { now: NOW });
  assert.equal(agentNote.order.anonymous, false, 'the one-note gate reads the anonymous flag only');
  assert.equal(throwaway.order.anonymous, true);
});

test('an agent that mines pays with work instead, because work is work whoever does it', () => {
  const created = createStickyOrder(pinBody({ agent: true, pow: true, powName: 'd@example.com' }), { now: NOW });
  assert.equal(created.ok, true);
  assert.equal(created.order.powFree, true);
  assert.equal(created.order.sats, 0);
  assert.equal(created.order.paymentMethod, 'pow');
});

test('a name nobody verified is not a door: the key has no subscription, so the desk still wants paying', () => {
  const created = createStickyOrder(pinBody({ nip05: 'd@example.com' }), { now: NOW });
  assert.equal(created.ok, false);
  assert.equal(created.code, 'subscription_required');
  assert.match(created.error, new RegExp(`\\b${STICKY_ANON_SATS} sats to pin one`),
    'the refusal says what the anonymous price is now, not what it used to be');
  assert.match(created.error, new RegExp(`${SUB_WEEK_SATS} sats a week`));
});

test('a subscriber who sends a name is covered by the subscription, not by the metered door', () => {
  // Both doors are free, and the order this branch is in decides which one a note is counted
  // against: a subscription buys unlimited notes, so it has to win, or ten notes a day would apply
  // to somebody who has already paid to be rid of them.
  const subscriptions = { [PUBKEY]: { expiresAt: NOW + 10_000, plan: 'year', sats: 411, startedAt: NOW - 100, extendedAt: NOW } };
  const created = createStickyOrder(pinBody({ nip05: 'd@example.com' }), { now: NOW, nip05Verified: true, subscriptions });
  assert.equal(created.ok, true);
  assert.equal(created.order.covered, true);
  assert.equal(created.order.nip05Free, false);
  assert.equal(created.order.paymentMethod, 'subscription');
  assert.equal(created.order.sats, 0);
});

test('the free door is a pin door only: a subscription carries no name and no agent marker', () => {
  for (const field of ['nip05', 'agent']) {
    const validated = validateOrderInput({ action: 'subscribe', pubkey: PUBKEY, plan: 'week', [field]: true });
    assert.equal(validated.ok, false, `a subscription carries no ${field}`);
    assert.equal(validated.code, 'bad_subscription');
  }
});

test('an anonymous identity has no name to offer, and is told why rather than quietly charged', () => {
  const validated = validateOrderInput(pinBody({ anonymous: true, nip05: 'd@example.com' }));
  assert.equal(validated.ok, false);
  assert.equal(validated.code, 'anon_nip05');
  assert.match(validated.error, /temporary anonymous identity/);
});

test('a name that is not name@domain is refused before a domain is ever asked', () => {
  for (const bad of ['d', 'd@', '@example.com', 'd@example', 'd@exa mple.com', 'd@example.com/x', 'a'.repeat(65) + '@example.com']) {
    const validated = validateOrderInput(pinBody({ nip05: bad }));
    assert.equal(validated.ok, false, `refused: ${bad}`);
    assert.equal(validated.code, 'bad_nip05');
  }
});

test('the agent marker has to be a boolean, not a truthy string', () => {
  const validated = validateOrderInput(pinBody({ agent: 'yes' }));
  assert.equal(validated.ok, false);
  assert.equal(validated.code, 'bad_agent');
});

test('a name is split into the two halves a domain is asked about', () => {
  assert.deepEqual(parseNip05Name('D@Example.COM'), { name: 'd@example.com', local: 'd', domain: 'example.com' });
  assert.deepEqual(parseNip05Name('  d@example.com  ').domain, 'example.com');
  for (const bad of ['d', 'd@', '@example.com', 'd@example', 'd@local host.com', 'd@example.com:8080', 'd@example.com/x']) {
    assert.equal(parseNip05Name(bad), null, `not a name: ${bad}`);
  }
});

test('the desk will not be pointed at its own network, in any of the spellings of an address', () => {
  for (const host of ['localhost', '127.0.0.1', '127.1', '10.0.0.5', '192.168.1.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '0.0.0.0', '2130706433', '0x7f000001', '[::1]', '::ffff:7f00:1',
    'example', 'box.local', 'thing.internal', 'svc.lan']) {
    assert.equal(isPrivateHost(host), true, `refused before a socket is opened: ${host}`);
  }
  for (const host of ['example.com', 'satoshi.si', 'nostr.example.co.uk']) {
    assert.equal(isPrivateHost(host), false, `a public name to ask: ${host}`);
  }
});

test('a domain that names this key opens the door', async () => {
  const calls = [];
  const answer = await verifyNip05Name('d@example.com', PUBKEY,
    { fetchImpl: domainSays({ d: PUBKEY }, { calls }), now: NOW });
  assert.equal(answer.ok, true);
  assert.equal(answer.pubkey, PUBKEY);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://example.com/.well-known/nostr.json?name=d',
    'the question is the well-known file, for this name only');
});

test('a domain that names another key does not', async () => {
  const answer = await verifyNip05Name('d@example.com', PUBKEY,
    { fetchImpl: domainSays({ d: OTHER_KEY }), now: NOW });
  assert.equal(answer.ok, false);
  assert.equal(answer.reason, 'the name answers for another key');
});

test('a name missing from the document, a non-200 and a non-JSON answer all fail closed', async () => {
  const missing = await verifyNip05Name('d@example.com', PUBKEY, { fetchImpl: domainSays({}), now: NOW });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /not in the document/);

  const refused = await verifyNip05Name('d@example.com', PUBKEY,
    { fetchImpl: domainSays({}, { status: 503 }), now: NOW });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /answered 503/);

  const garbage = await verifyNip05Name('d@example.com', PUBKEY,
    { fetchImpl: domainSays({}, { body: '<html>subscribe to continue</html>' }), now: NOW });
  assert.equal(garbage.ok, false);
  assert.match(garbage.reason, /not JSON/);
});

test('a redirect is not followed: the answer has to come from the name’s own domain', async () => {
  const answer = await verifyNip05Name('d@example.com', PUBKEY,
    { fetchImpl: domainSays({ d: PUBKEY }, { status: 302 }), now: NOW });
  assert.equal(answer.ok, false);
  assert.match(answer.reason, /answered 302/);
});

test('an address of the desk’s own network is refused without asking', async () => {
  let asked = false;
  const fetchImpl = async () => { asked = true; return { status: 200, text: async () => '{"names":{}}' }; };
  const answer = await verifyNip05Name('d@127.0.0.1', PUBKEY, { fetchImpl, now: NOW });
  assert.equal(answer.ok, false);
  assert.equal(answer.reason, 'not a NIP-05 name');
  assert.equal(asked, false, 'nothing was fetched');
});

test('a domain that never answers costs a deadline, not an order', async () => {
  const timeout = new Error('timed out');
  timeout.name = 'TimeoutError';
  const answer = await verifyNip05Name('d@example.com', PUBKEY,
    { fetchImpl: domainSays({}, { error: timeout }), now: NOW });
  assert.equal(answer.ok, false);
  assert.match(answer.reason, /did not answer in time/);

  const unreachable = await verifyNip05Name('d@example.com', PUBKEY,
    { fetchImpl: domainSays({}, { error: new Error('ECONNREFUSED') }), now: NOW, cache: createNip05Cache() });
  assert.equal(unreachable.ok, false);
  assert.match(unreachable.reason, /could not be reached/);
});

test('an answer is remembered for an hour, and so is a silence', async () => {
  const cache = createNip05Cache();
  const calls = [];
  const fetchImpl = domainSays({ d: PUBKEY }, { calls });

  const first = await verifyNip05Name('d@example.com', PUBKEY, { fetchImpl, cache, now: NOW });
  const second = await verifyNip05Name('d@example.com', PUBKEY, { fetchImpl, cache, now: NOW + 60 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1, 'the domain is asked once an hour, not once an order');

  // The same cached answer, for a key the name does not belong to, is a no without a fetch.
  const wrongKey = await verifyNip05Name('d@example.com', OTHER_KEY, { fetchImpl, cache, now: NOW + 60 });
  assert.equal(wrongKey.ok, false);
  assert.equal(calls.length, 1);

  // An hour later the domain is asked again, because a name can be taken away.
  await verifyNip05Name('d@example.com', PUBKEY, { fetchImpl, cache, now: NOW + 3601 });
  assert.equal(calls.length, 2);

  // A silence is remembered too: a broken domain cannot be used to make the desk wait per order.
  const silentCalls = [];
  const silent = domainSays({}, { status: 500, calls: silentCalls });
  const silentCache = createNip05Cache();
  await verifyNip05Name('e@example.com', PUBKEY, { fetchImpl: silent, cache: silentCache, now: NOW });
  const again = await verifyNip05Name('e@example.com', PUBKEY, { fetchImpl: silent, cache: silentCache, now: NOW + 30 });
  assert.equal(again.ok, false);
  assert.equal(again.cached, true);
  assert.equal(silentCalls.length, 1);
});

test('only so many lookups run at once, and the rest pay the price', async () => {
  const inflight = { count: NIP05_INFLIGHT_MAX };
  let asked = false;
  const answer = await verifyNip05Name('d@example.com', PUBKEY, {
    fetchImpl: async () => { asked = true; return { status: 200, text: async () => '{}' }; },
    now: NOW, inflight,
  });
  assert.equal(answer.ok, false);
  assert.match(answer.reason, /too many lookups in flight/);
  assert.equal(asked, false);
});

test('the agent reason says what the marker buys, and nothing else does', () => {
  assert.match(AGENT_PIN_REASON, /agents pay per note/);
  assert.match(NIP05_REASON, /NIP-05/);
});

// ---------------------------------------------------------------------------------------------
// The meter: a free door with no meter is a hole.

/** A stored free note, as the desk keeps one. */
function freeNote(pubkey, createdAt, extra = {}) {
  return { id: `o${createdAt}`, pubkey, nip05Free: true, createdAt, sats: 0, ...extra };
}

test('a name buys 10 free notes a day, and the day is a rolling 24 hours', () => {
  assert.equal(NIP05_DAILY_MAX, 10, 'ten is a day of writing, not a wire service');
  assert.equal(NIP05_WINDOW_SECONDS, 86400);
  const fresh = freeNoteUsage({}, PUBKEY, NOW);
  assert.deepEqual(
    { used: fresh.used, remaining: fresh.remaining, allowed: fresh.allowed, limit: fresh.limit },
    { used: 0, remaining: 10, allowed: true, limit: 10 });
  assert.equal(fresh.resetsAt, null, 'nothing to wait for when nothing has been spent');
});

test('the count is what the key ordered, and only the free ones', () => {
  const orders = {
    a: freeNote(PUBKEY, NOW - 60),
    b: freeNote(PUBKEY, NOW - 120),
    c: freeNote(PUBKEY, NOW - 180),
    // Not free, so not counted: a subscribed pin and a mined note were paid in another currency.
    d: { id: 'd', pubkey: PUBKEY, createdAt: NOW - 60, nip05Free: false, sats: 0, paymentMethod: 'subscription' },
    e: { id: 'e', pubkey: PUBKEY, createdAt: NOW - 60, powFree: true, sats: 0 },
    // Someone else's notes never count against this key.
    f: freeNote(OTHER_KEY, NOW - 60),
    // And a note from before the window has aged out.
    g: freeNote(PUBKEY, NOW - 86401),
  };
  const usage = freeNoteUsage(orders, PUBKEY, NOW);
  assert.equal(usage.used, 3);
  assert.equal(usage.remaining, 7);
  assert.equal(usage.allowed, true);
  assert.equal(usage.resetsAt, null, 'a partly spent day has nothing falling off yet');
});

test('the tenth note is the last one, and the eleventh waits for one to age out', () => {
  const orders = {};
  for (let i = 0; i < 10; i += 1) orders[`o${i}`] = freeNote(PUBKEY, NOW - 3600 + i);
  const spent = freeNoteUsage(orders, PUBKEY, NOW);
  assert.equal(spent.used, 10);
  assert.equal(spent.remaining, 0);
  assert.equal(spent.allowed, false);
  assert.equal(spent.resetsAt, (NOW - 3600) + NIP05_WINDOW_SECONDS,
    'the allowance comes back when the oldest free note ages out, not at a midnight');

  // Time moves on and the allowance comes back one note at a time, oldest first: a second past the
  // first note's window, the two oldest have aged out and there is room for two.
  const later = freeNoteUsage(orders, PUBKEY, (NOW - 3600) + NIP05_WINDOW_SECONDS + 1);
  assert.equal(later.used, 8);
  assert.equal(later.remaining, 2);
  assert.equal(later.allowed, true);
  assert.equal(later.resetsAt, null, 'a day with room left has nothing to wait for');
});

test('the meter never reports a negative remainder or counts a note from the future', () => {
  const orders = {};
  for (let i = 0; i < 15; i += 1) orders[`o${i}`] = freeNote(PUBKEY, NOW - 60 - i);
  orders.future = freeNote(PUBKEY, NOW + 600);
  const usage = freeNoteUsage(orders, PUBKEY, NOW);
  assert.equal(usage.used, 15, 'the future note is not counted until it is ordered');
  assert.equal(usage.remaining, 0, 'and a remainder is never negative');
  assert.equal(usage.allowed, false);
});

test('an empty or absent store is a full allowance, not a crash', () => {
  for (const store of [null, undefined, {}, []]) {
    const usage = freeNoteUsage(store, PUBKEY, NOW);
    assert.equal(usage.used, 0);
    assert.equal(usage.allowed, true, 'a desk that cannot read its own orders must not refuse a free note');
  }
  assert.equal(freeNoteUsage({}, '', NOW).used, 0);
});

test('a subscription does not raise the meter, it removes it', () => {
  // Ten free notes are exactly what a week of unlimited notes replaces, so a subscriber must never be
  // measured at all — not even when they send the NIP-05 name that would open the free door.
  const orders = {};
  for (let i = 0; i < 40; i += 1) orders[`o${i}`] = freeNote(PUBKEY, NOW - 60 - i);
  const free = freeNoteUsage(orders, PUBKEY, NOW);
  assert.equal(free.allowed, false, 'without a subscription, forty notes is far past the allowance');

  const subscribed = freeNoteUsage(orders, PUBKEY, NOW, { subscribed: true });
  assert.equal(subscribed.unlimited, true);
  assert.equal(subscribed.allowed, true);
  assert.equal(subscribed.remaining, null, 'there is no remainder to report when there is no ceiling');
  assert.equal(subscribed.used, 40, 'and the count is still told, because it is true');
});

test('a covered note is never a free one, so a subscriber cannot spend the allowance', () => {
  // The branch order in createStickyOrder is the whole of this rule: a subscription is decided
  // before the free door, so a subscriber who sends their name is covered rather than free.
  const subscriptions = { [PUBKEY]: { expiresAt: NOW + 10_000, plan: 'week', sats: 10, startedAt: NOW - 100, extendedAt: NOW } };
  const covered = createStickyOrder(pinBody({ nip05: 'd@example.com' }), { now: NOW, nip05Verified: true, subscriptions });
  assert.equal(covered.ok, true);
  assert.equal(covered.order.covered, true, 'the subscription pays, not the free door');
  assert.equal(covered.order.nip05Free, false, 'so the note does not count against the daily allowance');
  assert.equal(covered.order.paymentMethod, 'subscription');

  const freed = createStickyOrder(pinBody({ nip05: 'd@example.com' }), { now: NOW, nip05Verified: true });
  assert.equal(freed.order.nip05Free, true, 'and without one, the same order is a free note');
  assert.equal(freed.order.covered, false);
});
