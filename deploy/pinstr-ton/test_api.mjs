import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer, readSession } from './api.mjs';

const TOKEN = '123456:TEST-token-not-a-real-bot';
const SECRET = 'test-session-secret-please-change';
const USER = JSON.stringify({ id: 424242, first_name: 'D', username: 'dtest' });

function signedInitData(token = TOKEN, { ageS = 0 } = {}) {
  const params = new URLSearchParams();
  params.append('user', USER);
  params.append('auth_date', String(Math.floor(Date.now() / 1000) - ageS));
  params.append('query_id', 'AAQ');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  params.append('hash', crypto.createHmac('sha256', secret).update(check, 'utf8').digest('hex'));
  return params.toString();
}

async function withServer(fn) {
  const server = createServer({ token: TOKEN, secret: SECRET });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('health reports configuration', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/health`);
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.botConfigured, true);
    assert.equal(d.sessionConfigured, true);
  });
});

test('verify issues a session that reads back', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/tg/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: signedInitData() }) });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.user.id, 424242);
    assert.ok(d.session);
    const back = await fetch(`${base}/tg/session`, { headers: { authorization: `Bearer ${d.session}` } });
    const s = await back.json();
    assert.equal(back.status, 200);
    assert.equal(s.user.id, 424242);
  });
});

test('a forged init data gets 401 and no session', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/tg/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: signedInitData('999:OTHER-bot-token') }) });
    const d = await r.json();
    assert.equal(r.status, 401);
    assert.equal(d.session, undefined);
  });
});

test('expired init data is refused', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/tg/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: signedInitData(TOKEN, { ageS: 7200 }) }) });
    assert.equal(r.status, 401);
  });
});

test('a tampered session token is refused', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/tg/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: signedInitData() }) });
    const { session } = await r.json();
    const [body, mac] = session.split('.');
    const swapped = JSON.parse(Buffer.from(body, 'base64url').toString());
    swapped.tg = 111111;
    const forged = `${Buffer.from(JSON.stringify(swapped)).toString('base64url')}.${mac}`;
    const bad = await fetch(`${base}/tg/session`, { headers: { authorization: `Bearer ${forged}` } });
    assert.equal(bad.status, 401);
    assert.equal(readSession(forged, SECRET), null);
  });
});

test('cors is echoed only for pinstr origins', async () => {
  await withServer(async (base) => {
    const good = await fetch(`${base}/health`, { headers: { origin: 'https://pinstr.si' } });
    assert.equal(good.headers.get('access-control-allow-origin'), 'https://pinstr.si');
    const bad = await fetch(`${base}/health`, { headers: { origin: 'https://satoshi.si' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });
});

test('options preflight answers 204', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/tg/verify`, { method: 'OPTIONS', headers: { origin: 'https://pinstr.si' } });
    assert.equal(r.status, 204);
  });
});
