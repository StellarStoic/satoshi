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
  const template = {kind: 1, created_at: 1_700_000_000, content: 'A fairly long Pinstr note', tags: [['t', 'pinstr']]};
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

test('a retry keeps the record of the attempt the signer actually finishes', async () => {
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

  const sessionModule = await import(`../nostrSession.mjs?amber-retry-test=${Date.now()}`);
  const requestId = url => new URL(new URL(url).searchParams.get('callbackUrl')).hash.match(/^#nostr_signer=([a-z0-9-]+)\.$/i)[1];

  // A reader who taps again while the first round trip is still out leaves two attempts in
  // flight, and Android decides which answer arrives first — not the newest one.
  sessionModule.beginAmberLogin();
  const first = requestId(assigned[0]);
  sessionModule.beginAmberLogin();
  const second = requestId(assigned[1]);
  assert.notEqual(second, first, 'a retry is a new request, not the same one re-sent');

  globalThis.location.hash = `#nostr_signer=${first}.${'e'.repeat(64)}`;
  const answer = sessionModule.resumeAmber();
  assert.equal(answer?.action, 'login', 'the answer names the attempt it belongs to');
  assert.equal(sessionModule.getNostrSession().pubkey, 'e'.repeat(64));

  // However often the reader taps, the stored history stays bounded instead of growing.
  for (let attempt = 0; attempt < 10; attempt += 1) sessionModule.beginAmberLogin();
  const parked = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith('satoshi:nostr:amber:')) parked.push(key);
  }
  assert.ok(parked.length <= 5, `four kept attempts plus the latest, not ${parked.length}`);
});


test('an answer is read wherever a signer puts it, and a refusal is reported as one', async () => {
  // NIP-55 has the signer append its result to the callbackUrl without fixing the parameter name,
  // so every shape a real signer produces has to be read - and a refusal is not a broken key.
  const shapes = [
    {label: 'a callback ending in a bare parameter name', search: pubkey => `?result=${pubkey}`},
    {label: 'a result beside an echoed id', search: pubkey => `?id=req9&result=${pubkey}`},
    {label: 'our own concatenated query', search: pubkey => `?nostr_signer=req9.${pubkey}`},
    {label: 'a result glued onto the id', search: pubkey => `?nostr_signer_id=req9${pubkey}`},
    {label: 'the concatenated fragment our callback produces', hash: pubkey => `#nostr_signer=req9.${pubkey}`},
  ];
  for (const shape of shapes) {
    const pubkey = 'c'.repeat(64);
    const storage = memoryStorage();
    const replaced = [];
    storage.setItem('satoshi:nostr:amber:req9', JSON.stringify({createdAt: Date.now(), action: 'login'}));
    globalThis.localStorage = storage;
    globalThis.history = {replaceState: (...args) => replaced.push(args[2])};
    globalThis.location = {
      search: shape.search ? shape.search(pubkey) : '',
      hash: shape.hash ? shape.hash(pubkey) : '',
      pathname: '/stickyNotes.html', href: '',
    };
    globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`}}};

    const sessionModule = await import(`../nostrSession.mjs?amber-shape=${Date.now()}-${Math.random()}`);
    const answer = sessionModule.resumeAmber();
    assert.equal(answer?.session.pubkey, pubkey, shape.label);
    assert.equal(storage.getItem('satoshi:nostr:amber:req9'), null, `the request is spent: ${shape.label}`);
    assert.equal(/[?&](result|id|signature|pubkey|event|nostr_signer)=/.test(replaced[0] || ''), false,
      `the spent answer is taken out of the URL, whatever it was called: ${shape.label}`);
  }
});

test('a refusal in the signer is reported as a refusal', async () => {
  const storage = memoryStorage();
  storage.setItem('satoshi:nostr:amber:req9', JSON.stringify({createdAt: Date.now(), action: 'login'}));
  globalThis.localStorage = storage;
  globalThis.history = {replaceState() {}};
  globalThis.location = {search: '?id=req9&rejected=true', hash: '', pathname: '/stickyNotes.html', href: ''};
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`}}};

  const sessionModule = await import(`../nostrSession.mjs?amber-rejected=${Date.now()}`);
  assert.throws(() => sessionModule.resumeAmber(), /refused/);
  assert.equal(storage.getItem('satoshi:nostr:amber:req9'), null, 'a refusal does not leave the request hanging');
  assert.equal(sessionModule.getNostrSession(), null, 'a refusal is not a login');
});

test('a request sent with no callback can be finished from what Amber copied', async () => {
  const storage = memoryStorage();
  const assigned = [];
  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.history = {replaceState() {}};
  globalThis.location = {
    origin: 'https://satoshi.si', pathname: '/stickyNotes.html', search: '', hash: '',
    assign: value => assigned.push(value),
  };
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`}}};
  const copied = {text: ''};
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {userAgent: 'Android', clipboard: {readText: async () => copied.text}},
  });

  const sessionModule = await import(`../nostrSession.mjs?amber-clipboard=${Date.now()}`);
  sessionModule.beginAmberLogin({copy: true});
  assert.equal(assigned.length, 1, 'the request opens Amber');
  assert.equal(new URL(assigned[0]).searchParams.has('callbackUrl'), false,
    'no callback is sent, which is what makes the signer copy the result instead');
  assert.equal(new URL(assigned[0]).searchParams.get('type'), 'get_public_key');
  assert.equal(sessionModule.amberClipboardPending(), true, 'the page knows to offer the button');

  copied.text = 'not a key at all';
  await assert.rejects(() => sessionModule.adoptAmberClipboard(), /not a public key/);
  assert.equal(sessionModule.getNostrSession(), null, 'junk in the clipboard is not a login');

  copied.text = `${'D'.repeat(64)}\n`;
  const answer = await sessionModule.adoptAmberClipboard();
  assert.equal(answer.session.pubkey, 'd'.repeat(64), 'the copied key is read, whatever its case');
  assert.equal(sessionModule.getNostrSession().pubkey, 'd'.repeat(64));
  assert.equal(sessionModule.amberClipboardPending(), false, 'the request is spent');
});


test('a copied key finishes a no-callback sign-in by itself, but never one copied for something else', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.history = {replaceState() {}};
  globalThis.location = {
    origin: 'https://satoshi.si', pathname: '/stickyNotes.html', search: '', hash: '',
    assign: () => {},
  };
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`}}};
  const existing = 'C'.repeat(64);
  const copied = {text: existing};
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {userAgent: 'Android', clipboard: {readText: async () => copied.text}},
  });

  const sessionModule = await import(`../nostrSession.mjs?amber-auto=${Date.now()}`);
  sessionModule.beginAmberLogin({copy: true});
  // The fingerprint of what was already there is recorded while the tap is still live.
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(await sessionModule.adoptAmberClipboard({silent: true}), null,
    'a key that was already on the clipboard is not this signer answer, however valid it looks');
  assert.equal(sessionModule.getNostrSession(), null);
  assert.equal(sessionModule.amberClipboardPending(), true, 'the request stays parked for the button');

  copied.text = 'D'.repeat(64);
  const answer = await sessionModule.adoptAmberClipboard({silent: true});
  assert.equal(answer?.session.pubkey, 'd'.repeat(64), 'what the signer copied is the answer');
  assert.equal(sessionModule.getNostrSession().pubkey, 'd'.repeat(64));
  assert.equal(sessionModule.amberClipboardPending(), false, 'the request is spent');

  // The same value handed over on purpose is accepted: the guard only governs the silent read.
  sessionModule.beginAmberLogin({copy: true});
  await new Promise(resolve => setTimeout(resolve, 0));
  const deliberate = await sessionModule.adoptAmberClipboard();
  assert.equal(deliberate?.session.pubkey, 'd'.repeat(64), 'the button takes what is there when asked');

  sessionModule.beginAmberLogin({copy: true});
  await new Promise(resolve => setTimeout(resolve, 0));
  copied.text = 'not a key either';
  assert.equal(await sessionModule.adoptAmberClipboard({silent: true}), null, 'junk is ignored in silence');
  assert.equal(sessionModule.amberClipboardPending(), true, 'and it does not spend the request');

  // An identity this browser has signed in with is the reader's own, so an unchanged clipboard is
  // no reason to refuse it: that is what every return visit looks like, because the same key is
  // copied again. 'd' was signed in with above, so it is now a known identity.
  sessionModule.beginAmberLogin({copy: true});
  await new Promise(resolve => setTimeout(resolve, 0));
  copied.text = 'D'.repeat(64);
  const returning = await sessionModule.adoptAmberClipboard({silent: true});
  assert.equal(returning?.session.pubkey, 'd'.repeat(64),
    'coming back with the identity this browser already uses needs no tap');
});

test('the button still works when the browser refuses an automatic read', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.history = {replaceState() {}};
  globalThis.location = {origin: 'https://satoshi.si', pathname: '/stickyNotes.html', search: '', hash: '', assign: () => {}};
  globalThis.window = {dispatchEvent() {}, NostrTools: {nip19: {npubEncode: value => `npub1${value.slice(0, 58)}`}}};
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {userAgent: 'Android', clipboard: {readText: async () => { throw new Error('NotAllowedError'); }}},
  });

  const sessionModule = await import(`../nostrSession.mjs?amber-refused=${Date.now()}`);
  sessionModule.beginAmberLogin({copy: true});
  assert.equal(await sessionModule.adoptAmberClipboard({silent: true}), null, 'a refused read is silence, not an error');
  await assert.rejects(() => sessionModule.adoptAmberClipboard(), /refused to read the clipboard/,
    'the reader who taps the button is told what happened');
});

test('a nostrconnect offer names this origin, waits for the signer, and can be cancelled', async () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.location = {host: 'pinstr.si', origin: 'https://pinstr.si', pathname: '/stickyNotes.html'};
  if (!globalThis.crypto?.getRandomValues) {
    globalThis.crypto = {...(globalThis.crypto || {}), getRandomValues: array => array.fill(7)};
  }
  let closed = 0;
  let seen = null;
  globalThis.window = {
    dispatchEvent() {},
    open() {},
    NostrTools: {
      generateSecretKey: () => Uint8Array.from({length: 32}, (_, index) => index + 1),
      getPublicKey: secret => (secret.length === 32 ? 'a' : 'b').repeat(64),
      nip19: {npubEncode: pubkey => `npub1${pubkey.slice(0, 58)}`},
    },
    NostrBunker: {
      BunkerSigner: {
        fromURI: (clientSecret, uri, params) => {
          seen = {clientSecret, uri, params};
          return Promise.resolve({
            getPublicKey: async () => 'e'.repeat(64),
            signEvent: async template => template,
            close: () => { closed += 1; },
          });
        },
      },
    },
  };

  const sessionModule = await import(`../nostrSession.mjs?connect-test=${Date.now()}`);
  const offer = sessionModule.beginNostrConnect();
  const url = new URL(offer.uri);

  assert.equal(url.protocol, 'nostrconnect:');
  assert.match(url.host, /^[0-9a-f]{64}$/, 'the offer names the client key it will be answered to');
  assert.deepEqual(url.searchParams.getAll('relay'), ['wss://nostr.satoshi.si', 'wss://relay.damus.io']);
  assert.ok(url.searchParams.get('secret'), 'the handshake carries a secret the signer echoes back');
  assert.equal(url.searchParams.get('name'), 'pinstr.si', 'the signer is told which site it connects to');
  assert.equal(url.searchParams.get('url'), 'https://pinstr.si/stickyNotes.html');

  const session = await offer.promise;
  assert.equal(session.method, 'bunker', 'a scanned code produces the connection a bunker link produces');
  assert.equal(session.pubkey, 'e'.repeat(64));
  // Stored the way a bunker:// link stores it, so reconnecting later needs no code at all.
  const stored = JSON.parse(storage.getItem('satoshi:nostr:bunker:v1'));
  assert.equal(stored.clientSecret, '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20');
  assert.equal(stored.url, `bunker://${'e'.repeat(64)}?relay=wss%3A%2F%2Fnostr.satoshi.si&relay=wss%3A%2F%2Frelay.damus.io`);
  assert.equal(seen.uri, offer.uri, 'the offer is what the signer is handed');
  assert.equal(closed, 0, 'a connection that was made is left open');

  // A code nobody scans must not hold a subscription open for the life of the page.
  const abandoned = sessionModule.beginNostrConnect({timeout: 20});
  abandoned.cancel();
  await assert.rejects(abandoned.promise);
});

test('a stored secret the curve rejects is not a signer, and does not crash the page', async () => {
  const storage = memoryStorage();
  const expiresAt = Date.now() + 60_000;
  const pubkey = 'a'.repeat(64);
  storage.setItem('satoshi:nostr:session:v1', JSON.stringify({pubkey, method: 'anonymous', npub: `npub1${'a'.repeat(58)}`, expiresAt}));
  // 64 hex characters, so every shape check passes -- and not a scalar the curve will accept.
  storage.setItem('satoshi:nostr:anonymous:v1', JSON.stringify({pubkey, secret: '0'.repeat(64), expiresAt}));

  globalThis.localStorage = storage;
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.window = {
    dispatchEvent() {},
    NostrTools: {
      generateSecretKey: () => Uint8Array.from({length: 32}, (_, index) => index + 1),
      getPublicKey: () => 'a'.repeat(64),
      nip19: {npubEncode: key => `npub1${key.slice(0, 58)}`},
      finalizeEvent: template => ({...template, pubkey: 'a'.repeat(64), id: 'c'.repeat(64), sig: 'd'.repeat(128)}),
    },
  };

  const sessionModule = await import(`../nostrSession.mjs?bad-scalar-test=${Date.now()}`);
  assert.equal(await sessionModule.signerReady(), false, '64 hex characters is not the same as a usable key');
  assert.equal(sessionModule.getNostrSession(), null, 'the page does not claim a signer it cannot use');
  assert.equal(storage.getItem('satoshi:nostr:anonymous:v1'), null, 'the unusable key is dropped');
  await assert.rejects(() => sessionModule.signNostrEvent({kind: 1, content: '', tags: [], created_at: 1}),
    /Log in to Nostr first/, 'the reader is told to sign in, not shown a curve error');
});

test('a private key the curve rejects is refused when it is entered, not when it signs', async () => {
  globalThis.localStorage = memoryStorage();
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.window = {
    dispatchEvent() {},
    NostrTools: {nip19: {decode: () => ({type: 'nsec', data: new Uint8Array(32)})}},
  };

  const sessionModule = await import(`../nostrSession.mjs?bad-private-key-test=${Date.now()}`);
  assert.throws(() => sessionModule.loginWithPrivateKey('0'.repeat(64)), /curve accepts/, 'an all-zero key');
  assert.throws(() => sessionModule.loginWithPrivateKey('f'.repeat(64)),
    /curve accepts/, 'a value at or above the curve order');
});
