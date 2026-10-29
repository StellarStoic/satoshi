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

async function load({boardSession, telegramSession}) {
  const {document, card} = fakeDom();
  globalThis.document = document;
  globalThis.localStorage = memoryStorage({
    [BOARD_SESSION_KEY]: JSON.stringify(boardSession),
    ...(telegramSession ? {[TG_SESSION_KEY]: JSON.stringify(telegramSession)} : {}),
  });
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
