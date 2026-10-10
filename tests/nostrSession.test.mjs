import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    // A real Storage enumerates. Code that walks the keys sees nothing at all without
    // these two, and the symptom is "nothing is in flight" rather than an error.
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
  };
}

test('the installed PWA accepts signer callbacks in its existing window', async () => {
  const manifest = JSON.parse(await readFile(new URL('../site.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.launch_handler?.client_mode, 'navigate-existing');
});

test('anonymous Nostr identity is local, temporary, and restores the previous session', async () => {
  const storage = memoryStorage();
  const previous = {pubkey: 'b'.repeat(64), method: 'extension', npub: `npub1${'b'.repeat(58)}`, profile: {name: 'Alice'}};
  storage.setItem('satoshi:nostr:session:v1', JSON.stringify(previous));

  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.window = {
    dispatchEvent() {},
    NostrTools: {
      generateSecretKey: () => Uint8Array.from({length: 32}, (_, index) => index + 1),
      getPublicKey: () => 'a'.repeat(64),
      nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`},
      finalizeEvent: template => ({...template, pubkey: 'a'.repeat(64), id: 'c'.repeat(64), sig: 'd'.repeat(128)}),
    },
  };

  const sessionModule = await import(`../nostrSession.mjs?anonymous-test=${Date.now()}`);
  const anonymous = sessionModule.loginAnonymously();
  assert.equal(anonymous.method, 'anonymous');
  assert.equal(anonymous.pubkey, 'a'.repeat(64));
  assert.ok(anonymous.expiresAt > Date.now());
  assert.equal(await sessionModule.signerReady(), true);
  assert.equal((await sessionModule.signNostrEvent({kind: 1, content: '', tags: [], created_at: 1})).pubkey, anonymous.pubkey);

  const publishedId = 'e'.repeat(64);
  sessionModule.markAnonymousNotePublished(publishedId);
  assert.equal(sessionModule.getNostrSession().noteEventId, publishedId, 'the key records its only note');
  assert.equal(JSON.parse(storage.getItem('satoshi:nostr:anonymous:v1')).noteEventId, publishedId);
  assert.equal(sessionModule.loginAnonymously().noteEventId, publishedId,
    'clicking anonymous again does not silently mint another key before logout');

  sessionModule.logoutNostr();
  assert.deepEqual(sessionModule.getNostrSession(), previous);
  assert.equal(storage.getItem('satoshi:nostr:anonymous:v1'), null);

  sessionModule.loginAnonymously();
  const expiredSession = JSON.parse(storage.getItem('satoshi:nostr:session:v1'));
  const expiredSecret = JSON.parse(storage.getItem('satoshi:nostr:anonymous:v1'));
  storage.setItem('satoshi:nostr:session:v1', JSON.stringify({...expiredSession, expiresAt: Date.now() - 1}));
  storage.setItem('satoshi:nostr:anonymous:v1', JSON.stringify({...expiredSecret, expiresAt: Date.now() - 1}));
  assert.deepEqual(sessionModule.getNostrSession(), previous);
  assert.equal(storage.getItem('satoshi:nostr:anonymous:v1'), null);
});

test('the identity parked behind a temporary one is readable, and only when it can sign', async () => {
  const storage = memoryStorage();
  const real = {pubkey: 'b'.repeat(64), method: 'bunker', npub: `npub1${'b'.repeat(58)}`, profile: {name: 'Alice'}};
  storage.setItem('satoshi:nostr:session:v1', JSON.stringify(real));

  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.window = {
    dispatchEvent() {},
    NostrTools: {
      generateSecretKey: () => Uint8Array.from({length: 32}, (_, index) => index + 1),
      getPublicKey: () => 'a'.repeat(64),
      nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`},
      finalizeEvent: template => ({...template, pubkey: 'a'.repeat(64), id: 'c'.repeat(64), sig: 'd'.repeat(128)}),
    },
  };

  const sessionModule = await import(`../nostrSession.mjs?parked-test=${Date.now()}`);
  assert.equal(sessionModule.parkedSession(), null, 'nothing is parked while a real identity is in use');

  sessionModule.loginAnonymously();
  assert.deepEqual(sessionModule.parkedSession(), real, 'a temporary identity parks the one it replaced');

  sessionModule.logoutNostr();
  assert.deepEqual(sessionModule.getNostrSession(), real, 'logging out of the temporary one returns to it');
  assert.equal(sessionModule.parkedSession(), null, 'and the slot is spent');

  // A half-written slot is not an identity: the page must not offer to switch back to
  // something that cannot sign.
  sessionModule.loginAnonymously();
  storage.setItem('satoshi:nostr:previous-session:v1', JSON.stringify({pubkey: 'not-a-key', method: 'bunker'}));
  assert.equal(sessionModule.parkedSession(), null);
  storage.setItem('satoshi:nostr:previous-session:v1', JSON.stringify({pubkey: 'b'.repeat(64)}));
  assert.equal(sessionModule.parkedSession(), null, 'a method is what makes it signable');
});

test('a signing request that was never answered is readable, and a stale one is not', async () => {
  const storage = memoryStorage();
  storage.setItem('satoshi:nostr:session:v1', JSON.stringify({pubkey: 'a'.repeat(64), method: 'amber', npub: 'npub1' + 'a'.repeat(58)}));
  globalThis.localStorage = storage;
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`}}};

  const sessionModule = await import(`../nostrSession.mjs?amber-request-test=${Date.now()}`);
  assert.equal(sessionModule.pendingAmberRequest(), null, 'nothing is waiting when no request was made');

  const request = {createdAt: Date.now(), action: 'sign', template: {}, context: {orderId: 'order-1', action: 'pin'}};
  storage.setItem('satoshi:nostr:amber:req1', JSON.stringify(request));
  assert.deepEqual(sessionModule.pendingAmberRequest(), request, 'a request in flight is what the page reports on');

  // Thirty minutes is the window in which an answer is still worth anything: past it the
  // page must not promise a signature that is on its way.
  storage.setItem('satoshi:nostr:amber:req1', JSON.stringify({...request, createdAt: Date.now() - 31 * 60 * 1000}));
  assert.equal(sessionModule.pendingAmberRequest(), null, 'an expired request is not in flight');

  // An answered request is removed by the resume, which is how the page tells the two apart.
  storage.setItem('satoshi:nostr:amber:req1', JSON.stringify(request));
  storage.removeItem('satoshi:nostr:amber:req1');
  assert.equal(sessionModule.pendingAmberRequest(), null);
});

test('signing out keeps the bunker connection, so there is a way back in', async () => {
  const storage = memoryStorage();
  const bunker = {url: `bunker://${'d'.repeat(64)}?relay=wss%3A%2F%2Frelay.example`, clientSecret: 'e'.repeat(64)};
  storage.setItem('satoshi:nostr:session:v1', JSON.stringify({pubkey: 'f'.repeat(64), method: 'bunker', npub: `npub1${'f'.repeat(58)}`}));
  storage.setItem('satoshi:nostr:bunker:v1', JSON.stringify(bunker));
  globalThis.localStorage = storage;
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`}}};

  const sessionModule = await import(`../nostrSession.mjs?bunker-kept-test=${Date.now()}`);
  assert.equal(sessionModule.savedBunker()?.url, bunker.url, 'the saved connection is what the page can come back with');
  assert.equal(sessionModule.savedBunker()?.clientSecret, bunker.clientSecret, 'the authorized client keypair is part of it');

  sessionModule.logoutNostr();
  assert.equal(sessionModule.getNostrSession(), null, 'signing out does end the session');
  // The link is usually a one-use invitation and the client keypair cannot be re-created by
  // hand, so deleting this is deleting the reader's only way back in.
  assert.equal(sessionModule.savedBunker()?.url, bunker.url, 'signing out must not delete the way back in');
  assert.equal(sessionModule.savedBunker()?.clientSecret, bunker.clientSecret);
});

test('a signer answer is read from the query as well as the fragment', async () => {
  const storage = memoryStorage();
  storage.setItem('satoshi:nostr:amber:req9', JSON.stringify({createdAt: Date.now(), action: 'login'}));
  globalThis.localStorage = storage;
  const replaced = [];
  globalThis.history = {replaceState: (...args) => replaced.push(args[2])};
  globalThis.location = {search: `?nostr_signer_result=${'c'.repeat(64)}&nostr_signer_id=req9`, hash: '', pathname: '/stickyNotes.html'};
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`}}};

  const sessionModule = await import(`../nostrSession.mjs?amber-query-test=${Date.now()}`);
  const answer = sessionModule.resumeAmber();
  assert.equal(answer?.action, 'login', 'NIP-55 has the signer append its result to the callback query');
  assert.equal(answer.session.pubkey, 'c'.repeat(64));
  assert.equal(sessionModule.getNostrSession().pubkey, 'c'.repeat(64));
  assert.equal(storage.getItem('satoshi:nostr:amber:req9'), null, 'the request is spent');
  assert.deepEqual(replaced, ['/stickyNotes.html'], 'the answer is taken out of the URL rather than read twice');
});

test('Amber receives a callback its current web parser preserves and the round trip logs in', async () => {
  const storage = memoryStorage();
  const assigned = [];
  const replaced = [];
  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {userAgent: 'Android'}});
  globalThis.history = {replaceState: (...args) => replaced.push(args[2])};
  globalThis.location = {
    origin: 'https://satoshi.si', pathname: '/stickyNotes.html', search: '?g=u24jed', hash: '',
    assign: value => assigned.push(value),
  };
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`}}};

  const sessionModule = await import(`../nostrSession.mjs?amber-round-trip-test=${Date.now()}`);
  sessionModule.beginAmberLogin();
  assert.equal(assigned.length, 1);
  const signerUrl = new URL(assigned[0]);
  const callback = signerUrl.searchParams.get('callbackUrl');
  assert.match(callback, /#nostr_signer=[a-z0-9-]+\.$/i,
    'the callback survives Amber URL-decoding the whole signer request');
  assert.equal(new URL(callback).search, '', 'Amber must not receive a nested query delimiter');
  const amberParameters = decodeURIComponent(assigned[0]).split('?').slice(1).flatMap(part => part.split('&'));
  const parsedByAmber = amberParameters.find(parameter => parameter.startsWith('callbackUrl='))?.slice('callbackUrl='.length);
  assert.equal(parsedByAmber, callback, 'Amber still reads the complete fragment callback after decoding the signer URI');

  const returned = new URL(callback + 'd'.repeat(64));
  globalThis.location.search = '';
  globalThis.location.hash = returned.hash;
  const answer = sessionModule.resumeAmber();
  assert.equal(answer?.action, 'login');
  assert.equal(answer.session.pubkey, 'd'.repeat(64));
  assert.equal(sessionModule.getNostrSession().pubkey, 'd'.repeat(64), 'the returned Amber identity persists');
  assert.deepEqual(replaced, ['/stickyNotes.html?g=u24jed'], 'the board open before Amber is restored');
});

test('Amber login can be handed to Android as a direct user-activated link', async () => {
  const storage = memoryStorage();
  const assigned = [];
  globalThis.localStorage = storage;
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {userAgent: 'Android'}});
  globalThis.location = {
    origin: 'https://satoshi.si', pathname: '/stickyNotes.html', search: '', hash: '',
    assign: value => assigned.push(value),
  };
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`}}};

  const sessionModule = await import(`../nostrSession.mjs?amber-link-test=${Date.now()}`);
  const href = sessionModule.beginAmberLogin({navigate: false});
  assert.match(href, /^nostrsigner:\?type=get_public_key&/);
  assert.match(href, /callbackUrl=/);
  assert.equal(assigned.length, 0, 'the browser follows the link itself after the click handler returns');
  assert.equal(sessionModule.pendingAmberRequest()?.action, 'login', 'the exact link still has matching callback state');
});

test('Amber pinning returns a compact signature and rebuilds the verified event locally', async () => {
  const storage = memoryStorage();
  const pubkey = 'a'.repeat(64);
  const signature = 'b'.repeat(128);
  const eventId = 'c'.repeat(64);
  const assigned = [];
  storage.setItem('satoshi:nostr:session:v1', JSON.stringify({pubkey, method: 'amber', npub: `npub1${'a'.repeat(58)}`}));
  globalThis.localStorage = storage;
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {userAgent: 'Android'}});
  globalThis.history = {replaceState() {}};
  globalThis.location = {
    origin: 'https://satoshi.si', pathname: '/stickyNotes.html', search: '', hash: '',
    assign: value => assigned.push(value),
  };
  globalThis.window = {
    dispatchEvent() {},
    NostrTools: {
      nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`},
      getEventHash: event => {
        assert.equal(event.pubkey, pubkey);
        return eventId;
      },
      verifyEvent: event => event.id === eventId && event.sig === signature && event.pubkey === pubkey,
    },
  };

  const sessionModule = await import(`../nostrSession.mjs?amber-signature-test=${Date.now()}`);
  const template = {kind: 1, created_at: 1_700_000_000, content: 'A fairly long sticky note', tags: [['t', 'satoshi-sticky']]};
  sessionModule.beginAmberSigning(template, {action: 'pin', orderId: 'order-21'});
  const signerUrl = new URL(assigned[0]);
  assert.equal(signerUrl.searchParams.get('returnType'), 'signature');
  const callback = signerUrl.searchParams.get('callbackUrl');
  assert.match(callback, /#nostr_signer=[a-z0-9-]+\.$/i);

  globalThis.location.hash = new URL(callback + signature).hash;
  const answer = sessionModule.resumeAmber();
  assert.equal(answer.action, 'sign');
  assert.deepEqual(answer.context, {action: 'pin', orderId: 'order-21'});
  assert.deepEqual(answer.event, {...template, pubkey, id: eventId, sig: signature});
});
