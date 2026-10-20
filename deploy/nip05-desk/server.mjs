// satoshi.si payment desk: NIP-05 name orders + paid Pinstr notes.
//
// The site is static, so this service is the only thing the browser may talk to.
// It knows nothing about BTCPay and holds no BTCPay credentials: it prices
// orders, records them, and exposes a queue that the worker on D's Start9 drains.
// The worker creates the invoice and, once BTCPay reports the payment Settled,
// tells the desk so the buyer can publish.
//
// Deliberately narrow:
//   GET  /nip05/v1/config                  public: prices, reserved list, relay note
//   GET  /nip05/v1/names/{name}            public: is this name for sale right now
//   POST /nip05/v1/orders                  public: create an order
//   GET  /nip05/v1/orders/{id}             public: order status + payment rail
//   GET  /nip05/v1/worker/queue            worker only: orders needing action
//   POST /nip05/v1/worker/names            worker only: publish the names snapshot
//   POST /nip05/v1/worker/orders/{id}/invoice   worker only
//   POST /nip05/v1/worker/orders/{id}/status    worker only
//   GET  /nip05/v1/health                  liveness
//   POST /pinstr/v1/orders                public: create a pin order
//   GET  /pinstr/v1/orders/{id}            public: status, paid, publish token
//   POST /pinstr/v1/orders/{id}/publish    public: publish a paid note
//   POST /pinstr/v1/images                 public: store the picture a paid pin names
//   GET  /i/{hash}.webp                    public: a stored picture
//   GET  /pinstr/v1/worker/queue           worker only: sticky orders needing action
//   POST /pinstr/v1/worker/orders/{id}/invoice   worker only: attach the Bark rail
//   POST /pinstr/v1/worker/orders/{id}/status    worker only: Settled / expired
//   GET  /pinstr/v1/health                 liveness for the pinstr side
//
// CORS is set by nginx (locked to satoshi.si), as with the other services. Order
// ids are random so a public GET cannot be enumerated, and no secret is ever
// logged or echoed.
//
// The whole payment surface — pricing, token lifetime, what a valid note looks
// like — lives in sticky.mjs, which has no sockets in it and is unit tested.
// This file is the plumbing: HTTP in, state file, relay out.

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  MAX_BODY_BYTES, pricingConfig, availability, createOrder, applyInvoice, applyStatus,
  pruneOrders, validateNamesSnapshot, readJson, writeJson, liveOrders, keyOwner,
} from './store.mjs';
import {
  SUB_WEEK_SATS, SUB_YEAR_SATS, SUB_MEMBER_WEEK_SATS, SUB_MEMBER_YEAR_SATS, SUB_PLANS,
  SUB_WEEKS_PER_YEAR, SUB_YEAR_DISCOUNT, quoteSubscription, subscriptionView,
  activateSubscription, PAYMENT_METHOD, PAYMENT_METHODS,
  STICKY_VERSION, STICKY_TOPIC, STICKY_TAG, PIN_KIND,
  MAX_CONTENT_CHARS, COLORS, FONTS,
  PLACEMENT_MIN, PLACEMENT_MAX, ROTATION_MIN, ROTATION_MAX,
  TOKEN_TTL_SECONDS, PIN_TTL_DAYS, createStickyOrder, attachInvoice,
  settleOrder, statusView, consumePublishToken, verifyPublishEvent,
  markPublished, isPinLive, duplicateLivePin, quoteForPubkey, redact,
  STICKY_ANON_SATS, GEOHASH_ALPHABET, GEOHASH_MAX_CELLS, GEOHASH_MIN_LENGTH, GEOHASH_MAX_LENGTH,
  GEO_TAG, GEO_URI_TAG, GEO_URI_PREFIX, GEO_KIND_TAG,
  MENTION_TAG, MENTION_MAX,
  GEO_KIND_VALUE, CLIENT_TAG, CLIENT_VALUE, ANON_TAG,
  ANON_TAG_VALUE, EXPIRATION_TAG, STICKY_LIVELINESS, STICKY_DEFAULT_LIVELINESS,
  STICKY_MIN_LIVELINESS_SECONDS, STICKY_MAX_LIVELINESS_SECONDS,
  ANON_KEY_USED, ANON_NO_SUBSCRIPTION, STRANGER_REASON, memberName,
  anonymousPinGate,
  memberTierTable, hasNothingToPay, POW_BITS, POW_TAG, paymentBadge, PAYMENT_TAG, PAYMENT_BADGES,
} from './sticky.mjs';
import { fetchEventById, publishEvent } from './relay.mjs';
import { pubkeyPresence } from './presence.mjs';
import {boardCardPage, boardCardBytes, boardCellsFromPath} from './boardCard.mjs';
import {
  IMAGE_GRADE_IDS, isImageGrade, readCappedBody, storeImage,
  sweepImages, imagePath, imageReferrerExpiry, IMAGE_SWEEP_INTERVAL_MS,
} from './images.mjs';

const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || '127.0.0.1';
const STATE_DIR = process.env.STATE_DIR || '/var/lib/satoshi-nip05';
const WORKER_TOKEN = process.env.WORKER_TOKEN || '';
// How long POST /pinstr/v1/orders holds the connection waiting for the worker to
// attach the Bark rail. The worker long-polls this desk, so in practice the rail
// appears in about a second; the wait exists so the browser usually gets a
// payable order in one round trip instead of polling a "preparing" state.
// How long POST /pinstr/v1/orders waits for the worker to attach the rail before
// handing the order back. The board opens its dialog at once and polls every 3 s, so
// blocking here only delays the first poll: it catches the rail whichever way it
// arrives. Two seconds is enough for the common case where the worker is parked.
const STICKY_INVOICE_WAIT_MS = Number(process.env.STICKY_INVOICE_WAIT_MS || 2000);
// Upper bound on how long the worker may hold a long-poll open.
const STICKY_WORKER_MAX_WAIT_MS = Number(process.env.STICKY_WORKER_MAX_WAIT_MS || 25000);

const ORDERS_FILE = `${STATE_DIR}/orders.json`;

// TON rail pricing for Pinstr. Fixed ladder, fee on top, order id as the transfer comment.

const NAMES_FILE = `${STATE_DIR}/names.json`;
// Names this desk minted itself (Telegram identities). Kept apart from names.json, which the
// worker regenerates from the published nostr.json and would therefore wipe.
const MINTED_NAMES_FILE = `${STATE_DIR}/names-minted.json`;
const STICKY_FILE = `${STATE_DIR}/sticky.json`;
// {pubkey: {plan, sats, startedAt, expandedAt, expiresAt, orderId}}. Written when a
// subscription order settles and read on every order, quote and status call; a
// subscription is the only thing that lets a registered key pin a note.
const SUBSCRIPTIONS_FILE = `${STATE_DIR}/subscriptions.json`;

function loadSubscriptions() {
  const subs = readJson(SUBSCRIPTIONS_FILE, {});
  return subs && typeof subs === 'object' && !Array.isArray(subs) ? subs : {};
}

/**
 * Is this a key that exists only here?
 *
 * No satoshi.si name, and no profile on any of the relays that mirror everyone —
 * ditto, damus, purplepag.es. A name is still what makes a member; this answers the
 * narrower question of whether the key is worth pricing as a returning user at all.
 *
 * The relay answer is cached (see presence.mjs), so the common case costs nothing.
 * Only a clear 'absent' counts: a relay that never answered, or a bug in here, must
 * never make a real user pay a stranger's price.
 */
async function isStrangerKey(pubkey, names) {
  const key = String(pubkey || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) return false;
  if (memberName(key, names) !== null) return false;
  try {
    const presence = await pubkeyPresence(key);
    if (presence.state === 'absent') {
      console.log(JSON.stringify({
        event: 'sticky_stranger_key', pubkey: key, relays: Object.keys(presence.answers || {}),
      }));
      return true;
    }
  } catch (err) {
    console.log(JSON.stringify({ event: 'sticky_presence_failed', pubkey: key, error: String(err && err.message) }));
  }
  return false;
}

if (WORKER_TOKEN.length < 32) {
  console.error('refusing to start: WORKER_TOKEN must be set and at least 32 characters');
  process.exit(1);
}
if (!process.env.PUBLISH_TOKEN_SECRET || process.env.PUBLISH_TOKEN_SECRET.length < 32) {
  console.error('refusing to start: PUBLISH_TOKEN_SECRET must be set and at least 32 characters');
  process.exit(1);
}

const nowS = () => Math.floor(Date.now() / 1000);

// A shared board link's page and picture. Both addresses come from configuration rather than from the
// request, so no request can point a crawler's preview at a host of its choosing.
const BOARD_CARD_BASE_URL = (process.env.PINSTR_PUBLIC_URL || 'https://pinstr.si').replace(/\/+$/u, '');
const BOARD_CARD_SITE_URL = (process.env.PINSTR_CARD_SITE_URL || BOARD_CARD_BASE_URL).replace(/\/+$/u, '');
// The service may write only inside its own state directory (ProtectSystem=strict), so a picture
// it is to keep has to live there rather than under /var/cache.
const BOARD_CARD_CACHE_DIR = process.env.PINSTR_CARD_CACHE || '/var/lib/satoshi-nip05/cards';
// The pictures pinned to notes. They live in the state directory too, for the same reason:
// ProtectSystem=strict leaves the service one writable place, and a picture the board has
// to go and fetch is a picture the service has to be able to keep.
const IMAGE_DIR = process.env.PINSTR_IMAGE_DIR || `${STATE_DIR}/images`;
// Where a stored picture is said to live. From configuration rather than from the request,
// so no caller can have the desk hand back an address on a host of its choosing. The user's
// decision was satoshi.si: whether that host forwards /i/ here is the edge's business.
const IMAGE_BASE_URL = (process.env.PINSTR_IMAGE_URL || 'https://satoshi.si/i').replace(/\/+$/u, '');

function send(res, status, body, extraHeaders = {}) {
  const payload = `${JSON.stringify(body)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  res.end(payload);
}

/** Constant-time bearer comparison; a missing or malformed header fails closed. */
function tokenOk(header) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const presented = Buffer.from(header.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(WORKER_TOKEN, 'utf8');
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const err = new Error('body too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (size === 0) {
    const err = new Error('empty body');
    err.status = 400;
    throw err;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('body is not valid JSON');
    err.status = 400;
    throw err;
  }
}

function loadOrders(now) {
  const raw = readJson(ORDERS_FILE, {});
  const { orders, dropped } = pruneOrders(raw, now);
  return { orders, dropped };
}

/** The public view of an order: the buyer's own data plus the rail to pay on. */
function publicOrder(order) {
  return {
    ok: true,
    orderId: order.id,
    name: order.name,
    host: 'satoshi.si',
    address: `${order.name}@satoshi.si`,
    sats: order.sats,
    status: order.status,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    invoiceId: order.invoiceId || null,
    payment: {
      address: order.address || null,
      bolt11: order.bolt11 || null,
      ark: order.ark || null,
    },
    txid: order.txid || null,
    note: order.note || null,
  };
}

// ------------------------------------------------------------------ pinstr

/**
 * Pinstr state is a second file so a busy pinstr board can never disturb the
 * NIP-05 order book. Unpaid orders are dropped an hour after their window
 * closes; published pins are kept, because a pin is what feeds the relay's
 * write whitelist.
 */
function loadSticky(now) {
  const raw = readJson(STICKY_FILE, {});
  const orders = {};
  for (const [id, order] of Object.entries(raw)) {
    if (!order || typeof order !== 'object') continue;
    const pending = order.status === 'awaiting_invoice' || order.status === 'awaiting_payment';
    if (pending && (order.expiresAt || 0) + 3600 < now) continue;
    orders[id] = order;
  }
  return orders;
}

/**
 * May this order still have a picture?
 *
 * A print is stored for a pin that has been paid for and can still reach the board, and
 * for nothing else. An unpaid order would let a stranger fill the disk for free, and an
 * order whose windows have all closed can never become a note, so a picture bought for it
 * would be stored for nobody. The clock is the same one the sweep reads, so a print can
 * never be admitted for an order the sweep would consider dead.
 */
function imageUploadVerdict(order, now) {
  if (order.action !== 'pin') {
    return { ok: false, status: 400, reason: 'not_a_pin_order', error: 'only a pin can carry a picture' };
  }
  if (order.status !== 'paid' && order.status !== 'published') {
    return {
      ok: false, status: 402, reason: 'order_not_paid',
      error: `this order is ${order.status} — the desk stores a picture only for a pin that has been paid for`,
    };
  }
  if (imageReferrerExpiry(order) <= now) {
    return {
      ok: false, status: 409, reason: 'order_expired',
      error: 'this order can no longer become a note, so a picture for it would be stored for nobody',
    };
  }
  return { ok: true };
}

/** The sweep from wherever it is called: a failure here is logged and never fatal. */
function sweepPrints(orders, now = nowS()) {
  return sweepImages({ dir: IMAGE_DIR, orders, now, log: message => console.log(message) })
    .catch(error => console.error(JSON.stringify({ event: 'image_sweep_failed', message: redact(error.message) })));
}

/** Long-poll support: a buyer's POST waits here while the worker attaches a rail. */
const stickyWaiters = new Set();

function wakeStickyWaiters() {
  for (const wake of [...stickyWaiters]) wake();
}

function sleepUntilWoken(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      stickyWaiters.delete(wake);
      resolve();
    }, ms);
    const wake = () => {
      clearTimeout(timer);
      stickyWaiters.delete(wake);
      resolve();
    };
    stickyWaiters.add(wake);
  });
}

async function waitForStickyInvoice(id, maxMs) {
  const started = Date.now();
  let order = loadSticky(nowS())[id];
  while (order && order.status === 'awaiting_invoice') {
    const left = maxMs - (Date.now() - started);
    if (left <= 0) break;
    await sleepUntilWoken(Math.min(1000, left));
    order = loadSticky(nowS())[id];
  }
  return order;
}

/**
 * Response shape for POST /pinstr/v1/orders and GET /pinstr/v1/orders/{id}.
 *
 * Note what is *not* here: BTCheckout's checkoutLink. BTCPay on this box reports
 * a LAN-only checkout URL (http://10.0.3.1:52143/i/...) that a browser on the
 * internet cannot open, which is also why the NIP-05 flow ships invoice rails
 * instead of a checkout page. So the payable thing handed back is the Bark rail
 * itself: the ark address plus a bitcoin: URI carrying the exact amount.
 */
/**
 * Register one exact event id with the relay's fail-closed admission service.
 *
 * The relay asks that service about every event it is offered. The service knows
 * nothing about payments: it knows which event ids this desk has vouched for, and
 * each grant is good for one write of one event. The buyer's key — or the
 * throwaway key behind an anonymous pin — never enters the relay's whitelist.
 *
 * With STICKY_ADMIT_URL unset the relay is not gated yet and publication is
 * unchanged; with it set, an unreachable service refuses the publication rather
 * than quietly leaving the event ungated.
 */
/**
 * Tell the gate the relay really stored the event, so the grant is spent now
 * rather than lingering in its retry window. A failure here is logged and not
 * fatal: the event is already stored, and the window closes on its own.
 */
async function confirmAdmission(eventId) {
  const base = (process.env.STICKY_ADMIT_URL || '').trim();
  if (!base) return { ok: true, skipped: true };
  const token = (process.env.STICKY_ADMIT_TOKEN || '').trim();
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ eventId }),
      signal: AbortSignal.timeout(4000),
    });
    const payload = await response.json().catch(() => null);
    // A gate with no /confirm answers 404 "not found", and that says nothing about
    // the publish: the relay's own admission already spent the grant at the moment
    // it decided the write, so there is nothing left to spend and nothing to
    // repair. Call it unsupported so the caller does not log it as a failure.
    if (response.status === 404) {
      return { ok: false, unsupported: true, message: 'the admission service has no confirm endpoint' };
    }
    if (!response.ok || !payload || payload.ok !== true) {
      return { ok: false, message: (payload && payload.error) || `confirm answered ${response.status}` };
    }
    return { ok: true, consumed: !!payload.consumed };
  } catch (error) {
    return { ok: false, message: `confirm unreachable: ${error.message}` };
  }
}

async function registerAdmission(order, event) {
  const base = (process.env.STICKY_ADMIT_URL || '').trim();
  if (!base) return { ok: true, skipped: true };
  const token = (process.env.STICKY_ADMIT_TOKEN || '').trim();
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/admit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        eventId: event.id,
        pubkey: order.pubkey,
        action: order.action,
        // The kind the gate must hold us to: every Pinstr event is kind 1, and a
        // grant that admitted anything else would let a paid authorization write an
        // event no rule here validated. The gate re-checks it.
        kind: event.kind,
        geohash: order.geohash ?? null,
        anonymous: !!order.anonymous,
      }),
      signal: AbortSignal.timeout(4000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) {
      return { ok: false, message: (payload && payload.error) || `admission service answered ${response.status}` };
    }
    return { ok: true, expiresAt: payload.expiresAt ?? null };
  } catch (error) {
    return { ok: false, message: `admission service unreachable: ${error.message}` };
  }
}

function publicSticky(order, now) {
  const view = statusView(order, now);
  return {
    ok: true,
    id: order.id,
    action: order.action,
    status: order.status,
    sats: order.sats,
    geohash: order.geohash ?? null,
    // Every cell the note paid for. The board knows what it asked for; the order
    // says what it got, which is what an audit of a clump reads.
    geohashes: order.geohashes ?? null,
    anonymous: !!order.anonymous,
    plan: order.plan ?? null,
    covered: !!order.covered,
    freeTier: !!order.freeTier,
    // Work instead of money: the note is admitted by its own id, at this difficulty.
    powFree: !!order.powFree,
    powBits: order.powBits ?? null,
    // The word the board draws as a badge in the note's foot. Decided here, never by a client.
    paidBadge: paymentBadge(order),
    subscription: order.action === 'subscribe'
      ? subscriptionView(loadSubscriptions(), order.pubkey, now)
      : null,
    paymentMethod: order.paymentMethod,
    // Nothing is due on a covered note, and nothing at all on a plan the name's
    // tier makes free, so neither advertises a rail: a board that sees a rail
    // thinks it has to pay.
    paymentMethods: hasNothingToPay(order) ? [] : ((order.payment && order.payment.methods) || [PAYMENT_METHOD]),
    expiresAt: order.expiresAt,
    // A note covered by a subscription has nothing to pay, so it reports no
    // payment object at all: an empty one reads to the board as a missing rail.
    payment: order.payment && !hasNothingToPay(order)
      ? {
        arkAddress: order.payment.arkAddress || null,
        bolt11: order.payment.bolt11 || null,
        lightningUri: order.payment.lightningUri || null,
        paymentLink: order.payment.paymentLink || null,
        methods: order.payment.methods || [],
        invoiceId: order.invoiceId || null,
      }
      : null,
    discount: order.discount || null,
    commitment: { contentHash: order.contentHash },
    paid: view.paid,
    publishToken: view.publishToken,
    publishTokenExpiresAt: view.publishTokenExpiresAt,
    publishedEventId: view.publishedEventId,
  };
}

const handleRequest = async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname;
  const now = nowS();

  try {
    // A shared board link. The page carries the board's picture so a chat can unfurl the board
    // itself, and the picture is a render of the board's own page (see boardCard.mjs). Both are
    // reads of one board's address: nothing here writes, and nothing here trusts a request header.
    if (path.startsWith('/pinstr/v1/boards/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, {ok: false, error: 'method not allowed'}, {allow: 'GET, HEAD'});
      }
      const rest = path.slice('/pinstr/v1/boards/'.length);
      const cells = boardCellsFromPath(rest);
      if (!cells) return send(res, 404, {ok: false, error: 'no such board'}, {'cache-control': 'no-store'});
      const boardPath = `/b/${cells.join(',')}`;
      // An address ending in .webp or .png asks for the picture; a bare one asks for the page. The
      // pictures were .png for a few hours before they became WebP, and links to them are already in
      // chats, so both are answered - with WebP either way, which is what the content type says.
      if (!/\.(?:webp|png)$/u.test(rest)) {
        const page = boardCardPage({cells, baseUrl: BOARD_CARD_BASE_URL, boardPath});
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'content-length': Buffer.byteLength(page),
          'cache-control': 'public, max-age=60',
          'x-content-type-options': 'nosniff',
        });
        return res.end(page);
      }
      try {
        const bytes = await boardCardBytes({
          cells,
          siteUrl: BOARD_CARD_SITE_URL,
          cacheDir: BOARD_CARD_CACHE_DIR,
          log: message => console.log(message),
        });
        res.writeHead(200, {
          'content-type': 'image/webp',
          'content-length': bytes.length,
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
        });
        return res.end(bytes);
      } catch (error) {
        // The link still works and the page still names the board; only the picture is missing.
        console.error(`board card render failed for ${cells.join(',')}:`, error.message);
        return send(res, 503, {ok: false, error: 'the board picture is not ready'},
          {'cache-control': 'no-store', 'retry-after': '30'});
      }
    }

    // A stored picture, under the name that is its own hash. The address is therefore
    // immutable and the cache header says so; only a hash is a name at all, so no request
    // can ask this desk for a path.
    if (path.startsWith('/i/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET, HEAD' });
      }
      const named = /^([0-9a-f]{64})\.webp$/u.exec(path.slice('/i/'.length));
      if (!named) return send(res, 404, { ok: false, error: 'no such picture' }, { 'cache-control': 'no-store' });
      try {
        const bytes = await readFile(imagePath(IMAGE_DIR, named[1]));
        res.writeHead(200, {
          'content-type': 'image/webp',
          'content-length': bytes.length,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
        });
        return res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch {
        // Swept, or never stored on this box.
        return send(res, 404, { ok: false, error: 'no such picture' }, { 'cache-control': 'no-store' });
      }
    }

    if (path === '/nip05/v1/health') {
      const { orders } = loadOrders(now);
      const names = readJson(NAMES_FILE, {});
      return send(res, 200, {
        ok: true,
        liveOrders: liveOrders(orders, now).length,
        namesPublished: Object.keys(names).length,
      }, { 'cache-control': 'no-store' });
    }

    if (path === '/nip05/v1/config') {
      return send(res, 200, { ok: true, ...pricingConfig() }, { 'cache-control': 'public, max-age=300' });
    }

    // Is this name for sale? Used by the page while the buyer types.
    if (path.startsWith('/nip05/v1/names/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      const requested = decodeURIComponent(path.slice('/nip05/v1/names/'.length));
      if (requested.length > 64) return send(res, 400, { ok: false, error: 'name too long' });
      const { orders } = loadOrders(now);
      const names = readJson(NAMES_FILE, {});
      const verdict = availability({ name: requested, names, orders, nowS: now });
      return send(res, 200, { ok: true, ...verdict }, { 'cache-control': 'no-store' });
    }

    // Does this key already have a name here? Called while the buyer types, so a
    // second name for the same key is a decision they make knowingly.
    if (path.startsWith('/nip05/v1/keys/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      const requested = decodeURIComponent(path.slice('/nip05/v1/keys/'.length));
      if (requested.length > 128) return send(res, 400, { ok: false, error: 'pubkey too long' });
      const names = readJson(NAMES_FILE, {});
      const verdict = keyOwner(requested, names);
      if (!verdict.ok) return send(res, 400, { ok: false, error: verdict.error }, { 'cache-control': 'no-store' });
      return send(res, 200, {
        ok: true,
        pubkey: verdict.pubkey,
        known: verdict.known,
        names: verdict.names,
        note: verdict.known
          ? `This key already has ${verdict.names.join(', ')} here. One key, one name — use a different key.`
          : 'This key has no name here yet.',
      }, { 'cache-control': 'no-store' });
    }

    if (path === '/nip05/v1/orders') {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return send(res, 400, { ok: false, error: 'body must be a JSON object' });
      }
      for (const field of Object.keys(body)) {
        if (field !== 'name' && field !== 'pubkey') {
          return send(res, 400, { ok: false, error: `unexpected field: ${field}` });
        }
      }
      const { orders } = loadOrders(now);
      const names = readJson(NAMES_FILE, {});
      const created = createOrder({ name: body.name, pubkey: body.pubkey, names, orders, nowS: now });
      if (!created.ok) {
        const status = created.reason === 'busy' ? 503 : 409;
        return send(res, status, { ok: false, reason: created.reason, error: created.error }, { 'cache-control': 'no-store' });
      }
      orders[created.order.id] = created.order;
      writeJson(ORDERS_FILE, orders);
      // Log the order and the name, never the buyer's pubkey.
      console.log(JSON.stringify({ event: 'order_created', orderId: created.order.id, length: created.order.name.length, sats: created.order.sats }));
      return send(res, 201, {
        ok: true,
        orderId: created.order.id,
        address: `${created.order.name}@satoshi.si`,
        sats: created.order.sats,
        status: created.order.status,
        expiresAt: created.order.expiresAt,
        note: 'Invoice is being prepared. Poll this order for the payment rail.',
      }, { 'cache-control': 'no-store' });
    }

    if (path.startsWith('/nip05/v1/orders/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      const id = path.slice('/nip05/v1/orders/'.length);
      const { orders } = loadOrders(now);
      const order = orders[id];
      if (!order) return send(res, 404, { ok: false, error: 'unknown order' }, { 'cache-control': 'no-store' });
      return send(res, 200, publicOrder(order), { 'cache-control': 'no-store' });
    }

    if (path === '/nip05/v1/worker/queue') {
      if (req.method !== 'GET') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      const { orders, dropped } = loadOrders(now);
      if (dropped) writeJson(ORDERS_FILE, orders);
      const pending = Object.values(orders)
        .filter(order => order.status === 'new'
          || (order.status === 'awaiting_payment' && (order.expiresAt || 0) > now - 3600))
        .sort((a, b) => a.createdAt - b.createdAt);
      return send(res, 200, {
        ok: true,
        now,
        config: pricingConfig(),
        orders: pending,
      }, { 'cache-control': 'no-store' });
    }

    if (path === '/nip05/v1/worker/names') {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      const body = await readJsonBody(req);
      const checked = validateNamesSnapshot(body && body.names);
      if (!checked.ok) return send(res, 400, { ok: false, error: checked.error }, { 'cache-control': 'no-store' });
      writeJson(NAMES_FILE, checked.names);
      console.log(JSON.stringify({ event: 'names_published', count: Object.keys(checked.names).length }));
      return send(res, 200, { ok: true, count: Object.keys(checked.names).length }, { 'cache-control': 'no-store' });
    }

    const invoiceMatch = /^\/nip05\/v1\/worker\/orders\/([^/]+)\/invoice$/.exec(path);
    if (invoiceMatch) {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      const id = decodeURIComponent(invoiceMatch[1]);
      const { orders } = loadOrders(now);
      const applied = applyInvoice(orders[id], await readJsonBody(req), now);
      if (!applied.ok) return send(res, 400, { ok: false, error: applied.error }, { 'cache-control': 'no-store' });
      orders[id] = { ...orders[id], ...applied.patch, updatedAt: now };
      writeJson(ORDERS_FILE, orders);
      console.log(JSON.stringify({ event: 'invoice_attached', orderId: id, rail: Object.keys(applied.patch).filter(k => ['address', 'bolt11', 'ark'].includes(k)) }));
      return send(res, 200, { ok: true }, { 'cache-control': 'no-store' });
    }

    const statusMatch = /^\/nip05\/v1\/worker\/orders\/([^/]+)\/status$/.exec(path);
    if (statusMatch) {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      const id = decodeURIComponent(statusMatch[1]);
      const { orders } = loadOrders(now);
      const body = await readJsonBody(req);
      const applied = applyStatus(orders[id], body && body.status, now, {
        txid: body && body.txid, note: body && body.note,
      });
      if (!applied.ok) return send(res, 400, { ok: false, error: applied.error }, { 'cache-control': 'no-store' });
      if (!applied.noop) {
        orders[id] = { ...orders[id], ...applied.patch };
        writeJson(ORDERS_FILE, orders);
      }
      console.log(JSON.stringify({ event: 'order_status', orderId: id, status: body && body.status }));
      return send(res, 200, { ok: true }, { 'cache-control': 'no-store' });
    }

    // ------------------------------------------------------- pinstr: public

    if (path === '/pinstr/v1/health') {
      const orders = Object.values(loadSticky(now));
      return send(res, 200, {
        ok: true,
        anonymousSats: STICKY_ANON_SATS,

        subscription: {
          weekSats: SUB_WEEK_SATS, yearSats: SUB_YEAR_SATS,
          memberWeekSats: SUB_MEMBER_WEEK_SATS, memberYearSats: SUB_MEMBER_YEAR_SATS,
        },
        subscriptionsActive: Object.values(loadSubscriptions())
          .filter(s => Number.isInteger(s.expiresAt) && now < s.expiresAt).length,
        paymentMethod: PAYMENT_METHOD,
        paymentMethods: PAYMENT_METHODS,
        unpaid: orders.filter(o => o.status === 'awaiting_invoice' || o.status === 'awaiting_payment').length,
        published: orders.filter(o => o.status === 'published').length,
        livePins: orders.filter(o => isPinLive(o, now)).length,
      }, { 'cache-control': 'no-store' });
    }

    if (path === '/pinstr/v1/config') {
      return send(res, 200, {
        ok: true,
        anonymousSats: STICKY_ANON_SATS,

        // Posting one note can also be paid for with work instead of sats, by any key
        // claiming a NIP-05 name of its own. The difficulty is published here so the
        // board offers exactly the number of bits this desk will check, and so a board
        // that never saw this endpoint cannot invent one.
        // How a note was paid for, as the badge its own foot carries. A board draws these
        // words and nothing else; meaning says what each one is claiming.
        paid: {
          tag: PAYMENT_TAG,
          badges: PAYMENT_BADGES,
          meaning: {
            pow: 'mined instead of bought, at the difficulty above',
            bitcoin: 'a Bitcoin subscription covering it, or a per-note anonymous post in sats',
            cash: 'paid in cash',
          },
        },
        pow: {
          bits: POW_BITS,
          tag: POW_TAG,
          claim: 'your own NIP-05 name — name@domain, on any domain',
          buys: 'one pin, published the moment the work is there',
          anonymous: 'not offered — a temporary identity pays per note',
        },
        // A registered key may only pin while a subscription covers it.
        // The prices are named here so the board never has to invent one.
        subscription: {
          weekSats: SUB_WEEK_SATS,
          yearSats: SUB_YEAR_SATS,
          memberWeekSats: SUB_MEMBER_WEEK_SATS,
          memberYearSats: SUB_MEMBER_YEAR_SATS,
          // The whole ladder, so a client can show what a shorter name is worth
          // before anyone signs in. 100% off of a plan is a free plan.
          memberTiers: memberTierTable(),
          weeksPerYear: SUB_WEEKS_PER_YEAR,
          yearDiscount: SUB_YEAR_DISCOUNT,
          plans: SUB_PLANS,
          covers: 'every pin while it lasts',
          anonymous: 'not eligible — an anonymous identity pays per note: 69 sats to pin one',
        },
        geohash: {
          requiredForPin: true,
          alphabet: GEOHASH_ALPHABET,
          minLength: GEOHASH_MIN_LENGTH,
          maxLength: GEOHASH_MAX_LENGTH,
          maxCells: GEOHASH_MAX_CELLS,
          cells: 'one cell, or that cell and the neighbours it touches',
          tags: { geohash: GEO_TAG, uri: GEO_URI_PREFIX, kind: GEO_KIND_VALUE },
        },
        // A note is temporary by rule, and the term is a range the desk enforces:
        // the ladder here is what the board offers, the bounds are what is accepted.
        mentions: {
          tag: MENTION_TAG,
          standard: 'NIP-27',
          max: MENTION_MAX,
          taggable: 'anyone with a NIP-05 identity, on any domain: the board\u2019s @ picker resolves the name, the desk cannot',
          text: 'the note must name the npub of every key it tags',
          anonymous: 'a note from a temporary identity tags nobody',
        },
        liveliness: {
          requiredForPin: true,
          tag: EXPIRATION_TAG,
          standard: 'NIP-40',
          default: STICKY_DEFAULT_LIVELINESS,
          options: STICKY_LIVELINESS,
          minSeconds: STICKY_MIN_LIVELINESS_SECONDS,
          maxSeconds: STICKY_MAX_LIVELINESS_SECONDS,
          measuredFrom: 'created_at',
        },
        tags: {
          marker: STICKY_TOPIC,
          geohash: GEO_TAG,
          expiration: EXPIRATION_TAG,
          geoUri: GEO_URI_TAG,
          geohashKind: GEO_KIND_TAG,
          client: CLIENT_TAG,
          anonymous: ANON_TAG,
        },
        clientValue: CLIENT_VALUE,
        anonymousTagValue: ANON_TAG_VALUE,
        paymentMethod: PAYMENT_METHOD,
        paymentMethods: PAYMENT_METHODS,
        actions: ['pin'],
        memberReason: 'a pubkey that owns an active name in this service\u2019s names database pays the member price; ask GET /pinstr/v1/quote?pubkey=…',
        marker: STICKY_TOPIC,
        maxContentChars: MAX_CONTENT_CHARS,
        version: STICKY_VERSION,
        kind: PIN_KIND,
        board: {min: PLACEMENT_MIN, max: PLACEMENT_MAX},
        rotation: {min: ROTATION_MIN, max: ROTATION_MAX},
        colors: COLORS,
        fonts: FONTS,
        maxChars: MAX_CONTENT_CHARS,
        commitment: 'sha256hex(utf8("v1\n" + color + "\n" + font + "\n" + normalisedText))',
        publishTokenTtlSeconds: TOKEN_TTL_SECONDS,
        pinTtlDays: PIN_TTL_DAYS,
      }, { 'cache-control': 'public, max-age=300' });
    }

    // The subscription a pubkey holds right now, plus every plan price. Read-only,
    // and the page needs both halves: what it may do, and what buying costs.
    if (path === '/pinstr/v1/subscription') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      const pubkey = (url.searchParams.get('pubkey') || '').toLowerCase();
      const names = readJson(NAMES_FILE, {});
      const week = quoteSubscription(pubkey, 'week', names);
      const year = quoteSubscription(pubkey, 'year', names);
      // A key the big relays have never seen cannot buy a plan here, however the client
      // describes itself: it is a one-time key and pays per note. The relays are asked
      // here so the page can show the truth instead of a price it may not pay; the
      // answer is cached, and the decision is taken again when an order is created.
      const stranger = await isStrangerKey(pubkey, names);
      return send(res, 200, {
        ok: true,
        pubkey: pubkey || null,
        ...subscriptionView(loadSubscriptions(), pubkey, now),
        // The desk's verdict about the key, never the board's claim about itself.
        anonymous: stranger,
        anonymousReason: stranger ? STRANGER_REASON : null,
        prices: {
          weekSats: week.ok ? week.sats : SUB_WEEK_SATS,
          yearSats: year.ok ? year.sats : SUB_YEAR_SATS,
          // For this pubkey these are its own tier's prices, which is what a client
          // should show; the ladder below is the generic one.
          memberWeekSats: week.ok ? week.sats : SUB_MEMBER_WEEK_SATS,
          memberYearSats: year.ok ? year.sats : SUB_MEMBER_YEAR_SATS,
          baseWeekSats: SUB_WEEK_SATS,
          baseYearSats: SUB_YEAR_SATS,
          anonymousSats: STICKY_ANON_SATS,
          weeksPerYear: SUB_WEEKS_PER_YEAR,
          yearDiscount: SUB_YEAR_DISCOUNT,
          // A stranger has no plan to buy: what it can do is pin one note for 69 sats.
          plans: stranger ? [] : SUB_PLANS,
          member: week.ok ? Boolean(week.discount?.applied) : false,
          memberName: week.ok ? (week.discount?.name ?? null) : null,
          memberNameLength: week.ok ? (week.nameLength ?? null) : null,
          memberOffPercent: week.ok ? (week.offPercent ?? 0) : 0,
          free: week.ok ? Boolean(week.free) : false,
          memberTiers: memberTierTable(),
        },
      }, { 'cache-control': 'no-store' });
    }

    // What will this pubkey be charged? Read-only and safe to call as the page
    // loads; the price is decided again when the order is created, so a stale
    // quote cannot buy anything cheaper than the buyer qualifies for.
    if (path === '/pinstr/v1/quote') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      const pubkey = url.searchParams.get('pubkey') || '';
      const names = readJson(NAMES_FILE, {});
      const quote = quoteForPubkey(pubkey, names);
      if (!quote.ok) return send(res, 400, { ok: false, error: quote.error }, { 'cache-control': 'no-store' });
      const stranger = await isStrangerKey(pubkey, names);
      return send(res, 200, { ...quote, anonymous: stranger, anonymousReason: stranger ? STRANGER_REASON : null },
        { 'cache-control': 'no-store' });
    }

    if (path === '/pinstr/v1/orders') {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      const body = await readJsonBody(req);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        // A price sent from the browser is refused outright rather than ignored,
        // so a client that thinks it can set the price is told so. Nothing else is
        // refused here: a strict allow-list of every field once rejected one the
        // board genuinely sends (`geohashMode`), which broke posting for everyone
        // while looking like a validation success.
        const priced = new Set(['sats', 'amount', 'priceSats', 'baseSats', 'discount']);
        for (const field of Object.keys(body)) {
          if (priced.has(field)) {
            const hint = field === 'sats' || field === 'amount' ? ' — the price is fixed by this service' : '';
            return send(res, 400, { ok: false, error: `unexpected field: ${field}${hint}` });
          }
        }
      }
      // Eligibility is rechecked here, against the names database, on every
      // order: a quote is a courtesy, not a price the client gets to keep.
      const names = readJson(NAMES_FILE, {});
      // A key the big relays have never seen is a one-time key, whatever the client
      // calls it — so it is marked anonymous *before* the order is priced, and the
      // gates that already exist for the keys this board mints itself do the rest:
      // 69 sats for one note, no plan, no second note, no mining discount.
      const stranger = await isStrangerKey(String((body && body.pubkey) || '').toLowerCase(), names);
      if (stranger && body && typeof body === 'object') body.anonymous = true;
      const created = createStickyOrder(body, {
        now,
        names,
        subscriptions: loadSubscriptions(),
      });
      if (!created.ok) {
        // 402 for "you need a subscription to post as a registered user": the
        // request is well formed, the account is simply not entitled yet.
        const status = created.code === 'subscription_required' ? 402 : 400;
        return send(res, status, {
          ok: false,
          ...(created.code ? { reason: created.code } : {}),
          error: created.error,
        }, { 'cache-control': 'no-store' });
      }

      const orders = loadSticky(now);

      // A subscription for a throwaway identity, refused on the stored orders rather
      // than on the request alone: a key that has ever ordered anonymously is one of
      // these browser-generated keys, which cannot hold a name and so can never be a
      // member. Weekly and yearly plans are both refused, with a stable reason.
      if (created.order.action === 'subscribe'
        && (stranger
          || Object.values(orders).some(o => o && o.anonymous === true && o.pubkey === created.order.pubkey))) {
        console.log(JSON.stringify({
          event: 'sticky_anonymous_subscription_refused', pubkey: created.order.pubkey,
          plan: created.order.plan, source: stranger ? 'no-profile-anywhere' : 'anonymous-history',
        }));
        return send(res, 400, {
          ok: false, reason: ANON_NO_SUBSCRIPTION,
          error: 'That key is a temporary anonymous identity — it pays per note and cannot hold a subscription.',
        }, { 'cache-control': 'no-store' });
      }

      // A live pin for the same note is not charged for twice. The note is the commitment plus
      // the picture, so two wordless pictures are two notes rather than one (duplicateLivePin).
      if (created.order.action === 'pin') {
        const duplicate = duplicateLivePin(orders, created.order, now);
        if (duplicate) {
          return send(res, 409, {
            ok: false, reason: 'already_pinned',
            error: 'That note is already pinned on this key — nothing to pay.',
          }, { 'cache-control': 'no-store' });
        }
      }

      // One note per throwaway identity. Decided on the stored orders, and in the
      // same synchronous stretch as the write below — nothing is awaited in between —
      // so two orders racing for the same key cannot both pass it.
      if (created.order.action === 'pin' && created.order.anonymous === true) {
        const gate = anonymousPinGate(orders, created.order.pubkey);
        if (!gate.ok) {
          console.log(JSON.stringify({
            event: 'sticky_anonymous_key_used', pubkey: created.order.pubkey,
            publishedOrderId: gate.order.id,
          }));
          return send(res, 409, {
            ok: false, reason: gate.code,
            error: 'This temporary identity already has a note on the board — one note per '
              + 'anonymous identity. Log in with your own key to post more.',
          }, { 'cache-control': 'no-store' });
        }
        if (gate.reused) {
          // A retry of the same order, not a second note: the order the caller
          // already has comes back, invoice and all, and no second invoice is made.
          return send(res, 201, {
            ...publicSticky(gate.order, nowS()),
            note: 'This is the order you already had for this identity — nothing new was invoiced.',
          }, { 'cache-control': 'no-store' });
        }
      }

      orders[created.order.id] = created.order;
      writeJson(STICKY_FILE, orders);
      console.log(JSON.stringify({
        event: 'sticky_order_created', orderId: created.order.id,
        action: created.order.action, sats: created.order.sats, plan: created.order.plan,
        covered: Boolean(created.order.covered),
        free: Boolean(created.order.freeTier),
        nameLength: created.order.discount?.nameLength ?? null,
        offPercent: created.order.discount?.offPercent ?? null,
        member: Boolean(created.order.discount && created.order.discount.applied),
      }));

      // A free-tier plan (a three-character name) pays nothing, so the desk hands
      // out the time here instead of waiting for the worker to confirm an invoice
      // that cannot exist — BTCPay cannot invoice zero sats. This is the same
      // `activatedAt` guard the worker's status route uses, so one order can never
      // grant its time twice.
      if (created.order.action === 'subscribe' && created.order.freeTier === true
        && !orders[created.order.id].activatedAt) {
        const applied = activateSubscription(loadSubscriptions(), orders[created.order.id], now);
        writeJson(SUBSCRIPTIONS_FILE, applied.subscriptions);
        orders[created.order.id] = {
          ...orders[created.order.id],
          activatedAt: now,
          subscriptionExpiresAt: applied.subscription.expiresAt,
        };
        writeJson(STICKY_FILE, orders);
        console.log(JSON.stringify({
          event: 'sticky_subscription_activated', orderId: created.order.id,
          plan: applied.subscription.plan, sats: 0, free: true,
          nameLength: created.order.discount?.nameLength ?? null,
          expiresAt: applied.subscription.expiresAt,
        }));
      }
      wakeStickyWaiters();

      // Hold briefly for the worker so the buyer usually gets a payable order
      // in one round trip; if it is not ready the same order is simply polled.
      const ready = await waitForStickyInvoice(created.order.id, STICKY_INVOICE_WAIT_MS) || created.order;
      return send(res, 201, {
        ...publicSticky(ready, nowS()),
        note: ready.covered
          ? 'Covered by your subscription — place the note and publish whenever you are ready.'
          : (ready.powFree
            ? `This note is yours to mine: ${ready.powBits ?? POW_BITS} bits on its own id, then publish it.`
            : (ready.freeTier
              ? 'Your name makes this plan free — the time is on your key already, nothing to pay.'
            : (ready.payment
              ? 'Pay the Bark rail, then poll this order for your publish token.'
              : 'Invoice is being prepared. Poll this order for the Bark rail.'))),
      }, { 'cache-control': 'no-store' });
    }

    const stickyOrderMatch = /^\/(?:sticky|pinstr)\/v1\/orders\/([^/]+)$/.exec(path);
    if (stickyOrderMatch) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      const id = decodeURIComponent(stickyOrderMatch[1]);
      const order = loadSticky(now)[id];
      if (!order) return send(res, 404, { ok: false, error: 'unknown order' }, { 'cache-control': 'no-store' });
      return send(res, 200, publicSticky(order, now), { 'cache-control': 'no-store' });
    }

    const publishMatch = /^\/(?:sticky|pinstr)\/v1\/orders\/([^/]+)\/publish$/.exec(path);
    if (publishMatch) {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      const id = decodeURIComponent(publishMatch[1]);
      const orders = loadSticky(now);
      const order = orders[id];
      if (!order) return send(res, 404, { ok: false, error: 'unknown order' }, { 'cache-control': 'no-store' });
      const body = await readJsonBody(req);
      const header = req.headers.authorization || '';
      const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : (body && body.publishToken);

      // The token is the receipt: checked before anything else happens, and it
      // is bound to this order, pubkey, action and commitment.
      const token = consumePublishToken(order, presented, now);
      if (!token.ok) {
        return send(res, 403, { ok: false, reason: token.code, error: token.error }, { 'cache-control': 'no-store' });
      }
      if (!body || typeof body !== 'object' || !body.event) {
        return send(res, 400, { ok: false, error: 'body must be {"event": <signed nostr event>}' });
      }

      // The one-note rule is enforced here too, where a note is actually published:
      // an anonymous order that predates the rule, or one racing a second order from
      // the same throwaway key, still cannot put a second anonymous note on the board.
      if (order.action === 'pin' && order.anonymous === true) {
        const gate = anonymousPinGate(orders, order.pubkey);
        if (!gate.ok) {
          console.log(JSON.stringify({ event: 'sticky_anonymous_key_used', orderId: id, reason: gate.code }));
          return send(res, 409, {
            ok: false, reason: gate.code,
            error: 'This temporary identity already has a note on the board — one note per anonymous identity.',
          }, { 'cache-control': 'no-store' });
        }
      }

      const verdict = verifyPublishEvent({ order, event: body.event, now });
      if (!verdict.ok) {
        console.log(JSON.stringify({ event: 'sticky_publish_rejected', orderId: id, reason: verdict.code }));
        return send(res, 400, { ok: false, reason: verdict.code, error: verdict.error }, { 'cache-control': 'no-store' });
      }

      // The relay is gated fail-closed: an event from a throwaway (or any
      // otherwise unlisted) author is refused unless this exact event id has
      // been registered first, one event at a time. This desk is the only thing
      // that may register, and only after every rule in verifyPublishEvent has
      // passed. Nothing here touches the relay's pubkey whitelist, so no buyer
      // key — and no throwaway anonymous key — ever gains standing write access.
      const admitted = await registerAdmission(order, body.event);
      if (!admitted.ok) {
        console.log(JSON.stringify({ event: 'sticky_admission_failed', orderId: id, message: admitted.message }));
        return send(res, 502, {
          ok: false, reason: 'relay_rejected',
          error: admitted.message || 'the relay admission service refused this event',
        }, { 'cache-control': 'no-store' });
      }

      const written = await publishEvent(body.event);
      if (!written.ok) {
        console.log(JSON.stringify({ event: 'sticky_relay_rejected', orderId: id, message: written.message }));
        return send(res, 502, {
          ok: false, reason: 'relay_rejected',
          error: written.message || 'the relay refused the note',
        }, { 'cache-control': 'no-store' });
      }

      // The relay has it, and the grant that let it through is already spent: the
      // gate spends a grant inside the decision that admits the write. This call is
      // therefore belt and braces, for a gate that grows a /confirm endpoint; a gate
      // without one answers 404, which is expected and not worth a log line.
      const confirmed = await confirmAdmission(body.event.id);
      if (!confirmed.ok && !confirmed.unsupported) {
        console.log(JSON.stringify({ event: 'sticky_admission_confirm_failed', orderId: id, message: confirmed.message }));
      }

      orders[id] = markPublished(order, body.event.id, now);
      writeJson(STICKY_FILE, orders);
      console.log(JSON.stringify({ event: 'sticky_published', orderId: id, action: order.action, eventId: body.event.id }));
      return send(res, 200, {
        ok: true,
        status: 'published',
        publishedEventId: body.event.id,
        action: order.action,
      }, { 'cache-control': 'no-store' });
    }

    // The picture a note will name. This is a separate request because the note's own
    // body is capped at MAX_BODY_BYTES: a print can never be inside it, so it is uploaded
    // here, once, and the note carries the address that comes back in a tag. The bytes
    // are the body, raw - not multipart, so the cap is enforced against the bytes that
    // arrive rather than against a part header that says how big they are - and the grade
    // and the order travel in the query (or in the two headers, for a client that would
    // rather send them that way). The grade is baked into the stored file, so the desk
    // stores the finished print and never a filter to apply later.
    if (path === '/pinstr/v1/images') {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      // A refused upload is answered before the body is read, and the connection is closed
      // with it: the client is still sending, and it has to be able to read the answer.
      const refuse = (status, reason, error) =>
        send(res, status, { ok: false, reason, error }, { 'cache-control': 'no-store', connection: 'close' });
      const orderId = url.searchParams.get('order') || req.headers['x-pinstr-order'] || '';
      const grade = url.searchParams.get('grade') || req.headers['x-pinstr-grade'] || '';
      if (!orderId) {
        return refuse(400, 'no_order', 'name the order this picture belongs to: /pinstr/v1/images?order=<id>&grade=<id>');
      }
      if (!isImageGrade(grade)) {
        return refuse(400, 'bad_grade', `grade must be one of ${IMAGE_GRADE_IDS.join(', ')}`);
      }
      const orders = loadSticky(now);
      const order = orders[orderId];
      if (!order) return refuse(404, 'unknown_order', 'no order with that id');
      const verdict = imageUploadVerdict(order, now);
      if (!verdict.ok) return refuse(verdict.status, verdict.reason, verdict.error);

      let bytes;
      try {
        bytes = await readCappedBody(req);
      } catch (error) {
        console.log(JSON.stringify({ event: 'sticky_image_refused', orderId, reason: error.reason }));
        return send(res, error.status || 400, { ok: false, reason: error.reason, error: error.error || error.message },
          { 'cache-control': 'no-store', ...(error.stopReading ? { connection: 'close' } : {}) });
      }

      const stored = await storeImage({
        bytes, grade, dir: IMAGE_DIR, baseUrl: IMAGE_BASE_URL,
        log: message => console.log(message),
      });
      if (!stored.ok) {
        console.log(JSON.stringify({ event: 'sticky_image_refused', orderId, reason: stored.reason }));
        return send(res, stored.status || 400, { ok: false, reason: stored.reason, error: stored.error },
          { 'cache-control': 'no-store' });
      }

      // The order is the referrer: this hash on this order is what keeps the file. Written
      // before the sweep runs, so the sweep can never take the print the caller is being
      // handed, and a second picture for one order simply replaces the reference (the one
      // it replaced is swept once nothing else names it).
      orders[orderId] = { ...order, imageHash: stored.hash, imageGrade: grade };
      writeJson(STICKY_FILE, orders);
      console.log(JSON.stringify({
        event: 'sticky_image_stored', orderId, hash: stored.hash, grade,
        bytes: stored.bytes, originalBytes: stored.originalBytes, reused: stored.reused,
      }));
      void sweepPrints(orders, nowS());
      return send(res, 200, { ok: true, url: stored.url, grade, bytes: stored.bytes },
        { 'cache-control': 'no-store' });
    }


    // The nameset itself, so a minted name resolves the moment it exists instead of waiting
    // for a commit. NIP-05 wants { names } and, optionally, relays for those names.
    if (path === '/pinstr/v1/nostr.json' && req.method === 'GET') {
      const names = { ...readJson(MINTED_NAMES_FILE, {}), ...readJson(NAMES_FILE, {}) };
      const relays = {};
      for (const [name, pubkey] of Object.entries(names)) {
        if (typeof pubkey === 'string' && /^[0-9a-f]{64}$/i.test(pubkey)) {
          relays[pubkey.toLowerCase()] = ['wss://nostr.satoshi.si'];
        }
      }
      return send(res, 200, { names, relays },
        { 'cache-control': 'public, max-age=60' });
    }

    // ------------------------------------------------------ pinstr: telegram

    // A Telegram sign-up is given a name of its own: kind 0 carries tele<id>+<hex> for
    // display, and this route mints the NIP-05 that goes beside it. It writes into the
    // name snapshot the worker publishes from, so a minted name resolves on the next
    // tick with no git commit - the same store a paid name lands in, minus the order.
    if (path === '/pinstr/v1/tg/name') {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        return send(res, 400, { ok: false, error: 'invalid json' }, { 'cache-control': 'no-store' });
      }
      const wanted = String(body?.name ?? '').trim().toLowerCase();
      const owner = String(body?.pubkey ?? '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,64}$/.test(wanted)) {
        return send(res, 400, {
          ok: false,
          error: 'name must be 3-64 characters of a-z, 0-9, dot, dash or underscore',
        }, { 'cache-control': 'no-store' });
      }
      if (!/^[0-9a-f]{64}$/.test(owner)) {
        return send(res, 400, { ok: false, error: 'pubkey must be 64 hex characters' },
          { 'cache-control': 'no-store' });
      }
      const published = readJson(NAMES_FILE, {});
      const names = readJson(MINTED_NAMES_FILE, {});
      if (typeof published[wanted] === 'string' && published[wanted].toLowerCase() !== owner) {
        return send(res, 409, { ok: false, error: 'name is already published for another key' },
          { 'cache-control': 'no-store' });
      }
      const existing = typeof names[wanted] === 'string' ? names[wanted].toLowerCase() : '';
      if (existing && existing !== owner) {
        return send(res, 409, { ok: false, error: 'name already belongs to another key' },
          { 'cache-control': 'no-store' });
      }
      if (existing) {
        return send(res, 200, { ok: true, name: wanted, pubkey: owner, created: false },
          { 'cache-control': 'no-store' });
      }
      names[wanted] = owner;
      writeJson(MINTED_NAMES_FILE, names);
      return send(res, 201, { ok: true, name: wanted, pubkey: owner, created: true },
        { 'cache-control': 'no-store' });
    }

    // ------------------------------------------------------- pinstr: worker

    // The worker attaches the rail it created, then reports the settlement. Both routes
    // were documented from the start but never implemented: /pinstr/v1/worker/orders/{id}
    // fell through to the 404 at the bottom of this router, so the worker could never
    // hand back an invoice and every anonymous order sat in awaiting_invoice while the
    // board waited on it.
    if (path.startsWith('/pinstr/v1/worker/orders/')) {
      const rest = path.slice('/pinstr/v1/worker/orders/'.length);
      const slash = rest.lastIndexOf('/');
      const orderId = slash === -1 ? '' : decodeURIComponent(rest.slice(0, slash));
      const action = slash === -1 ? '' : rest.slice(slash + 1);
      if (action !== 'invoice' && action !== 'status') {
        return send(res, 404, { ok: false, error: 'not found' });
      }
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        return send(res, 400, { ok: false, error: 'invalid json' }, { 'cache-control': 'no-store' });
      }
      const orders = loadSticky(nowS());
      const order = orders[orderId];
      if (!order) {
        return send(res, 404, { ok: false, error: 'not found' }, { 'cache-control': 'no-store' });
      }
      if (action === 'invoice') {
        if (order.status !== 'awaiting_invoice') {
          return send(res, 409, {
            ok: false, error: 'order is not awaiting an invoice', status: order.status,
          }, { 'cache-control': 'no-store' });
        }
        const { invoiceId, amountSats, expiresAt, ...rails } = body || {};
        if (typeof invoiceId !== 'string' || invoiceId.length === 0) {
          return send(res, 400, { ok: false, error: 'invoiceId is required' }, { 'cache-control': 'no-store' });
        }
        // The model decides whether this invoice may be attached: it checks the status,
        // requires at least one payable rail and refuses a BOLT11 asking for anything
        // other than the order's price. Writing the fields here instead would skip all
        // of that, which is how a mispriced invoice could be accepted quietly.
        let attached;
        try {
          attached = attachInvoice(order, { ...rails, amountSats: Number(amountSats) || order.sats });
        } catch (err) {
          return send(res, 400, { ok: false, error: String(err.message || err) },
            { 'cache-control': 'no-store' });
        }
        if (!attached || !attached.ok) {
          return send(res, 400, { ok: false, error: (attached && attached.error) || 'invoice refused' },
            { 'cache-control': 'no-store' });
        }
        // The board reads the rail data from order.payment (stickyPaymentRails in
        // stickyNotesModel.mjs), not from a rails field: bolt11, lightningUri, arkAddress
        // and paymentLink. Storing them anywhere else looks attached on the server and
        // leaves the board spinning forever.
        orders[orderId] = {
          ...attached.order,
          status: 'awaiting_payment',
          invoiceId,
          amountSats: Number(amountSats) || order.sats,
          expiresAt: Number(expiresAt) || order.expiresAt || nowS() + 900,
          payment: { invoiceId, ...rails },
        };
        writeJson(STICKY_FILE, orders);
        console.log(JSON.stringify({
          event: 'sticky_invoice_attached', orderId, invoiceId, payment: Object.keys(rails),
        }));
        wakeStickyWaiters();
        return send(res, 200, { ok: true }, { 'cache-control': 'no-store' });
      }
      const asked = String((body && body.status) || '');
      const known = ['paid', 'settled', 'expired', 'published', 'cancelled', 'refunded'];
      if (!known.includes(asked)) {
        return send(res, 400, { ok: false, error: 'unknown status' }, { 'cache-control': 'no-store' });
      }
      // BTCPay says Settled; the desk's own vocabulary says paid.
      const next = asked === 'settled' ? 'paid' : asked;
      // A settled payment goes through the model, which stamps paidAt and extends
      // publishTokenExpiresAt so the token the order was created with is still usable
      // long after the invoice was made. The board renders from order.paid, so that
      // flag is added on top — settleOrder reports paidAt, not the display flag.
      if (next === 'paid') {
        const settled = settleOrder(order, nowS());
        orders[orderId] = { ...settled.order, paid: true };
      } else {
        orders[orderId] = { ...order, status: next };
      }
      writeJson(STICKY_FILE, orders);
      console.log(JSON.stringify({ event: 'sticky_order_status', orderId, status: next }));
      wakeStickyWaiters();
      return send(res, 200, { ok: true }, { 'cache-control': 'no-store' });
    }

    if (path === '/pinstr/v1/worker/queue') {
      if (req.method !== 'GET') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      // ?wait is in SECONDS (the worker sends 20, the cap is 25). Read as
      // milliseconds, a "20" became a 20 ms hold: the worker then spun a request a
      // second into the nginx rate limit and reported a 503 every minute.
      const waitSeconds = Math.min(
        Math.max(Number(url.searchParams.get('wait') || 0), 0),
        Math.floor(STICKY_WORKER_MAX_WAIT_MS / 1000),
      );
      const waitMs = Math.round(waitSeconds * 1000);
      const pick = () => Object.values(loadSticky(nowS()))
        .filter(o => o.status === 'awaiting_invoice' || o.status === 'awaiting_payment')
        .sort((a, b) => a.createdAt - b.createdAt);
      let pending = pick();
      if (pending.length === 0 && waitMs > 0) {
        // Long-poll: the worker stays parked here so a fresh order is invoiced
        // in about a second instead of waiting for the next cron tick.
        await sleepUntilWoken(waitMs);
        pending = pick();
      }
      return send(res, 200, {
        ok: true,
        now: nowS(),
        config: {
          anonymousSats: STICKY_ANON_SATS,
          subscription: { weekSats: SUB_WEEK_SATS, yearSats: SUB_YEAR_SATS,
            memberWeekSats: SUB_MEMBER_WEEK_SATS, memberYearSats: SUB_MEMBER_YEAR_SATS,
            memberTiers: memberTierTable() },
          paymentMethod: PAYMENT_METHOD, paymentMethods: PAYMENT_METHODS,
        },
        orders: pending,
      }, { 'cache-control': 'no-store' });
    }

    const stickyInvoiceMatch = /^\/sticky\/v1\/worker\/orders\/([^/]+)\/invoice$/.exec(path);
    if (stickyInvoiceMatch) {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      const id = decodeURIComponent(stickyInvoiceMatch[1]);
      const orders = loadSticky(now);
      const order = orders[id];
      if (!order) return send(res, 404, { ok: false, error: 'unknown order' }, { 'cache-control': 'no-store' });
      const applied = attachInvoice(order, await readJsonBody(req));
      if (!applied.ok) return send(res, 400, { ok: false, error: applied.error }, { 'cache-control': 'no-store' });
      orders[id] = applied.order;
      writeJson(STICKY_FILE, orders);
      // The rail is a payment destination: log the order, never the address.
      console.log(JSON.stringify({ event: 'sticky_invoice_attached', orderId: id, method: order.paymentMethod, sats: order.sats }));
      wakeStickyWaiters();
      return send(res, 200, { ok: true }, { 'cache-control': 'no-store' });
    }

    const stickyStatusMatch = /^\/sticky\/v1\/worker\/orders\/([^/]+)\/status$/.exec(path);
    if (stickyStatusMatch) {
      if (req.method !== 'POST') {
        return send(res, 405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
      }
      if (!tokenOk(req.headers.authorization)) {
        return send(res, 401, { ok: false, error: 'unauthorized' }, { 'cache-control': 'no-store' });
      }
      const id = decodeURIComponent(stickyStatusMatch[1]);
      const orders = loadSticky(now);
      const order = orders[id];
      if (!order) return send(res, 404, { ok: false, error: 'unknown order' }, { 'cache-control': 'no-store' });
      const body = await readJsonBody(req);
      const status = body && body.status;
      if (status === 'paid') {
        // Reached only when BTCPay reports the invoice Settled.
        // settleOrder returns {ok, order}; storing the wrapper instead of the
        // order once made a Settled invoice look unpaid, which the publish-path
        // integration test catches.
        const settled = settleOrder(order, now).order;
        orders[id] = settled;
        writeJson(STICKY_FILE, orders);

        // A settled subscription becomes time for that pubkey. `activatedAt` is
        // the guard: this route can be called again for the same order, and
        // activating twice would hand out a week that was never paid for.
        if (settled.action === 'subscribe' && !order.activatedAt) {
          const applied = activateSubscription(loadSubscriptions(), settled, now);
          writeJson(SUBSCRIPTIONS_FILE, applied.subscriptions);
          orders[id] = { ...settled, activatedAt: now, subscriptionExpiresAt: applied.subscription.expiresAt };
          writeJson(STICKY_FILE, orders);
          console.log(JSON.stringify({
            event: 'sticky_subscription_activated', orderId: id, plan: applied.subscription.plan,
            sats: applied.subscription.sats, expiresAt: applied.subscription.expiresAt,
          }));
        }
        console.log(JSON.stringify({ event: 'sticky_order_paid', orderId: id, action: order.action }));
        wakeStickyWaiters();
        return send(res, 200, { ok: true, status: 'paid' }, { 'cache-control': 'no-store' });
      }
      if (status === 'expired' || status === 'cancelled') {
        orders[id] = { ...order, status };
        writeJson(STICKY_FILE, orders);
        console.log(JSON.stringify({ event: 'sticky_order_closed', orderId: id, status }));
        return send(res, 200, { ok: true, status }, { 'cache-control': 'no-store' });
      }
      return send(res, 400, { ok: false, error: 'status must be "paid", "expired" or "cancelled"' }, { 'cache-control': 'no-store' });
    }

    return send(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    if (status >= 500) console.error(JSON.stringify({ event: 'error', message: redact(err.message) }));
    return send(res, status, { ok: false, error: status >= 500 ? 'internal error' : err.message });
  }
};
// Every request goes through one place, and a handler that throws - after the headers are written,
// which is how one wrong name in a route took this desk down and left links unanswered for five
// seconds - is reported and answered instead of fatal. The desk is stateless between requests, so
// surviving a bad one costs nothing.
const server = createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error(JSON.stringify({event: 'request_failed', path: req.url, message: error.message}));
    if (res.headersSent) res.destroy();
    else send(res, 500, {ok: false, error: 'the desk failed to answer'}, {'cache-control': 'no-store'});
  });
});

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ event: 'listening', host: HOST, port: PORT, stateDir: STATE_DIR }));
  // The prints nothing refers to: once when the service comes up, and hourly after that.
  // An upload sweeps too, so this is the backstop for the one thing an upload-time sweep
  // cannot see - an order that expired, or a note that was never published, while the desk
  // sat idle. A picture whose every referrer has passed its own expiry is nobody's.
  sweepPrints(loadSticky(nowS()));
  setInterval(() => sweepPrints(loadSticky(nowS())), IMAGE_SWEEP_INTERVAL_MS).unref();
});
