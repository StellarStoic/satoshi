import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealSecret, openSecret, profileContent, checkKind0, publishEvent } from './profile.mjs';

const SECRET = 'a-test-session-secret-that-is-long-enough';
const PUB = 'a'.repeat(64);

function makeEvent({ kind = 0, pubkey = PUB, content = null, tags = [], created_at = Math.floor(Date.now() / 1000), sig = 'f'.repeat(128) } = {}) {
  const ev = { pubkey, created_at, kind, tags, content: content ?? profileContent({ tgId: 8513984991 }), sig };
  const serialised = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  ev.id = crypto.createHash('sha256').update(serialised, 'utf8').digest('hex');
  return ev;
}

test('secrets round-trip through the sealed envelope', () => {
  const sealed = sealSecret('nsec1example', SECRET);
  assert.equal(openSecret(sealed, SECRET), 'nsec1example');
  assert.equal(Buffer.from(sealed.body, 'base64').toString('utf8').includes('nsec1'), false);
});

test('a different session secret cannot open it', () => {
  const sealed = sealSecret('nsec1example', SECRET);
  assert.throws(() => openSecret(sealed, 'a-completely-different-secret-value'));
});

test('the profile carries the telegram id and nothing else', () => {
  const content = JSON.parse(profileContent({ tgId: 8513984991 }));
  assert.deepEqual(Object.keys(content), ['name']);
  assert.equal(content.name, '8513984991');
});

test('a well-formed kind 0 for the session key is accepted', () => {
  assert.equal(checkKind0(makeEvent(), { pubkey: PUB }).ok, true);
});

test('a kind 0 for another key is refused', () => {
  const r = checkKind0(makeEvent({ pubkey: 'b'.repeat(64) }), { pubkey: PUB });
  assert.equal(r.ok, false);
  assert.match(r.reason, /pubkey/);
});

test('a forged id is refused', () => {
  const ev = makeEvent();
  ev.content = JSON.stringify({ name: 'someone else' });
  assert.equal(checkKind0(ev, { pubkey: PUB }).ok, false);
});

test('a stale created_at is refused', () => {
  const old = Math.floor(Date.now() / 1000) - 7200;
  assert.equal(checkKind0(makeEvent({ created_at: old }), { pubkey: PUB }).ok, false);
});

test('a non-kind-0 or malformed signature is refused', () => {
  assert.equal(checkKind0(makeEvent({ kind: 1 }), { pubkey: PUB }).ok, false);
  assert.equal(checkKind0(makeEvent({ sig: 'abc' }), { pubkey: PUB }).ok, false);
});

test('publish reports failure instead of hanging when the socket never opens', async () => {
  class DeadSocket {
    constructor() { setTimeout(() => this.onerror && this.onerror(), 5); }
    close() {}
    send() {}
  }
  const r = await publishEvent('wss://example.invalid', makeEvent(), { WebSocketImpl: DeadSocket, timeoutMs: 200 });
  assert.equal(r.ok, false);
});

test('publish resolves ok when the relay confirms the event', async () => {
  const event = makeEvent();
  class GoodSocket {
    constructor() {
      setTimeout(() => {
        this.onopen && this.onopen();
        this.onmessage && this.onmessage({ data: JSON.stringify(['OK', event.id, true, '']) });
      }, 5);
    }
    close() {}
    send() {}
  }
  const r = await publishEvent('wss://relay.example', event, { WebSocketImpl: GoodSocket, timeoutMs: 500 });
  assert.equal(r.ok, true);
});
