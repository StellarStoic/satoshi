import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './api.mjs';
import { schnorr } from './vendor/noble/secp256k1.js';
import { nsecToBytes, bytesToHex } from './bech32.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const NostrTools = new Function(fs.readFileSync(path.join(here, '..', '..', 'stego', 'vendor', 'nostr-tools.bundle.js'), 'utf8') + '\nreturn NostrTools;')();

const TOKEN = '123456:TEST-token-not-a-real-bot';
const SECRET = 'test-session-secret-please-change';
const TG_ID = 515151;
const PRIV = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);
const NSEC = NostrTools.nip19.nsecEncode(PRIV);
const PUB = bytesToHex(schnorr.getPublicKey(PRIV));
const USER = JSON.stringify({ id: TG_ID, first_name: 'D' });

function initData() {
  const p = new URLSearchParams();
  p.append('user', USER);
  p.append('auth_date', String(Math.floor(Date.now() / 1000)));
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.append('hash', crypto.createHmac('sha256', key).update(check, 'utf8').digest('hex'));
  return p.toString();
}

function kind0() {
  const ev = { pubkey: PUB, created_at: Math.floor(Date.now() / 1000), kind: 0, tags: [], content: JSON.stringify({ name: String(TG_ID) }), sig: 'a'.repeat(128) };
  ev.id = crypto.createHash('sha256').update(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]), 'utf8').digest('hex');
  return ev;
}

async function withSession(fn, { withProfile = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-'));
  const server = createServer({ token: TOKEN, secret: SECRET, profileDir: dir, relays: ['wss://relay.test'], publish: async () => ({ ok: true, results: [] }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { session } = await (await fetch(`${base}/tg/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: initData() }) })).json();
  if (withProfile) {
    await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ event: kind0(), nsec: NSEC }) });
  }
  try {
    await fn({ base, session });
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const sign = (s, draft) => fetch(`${s.base}/tg/sign`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session}` }, body: JSON.stringify({ event: draft }) });

test('a signed note verifies against the account pubkey', async () => {
  await withSession(async (s) => {
    const r = await sign(s, { kind: 1, content: 'first pin from telegram', tags: [], created_at: Math.floor(Date.now() / 1000) });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    const ev = d.event;
    assert.equal(ev.pubkey, PUB);
    assert.equal(schnorr.verify(Buffer.from(ev.sig, 'hex'), Buffer.from(ev.id, 'hex'), nsecToBytes(NSEC) && schnorr.getPublicKey(nsecToBytes(NSEC))), true);
    const recomputed = crypto.createHash('sha256').update(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]), 'utf8').digest('hex');
    assert.equal(ev.id, recomputed);
  });
});

test('the caller cannot sign as somebody else', async () => {
  await withSession(async (s) => {
    const r = await sign(s, { kind: 1, content: 'x', tags: [], pubkey: 'b'.repeat(64) });
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.event.pubkey, PUB);
  });
});

test('signing needs a session', async () => {
  await withSession(async (s) => {
    const r = await fetch(`${s.base}/tg/sign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: { kind: 1, content: 'x', tags: [] } }) });
    assert.equal(r.status, 401);
  });
});

test('signing without a stored key is a 409', async () => {
  await withSession(async (s) => {
    const r = await sign(s, { kind: 1, content: 'x', tags: [] });
    assert.equal(r.status, 409);
  }, { withProfile: false });
});

test('only note-like kinds and reasonable payloads are signed', async () => {
  await withSession(async (s) => {
    assert.equal((await sign(s, { kind: 4, content: 'secret', tags: [] })).status, 400);
    assert.equal((await sign(s, { kind: 1, content: 'x'.repeat(9000), tags: [] })).status, 400);
    assert.equal((await sign(s, { kind: 1, content: 'x', tags: 'nope' })).status, 400);
  });
});
