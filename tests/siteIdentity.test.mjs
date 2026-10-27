/**
 * siteIdentity: the page-side half of the site's identity.
 *
 * Three things are worth testing and one is not. Worth testing: reading the identity costs nothing and
 * agrees with the session module about expiry; asking for a signature returns either an event or a
 * *pending* hand-over instead of throwing the difference at the caller; and the vendor bundles are loaded
 * once, on demand, never for a page that does not sign. Not worth testing here: the six sign-in methods
 * themselves — nostrSession.test.mjs already drives those.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const SESSION_KEY = 'satoshi:nostr:session:v1';
const ANONYMOUS_KEY = 'satoshi:nostr:anonymous:v1';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
  };
}

function identitySession(overrides = {}) {
  return {
    pubkey: 'a'.repeat(64),
    method: 'extension',
    npub: `npub1${'a'.repeat(58)}`,
    profile: {name: 'StellarStoic'},
    ...overrides,
  };
}

/** What a vendor bundle defines once its script has run. */
function defineBundle(src, window) {
  if (src.includes('nostr-tools')) {
    window.NostrTools = {
      generateSecretKey: () => Uint8Array.from({length: 32}, (unused, index) => index + 1),
      getPublicKey: () => 'a'.repeat(64),
      nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`},
      finalizeEvent: template => ({...template, id: 'c'.repeat(64), sig: 'd'.repeat(128)}),
    };
  }
  if (src.includes('nostr-bunker')) window.NostrBunker = {BunkerSigner: {}};
}

/** A window + document that records script injections and dispatches the session event. */
function installDom() {
  const injected = [];
  const listeners = new Map();
  globalThis.document = {
    head: {
      append(node) {
        injected.push(node.src);
        // a loaded bundle defines its global before its load event fires
        defineBundle(node.src, globalThis.window);
        setTimeout(() => node.__listeners?.load?.forEach(fn => fn()), 0);
      },
    },
    querySelector(selector) {
      const src = selector.match(/script\[src="(.+)"\]/)?.[1];
      return src && injected.includes(src) ? {src} : null;
    },
    createElement() {
      const node = {
        __listeners: {load: [], error: []},
        set src(value) { this._src = value; },
        get src() { return this._src; },
        addEventListener(type, fn) { this.__listeners[type].push(fn); },
      };
      return node;
    },
  };
  globalThis.window = {
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(entry => entry !== fn)); },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach(fn => fn(event)); },
    location: {origin: 'https://satoshi.si', pathname: '/btcMap.html', host: 'satoshi.si'},
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  // nostrSession.mjs reaches for a bare `location`, not window.location
  globalThis.location = globalThis.window.location;
  return {injected, listeners};
}

const load = () => import(`../siteIdentity.mjs?test=${Math.random()}`);

test('reading the identity costs nothing and matches what the session module would conclude', async () => {
  globalThis.localStorage = memoryStorage({[SESSION_KEY]: JSON.stringify(identitySession())});
  const module = await load();
  const identity = module.readIdentity();
  assert.equal(identity.pubkey, 'a'.repeat(64));
  assert.equal(identity.method, 'extension');
  assert.equal(module.identityLabel(identity), 'StellarStoic', 'the profile name is what a reader recognises');
  assert.equal(module.identityLabel(identitySession({profile: null})), 'npub1aaaa…aaaaa',
    'without a profile name the npub is shortened, not the raw hex');
});

test('a throwaway identity that has run out is nobody, and a live one needs its secret', async () => {
  const expired = memoryStorage({[SESSION_KEY]: JSON.stringify(identitySession({method: 'anonymous', expiresAt: Date.now() - 1000}))});
  globalThis.localStorage = expired;
  const module = await load();
  assert.equal(module.readIdentity(), null, 'an expired throwaway identity is not an identity');

  const live = memoryStorage({
    [SESSION_KEY]: JSON.stringify(identitySession({method: 'anonymous', expiresAt: Date.now() + 60_000})),
    [ANONYMOUS_KEY]: JSON.stringify({pubkey: 'a'.repeat(64), secret: 'b'.repeat(64)}),
  });
  globalThis.localStorage = live;
  assert.ok(module.readIdentity(), 'a live one with its secret is');

  live.removeItem(ANONYMOUS_KEY);
  assert.equal(module.readIdentity(), null, 'a record whose secret is gone cannot sign, so it is not shown either');
});

test('a page that does not sign never loads the vendor bundles', async () => {
  globalThis.localStorage = memoryStorage({[SESSION_KEY]: JSON.stringify(identitySession())});
  const {injected} = installDom();
  const module = await load();
  assert.deepEqual(injected, [], 'reading the identity injects no script');
  assert.equal(module.readIdentity().method, 'extension');
  assert.deepEqual(injected, [], 'and still none after reading it');
});

test('the first signature loads what it needs, once, and reuses it', async () => {
  const session = identitySession({method: 'extension'});
  globalThis.localStorage = memoryStorage({[SESSION_KEY]: JSON.stringify(session)});
  const {injected} = installDom();
  globalThis.window.nostr = {signEvent: async template => ({...template, id: 'c'.repeat(64), sig: 'd'.repeat(128)})};
  assert.equal(globalThis.window.NostrTools, undefined, 'the page starts without the bundle');
  const module = await load();

  const first = await module.signOrHandOver({kind: 1, created_at: 1, tags: [], content: 'hello'});
  assert.ok(first.event, 'an extension answers inside the call');
  assert.deepEqual(injected, ['/stego/vendor/nostr-tools.bundle.js'],
    'a local identity does not pull the bunker bundle it will never use');

  await module.signOrHandOver({kind: 1, created_at: 1, tags: [], content: 'again'});
  assert.deepEqual(injected, ['/stego/vendor/nostr-tools.bundle.js'], 'the second signature loads nothing new');
});

test('Amber hands over instead of answering, and says so without throwing', async () => {
  globalThis.localStorage = memoryStorage({[SESSION_KEY]: JSON.stringify(identitySession({method: 'amber'}))});
  installDom();
  const taken = [];
  globalThis.location.assign = url => taken.push(url);
  defineBundle('/stego/vendor/nostr-tools.bundle.js', globalThis.window);
  const module = await load();

  const answer = await module.signOrHandOver({kind: 1, created_at: 1, tags: [], content: 'hi'}, {action: 'test'});
  assert.equal(answer.pending, true, 'a hand-over is an answer, not an error');
  assert.equal(answer.reason, 'amber');
  assert.match(answer.message, /Amber/);
  assert.equal(typeof answer.resume, 'function');
  assert.ok(taken.some(url => url.startsWith('nostrsigner:')), 'Amber is opened with the request');
});

test('no identity is the one case that throws, and it names what to do', async () => {
  globalThis.localStorage = memoryStorage();
  installDom();
  const module = await load();
  await assert.rejects(() => module.signOrHandOver({kind: 1, created_at: 1, tags: [], content: ''}), error => {
    assert.equal(error.code, 'no-identity');
    assert.match(error.message, /Connect a Nostr identity first/);
    return true;
  });
});

test('a page is told when the identity changes, in this tab and another', async () => {
  globalThis.localStorage = memoryStorage();
  const {listeners} = installDom();
  const module = await load();
  const seen = [];
  const stop = module.onIdentityChange(identity => seen.push(identity ? identity.pubkey : null));
  assert.deepEqual(seen, [null], 'the callback is told immediately, so a page can paint once');

  globalThis.localStorage = memoryStorage({[SESSION_KEY]: JSON.stringify(identitySession())});
  globalThis.window.dispatchEvent(new CustomEvent('satoshi-nostr-session', {detail: {}}));
  assert.equal(seen.at(-1), 'a'.repeat(64), 'a sign-in in this tab reaches the page');

  globalThis.localStorage = memoryStorage();
  (listeners.get('storage') || []).forEach(fn => fn({key: SESSION_KEY}));
  assert.equal(seen.at(-1), null, 'and a sign-out in another tab does too');

  stop();
  globalThis.localStorage = memoryStorage({[SESSION_KEY]: JSON.stringify(identitySession())});
  (listeners.get('storage') || []).forEach(fn => fn({key: SESSION_KEY}));
  assert.equal(seen.at(-1), null, 'an unsubscribed page stops hearing about it');
});
