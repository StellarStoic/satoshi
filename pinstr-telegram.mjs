// The Telegram door for Pinstr.
//
// Inside a Mini App there is no login step: Telegram hands the page initData, so the
// board can know who opened it without asking anything. If that account has no Nostr
// key yet, one is made here — in the page, with the already-shipped nostr-tools — and
// the kind 0 is signed here too, so the server never needs a schnorr implementation.

// The service lives on pinstr.si, but the board is served from satoshi.si as well, so
// the base is absolute wherever the page is not on pinstr.si itself.
const ON_PINSTR = /(^|\.)pinstr\.si$/i.test(typeof location !== 'undefined' ? location.hostname : '');
const API = ON_PINSTR ? '/tg' : 'https://pinstr.si/tg';
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

// All three ways in should look like the same kind of choice, so the board's own
// anonymous button is the reference: its computed style is copied onto the Telegram
// button and the Nostr summary instead of me inventing a third look.
function copyLoginLook(target, ref, { stretch = false } = {}) {
  if (!target || !ref) return;
  let cs;
  try {
    cs = getComputedStyle(ref);
  } catch {
    return;
  }
  const props = ['background', 'background-color', 'color', 'border', 'border-radius', 'padding', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'box-sizing', 'min-height'];
  for (const prop of props) {
    const value = cs.getPropertyValue(prop);
    if (value) target.style.setProperty(prop, value);
  }
  target.style.display = 'flex';
  target.style.alignItems = 'center';
  target.style.gap = '10px';
  target.style.justifyContent = stretch ? 'space-between' : 'center';
  target.style.cursor = 'pointer';
  target.style.width = '100%';
  target.style.margin = '0 0 10px';
}

function injectLoginStyles() {
  if (typeof document === 'undefined' || document.getElementById('pinstr-tg-styles')) return;
  const style = document.createElement('style');
  style.id = 'pinstr-tg-styles';
  style.textContent = `
    .pinstr-nostr { margin: 0 0 10px; }
    .pinstr-nostr > summary { list-style: none; display: flex; align-items: center; gap: 10px; width: 100%; }
    .pinstr-nostr > summary::-webkit-details-marker { display: none; }
    .pinstr-nostr > summary::after { content: '\\25BE'; margin-left: auto; font-size: .9em; opacity: .7; }
    .pinstr-nostr[open] > summary::after { transform: rotate(180deg); }
    .pinstr-nostr[open] > summary { margin-bottom: 10px; }
  `;
  document.head.appendChild(style);
}

// The key lives sealed on the server, so the only way a Telegram user can take it with
// them is to ask for it. This is that button, and the one that deletes our copy after
// they have imported it somewhere they trust.
// The board publishes through window.nostr, so a Telegram session exposes one: the
// public key it holds, and signEvent forwarded to the server that keeps the key. An
// existing browser extension is never replaced.
const BOARD_SESSION_KEY = 'satoshi:nostr:session:v1';
// The signed session string is what /tg/sign accepts, and it lived only in memory: a reload kept the
// board logged in but left nothing able to sign, which the board reported as "Reconnect your signer".
// It is a bearer token for a key sealed on the server, so it is kept beside the board session and
// dropped when its own exp has passed. The private key itself never comes near this.
const TG_SESSION_KEY = 'pinstr:tg-session:v1';

function rememberTelegramSession(detail) {
  if (!detail || !detail.session || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TG_SESSION_KEY, JSON.stringify({
      session: detail.session,
      user: detail.user || null,
      expiresAt: detail.expiresAt || '',
    }));
  } catch { /* storage blocked: signing works until this page is closed */ }
}

function readTelegramSession() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const stored = JSON.parse(localStorage.getItem(TG_SESSION_KEY) || 'null');
    if (!stored || !stored.session) return null;
    // The token carries its own exp; trust a missing expiresAt but never a future-dated stale one.
    if (stored.expiresAt) {
      const at = Date.parse(stored.expiresAt);
      if (Number.isFinite(at) && at <= Date.now()) return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function adoptBoardSession(pubkey) {
  if (!/^[0-9a-f]{64}$/.test(pubkey || '') || typeof localStorage === 'undefined') return;
  try {
    const existing = JSON.parse(localStorage.getItem(BOARD_SESSION_KEY) || 'null');
    const nip19 = globalThis.NostrTools && globalThis.NostrTools.nip19;
    const session = {
      pubkey,
      method: 'telegram',
      npub: nip19 ? nip19.npubEncode(pubkey) : '',
      profile: existing?.pubkey === pubkey ? existing.profile || null : null,
    };
    localStorage.setItem(BOARD_SESSION_KEY, JSON.stringify(session));
    globalThis.dispatchEvent(new CustomEvent('satoshi-nostr-session', { detail: session }));
  } catch { /* storage blocked: the board will keep asking, but nothing breaks */ }
}

function installSessionSigner(detail) {
  if (!detail || !detail.pubkey || !detail.session) return;
  const unsupported = () => {
    throw new Error('This signer signs notes only. Use your own signer for encrypted messages.');
  };
  // Keep Telegram separate from window.nostr. A real browser extension may already own that
  // object, and treating Telegram as an extension can mismatch the active key and signer.
  globalThis.PinstrTelegramSigner = {
    pubkey: detail.pubkey,
    getPublicKey: async () => detail.pubkey,
    signEvent: async (event) => {
      const draft = {
        kind: event && event.kind,
        created_at: event && event.created_at,
        tags: (event && event.tags) || [],
        content: (event && event.content) || '',
      };
      const res = await post('/sign', { event: draft }, detail.session);
      if (!res.ok) throw new Error((res.data && res.data.error) || `signing failed (${res.status})`);
      return res.data.event;
    },
    getRelays: async () => ({}),
    nip04: { encrypt: unsupported, decrypt: unsupported },
    nip44: { encrypt: unsupported, decrypt: unsupported },
  };
  try {
    // The board composes, prices and mines from session.pubkey, so the signer and session
    // are installed together before the successful login is announced.
    adoptBoardSession(detail.pubkey);
    try { document.dispatchEvent(new CustomEvent('nostr:login', { detail: { pubkey: detail.pubkey } })); } catch {}
  } catch {}
}

function mountKeyTools(detail) {
  if (typeof document === 'undefined' || !detail || !detail.session) return;
  const host = document.querySelector('#accountDialog .account-card');
  if (!host || host.querySelector('.pinstr-key-tools')) return;

  const box = document.createElement('div');
  box.className = 'pinstr-key-tools';
  box.style.cssText = 'margin:18px 0 0;padding-top:14px;border-top:1px solid var(--border);';

  const heading = document.createElement('p');
  heading.textContent = 'Your key';
  heading.style.cssText = 'margin:0 0 6px;font-size:.85rem;color:var(--text);';
  const explain = document.createElement('p');
  explain.textContent = 'This account was created for you, so the key is held here for now. Export it into your own signer to keep it.';
  explain.style.cssText = 'margin:0 0 10px;font-size:.8rem;line-height:1.5;color:var(--text-muted);';

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = 'Export my key';
  exportButton.style.cssText = 'padding:8px 14px;border-radius:20px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:.82rem;cursor:pointer;margin:0 8px 8px 0;';

  const forgetButton = document.createElement('button');
  forgetButton.type = 'button';
  forgetButton.textContent = 'Remove our copy';
  forgetButton.hidden = true;
  forgetButton.style.cssText = 'padding:8px 14px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--text-muted);font:inherit;font-size:.82rem;cursor:pointer;';

  const field = document.createElement('textarea');
  field.readOnly = true;
  field.hidden = true;
  field.spellcheck = false;
  field.style.cssText = 'width:100%;margin:10px 0 8px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--page-bg);color:var(--text);font:inherit;font-size:.8rem;word-break:break-all;';
  const warning = document.createElement('p');
  warning.hidden = true;
  warning.textContent = 'Anyone holding this is you. Import it into Amber or another signer, then remove our copy.';
  warning.style.cssText = 'margin:0 0 8px;font-size:.78rem;line-height:1.5;color:#e05353;';

  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const res = await post('/export', {}, detail.session);
      if (!res.ok) throw new Error(`export ${res.status}`);
      field.value = res.data.nsec;
      field.hidden = false;
      warning.hidden = false;
      forgetButton.hidden = false;
      field.focus();
      field.select();
    } catch (err) {
      setStatus('Could not export the key: ' + String(err.message || err), 'bad');
    } finally {
      exportButton.disabled = false;
    }
  });

  forgetButton.addEventListener('click', async () => {
    if (!detail.pubkey) return;
    const res = await fetch(`${API}/key`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + detail.session },
      body: JSON.stringify({ confirm: detail.pubkey }),
    });
    if (res.ok) {
      field.hidden = true;
      warning.hidden = true;
      forgetButton.hidden = true;
      setStatus('Our copy of the key is deleted. It now exists only where you imported it.', 'ok');
    } else {
      setStatus('Could not remove the stored key.', 'bad');
    }
  });

  box.append(heading, explain, exportButton, forgetButton, field, warning);
  host.appendChild(box);
}

function makeTelegramButton({ wide = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pinstr-tg-btn';
  button.style.cssText = `display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:24px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:.88rem;cursor:pointer;${wide ? 'width:100%;margin:0 0 14px;' : ''}`;
  button.innerHTML = '<i class="lni lni-telegram" aria-hidden="true"></i><span>Sign in with Telegram</span>';
  return button;
}

function wireTelegramButton(button, note) {
  button.addEventListener('click', () => {
    // Checked at click time, not at mount: Telegram's script may not have run yet.
    const inTelegram = Boolean(miniAppInitData());
    button.disabled = true;
    button.style.opacity = '.6';
    setStatus('Waiting for Telegram…');
    const run = inTelegram
      ? bootTelegram()
      : loginWithWidget().then(({ session, user }) => bootTelegram({ session, user }));
    run.catch((err) => setStatus(`Telegram sign-in failed: ${String(err.message || err)}`, 'bad')).finally(() => {
      button.disabled = false;
      button.style.opacity = '1';
    });
  });
  if (note) {
    note.textContent = miniAppInitData()
      ? 'Checking your Telegram session…'
      : 'Opens Telegram to confirm who you are, then creates your key. No password, no seed phrase to write down.';
  }
  // inTelegram moved inside the click handler when detection became click-time; this
  // return kept referring to it and threw at load, killing the mount after the dialog had
  // already been restructured - which is why the button existed in the DOM and never
  // appeared or answered a click.
  return { inTelegram: Boolean(miniAppInitData()), wire: null };
}

// The dialog is titled "Log in to Nostr" and offers four Nostr methods before anything
// else, which reads as if Nostr were the only way in. It becomes: a Sign in title, a
// Telegram button, then Nostr folded away behind a summary, with anonymous last.
function restructureLoginDialog() {
  if (typeof document === 'undefined') return false;
  const dialog = document.querySelector('#loginDialog');
  if (!dialog) return false;

  const title = dialog.querySelector('#loginTitle');
  if (title && title.textContent.trim() !== 'Sign in') title.textContent = 'Sign in';

  // The person button that opens the dialog should say what it does, not name a protocol.
  for (const el of document.querySelectorAll('button, a, [role="button"]')) {
    if (dialog.contains(el)) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (/^sign in( with nostr)?$/i.test(label) || /sign in with nostr/i.test(label)) {
      if (el.textContent && el.textContent.trim()) el.textContent = 'Sign in';
      else el.setAttribute('aria-label', 'Sign in');
    }
  }

  if (dialog.dataset.pinstrTg === '1') return true;
  dialog.dataset.pinstrTg = '1';

  const methods = dialog.querySelector('.login-methods');
  if (methods) {
    const details = document.createElement('details');
    details.className = 'pinstr-nostr';
    const summary = document.createElement('summary');
    summary.textContent = 'Sign in with Nostr';
    summary.style.cssText = 'cursor:pointer;font-size:1.05rem;color:var(--text);margin:0 0 12px;padding:6px 0;';
    details.appendChild(summary);
    methods.parentNode.insertBefore(details, methods);
    for (const node of [
      methods,
      dialog.querySelector('#amberPair'),
      dialog.querySelector('label.login-field'),
      dialog.querySelector('#bunkerReconnect'),
      dialog.querySelector('.private-key-login'),
    ]) {
      if (node) details.appendChild(node);
    }

    injectLoginStyles();
    const reference = dialog.querySelector('.anonymous-login');

    // Clone the board's own button rather than copying its computed style: at mount the
    // anonymous button can be inside a hidden block, and copying a hidden element's
    // resolved styles made the Telegram button invisible.
    // The markup carries the button so it cannot fail to appear: the module only unhides it
    // and wires it. Cloning a reference button remains the fallback for pages without it.
    let button = dialog.querySelector('#pinstrTgSignIn');
    if (button) {
      button.hidden = false;
      button.classList.add('pinstr-tg-btn');
      if (summary && reference) summary.className = (reference.className || '') + ' pinstr-nostr-summary';
    } else if (reference) {
      button = reference.cloneNode(true);
      button.removeAttribute('data-login');
      button.classList.add('pinstr-tg-btn');
      button.innerHTML = '<i class="lni lni-telegram" aria-hidden="true"></i><span>Sign in with Telegram</span>';
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.gap = '10px';
      button.style.width = '100%';
      button.style.margin = '0 0 12px';
      button.style.cursor = 'pointer';
      if (summary) summary.className = (reference.className || '') + ' pinstr-nostr-summary';
    } else {
      button = makeTelegramButton({ wide: true });
    }

    let note = dialog.querySelector('.pinstr-tg-status');
    if (!note) {
      note = document.createElement('p');
      note.className = 'pinstr-tg-status';
    }
    note.hidden = false;
    wireTelegramButton(button, note);
    // Insert without assuming the details element exists: the board may build its method
    // list later, and the previous version threw here, taking the button and the status
    // line with it and failing silently.
    const host = (details && details.parentNode) || dialog.querySelector('.dialog-inner') || dialog;
    if (details && details.parentNode) {
      host.insertBefore(button, details);
      host.insertBefore(note, details);
    } else {
      host.insertBefore(button, host.firstChild);
      host.insertBefore(note, button.nextSibling);
    }
    summary.textContent = 'Sign in with Nostr';
  }
  return true;
}

// The board builds its login block after the module may have loaded, so the Telegram
// option is mounted whenever that block appears rather than once at boot.
function mountTelegramOption() {
  if (typeof document === 'undefined') return false;
  if (restructureLoginDialog()) return true;
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
  note.textContent = inTelegram ? 'Checking your Telegram session…' : 'Opens Telegram to confirm who you are, then creates your key. No password, no seed phrase to write down.';

  button.addEventListener('click', () => {
    button.disabled = true;
    button.style.opacity = '.6';
    setStatus('Waiting for Telegram…');
    const run = inTelegram
      ? bootTelegram()
      : loginWithWidget().then(({ session, user }) => bootTelegram({ session, user }));
    run.catch((err) => setStatus(`Telegram sign-in failed: ${String(err.message || err)}`, 'bad')).finally(() => {
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
  if (!document.querySelector('#loginDialog') || !document.querySelector('.pinstr-tg-btn')) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

// The key tools were mounted only on the login path, so a reload that restored the session from
// storage left the account dialog without its export and delete controls - it looked like a smaller,
// poorer dialog than the one just after signing in. Re-mount from the stored session as well, both
// once the DOM is there and every time the account dialog opens.
function restoreTelegramSession() {
  const stored = readTelegramSession();
  if (!stored) return;
  let boardSession;
  try {
    boardSession = JSON.parse(localStorage.getItem(BOARD_SESSION_KEY) || 'null');
  } catch {
    boardSession = null;
  }
  const pubkey = boardSession && /^[0-9a-f]{64}$/.test(boardSession.pubkey || '') ? boardSession.pubkey : '';
  if (!pubkey) return;
  const detail = { active: true, signedIn: true, pubkey, session: stored.session, user: stored.user || {}, npub: boardSession.npub || '' };
  try {
    installSessionSigner(detail);
  } catch { /* the board will say it needs a signer rather than pretending to have one */ }
  mountKeyTools(detail);
}

function remountKeyToolsFromSession() {
  let session;
  try {
    session = JSON.parse(localStorage.getItem(BOARD_SESSION_KEY) || 'null');
  } catch {
    return;
  }
  if (!session || !session.pubkey) return;
  // adoptBoardSession writes { pubkey, method: 'telegram', npub, profile }; older shapes used
  // signer/source/via, so accept any of them rather than assuming one.
  const hosted = ['method', 'signer', 'source', 'via'].some((key) => session[key] === 'telegram');
  if (!hosted) return;
  mountKeyTools({
    active: true,
    signedIn: true,
    session,
    user: (session.user && typeof session.user === 'object' ? session.user : {}),
    npub: session.npub || '',
  });
}

function armKeyToolsFromStorage() {
  const run = () => {
    restoreTelegramSession();
    remountKeyToolsFromSession();
    const dialog = document.querySelector('#accountDialog');
    if (!dialog || dialog.dataset.pinstrKeyWatch === '1') return;
    dialog.dataset.pinstrKeyWatch = '1';
    new MutationObserver(() => {
      if (dialog.open) remountKeyToolsFromSession();
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  // The board may build the account dialog after this module runs, so look again shortly after and
  // whenever a session appears.
  setTimeout(run, 1500);
  setTimeout(run, 4000);
  document.addEventListener('satoshi-nostr-session', () => setTimeout(run, 200));
}

armKeyToolsFromStorage();

function announce(detail) {
  globalThis.PinstrTelegram = detail;
  try {
    if (detail && detail.active && detail.signedIn) {
      setStatus(`Signed in with Telegram as ${detail.user.id}${detail.created ? ' · key created now' : ''}${detail.npub ? ' · ' + detail.npub : ''}`, 'ok');
      installSessionSigner(detail);
      mountKeyTools(detail);
      rememberTelegramSession(detail);
      const login = document.querySelector('#loginDialog');
      if (login?.open) login.close();
      if (detail.created) {
        const welcome = document.querySelector('#telegramIdentityDialog');
        if (welcome && !welcome.open) requestAnimationFrame(() => welcome.showModal());
      }
    } else if (detail && detail.active) {
      setStatus(`Telegram sign-in failed: ${detail.reason || 'unknown reason'}`, 'bad');
    }
  } catch {}
  try {
    globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  } catch {}
  return detail;
}

const BOT_ID = 8513984991; // @pinstrsibot
const WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';

// Inside a Mini App the launch parameters can be read even before Telegram's own script
// runs: tgWebAppData sits in the URL. Asking the WebView first, then the URL, is what
// makes the detection work no matter how the page was opened.
function miniAppInitData() {
  const wa = globalThis.Telegram && globalThis.Telegram.WebApp;
  if (wa && wa.initData) return wa.initData;
  const loc = globalThis.location;
  for (const part of [loc && loc.hash, loc && loc.search]) {
    if (!part) continue;
    const m = /(?:^|[#&?])tgWebAppData=([^&]+)/.exec(part);
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
  }
  return '';
}

function loadWebAppScript() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (globalThis.Telegram && globalThis.Telegram.WebApp) return Promise.resolve();
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://telegram.org/js/telegram-web-app.js';
    tag.async = true;
    tag.onload = resolve;
    tag.onerror = resolve;
    document.head.appendChild(tag);
  });
}

function loadLoginWidgetScript() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (globalThis.Telegram && globalThis.Telegram.Login) return Promise.resolve();
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = WIDGET_SRC;
    tag.async = true;
    tag.onload = resolve;
    tag.onerror = resolve;
    document.head.appendChild(tag);
  });
}

// Outside Telegram the only way in is the Login Widget: a popup on
// oauth.telegram.org which hands back a signed user object. It has to be opened from
// the click itself, or the browser blocks it.
async function loginWithWidget() {
  await loadLoginWidgetScript();
  const login = globalThis.Telegram && globalThis.Telegram.Login;
  if (!login || typeof login.auth !== 'function') throw new Error('Telegram login widget did not load');
  const user = await new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) reject(new Error('Telegram login was not completed'));
    }, 180000);
    try {
      login.auth({ bot_id: BOT_ID, request_access: 'write' }, (data) => {
        settled = true;
        clearTimeout(timer);
        if (!data || !data.id) reject(new Error('Telegram returned no account'));
        else resolve(data);
      });
    } catch (err) {
      settled = true;
      clearTimeout(timer);
      reject(err);
    }
  });
  const res = await post('/login', user);
  if (!res.ok) throw new Error(`login ${res.status}`);
  return { session: res.data.session, user: res.data.user };
}

export async function bootTelegram(pre = null) {
  const wa = globalThis.Telegram && globalThis.Telegram.WebApp;
  const initData = pre ? '' : miniAppInitData();
  if (!pre && !initData) return announce({ active: false, reason: 'not opened from telegram' });
  if (initData) {
    await loadWebAppScript();
    const app = (globalThis.Telegram && globalThis.Telegram.WebApp) || wa;
    try {
      if (app) {
        app.ready();
        app.expand();
      }
    } catch {}
  }

  let session;
  let user;
  if (pre) {
    session = pre.session;
    user = pre.user;
  } else {
    const verified = await post('/verify', { initData });
    if (!verified.ok) return announce({ active: false, reason: `verify ${verified.status}`, detail: verified.data });
    session = verified.data.session;
    user = verified.data.user;
  }
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
  // Telegram sign-in is pinstr.si only. satoshi.si is the Bitcoin site, and its domain is
  // not registered for the bot, so the popup cannot complete there: stay completely inert.
  if (!ON_PINSTR) {
    // The button ships visible so that a failure anywhere below cannot hide it; this is the
    // one place that takes it away again, and only off pinstr.
    try {
      document.querySelectorAll('.pinstr-tg-signin, #pinstrTgSignIn').forEach((element) => { element.hidden = true; });
    } catch {}
    return announce({ active: false, reason: 'telegram sign-in is only offered on pinstr.si' });
  }
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
    if (!ON_PINSTR) {
      document.querySelectorAll('.pinstr-tg-signin, #pinstrTgSignIn, .pinstr-tg-status')
        .forEach((element) => { element.hidden = true; });
      return;
    }
    watchForLoginBlock();
    // Inside a Mini App the WebView script gives ready(), expand() and themeParams.
    if (miniAppInitData()) loadWebAppScript();
    // The widget script defines Telegram.Login; loading it early is what lets the
    // popup open from the click instead of being blocked.
    if (!miniAppInitData()) loadLoginWidgetScript();
    ensureBooted();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
