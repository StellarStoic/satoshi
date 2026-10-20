// api.pinstr.si — Telegram session service for the Pinstr door.
// Deploy-only. satoshi.si never loads or hosts any of this.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifyInitData, verifyLoginWidget } from './telegramAuth.mjs';
import { sealSecret, openSecret, checkKind0, publishToAll } from './profile.mjs';
import { nsecToBytes, bytesToHex } from './bech32.mjs';
import { schnorr } from './vendor/noble/secp256k1.js';

const SIGNABLE_KINDS = new Set([0, 1, 7]);
const MAX_CONTENT = 8192;

function signEventFor(pubkey, priv, { kind, created_at, tags, content }) {
  const createdAt = Number.isFinite(created_at) ? Math.floor(created_at) : Math.floor(Date.now() / 1000);
  const serialised = JSON.stringify([0, pubkey, createdAt, kind, tags, content]);
  const idHex = crypto.createHash('sha256').update(serialised, 'utf8').digest('hex');
  const sig = Buffer.from(schnorr.sign(Buffer.from(idHex, 'hex'), priv)).toString('hex');
  return { id: idHex, pubkey, created_at: createdAt, kind, tags, content, sig };
}

const PORT = Number(process.env.PINSTR_TG_PORT || 8851);
const TOKEN = process.env.PINSTR_TG_BOT_TOKEN || '';
const SECRET = process.env.PINSTR_TG_SESSION_SECRET || '';
const SESSION_TTL_S = Number(process.env.PINSTR_TG_SESSION_TTL || 604800);
const ALLOWED_ORIGINS = (process.env.PINSTR_TG_ORIGINS || 'https://pinstr.si,https://www.pinstr.si').split(',').map((s) => s.trim()).filter(Boolean);
const VERIFY_PER_MIN = Number(process.env.PINSTR_TG_VERIFY_PER_MIN || 12);
const PROFILE_DIR = process.env.PINSTR_TG_PROFILE_DIR || '/opt/pinstr-tg/profiles';

// A Telegram identity carries a face and a name of its own. Both derive from the pubkey, so they
// are stable for the life of the key and never need storing to be recomputed: three hex characters
// summarise the key, kind 0 shows tele<id>+<hex>, and the NIP-05 - whose local part has no "+" -
// uses a dash in the same string.
const TG_NAME_ENDPOINT = process.env.PINSTR_TG_NAME_ENDPOINT || 'http://127.0.0.1:8790/pinstr/v1/tg/name';
const TG_NAME_TOKEN = process.env.PINSTR_TG_NAME_TOKEN || '';

function telegramIdentity(tgId, pubkey) {
  const hex = crypto.createHash('sha256').update(`pinstr-tg:${pubkey}`).digest('hex').slice(0, 3);
  const id = String(tgId);
  return {
    hex,
    name: `tele${id}+${hex}`,
    nip05: `tele${id}-${hex}@pinstr.si`,
    picture: `https://pinstr.si/tg/avatar/${pubkey}.svg`,
  };
}

// Mints the NIP-05 into the snapshot the desk publishes. Best effort: a name is worth having, a
// profile is worth more, so a desk that is down must not stop a profile from being published.
async function mintTelegramName(name, pubkey) {
  if (!TG_NAME_TOKEN) return { ok: false, reason: 'no name token configured' };
  try {
    const response = await fetch(TG_NAME_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TG_NAME_TOKEN}` },
      body: JSON.stringify({ name, pubkey }),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, created: Boolean(body && body.created), reason: body && body.error ? String(body.error) : '' };
  } catch (err) {
    return { ok: false, reason: String(err.message || err).slice(0, 120) };
  }
}

// Brings a stored Telegram profile up to the current shape: kind 0 carrying its name, NIP-05 and
// picture, signed here because the sealed key is here. It runs on every sign-in, so accounts made
// before any of this existed repair themselves the next time they are used.
export async function refreshTelegramProfile({ tgId, record, relays, secret }) {
  if (!record || !record.sealed || record.deleted || !record.pubkey) {
    return { refreshed: false, reason: 'no key stored' };
  }
  const identity = telegramIdentity(tgId, record.pubkey);
  const minted = await mintTelegramName(identity.nip05.split('@')[0], record.pubkey);
  let priv;
  try {
    // The sealed value is a bech32 nsec, not hex: nsecToBytes is the decoder for it.
    priv = Buffer.from(nsecToBytes(openSecret(record.sealed, secret)));
  } catch (err) {
    return { refreshed: false, reason: `sealed key unreadable: ${String(err.message || err).slice(0, 80)}` };
  }
  const event = signEventFor(record.pubkey, priv, {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({ name: identity.name, nip05: identity.nip05, picture: identity.picture }),
  });
  priv.fill(0);
  let published = false;
  let publishReason = '';
  try {
    const outcome = await publishToAll(relays, event);
    published = Boolean(outcome && outcome.ok);
    publishReason = published ? '' : JSON.stringify(outcome && outcome.results ? outcome.results : outcome).slice(0, 200);
  } catch (err) {
    publishReason = String(err.message || err).slice(0, 200);
  }
  writeProfile(record.dir, tgId, {
    ...record,
    eventId: event.id,
    name: identity.name,
    nip05: identity.nip05,
    picture: identity.picture,
    nameMinted: Boolean(minted.ok),
    nameReason: minted.ok ? '' : String(minted.reason || '').slice(0, 160),
    published,
    publishReason,
    updatedAt: new Date().toISOString(),
  });
  return { refreshed: true, published, minted: minted.ok, name: identity.name, nip05: identity.nip05, picture: identity.picture };
}

const RELAYS = (process.env.PINSTR_TG_RELAYS || 'wss://nostr.satoshi.si').split(',').map((s) => s.trim()).filter(Boolean);

function readProfile(dir, tgId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `${Number(tgId)}.json`), 'utf8'));
  } catch {
    return null;
  }
}

function writeProfile(dir, tgId, record) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, `${Number(tgId)}.json`);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.renameSync(temp, target);
}

function sign(payload, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function readSession(token, secret = SECRET, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.exp * 1000 < now) return null;
  return payload;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

async function readJson(req, limit = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('body is not json');
  }
}

const verifyHits = new Map();

function rateLimited(key, now) {
  const windowStart = now - 60_000;
  const hits = (verifyHits.get(key) || []).filter((t) => t > windowStart);
  hits.push(now);
  verifyHits.set(key, hits);
  if (verifyHits.size > 5000) verifyHits.clear();
  return hits.length > VERIFY_PER_MIN;
}

export function createServer(env = {}) {
  const token = env.token ?? TOKEN;
  const secret = env.secret ?? SECRET;
  const publish = env.publish ?? ((urls, event) => publishToAll(urls, event));
  const profileDir = env.profileDir ?? PROFILE_DIR;
  const relays = env.relays ?? RELAYS;
  return http.createServer(async (req, res) => {
    cors(req, res);
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      if (url.pathname === '/health' && req.method === 'GET') {
        send(res, 200, { ok: true, service: 'pinstr-telegram', botConfigured: Boolean(token), sessionConfigured: Boolean(secret), sessionTtlS: SESSION_TTL_S });
        return;
      }
      // A Telegram identity needs a face, and it should not be stored: the avatar is
      // derived from the pubkey, so it is stable for the life of the key. DiceBear shadows
      // is vendored under ./vendor/dicebear (core 10.7.0 plus that one style definition)
      // because this service has no package manager and must start offline.
      if (url.pathname.startsWith('/tg/avatar/') && req.method === 'GET') {
        const wanted = decodeURIComponent(url.pathname.slice('/tg/avatar/'.length)).replace(/\.svg$/i, '');
        if (!/^[0-9a-f]{64}$/i.test(wanted)) {
          return send(res, 400, { ok: false, error: 'avatar needs a 64-character hex pubkey' });
        }
        const svg = await renderAvatar(wanted.toLowerCase());
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': Buffer.byteLength(svg),
        });
        return res.end(svg);
      }

      if (url.pathname === '/tg/verify' && req.method === 'POST') {
        if (!token) return send(res, 503, { error: 'bot token not configured' });
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const body = await readJson(req);
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        if (rateLimited(ip, now)) return send(res, 429, { error: 'too many attempts' });
        const result = verifyInitData(body.initData, token, { now });
        if (!result.valid) {
          // Never say which check failed beyond a coarse reason; no payload echo.
          return send(res, 401, { error: 'verification failed', reason: result.reason });
        }
        const exp = Math.floor(now / 1000) + SESSION_TTL_S;
        const session = sign({ tg: result.user.id, user: result.user, iat: Math.floor(now / 1000), exp }, secret);
        send(res, 200, { session, user: result.user, startParam: result.startParam, expiresAt: new Date(exp * 1000).toISOString() });
        return;
      }
      if (url.pathname === '/tg/login' && req.method === 'POST') {
        // The web Login Widget signs with sha256 of the bot token, not the WebAppData
        // derivation, so it gets its own verification path.
        if (!token) return send(res, 503, { error: 'bot token not configured' });
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const body = await readJson(req);
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        if (rateLimited(ip, now)) return send(res, 429, { error: 'too many attempts' });
        const result = verifyLoginWidget(body, token, { now });
        if (!result.valid) return send(res, 401, { error: 'verification failed', reason: result.reason });
        const exp = Math.floor(now / 1000) + SESSION_TTL_S;
        const session = sign({ tg: result.user.id, user: result.user, iat: Math.floor(now / 1000), exp, via: 'widget' }, secret);
        const record = readProfile(profileDir, result.user.id);
        // Existing accounts repair themselves here: a profile gains its name, NIP-05 and picture
        // the first time it is used after this shipped, because the sealed key lets the server
        // re-sign the kind 0 instead of asking the user to do anything.
        let identity = null;
        if (record && record.sealed && !record.deleted && (!record.nip05 || !record.picture)) {
          try {
            identity = await refreshTelegramProfile({ tgId: result.user.id, record, relays, secret });
          } catch (err) {
            identity = { refreshed: false, reason: String(err.message || err).slice(0, 120) };
          }
        }
        send(res, 200, {
          session,
          user: result.user,
          expiresAt: new Date(exp * 1000).toISOString(),
          profile: record ? { pubkey: record.pubkey, published: Boolean(record.published) } : null,
        });
        return;
      }
      if (url.pathname === '/tg/session' && req.method === 'GET') {
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const auth = req.headers.authorization || '';
        const cookie = /(?:^|;\s*)pinstr_tg=([^;]+)/.exec(req.headers.cookie || '');
        const raw = auth.startsWith('Bearer ') ? auth.slice(7) : cookie ? decodeURIComponent(cookie[1]) : '';
        const session = readSession(raw, secret);
        if (!session) return send(res, 401, { error: 'no valid session' });
        const record = readProfile(profileDir, session.user.id);
        send(res, 200, {
          user: session.user,
          expiresAt: new Date(session.exp * 1000).toISOString(),
          profile: record ? { pubkey: record.pubkey, published: Boolean(record.published), hasKey: Boolean(record.sealed) } : null,
        });
        return;
      }
      if (url.pathname === '/tg/export' && req.method === 'POST') {
        // The one endpoint that returns a secret. Session-only, rate limited, never logged.
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const auth = req.headers.authorization || '';
        const session = readSession(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
        if (!session) return send(res, 401, { error: 'no valid session' });
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        if (rateLimited(`export:${ip}:${session.tg}`, Date.now())) return send(res, 429, { error: 'too many attempts' });
        const record = readProfile(profileDir, session.user.id);
        if (!record || !record.sealed) return send(res, 404, { error: 'no key stored for this account' });
        let nsec;
        try {
          nsec = openSecret(record.sealed, secret);
        } catch (err) {
          return send(res, 500, { error: 'the stored key cannot be opened: ' + String(err.message || err) });
        }
        record.lastExportAt = new Date().toISOString();
        writeProfile(profileDir, session.user.id, record);
        send(res, 200, { nsec, pubkey: record.pubkey, warning: 'Anyone with this key is you. Import it into your own signer, then remove it here.' });
        return;
      }
      if (url.pathname === '/tg/key' && req.method === 'DELETE') {
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const auth = req.headers.authorization || '';
        const session = readSession(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
        if (!session) return send(res, 401, { error: 'no valid session' });
        const body = await readJson(req);
        const record = readProfile(profileDir, session.user.id);
        if (!record) return send(res, 404, { error: 'no key stored for this account' });
        if (body.confirm !== record.pubkey) return send(res, 400, { error: 'confirm must be the pubkey of the key being removed' });
        writeProfile(profileDir, session.user.id, {
          tgId: session.user.id,
          pubkey: record.pubkey,
          deleted: true,
          sealed: null,
          deletedAt: new Date().toISOString(),
        });
        send(res, 200, { deleted: true, pubkey: record.pubkey });
        return;
      }
      if (url.pathname === '/tg/sign' && req.method === 'POST') {
        // Signs one event with the sealed key. The key never leaves this box, and the
        // event always carries the session's pubkey, whatever the caller sent.
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const auth = req.headers.authorization || '';
        const session = readSession(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
        if (!session) return send(res, 401, { error: 'no valid session' });
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        if (rateLimited(`sign:${ip}:${session.tg}`, Date.now())) return send(res, 429, { error: 'too many events' });
        const record = readProfile(profileDir, session.user.id);
        if (!record || !record.sealed) return send(res, 409, { error: 'no key to sign with' });
        const body = await readJson(req, 64 * 1024);
        const draft = body.event || {};
        if (!SIGNABLE_KINDS.has(draft.kind)) return send(res, 400, { error: 'that event kind cannot be signed here' });
        if (typeof draft.content !== 'string' || draft.content.length > MAX_CONTENT) return send(res, 400, { error: 'bad content' });
        if (!Array.isArray(draft.tags) || draft.tags.some((t) => !Array.isArray(t))) return send(res, 400, { error: 'bad tags' });
        let priv;
        try {
          priv = nsecToBytes(openSecret(record.sealed, secret));
        } catch (err) {
          return send(res, 500, { error: 'the stored key cannot be opened' });
        }
        const derived = bytesToHex(schnorr.getPublicKey(priv));
        if (derived !== record.pubkey) return send(res, 500, { error: 'the stored key does not match its pubkey' });
        const event = signEventFor(record.pubkey, priv, draft);
        send(res, 200, { event });
        return;
      }
      if (url.pathname === '/tg/profile' && req.method === 'POST') {
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const auth = req.headers.authorization || '';
        const session = readSession(auth.startsWith('Bearer ') ? auth.slice(7) : '', secret);
        if (!session) return send(res, 401, { error: 'no valid session' });
        const body = await readJson(req);
        const event = body.event;
        const nsec = typeof body.nsec === 'string' ? body.nsec.trim() : '';
        if (!event || !event.pubkey) return send(res, 400, { error: 'event required' });
        const existing = readProfile(profileDir, session.user.id);
        if (existing && !existing.deleted && existing.pubkey !== event.pubkey) {
          // First write wins: a Telegram id keeps the key it was given.
          return send(res, 409, { error: 'a different key is already bound to this account', pubkey: existing.pubkey });
        }
        const content = JSON.parse(event.content || '{}');
        if (content.name !== String(session.user.id)) return send(res, 400, { error: 'profile name must be the telegram id' });
        const checked = checkKind0(event, { pubkey: event.pubkey });
        if (!checked.ok) return send(res, 400, { error: 'profile rejected', reason: checked.reason });
        let published = false;
        let publishReason = '';
        try {
          const outcome = await publish(relays, event);
          published = Boolean(outcome && outcome.ok);
          publishReason = published ? '' : JSON.stringify(outcome && outcome.results ? outcome.results : outcome).slice(0, 200);
        } catch (err) {
          publishReason = String(err.message || err).slice(0, 200);
        }
        const record = {
          tgId: session.user.id,
          pubkey: event.pubkey,
          eventId: event.id,
          sealed: nsec ? sealSecret(nsec, secret) : (existing ? existing.sealed : null),
          published,
          publishReason,
          updatedAt: new Date().toISOString(),
          dir: profileDir,
        };
        writeProfile(profileDir, session.user.id, record);
        send(res, 200, { pubkey: event.pubkey, published, relays: published ? relays : [], reason: publishReason || undefined });
        return;
      }
      send(res, 404, { error: 'not found' });
    } catch (err) {
      send(res, 400, { error: String(err.message || err) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`pinstr-telegram api on 127.0.0.1:${PORT} bot=${Boolean(TOKEN)} secret=${Boolean(SECRET)}`);
  });
}

// Vendored lazily: a missing or broken avatar tree must not stop the service from booting,
// because signing and key custody matter more than a picture.
let avatarStyle = null;
async function renderAvatar(seed) {
  if (!avatarStyle) {
    const [{ Avatar, Style }, { readFileSync }] = await Promise.all([
      import('./vendor/dicebear/lib/index.js'),
      import('node:fs'),
    ]);
    const file = new URL('./vendor/dicebear/shadows.min.json', import.meta.url);
    avatarStyle = { Avatar, Style, definition: JSON.parse(readFileSync(file, 'utf8')) };
  }
  const { Avatar, Style, definition } = avatarStyle;
  return new Avatar(new Style(definition), { seed, size: 128 }).toString();
}
