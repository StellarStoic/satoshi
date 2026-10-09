import assert from 'node:assert/strict';
import test from 'node:test';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
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
