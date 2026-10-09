import assert from 'node:assert/strict';
import test from 'node:test';

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

test('Amber receives a callback whose final slot is the result and the round trip logs in', async () => {
  const storage = memoryStorage();
  const assigned = [];
  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {userAgent: 'Android'}});
  globalThis.history = {replaceState() {}};
  globalThis.location = {
    origin: 'https://satoshi.si', pathname: '/stickyNotes.html', search: '', hash: '',
    assign: value => assigned.push(value),
  };
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`}}};

  const sessionModule = await import(`../nostrSession.mjs?amber-round-trip-test=${Date.now()}`);
  sessionModule.beginAmberLogin();
  assert.equal(assigned.length, 1);
  const signerUrl = new URL(assigned[0]);
  const callback = signerUrl.searchParams.get('callbackUrl');
  assert.ok(callback?.endsWith('&nostr_signer_result='), 'Amber appends its answer to the final callback slot');
  assert.equal(new URL(callback).hash, '', 'nothing follows the result slot in a fragment');

  const returned = new URL(callback + 'd'.repeat(64));
  globalThis.location.search = returned.search;
  const answer = sessionModule.resumeAmber();
  assert.equal(answer?.action, 'login');
  assert.equal(answer.session.pubkey, 'd'.repeat(64));
  assert.equal(sessionModule.getNostrSession().pubkey, 'd'.repeat(64), 'the returned Amber identity persists');
});
