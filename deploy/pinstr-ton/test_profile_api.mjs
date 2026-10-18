import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from './api.mjs';

const TOKEN = '123456:TEST-token-not-a-real-bot';
const SECRET = 'test-session-secret-please-change';
const TG_ID = 424242;
const USER = JSON.stringify({ id: TG_ID, first_name: 'D' });

function initData(token = TOKEN) {
  const p = new URLSearchParams();
  p.append('user', USER);
  p.append('auth_date', String(Math.floor(Date.now() / 1000)));
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  p.append('hash', crypto.createHmac('sha256', secret).update(check, 'utf8').digest('hex'));
  return p.toString();
}

function kind0({ name = String(TG_ID), pubkey = 'c'.repeat(64) } = {}) {
  const ev = { pubkey, created_at: Math.floor(Date.now() / 1000), kind: 0, tags: [], content: JSON.stringify({ name }), sig: 'd'.repeat(128) };
  ev.id = crypto.createHash('sha256').update(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]), 'utf8').digest('hex');
  return ev;
}

async function withServer(fn, { publishOk = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptg-'));
  const published = [];
  const server = createServer({
    token: TOKEN,
    secret: SECRET,
    profileDir: dir,
    relays: ['wss://relay.test'],
    publish: async (urls, event) => {
      published.push(event);
      return { ok: publishOk, results: urls.map((u) => ({ url: u, ok: publishOk })) };
    },
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const vr = await fetch(`${base}/tg/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: initData() }) });
    const { session } = await vr.json();
    await fn({ base, session, dir, published });
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('session reports no profile before one is made', async () => {
  await withServer(async ({ base, session }) => {
    const r = await fetch(`${base}/tg/session`, { headers: { authorization: `Bearer ${session}` } });
    const d = await r.json();
    assert.equal(d.profile, null);
  });
});

test('a valid kind 0 is stored sealed and published', async () => {
  await withServer(async ({ base, session, dir, published }) => {
    const event = kind0();
    const r = await fetch(`${base}/tg/profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` },
      body: JSON.stringify({ event, nsec: 'nsec1verysecretvalue' }),
    });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.published, true);
    assert.equal(published.length, 1);
    const file = path.join(dir, `${TG_ID}.json`);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(stored.pubkey, event.pubkey);
    const raw = fs.readFileSync(file, 'utf8');
    assert.equal(raw.includes('nsec1verysecretvalue'), false, 'the secret must not be stored in the clear');
    assert.ok(stored.sealed && stored.sealed.tag);
  });
});

test('the bound key shows up on the session afterwards', async () => {
  await withServer(async ({ base, session }) => {
    const event = kind0();
    await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ event, nsec: 'x'.repeat(20) }) });
    const r = await fetch(`${base}/tg/session`, { headers: { authorization: `Bearer ${session}` } });
    const d = await r.json();
    assert.equal(d.profile.pubkey, event.pubkey);
    assert.equal(d.profile.published, true);
  });
});

test('a second, different key is refused', async () => {
  await withServer(async ({ base, session }) => {
    const first = kind0();
    await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ event: first, nsec: 'x'.repeat(20) }) });
    const r = await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ event: kind0({ pubkey: 'e'.repeat(64) }), nsec: 'y'.repeat(20) }) });
    assert.equal(r.status, 409);
  });
});

test('a profile naming someone else is refused', async () => {
  await withServer(async ({ base, session }) => {
    const r = await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ event: kind0({ name: 'D' }), nsec: 'x'.repeat(20) }) });
    assert.equal(r.status, 400);
  });
});

test('a forged id never reaches a relay', async () => {
  await withServer(async ({ base, session, published }) => {
    const ev = kind0();
    ev.content = JSON.stringify({ name: String(TG_ID), about: 'injected' });
    const r = await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ event: ev, nsec: 'x'.repeat(20) }) });
    assert.equal(r.status, 400);
    assert.equal(published.length, 0);
  });
});

test('no session means no profile write', async () => {
  await withServer(async ({ base }) => {
    const r = await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: kind0(), nsec: 'x'.repeat(20) }) });
    assert.equal(r.status, 401);
  });
});

test('a rejected relay is recorded rather than reported as success', async () => {
  await withServer(async ({ base, session, dir }) => {
    const r = await fetch(`${base}/tg/profile`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session}` }, body: JSON.stringify({ event: kind0(), nsec: 'x'.repeat(20) }) });
    const d = await r.json();
    assert.equal(d.published, false);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, `${TG_ID}.json`), 'utf8'));
    assert.equal(stored.published, false);
    assert.ok(stored.publishReason.length > 0);
  }, { publishOk: false });
});
