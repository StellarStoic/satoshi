/**
 * The Telegram key panel belongs to a Telegram session and to nothing else.
 *
 * This module is loaded by the board on every page, and it used to mount its "your key was created for you" panel
 * whenever a Telegram session was merely *stored* — using whatever pubkey the board session held. A reader who signed
 * in with Amber after ever having used the Telegram door got that panel on top of their own identity, which is how the
 * account dialog came to name the wrong signer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const BOARD_SESSION_KEY = 'satoshi:nostr:session:v1';
const TG_SESSION_KEY = 'pinstr:tg-session:v1';

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: index => [...map.keys()][index] ?? null,
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  };
}

/** Just enough document for the module: a card to mount into, and elements that record their own children. */
function fakeDom() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(), textContent: '', style: {cssText: ''}, hidden: false, children: [], dataset: {},
    appendChild(child) { this.children.push(child); return child; },
    append(...nodes) { this.children.push(...nodes); },
    remove() { this.removed = true; },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  });
  const card = make('div');
  // Faithful to the real element: the module asks the card whether a panel is already there before adding one.
  card.querySelector = selector => (selector === '.pinstr-key-tools'
    ? card.children.find(child => child.className === 'pinstr-key-tools') || null
    : null);
  const dialog = make('dialog');
  dialog.querySelector = selector => (selector === '.account-card' ? card : null);
  const document = {
    readyState: 'complete',
    head: make('head'),
    querySelector: selector => (selector === '#accountDialog' ? dialog : selector === '#accountDialog .account-card' ? card : null),
    querySelectorAll: selector => (selector.includes('.pinstr-key-tools') ? card.children.filter(child => child.className === 'pinstr-key-tools') : []),
    createElement: make,
    addEventListener() {},
  };
  return {document, card, dialog};
}

async function load({boardSession, telegramSession, initData = '', fetchImpl = null}) {
  const {document, card} = fakeDom();
  globalThis.document = document;
  globalThis.localStorage = memoryStorage({
    [BOARD_SESSION_KEY]: JSON.stringify(boardSession),
    ...(telegramSession ? {[TG_SESSION_KEY]: JSON.stringify(telegramSession)} : {}),
  });
  globalThis.Telegram = initData ? {WebApp: {initData, ready() {}, expand() {}}} : undefined;
  globalThis.location = {hash: '', search: ''};
  if (fetchImpl) globalThis.fetch = fetchImpl;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.dispatchEvent = () => {};
  globalThis.window = globalThis;
  globalThis.NostrTools = {nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`}};
  const module = await import(`../pinstr-telegram.mjs?test=${Math.random()}`);
  // the module arms itself on a timer and on DOMContentLoaded; give those a turn
  await new Promise(resolve => setTimeout(resolve, 50));
  return {module, card};
}

const TELEGRAM_SESSION = {session: {template: 'anything'}, user: {id: 12345}, expiresAt: ''};
const mounted = card => card.children.filter(child => child.className === 'pinstr-key-tools');

test('an Amber session is not dressed as a Telegram one', async () => {
  const {card} = await load({
    boardSession: {pubkey: 'a'.repeat(64), method: 'amber'},
    telegramSession: TELEGRAM_SESSION,
  });
  assert.equal(mounted(card).length, 0,
    'the Telegram key panel must not be mounted over a reader who signed in with Amber');
});

test('a leftover Telegram panel comes down when the identity changed', async () => {
  // The reader used the Telegram door once, so the panel was mounted; they have since signed in with a key of their
  // own. The panel belongs to the session that is gone, so it is taken down rather than left on someone else's account.
  const {document, card, dialog} = fakeDom();
  const stale = {className: 'pinstr-key-tools', removed: false, remove() { this.removed = true; }};
  card.children.push(stale);
  globalThis.document = document;
  globalThis.localStorage = memoryStorage({
    [BOARD_SESSION_KEY]: JSON.stringify({pubkey: 'b'.repeat(64), method: 'extension'}),
    [TG_SESSION_KEY]: JSON.stringify(TELEGRAM_SESSION),
  });
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.dispatchEvent = () => {};
  globalThis.window = globalThis;
  globalThis.NostrTools = {nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`}};
  await import(`../pinstr-telegram.mjs?test=${Math.random()}`);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(stale.removed, true, 'the panel from the previous identity is removed');
  assert.equal(mounted(card).length, 1, 'and nothing new is mounted in its place');
  assert.equal(dialog.open, undefined, 'the dialog itself is only observed, never opened by this module');
});

test('a Telegram session still gets its panel', async () => {
  const {card} = await load({
    boardSession: {pubkey: 'c'.repeat(64), method: 'telegram'},
    telegramSession: TELEGRAM_SESSION,
  });
  assert.equal(mounted(card).length, 1, 'the reader whose key this module holds keeps the panel that exports it');
});

test('a stored Telegram session never takes a board session away from another signer', async () => {
  // The real fault behind D's report: he signed in with Amber, and the board's own session was overwritten with
  // method 'telegram' on the next load, because the Telegram module re-mounted from storage and its install path
  // wrote the session. The account dialog then said "Signer: telegram" while he had signed in with Amber.
  const {card} = await load({
    boardSession: {pubkey: 'd'.repeat(64), method: 'amber'},
    telegramSession: TELEGRAM_SESSION,
  });
  const stored = JSON.parse(globalThis.localStorage.getItem(BOARD_SESSION_KEY));
  assert.equal(stored.method, 'amber', "the reader's Amber session is still an Amber session");
  assert.equal(stored.pubkey, 'd'.repeat(64), 'and it is still their key');
  assert.equal(mounted(card).length, 0, 'with no Telegram panel over it');
});

test('a Telegram session that already exists is left as one', async () => {
  await load({
    boardSession: {pubkey: 'e'.repeat(64), method: 'telegram', npub: 'npub1example'},
    telegramSession: TELEGRAM_SESSION,
  });
  const stored = JSON.parse(globalThis.localStorage.getItem(BOARD_SESSION_KEY));
  assert.equal(stored.method, 'telegram', 'the session this module hosts keeps its own method');
});

test('a token the server has forgotten is renewed, and the note still gets signed', async () => {
  // What D hit: the page said "signed in with Telegram" and pressing Pin returned the server's own words, "no valid
  // session", because the stored token had died (seven days old, or minted before a session-secret change). Inside the
  // Mini App the launch data can mint another, so the note is signed instead of the reader being stuck.
  const calls = [];
  const signer = () => globalThis.PinstrTelegramSigner;
  const fetchImpl = async (url, init) => {
    calls.push({path: url.replace(/^.*\/tg/, '/tg'), auth: init.headers.authorization || ''});
    if (url.endsWith('/verify')) {
      return {status: 200, ok: true, json: async () => ({session: 'renewed-token', user: {id: 12345}, expiresAt: '2999-01-01T00:00:00Z'})};
    }
    const auth = init.headers.authorization || '';
    if (auth === 'Bearer dead-token') return {status: 401, ok: false, json: async () => ({error: 'no valid session'})};
    return {status: 200, ok: true, json: async () => ({event: {id: 'signed-here', kind: 31923}})};
  };
  await load({
    boardSession: {pubkey: 'd'.repeat(64), method: 'telegram'},
    telegramSession: {session: 'dead-token', user: {id: 12345}, expiresAt: ''},
    initData: 'auth_date=1&hash=deadbeef',
    fetchImpl,
  });
  assert.ok(signer(), 'the module mounted its signer for the Telegram session');
  const signed = await signer().signEvent({kind: 31923, created_at: 1, tags: [], content: ''});
  assert.equal(signed.id, 'signed-here', 'the calendar event is signed after the quiet renewal');
  assert.deepEqual(calls.map(call => call.path), ['/tg/sign', '/tg/verify', '/tg/sign'],
    'one refused signature, one renewal, one signature that lands');
  assert.equal(calls[2].auth, 'Bearer renewed-token', 'the retry carries the new token');
  assert.equal(JSON.parse(globalThis.localStorage.getItem(TG_SESSION_KEY)).session, 'renewed-token',
    'and the new token is kept, so the next note does not repeat the renewal');
});

test('outside Telegram a dead token says what to do, and is dropped', async () => {
  const fetchImpl = async () => ({status: 401, ok: false, json: async () => ({error: 'no valid session'})});
  await load({
    boardSession: {pubkey: 'e'.repeat(64), method: 'telegram'},
    telegramSession: {session: 'dead-token', user: {id: 12345}, expiresAt: ''},
    initData: '',
    fetchImpl,
  });
  assert.ok(globalThis.PinstrTelegramSigner, 'the stale session still mounts, so the board is not left signerless');
  await assert.rejects(
    () => globalThis.PinstrTelegramSigner.signEvent({kind: 1, created_at: 1, tags: [], content: 'hi'}),
    /Your Telegram session has ended\. Log in with Telegram again, then pin this note\./,
    'the reader is told what to do instead of being handed "no valid session"',
  );
  assert.equal(globalThis.localStorage.getItem(TG_SESSION_KEY), null,
    'the dead token is dropped rather than retried forever');
});

test('a Telegram board session with no token mints one on load', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.replace(/^.*\/tg/, '/tg'));
    return {status: 200, ok: true, json: async () => ({session: 'fresh-token', user: {id: 999}, expiresAt: '2999-01-01T00:00:00Z'})};
  };
  await load({
    boardSession: {pubkey: 'f'.repeat(64), method: 'telegram', npub: 'npub1ffff'},
    initData: 'auth_date=2&hash=cafebabe',
    fetchImpl,
  });
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.deepEqual(calls, ['/tg/verify'], 'the launch data is exchanged for a session without asking the reader');
  assert.ok(globalThis.PinstrTelegramSigner, 'so the board can sign again after a week away');
  assert.equal(JSON.parse(globalThis.localStorage.getItem(TG_SESSION_KEY)).session, 'fresh-token');
});

test('the Nostr summary is centred like the buttons it opens', async () => {
  // D: "in the log in modal the sign in with nostr is text aligned left. Make it center." The summary is a flex row, so
  // the label was centred only if the flex line was — it was not, while every button under it was. The chevron is taken
  // out of the flow, because `margin-left: auto` would otherwise hold the words against the left edge again.
  const {readFile} = await import('node:fs/promises');
  const script = await readFile(new URL('../pinstr-telegram.mjs', import.meta.url), 'utf8');
  const summary = script.slice(script.indexOf('.pinstr-nostr > summary {'), script.indexOf('.pinstr-nostr > summary::after'));
  assert.match(summary, /justify-content: center/, 'the label sits in the middle of the dialog');
  assert.match(summary, /position: relative/, 'and the chevron is positioned against it');
  const chevron = script.slice(script.indexOf('.pinstr-nostr > summary::after'), script.indexOf('[open] > summary::after'));
  assert.match(chevron, /position: absolute/);
  assert.match(chevron, /right: 0/);
  assert.doesNotMatch(chevron, /margin-left: auto/,
    'the old auto margin is what kept the words on the left, so it must be gone');
});
