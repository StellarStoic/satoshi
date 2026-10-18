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

function setStatus(text, tone) {
  const line = document.querySelector('.pinstr-tg-status');
  if (!line) return;
  line.textContent = text;
  line.style.color = tone === 'ok' ? 'var(--accent)' : tone === 'bad' ? '#e05353' : 'var(--text-muted)';
}

// The board builds its login block after the module may have loaded, so the Telegram
// option is mounted whenever that block appears rather than once at boot.
function mountTelegramOption() {
  if (typeof document === 'undefined') return false;
  const block = document.querySelector('.anonymous-login-block');
  if (!block || block.querySelector('.pinstr-tg-row')) return Boolean(block);

  const row = document.createElement('div');
  row.className = 'pinstr-tg-row';
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px;';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pinstr-tg-btn';
  button.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:24px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:.86rem;cursor:pointer;';
  button.innerHTML = '<i class="lni lni-telegram" aria-hidden="true"></i><span>Sign in with Telegram</span>';

  const note = document.createElement('p');
  note.className = 'pinstr-tg-status';
  note.style.cssText = 'margin:0;font-size:.8rem;line-height:1.5;color:var(--text-muted);flex:1 1 100%;';

  const inTelegram = Boolean(globalThis.Telegram && globalThis.Telegram.WebApp && globalThis.Telegram.WebApp.initData);
  note.textContent = inTelegram ? 'Checking your Telegram session…' : 'Inside Telegram this signs you in with one tap, with no key to save.';

  button.addEventListener('click', () => {
    if (!inTelegram) {
      setStatus('Open @pinstrsibot in Telegram and choose Open Pinstr.', 'bad');
      return;
    }
    button.disabled = true;
    button.style.opacity = '.6';
    bootTelegram().finally(() => {
      button.disabled = false;
      button.style.opacity = '1';
    });
  });

  row.append(button, note);
  block.appendChild(row);
  return true;
}

function watchForLoginBlock() {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return;
  const tryMount = () => {
    if (mountTelegramOption()) observer.disconnect();
  };
  const observer = new MutationObserver(tryMount);
  tryMount();
  if (!document.querySelector('.pinstr-tg-row')) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function announce(detail) {
  globalThis.PinstrTelegram = detail;
  try {
    if (detail && detail.active && detail.signedIn) {
      setStatus(`Signed in with Telegram as ${detail.user.id}${detail.created ? ' · key created now' : ''}${detail.npub ? ' · ' + detail.npub : ''}`, 'ok');
    } else if (detail && detail.active) {
      setStatus(`Telegram sign-in failed: ${detail.reason || 'unknown reason'}`, 'bad');
    }
  } catch {}
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
  const start = () => {
    watchForLoginBlock();
    ensureBooted();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
