import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from './api.mjs';

const TOKEN = '123456:TEST-token-not-a-real-bot';
const SECRET = 'test-session-secret-please-change';
const TG_ID = 909090;
const NSEC = 'nsec1exportmetest';
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

function kind0(pubkey = 'f'.repeat(64)) {
  const ev = { pubkey, created_at: Math.floor(Date.now() / 1000), kind: 0, tags: [], content: JSON.stringify({ name: String(TG_ID) }), sig: 'a'.repeat(128) };
  ev.id = crypto.createHash('sha256').update(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]), 'utf8').digest('hex');
  return ev;
}

async function session() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pte-'));
  const server = createServer({ token: TOKEN, secret: SECRET, profileDir: dir, relays: ['wss://relay.test'], publish: async () => ({ ok: true, results: [] }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const vr = await fetch(`${base}/tg/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: initData() }) });
  const { session: tok } = await vr.json();
  return {
    base, tok, dir,
    close: async () => { await new Promise((r) => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

const makeProfile = (s, pubkey) => fetch(`${s.base}/tg/profile`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${s.tok}` },
  body: JSON.stringify({ event: kind0(pubkey), nsec: NSEC }),
});

test('the key can be exported exactly once per call, unchanged', async () => {
  const s = await session();
  try {
    await makeProfile(s);
    const r = await fetch(`${s.base}/tg/export`, { method: 'POST', headers: { authorization: `Bearer ${s.tok}` } });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.nsec, NSEC);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const again = await (await fetch(`${s.base}/tg/export`, { method: 'POST', headers: { authorization: `Bearer ${s.tok}` } })).json();
    assert.equal(again.nsec, NSEC);
  } finally {
    await s.close();
  }
});

test('export needs a session', async () => {
  const s = await session();
  try {
    const r = await fetch(`${s.base}/tg/export`, { method: 'POST' });
    assert.equal(r.status, 401);
  } finally {
    await s.close();
  }
});

test('export before a key exists is a 404, not an empty nsec', async () => {
  const s = await session();
  try {
    const r = await fetch(`${s.base}/tg/export`, { method: 'POST', headers: { authorization: `Bearer ${s.tok}` } });
    assert.equal(r.status, 404);
  } finally {
    await s.close();
  }
});

test('removing the key needs the pubkey as confirmation', async () => {
  const s = await session();
  try {
    await makeProfile(s);
    const bad = await fetch(`${s.base}/tg/key`, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.tok}` }, body: JSON.stringify({ confirm: 'nope' }) });
    assert.equal(bad.status, 400);
  } finally {
    await s.close();
  }
});

test('after removal the key is gone from the session and cannot be exported', async () => {
  const s = await session();
  try {
    const pubkey = 'f'.repeat(64);
    await makeProfile(s, pubkey);
    const del = await fetch(`${s.base}/tg/key`, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.tok}` }, body: JSON.stringify({ confirm: pubkey }) });
    assert.equal(del.status, 200);
    const sess = await (await fetch(`${s.base}/tg/session`, { headers: { authorization: `Bearer ${s.tok}` } })).json();
    assert.equal(sess.profile.hasKey, false);
    const exp = await fetch(`${s.base}/tg/export`, { method: 'POST', headers: { authorization: `Bearer ${s.tok}` } });
    assert.equal(exp.status, 404);
  } finally {
    await s.close();
  }
});

test('a new key may be made after the old one is removed', async () => {
  const s = await session();
  try {
    await makeProfile(s, 'f'.repeat(64));
    await fetch(`${s.base}/tg/key`, { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.tok}` }, body: JSON.stringify({ confirm: 'f'.repeat(64) }) });
    const r = await makeProfile(s, 'e'.repeat(64));
    assert.equal(r.status, 200);
  } finally {
    await s.close();
  }
});
