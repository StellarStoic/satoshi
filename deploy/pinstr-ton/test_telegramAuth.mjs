import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyInitData, verifyLoginWidget } from './telegramAuth.mjs';

const TOKEN = '123456:TEST-token-not-a-real-bot';

function sign(initData, token = TOKEN, { excludeSignature = false } = {}) {
  const params = new URLSearchParams(initData);
  params.delete('hash');
  const exclude = new Set(excludeSignature ? ['signature'] : []);
  const check = [...params.entries()].filter(([k]) => !exclude.has(k)).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(check, 'utf8').digest('hex');
  params.append('hash', hash);
  return params.toString();
}

const user = JSON.stringify({ id: 777001, first_name: 'Test', username: 'tester', language_code: 'sl', is_premium: true });

function base(extra = '') {
  const authDate = Math.floor(Date.now() / 1000);
  return `query_id=AAExample&user=${encodeURIComponent(user)}&auth_date=${authDate}${extra}`;
}

test('accepts init data signed with the bot token', () => {
  const r = verifyInitData(sign(base()), TOKEN);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.user.id, 777001);
  assert.equal(r.user.username, 'tester');
  assert.equal(r.user.isPremium, true);
});

test('accepts a payload whose signature field is excluded from the check string', () => {
  const withSig = base('&signature=abcdef');
  assert.equal(verifyInitData(sign(withSig, TOKEN, { excludeSignature: true }), TOKEN).valid, true);
  assert.equal(verifyInitData(sign(withSig), TOKEN).valid, true);
});

test('rejects a tampered user id', () => {
  const signed = sign(base());
  const tampered = signed.replace(encodeURIComponent(user), encodeURIComponent(user.replace('777001', '777002')));
  const r = verifyInitData(tampered, TOKEN);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'signature does not match');
});

test('rejects a payload signed with a different bot token', () => {
  assert.equal(verifyInitData(sign(base(), '999:OTHER-token-entirely'), TOKEN).valid, false);
});

test('rejects stale init data', () => {
  const old = Math.floor(Date.now() / 1000) - 7200;
  const initData = `query_id=AAExample&user=${encodeURIComponent(user)}&auth_date=${old}`;
  const r = verifyInitData(sign(initData), TOKEN);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'expired');
});

test('returns start_param for deep links', () => {
  const r = verifyInitData(sign(base('&start_param=note_42')), TOKEN);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.startParam, 'note_42');
});

test('refuses to validate without a configured token', () => {
  assert.equal(verifyInitData(sign(base()), '').valid, false);
});

test('login widget path verifies with sha256 of the token', () => {
  const authDate = Math.floor(Date.now() / 1000);
  const fields = { id: '777001', first_name: 'Test', username: 'tester', auth_date: String(authDate) };
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHash('sha256').update(TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(check, 'utf8').digest('hex');
  const r = verifyLoginWidget({ ...fields, hash }, TOKEN);
  assert.equal(r.valid, true, r.reason);
  assert.equal(r.user.id, 777001);
  assert.equal(verifyLoginWidget({ ...fields, hash: hash.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')) }, TOKEN).valid, false);
  assert.equal(verifyLoginWidget({ ...fields, hash, auth_date: String(authDate - 4000) }, TOKEN).valid, false);
});
