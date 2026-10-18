// The Telegram door for Pinstr.
//
// Inside a Mini App there is no login step: Telegram hands the page initData, so the
// board can know who opened it without asking anything. If that account has no Nostr
// key yet, one is made here — in the page, with the already-shipped nostr-tools — and
// the kind 0 is signed here too, so the server never needs a schnorr implementation.

const API = '/tg';
const EVENT = 'pinstr-telegram-ready';

function tools() {
  const t = globalThis.NostrTools;
  if (!t || typeof t.finalizeEvent !== 'function' || !t.nip19) throw new Error('nostr-tools bundle not loaded');
  return t;
}

async function post(path, body, session) {
  const headers = { 'content-type': 'application/json' };
  if (session) headers.authorization = `Bearer ${session}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, data };
}

async function getJson(path, session) {
  const res = await fetch(`${API}${path}`, { headers: session ? { authorization: `Bearer ${session}` } : {} });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, data };
}

function announce(detail) {
  globalThis.PinstrTelegram = detail;
  try {
    globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  } catch {}
  return detail;
}

export async function bootTelegram() {
  const wa = globalThis.Telegram && globalThis.Telegram.WebApp;
  if (!wa || !wa.initData) return announce({ active: false, reason: 'not opened from telegram' });
  try {
    wa.ready();
    wa.expand();
  } catch {}

  const verified = await post('/verify', { initData: wa.initData });
  if (!verified.ok) return announce({ active: false, reason: `verify ${verified.status}`, detail: verified.data });

  const session = verified.data.session;
  const user = verified.data.user;
  const resumed = await getJson('/session', session);
  if (!resumed.ok) return announce({ active: true, signedIn: false, reason: `session ${resumed.status}`, user, session });

  let pubkey = resumed.data.profile && resumed.data.profile.pubkey;
  let created = false;
  let secret = null;

  if (!pubkey) {
    try {
      const nostr = tools();
      secret = nostr.generateSecretKey();
      pubkey = nostr.getPublicKey(secret);
      const event = nostr.finalizeEvent(
        { kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ name: String(user.id) }) },
        secret,
      );
      const saved = await post('/profile', { event, nsec: nostr.nip19.nsecEncode(secret) }, session);
      if (!saved.ok) {
        return announce({ active: true, signedIn: false, reason: `profile ${saved.status}`, detail: saved.data, user, session, pubkey });
      }
      pubkey = saved.data.pubkey || pubkey;
      created = true;
      announce({ active: true, signedIn: true, created, user, session, pubkey, npub: nostr.nip19.npubEncode(pubkey), published: Boolean(saved.data.published) });
      return globalThis.PinstrTelegram;
    } catch (err) {
      return announce({ active: true, signedIn: false, reason: String(err.message || err), user, session });
    }
  }

  const npub = globalThis.NostrTools && globalThis.NostrTools.nip19 ? globalThis.NostrTools.nip19.npubEncode(pubkey) : null;
  return announce({ active: true, signedIn: true, created, user, session, pubkey, npub });
}

// Load the vendored bundle if the page did not already, then boot. The bundle is a
// classic script that defines a global, so it is injected rather than imported.
export async function ensureBooted() {
  if (globalThis.Telegram && globalThis.Telegram.WebApp && globalThis.Telegram.WebApp.initData) {
    if (!globalThis.NostrTools) {
      await new Promise((resolve) => {
        const tag = document.createElement('script');
        tag.src = '/stego/vendor/nostr-tools.bundle.js';
        tag.onload = resolve;
        tag.onerror = resolve;
        document.head.appendChild(tag);
      });
    }
    return bootTelegram();
  }
  return announce({ active: false, reason: 'not opened from telegram' });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { ensureBooted(); });
  else ensureBooted();
}
