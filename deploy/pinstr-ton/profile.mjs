// Telegram-created Nostr profiles for the Pinstr door.
//
// The key is generated in the Mini App, where nostr-tools is already shipped, and the
// kind 0 is signed there too. This module stores the secret encrypted, checks that a
// submitted profile actually belongs to the key it claims, and publishes it.

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function keyFrom(secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('session secret too short');
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function sealSecret(nsec, sessionSecret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyFrom(sessionSecret), iv);
  const body = Buffer.concat([cipher.update(nsec, 'utf8'), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    body: body.toString('base64'),
  };
}

export function openSecret(sealed, sessionSecret) {
  if (!sealed || sealed.v !== 1) throw new Error('unknown sealed secret');
  const decipher = crypto.createDecipheriv(ALGO, keyFrom(sessionSecret), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.body, 'base64')), decipher.final()]).toString('utf8');
}

// The profile the board shows: the Telegram id and nothing else. No real name, no
// Telegram username, no avatar — the id is what the user is known by, and nothing
// here leaks who they are off Telegram.
export function profileContent({ tgId }) {
  if (!tgId) throw new Error('tgId required');
  return JSON.stringify({ name: String(tgId) });
}

// A kind 0 is only accepted if its id really is the hash of its own fields and its
// pubkey is the one bound to the session. Without a schnorr implementation on the
// server the signature itself is not verified, so publishing is first-write-wins per
// Telegram id: the worst a forged payload can do is name a key nobody holds.
export function checkKind0(event, { pubkey, now = Date.now() }) {
  if (!event || typeof event !== 'object') return { ok: false, reason: 'no event' };
  if (event.kind !== 0) return { ok: false, reason: 'not a kind 0' };
  if (event.pubkey !== pubkey) return { ok: false, reason: 'pubkey does not match the session key' };
  if (typeof event.content !== 'string' || event.content.length > 1000) return { ok: false, reason: 'bad content' };
  if (typeof event.sig !== 'string' || !/^[0-9a-f]{128}$/.test(event.sig)) return { ok: false, reason: 'bad signature shape' };
  if (typeof event.created_at !== 'number' || Math.abs(now / 1000 - event.created_at) > 3600) return { ok: false, reason: 'created_at is not now' };
  const serialised = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags || [], event.content]);
  const id = crypto.createHash('sha256').update(serialised, 'utf8').digest('hex');
  if (id !== event.id) return { ok: false, reason: 'id does not match the event' };
  if (!Array.isArray(event.tags)) return { ok: false, reason: 'tags must be an array' };
  return { ok: true };
}

export async function publishEvent(url, event, { timeoutMs = 8000, WebSocketImpl = globalThis.WebSocket } = {}) {
  if (typeof WebSocketImpl !== 'function') return { ok: false, reason: 'no websocket in this runtime' };
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, reason: 'timeout' }), timeoutMs);
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch (err) {
      return done({ ok: false, reason: String(err.message || err) });
    }
    ws.onopen = () => ws.send(JSON.stringify(['EVENT', event]));
    ws.onmessage = (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (data[0] === 'OK' && data[1] === event.id) done({ ok: data[2] === true, reason: data[3] || '', url });
      if (data[0] === 'NOTICE') done({ ok: false, reason: String(data[1] || 'notice'), url });
    };
    ws.onerror = () => done({ ok: false, reason: 'socket error', url });
    ws.onclose = () => done({ ok: false, reason: 'closed before confirmation', url });
  });
}

export async function publishToAll(urls, event, options = {}) {
  const results = await Promise.all((urls || []).map((url) => publishEvent(url, event, options)));
  return { ok: results.some((r) => r.ok), results };
}
