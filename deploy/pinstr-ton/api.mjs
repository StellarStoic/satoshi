// api.pinstr.si — Telegram session service for the Pinstr door.
// Deploy-only. satoshi.si never loads or hosts any of this.

import http from 'node:http';
import crypto from 'node:crypto';
import { verifyInitData } from './telegramAuth.mjs';

const PORT = Number(process.env.PINSTR_TG_PORT || 8851);
const TOKEN = process.env.PINSTR_TG_BOT_TOKEN || '';
const SECRET = process.env.PINSTR_TG_SESSION_SECRET || '';
const SESSION_TTL_S = Number(process.env.PINSTR_TG_SESSION_TTL || 604800);
const ALLOWED_ORIGINS = (process.env.PINSTR_TG_ORIGINS || 'https://pinstr.si,https://www.pinstr.si').split(',').map((s) => s.trim()).filter(Boolean);
const VERIFY_PER_MIN = Number(process.env.PINSTR_TG_VERIFY_PER_MIN || 12);

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
      if (url.pathname === '/tg/session' && req.method === 'GET') {
        if (!secret) return send(res, 503, { error: 'session secret not configured' });
        const auth = req.headers.authorization || '';
        const cookie = /(?:^|;\s*)pinstr_tg=([^;]+)/.exec(req.headers.cookie || '');
        const raw = auth.startsWith('Bearer ') ? auth.slice(7) : cookie ? decodeURIComponent(cookie[1]) : '';
        const session = readSession(raw, secret);
        if (!session) return send(res, 401, { error: 'no valid session' });
        send(res, 200, { user: session.user, expiresAt: new Date(session.exp * 1000).toISOString() });
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
