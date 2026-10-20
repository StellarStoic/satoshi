// The currency door for pinstr.si: every reader is asked whether they want to pay in Bitcoin or TON,
// and the answer decides which rail the payment dialog shows. Bitcoin keeps the board's own dialog
// untouched; choosing TON replaces it with the TON panel reading the desk's /orders/{id}/ton route.
//
// Host-gated like pinstr-telegram.mjs: satoshi.si is the Bitcoin site and must never offer TON, so
// this returns before touching anything there.

const ON_PINSTR = /(^|\.)pinstr\.si$/i.test(location.hostname);
const KEY = 'pinstr:currency:v1';
const PENDING_KEY = 'satoshi:sticky:pending:v1';
const POLL_MS = 4000;

// Mutable module state, declared before the boot call below: start() runs at import time, so
// anything it assigns to must already be initialised or the module dies in the temporal dead zone.
let chooser = null;
let tonDialog = null;
let tonOrderId = '';
// An order is shown once. The board closes dialogs as it works, and re-opening on every appearance
// turned a closed panel into a loop of empty ones.
let tonShownFor = '';
let tonDismissedFor = '';
let tonPoll = null;
// Guards applyComposerCopy against re-entering itself through its own DOM writes.
let applyingCopy = false;
// Set while the QR library is loading, so two panels cannot fetch it twice.
let qrLoading = null;
// Interval that re-asserts composer copy while TON is chosen.
let copyTicker = null;

if (ON_PINSTR && typeof document !== 'undefined') {
  // Loaded loudly on purpose: when a modal does not appear, the first question is whether the
  // module ran at all, and a console line answers that without a debugger.
  try {
    start();
  } catch (err) {
    console.error('[pinstr-currency] failed to start', err);
  }
} else {
  console.info('[pinstr-currency] not pinstr.si, staying out of the way');
}

function start() {
  injectStyles();
  mountChooser();
  mountTonPanel();
  // Ask on arrival if nothing is chosen, and again on every sign-in: the choice is remembered but
  // re-confirmed, because a reader who came for a quick pin may not remember what they picked.
  console.info('[pinstr-currency] loaded', { choice: readChoice() || 'none yet' });
  // Nothing is asked on arrival, on sign-in, or on a stray tap. Payment belongs where a note is
  // being written, so the choice lives inside the composer and nowhere else.
  mountComposerCurrency();
  installOrderRail();
  watchPendingOrders();
  ensureQrLibrary();
  installPayHook();
  document.addEventListener('pinstr-currency-changed', () => {
    applyCurrency();
    applyComposerCurrency();
    applyComposerCopy();
  });
  applyCurrency();
  watchComposer();
  setTimeout(() => { watchComposer(); applyComposerCopy(); }, 1200);
  setTimeout(() => { watchComposer(); applyComposerCopy(); }, 3000);
}

function readChoice() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'ton' || value === 'bitcoin' ? value : '';
  } catch {
    return '';
  }
}

function saveChoice(value) {
  try { localStorage.setItem(KEY, value); } catch {}
  document.dispatchEvent(new CustomEvent('pinstr-currency-changed', { detail: { currency: value } }));
}

function applyCurrency() {
  const choice = readChoice();
  document.documentElement.dataset.pinstrCurrency = choice || 'bitcoin';
}

// ---------------------------------------------------------------- the chooser


function mountChooser() {
  chooser = document.createElement('dialog');
  chooser.className = 'pinstr-currency-dialog';
  chooser.innerHTML = `
    <div class="pcd-inner">
      <h2>How would you like to pay?</h2>
      <p class="pcd-lede">This board takes sats or TON. You can change it any time from the payment window.</p>
      <button type="button" class="pcd-option" data-currency="bitcoin">
        <span class="pcd-title"><i class="lni lni-bitcoin" aria-hidden="true"></i>Bitcoin · sats</span>
        <span class="pcd-note">Choose Bitcoin and save big.</span>
      </button>
      <button type="button" class="pcd-option" data-currency="ton">
        <span class="pcd-title">TON</span>
        <span class="pcd-note">0.5 TON a pin · 1 a week · 3 a year, plus the network fee.</span>
      </button>
      <button type="button" class="pcd-skip" data-close>Not now</button>
    </div>`;
  chooser.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-currency]');
    if (pick) {
      const value = pick.getAttribute('data-currency');
      saveChoice(value);
      chooser.close();
      setStatus(value === 'ton'
        ? 'Paying in TON. The payment window will show the TON address and amount.'
        : 'Paying in sats. The payment window is unchanged.');
      return;
    }
    if (event.target.closest('[data-close]')) chooser.close();
  });
  document.body.appendChild(chooser);
}

function openChooser({ firstTime = false } = {}) {
  if (!chooser) return;
  if (chooser.open) return;
  if (!firstTime && !readChoice()) return;
  // Do not talk over the payment window: a reader who is already paying has decided.
  const payment = document.getElementById('paymentDialog');
  if (payment && payment.open) return;
  chooser.showModal();
}

function setStatus(text) {
  const box = document.getElementById('loginStatus');
  if (!box) return;
  box.textContent = text;
  box.className = 'inline-status is-ok';
}



// The composer is the only place the rail is chosen. Until a reader picks one the pay and mining
// buttons stay out of sight, so the composer reads as writing first and paying second.

// Choosing a plan makes the board rewrite the pay button after our write lands, so a single re-apply on
// mutation is a race we lose. While the composer is open in TON mode the copy is re-asserted on a short
// ticker; every write is conditional, so it settles instead of looping.
function keepComposerCopyInTon() {
  const composer = document.getElementById('composerDialog');
  const shouldRun = readChoice() === 'ton' && composer && composer.open;
  if (shouldRun && !copyTicker) {
    copyTicker = setInterval(() => {
      const still = document.getElementById('composerDialog');
      if (readChoice() !== 'ton' || !still || !still.open) {
        clearInterval(copyTicker);
        copyTicker = null;
        return;
      }
      applyComposerCopySafely();
    }, 400);
  } else if (!shouldRun && copyTicker) {
    clearInterval(copyTicker);
    copyTicker = null;
  }
}

function mountComposerCurrency() {
  const composer = document.getElementById('composerDialog');
  if (!composer || composer.querySelector('.pinstr-composer-currency')) return;
  const plans = composer.querySelector('.plan-button');
  const host = plans ? plans.parentNode : composer.querySelector('.dialog-inner');
  if (!host) return;

  const box = document.createElement('div');
  box.className = 'pinstr-composer-currency';
  box.innerHTML = `
    <span class="pcc-label">Pay with</span>
    <button type="button" class="pcc-option" data-pcc="bitcoin">Bitcoin · sats <small>save big</small></button>
    <button type="button" class="pcc-option" data-pcc="ton">TON</button>`;
  host.parentNode.insertBefore(box, host);

  box.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-pcc]');
    if (!pick) return;
    saveChoice(pick.getAttribute('data-pcc'));
    applyComposerCurrency();
    applyComposerCopy();
    keepComposerCopyInTon();
  });
  applyComposerCurrency();
  keepComposerCopyInTon();
}

function applyComposerCurrency() {
  const composer = document.getElementById('composerDialog');
  if (!composer) return;
  const choice = readChoice();
  for (const button of composer.querySelectorAll('.pcc-option')) {
    const on = button.getAttribute('data-pcc') === choice;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  // Pay and mine appear only after a choice: asking a writer to price a note they have not chosen a
  // rail for is the same intrusion as asking on arrival.
  for (const id of ['payForSticky', 'mineForSticky']) {
    const node = document.getElementById(id);
    if (!node) continue;
    const hiddenByBoard = node.dataset.pinstrOwnHidden === '1' || (id === 'mineForSticky' && node.dataset.pinstrPowHidden === '1');
    node.hidden = hiddenByBoard || !choice;
  }
}

// The composer prices a note before any order exists: Week 10 sats, Year 411 sats, "Subscribe & pin",
// "Free with POW", and a paragraph about discounts. All of that is the Bitcoin rail, so in TON mode
// it is replaced with the TON ladder. Originals are kept and restored when the reader switches back,
// rather than being rebuilt from assumptions about the board's markup.
const TON_PLAN_COPY = { week: '1 TON', year: '3 TON' };

function applyComposerCopy() {
  const composer = document.getElementById('composerDialog');
  if (!composer) return;
  const on = readChoice() === 'ton';

  for (const button of composer.querySelectorAll('.plan-button[data-plan]')) {
    const plan = button.getAttribute('data-plan');
    if (on) {
      const wanted = `Pay ${TON_PLAN_COPY[plan] || ''} · ${plan}`;
      if (button.innerHTML.trim() === wanted) continue;
      if (!button.dataset.pinstrOriginal) button.dataset.pinstrOriginal = button.innerHTML;
      button.innerHTML = wanted;
    } else if (button.dataset.pinstrOriginal) {
      button.innerHTML = button.dataset.pinstrOriginal;
      delete button.dataset.pinstrOriginal;
    }
  }

  const pay = document.getElementById('payForSticky');
  if (pay) {
    const label = pay.querySelector('span') || pay;
    if (on) {
      if (!label.dataset.pinstrOriginal) label.dataset.pinstrOriginal = label.textContent;
      if (label.textContent !== 'Pay') label.textContent = 'Pay';
    } else if (label.dataset.pinstrOriginal !== undefined) {
      label.textContent = label.dataset.pinstrOriginal;
      delete label.dataset.pinstrOriginal;
    }
  }

  // Mining for work is free on either rail, so it stays reachable; only the sats wording goes.
  const mine = document.getElementById('mineForSticky');
  if (mine && on && mine.dataset.pinstrOriginalHidden === undefined) {
    mine.dataset.pinstrOriginalHidden = mine.hidden ? '1' : '0';
  } else if (mine && !on && mine.dataset.pinstrOriginalHidden !== undefined) {
    mine.hidden = mine.dataset.pinstrOriginalHidden === '1';
    delete mine.dataset.pinstrOriginalHidden;
  }

  // The sats paragraph has a <strong> inside it, so a childless-node test skipped it and the
  // discount copy stayed under a TON choice. Rewrite by walking text nodes instead.
  // The status line under the plan buttons counts in sats as well, and is rewritten by the board on
  // every plan change.
  const state = document.getElementById('subscriptionState');
  if (state) {
    const text = (state.textContent || '').trim();
    if (on && / sats?/.test(text)) {
      if (!state.dataset.pinstrOriginal) state.dataset.pinstrOriginal = state.innerHTML;
      const tonText = text
        .replace(/10 sats? a week/gi, '1 TON a week')
        .replace(/411 sats? a year/gi, '3 TON a year')
        .replace(/10 sats?/gi, '1 TON')
        .replace(/411 sats?/gi, '3 TON');
    } else if (!on && state.dataset.pinstrOriginal !== undefined) {
      state.innerHTML = state.dataset.pinstrOriginal;
      delete state.dataset.pinstrOriginal;
    }
  }

  for (const node of composer.querySelectorAll('p, div, span')) {
    const text = (node.textContent || '').trim();
    if (on && /^Posting needs a subscription/.test(text)) {
      if (!node.dataset.pinstrOriginal) node.dataset.pinstrOriginal = node.innerHTML;
      const wanted = 'Posting in TON: 1 TON a week or 3 TON a year, plus the 0.01 TON network fee.';
      if (node.textContent !== wanted) node.textContent = wanted;
    } else if (!on && node.dataset.pinstrOriginal !== undefined) {
      node.innerHTML = node.dataset.pinstrOriginal;
      delete node.dataset.pinstrOriginal;
    }
  }
}

// The board re-prices the composer whenever a plan is chosen and rewrites the pay button's label each
// time, which is why the sats wording came back the moment week or year was pressed. Copy is therefore
// re-applied after any content change inside the composer, guarded so its own writes cannot loop.
function applyComposerCopySafely() {
  if (applyingCopy) return;
  applyingCopy = true;
  try {
    applyComposerCopy();
  } finally {
    applyingCopy = false;
  }
}

function watchComposer() {
  const composer = document.getElementById('composerDialog');
  if (!composer || composer.dataset.pinstrCopyWatch === '1') return;
  composer.dataset.pinstrCopyWatch = '1';
  let queued = false;
  new MutationObserver(() => {
    if (!composer.open) return;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyComposerCopySafely();
    });
  }).observe(composer, { attributes: true, attributeFilter: ['open'], childList: true, subtree: true, characterData: true });
  if (composer.open) applyComposerCopySafely();
}




// A TON order has no invoice by design, so the board's own copy - "Invoice expired - tap Pay to make a
// new one" - is wrong and alarming. In TON mode that sentence is replaced with what is actually true.
const EXPIRED_COPY = /invoice expired|tap pay to make a new one|no longer open/i;
const TON_TRUTH = 'Waiting for your TON transfer — the panel has the amount and the comment.';

function softenExpiredCopy() {
  if (readChoice() !== 'ton') return;
  const roots = ['composerDialog', 'paymentDialog']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const status = document.getElementById('loginStatus');
  if (status) roots.push(status);
  for (const root of roots) {
    for (const node of root.querySelectorAll('p, span, div, small, output')) {
      if (node.children.length) continue;
      const text = (node.textContent || '').trim();
      if (!EXPIRED_COPY.test(text)) continue;
      if (!node.dataset.pinstrOriginal) node.dataset.pinstrOriginal = node.textContent;
      node.textContent = TON_TRUTH;
    }
  }
}


// The board talks to an absolute API - meta[name="pinstr-api"] or pay.satoshi.si - and appends paths
// that already contain /pinstr/v1. Using a relative path here resolved against pinstr.si, hit the static
// mirror, returned HTML, and the JSON parse failed, which the panel reported as "Could not reach the
// desk". Same base, same paths.
function deskBase() {
  const meta = document.querySelector('meta[name="pinstr-api"]');
  if (meta && meta.content) return meta.content.replace(/\/+$/, '');
  return 'https://pay.satoshi.si';
}

async function deskJson(path) {
  const response = await fetch(deskBase() + path, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = new Error((body && body.error) || `Desk answered ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  if (!body) throw new Error('Desk answered with something that is not JSON');
  return body;
}

// Any path can create the order - the Pay button, a plan button, a resubscribe after expiry - and the
// board polls it itself, sees no invoice because a TON order has none, and reports "Invoice expired".
// So the panel is opened by watching for a new pending order id rather than by one specific button.
function watchPendingOrders() {
  let lastSeen = currentOrderId();
  setInterval(() => {
    if (readChoice() !== 'ton') return;
    const id = currentOrderId();
    if (!id || id === lastSeen) return;
    lastSeen = id;
    softenExpiredCopy();
    if (id === tonDismissedFor) return;
    openTonPanel();
  }, 1200);
}

// The board decides the order body, so the rail has to be added on the way out. Without it the desk
// creates an ordinary order and the worker attaches a Bark invoice to a reader who chose TON - a
// bolt11 and an ark address for a payment they never intended to make.
function installOrderRail() {
  if (!ON_PINSTR || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.pinstrOrderRail) return;
  const native = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      if (method === 'POST' && /\/pinstr\/v1\/orders\/?$/.test(url.split('?')[0]) && readChoice() === 'ton') {
        const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
        if (body && typeof body === 'object' && !body.rail) {
          body.rail = 'TON';
          init = { ...(init || {}), body: JSON.stringify(body) };
        }
      }
    } catch { /* a body we cannot parse is the board's business, not ours */ }
    return native(input, init);
  };
  window.pinstrOrderRail = true;
}

// With no invoice there is no payment dialog for the TON panel to replace, so the panel opens from the
// press of Pay itself: wait for the board to create the order, then show the TON amount.
function installPayHook() {
  document.addEventListener('click', (event) => {
    const pay = event.target.closest('#payForSticky');
    if (!pay || readChoice() !== 'ton') return;
    const before = currentOrderId();
    const startedAt = Date.now();
    const waitForOrder = () => {
      if (readChoice() !== 'ton') return;
      const id = currentOrderId();
      if (id && id !== before) {
        openTonPanel();
        return;
      }
      if (Date.now() - startedAt < 15000) setTimeout(waitForOrder, 400);
    };
    setTimeout(waitForOrder, 500);
  }, true);
}

// ---------------------------------------------------------------- the TON panel


function mountTonPanel() {
  const existing = document.querySelector('.pinstr-ton-dialog');
  if (existing) {
    tonDialog = existing;
    return;
  }
  tonDialog = document.createElement('dialog');
  tonDialog.className = 'pinstr-ton-dialog';
  tonDialog.innerHTML = `
    <div class="ptd-inner">
      <button type="button" class="ptd-close" data-ton-close aria-label="Close"><i class="lni lni-xmark" aria-hidden="true"></i></button>
      <h2>Pay in TON</h2>
      <p class="ptd-amount" data-ton-amount>—</p>
      <p class="ptd-split" data-ton-split></p>
      <div class="ptd-qr" data-ton-qr></div>
      <label class="ptd-field"><span>Amount</span><input data-ton-nano readonly></label>
      <label class="ptd-field"><span>Send to</span><input data-ton-address readonly><button type="button" data-copy="address">Copy</button></label>
      <label class="ptd-field"><span>Comment — this is how your payment is found</span><input data-ton-comment readonly><button type="button" data-copy="comment">Copy</button></label>
      <a class="ptd-wallet" data-ton-wallet href="#" target="_blank" rel="noopener">Open in a TON wallet</a>
      <p class="ptd-state" data-ton-state>Waiting for the transfer…</p>
      <p class="ptd-hint">Sats are cheaper: a pin is 69 sats on the Bitcoin rail. <button type="button" class="ptd-switch" data-ton-switch>Switch to Bitcoin</button></p>
    </div>`;
  tonDialog.addEventListener('click', async (event) => {
    if (event.target.closest('[data-ton-close]')) {
      stopTonPoll();
      tonDismissedFor = tonOrderId;
      tonDialog.close();
      return;
    }
    if (event.target.closest('[data-ton-switch]')) {
      saveChoice('bitcoin');
      stopTonPoll();
      tonDialog.close();
      setStatus('Switched to sats. Tap pay again and the Bitcoin invoice will appear.');
      return;
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const field = tonDialog.querySelector(copy.getAttribute('data-copy') === 'address' ? '[data-ton-address]' : '[data-ton-comment]');
      try {
        await navigator.clipboard.writeText(field.value);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
      } catch {
        field.select();
      }
    }
  });
  document.body.appendChild(tonDialog);

  // The board opens its own payment dialog when an order's rails arrive. In TON mode that dialog is
  // the wrong rail, so it is closed and this one takes its place. Bitcoin mode never comes near it.
  const watch = () => {
    const payment = document.getElementById('paymentDialog');
    if (!payment || payment.dataset.pinstrTonWatch === '1') return;
    payment.dataset.pinstrTonWatch = '1';
    new MutationObserver(() => {
      if (readChoice() !== 'ton') return;
      if (!payment.open) return;
      // The board's own poll re-opens its invoice dialog every few seconds. In TON mode that dialog
      // offers sats, which is the wrong rail, so close it every time it appears and keep the TON
      // panel in its place. Without this the sats buttons come back and the reader is asked to
      // subscribe in a currency they did not choose.
      if (tonDialog.open) {
        payment.close();
        return;
      }
      setTimeout(() => openTonPanel(), 60);
    }).observe(payment, { attributes: true, attributeFilter: ['open'] });
  };
  watch();
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
}

function currentOrderId() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (!pending) return '';
    return pending.subscribeOrderId || pending.orderId || '';
  } catch {
    return '';
  }
}

async function openTonPanel() {
  const orderId = currentOrderId();
  if (!orderId) return;
  // The board reopens its own invoice dialog while it waits for rails, and each appearance used to
  // drag this panel up again with fresh numbers - which is why it kept popping with the QR flashing.
  if (orderId === tonDismissedFor) return;
  if (orderId === tonShownFor) {
    // Already presented for this order: keep the board's dialog out of the way without re-rendering.
    const paymentDialog = document.getElementById('paymentDialog');
    if (paymentDialog && paymentDialog.open) paymentDialog.close();
    return;
  }
  tonShownFor = orderId;
  setTimeout(softenExpiredCopy, 300);
  setTimeout(softenExpiredCopy, 1500);
  if (tonDialog.open && orderId === tonOrderId) {
    const paymentDialog = document.getElementById('paymentDialog');
    if (paymentDialog && paymentDialog.open) paymentDialog.close();
    return;
  }
  tonOrderId = orderId;
  const payment = document.getElementById('paymentDialog');
  if (payment && payment.open) payment.close();
  tonDialog.querySelector('[data-ton-state]').textContent = 'Preparing the TON amount…';
  if (!tonDialog.open) tonDialog.showModal();
  let quote;
  try {
    quote = await deskJson(`/pinstr/v1/orders/${encodeURIComponent(orderId)}/ton`);
  } catch (err) {
    console.warn('[pinstr-currency] TON quote failed', err && err.status, err && err.message);
    tonDialog.querySelector('[data-ton-state]').textContent =
      `Could not get a TON amount (${(err && (err.status || err.message)) || 'no answer'}). Try again, or switch to Bitcoin.`;
    return;
  }
  if (!quote || !quote.ok) {
    tonDialog.querySelector('[data-ton-state]').textContent = (quote && quote.error) || 'This order has no TON price.';
    return;
  }
  tonDialog.querySelector('[data-ton-amount]').textContent = `${quote.ton} TON`;
  tonDialog.querySelector('[data-ton-split]').textContent = `${quote.priceTon} TON for the ${quote.action === 'anonymous' ? 'pin' : quote.action + ' subscription'} + ${quote.feeTon} TON network fee`;
  tonDialog.querySelector('[data-ton-nano]').value = quote.nano;
  tonDialog.querySelector('[data-ton-address]').value = quote.address;
  tonDialog.querySelector('[data-ton-comment]').value = quote.comment;
  tonDialog.querySelector('[data-ton-wallet]').href = quote.payUrl;
  drawQr(quote.payUrl);
  tonDialog.querySelector('[data-ton-state]').textContent = 'Waiting for the transfer…';
  tonDialog.classList.remove('is-paid');
  startTonPoll(orderId);
}

const QR_MODULE = '/pinstr-qr.mjs';

function ensureQrLibrary() {
  // The board's classic script may or may not have executed, so the panel imports its own copy and does
  // not depend on a global that might not exist yet. Rolling hashes are cheap; a missing QR is not.
  if (!qrLoading) {
    qrLoading = import(QR_MODULE)
      .then((mod) => (typeof mod.default === 'function' ? mod.default : null))
      .catch((err) => {
        console.warn('[pinstr-currency] QR module failed to load', err);
        return null;
      });
  }
  return qrLoading;
}

async function drawQr(text) {
  const host = tonDialog.querySelector('[data-ton-qr]');
  if (!host) return;
  // Clearing first is what showed an empty box over the real QR: the clear happened, the draw waited.
  // The new code is built off-document and swapped in when it is actually ready.
  const frame = document.createElement('div');
  frame.style.cssText = 'display:grid;place-items:center;width:100%';
  const make = await ensureQrLibrary();
  if (typeof make !== 'function') {
    console.warn('[pinstr-currency] QR library unavailable, showing the link instead');
    const link = document.createElement('code');
    link.style.cssText = 'font-size:.68rem;word-break:break-all;color:#111;background:none;';
    link.textContent = text;
    frame.appendChild(link);
    host.replaceChildren(frame);
    return;
  }
  try {
    const qr = make(0, 'M');
    qr.addData(text);
    qr.make();
    frame.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
    const svg = frame.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('style', 'width:100%;height:auto;display:block');
    }
    host.replaceChildren(frame);
    console.info('[pinstr-currency] qr drawn', { bytes: frame.innerHTML.length });
  } catch (err) {
    console.warn('[pinstr-currency] qr failed', err);
    frame.textContent = 'QR could not be drawn — use the wallet link below.';
    host.replaceChildren(frame);
  }
}

function startTonPoll(orderId) {
  stopTonPoll();
  tonPoll = setInterval(async () => {
    if (!tonDialog.open) { stopTonPoll(); return; }
    try {
      const order = await deskJson(`/pinstr/v1/orders/${encodeURIComponent(orderId)}`);
      if (!order) return;
      if (order.paid || order.status === 'paid' || order.status === 'published') {
        stopTonPoll();
        tonDialog.classList.add('is-paid');
        tonDialog.querySelector('[data-ton-state]').textContent = 'Payment received. Close this and finish your note — your publish token is ready.';
      } else if (order.status === 'cancelled' || order.status === 'expired') {
        stopTonPoll();
        tonDialog.querySelector('[data-ton-state]').textContent = 'This order is no longer open. Tap pay again to make a new one.';
      }
    } catch {}
  }, POLL_MS);
}

function stopTonPoll() {
  if (tonPoll) clearInterval(tonPoll);
  tonPoll = null;
}

// ---------------------------------------------------------------- styles

function injectStyles() {
  if (document.getElementById('pinstrCurrencyStyles')) return;
  const style = document.createElement('style');
  style.id = 'pinstrCurrencyStyles';
  style.textContent = `
.pinstr-currency-dialog, .pinstr-ton-dialog { border: 1px solid rgba(255,255,255,.16); border-radius: 12px; background: #121313; color: #f4f4f1; padding: 0; max-width: 420px; width: calc(100vw - 32px); }
.pinstr-currency-dialog::backdrop, .pinstr-ton-dialog::backdrop { background: rgba(0,0,0,.6); }
.pcd-inner, .ptd-inner { display: grid; gap: 10px; padding: 20px; position: relative; }
.pcd-inner h2, .ptd-inner h2 { margin: 0 0 2px; font-size: 1.15rem; }
.pcd-lede { margin: 0 0 6px; font-size: .82rem; line-height: 1.5; color: rgba(244,244,241,.72); }
.pcd-option { display: grid; gap: 3px; text-align: left; padding: 12px 14px; border: 1px solid rgba(255,255,255,.2); border-radius: 8px; background: rgba(18,19,19,.7); color: inherit; font: inherit; cursor: pointer; }
.pcd-option:hover, .pcd-option:focus-visible { border-color: rgba(120,220,150,.7); background: rgba(24,34,26,.85); }
.pcd-title { display: flex; align-items: center; gap: 8px; font-size: 1rem; }
.pcd-note { font-size: .78rem; color: rgba(244,244,241,.66); }
.pcd-skip { justify-self: start; padding: 6px 2px; border: 0; background: none; color: rgba(244,244,241,.6); font: inherit; font-size: .8rem; cursor: pointer; text-decoration: underline; }
.ptd-close { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; background: rgba(18,19,19,.7); color: inherit; cursor: pointer; }
.ptd-amount { margin: 0; font-size: 1.6rem; font-weight: 700; }
.ptd-split { margin: 0; font-size: .78rem; color: rgba(244,244,241,.66); }
.ptd-qr { display: grid; place-items: center; padding: 10px; background: #fff; border-radius: 8px; min-height: 190px; }
.ptd-qr svg { width: 100%; max-width: 200px; height: auto; display: block; }
.ptd-field { display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: center; font-size: .78rem; color: rgba(244,244,241,.66); }
.ptd-field span { grid-column: 1 / -1; }
.ptd-field input { min-width: 0; padding: 8px 10px; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; background: #0d0e0e; color: #f4f4f1; font: inherit; font-family: ui-monospace, monospace; font-size: .78rem; }
.ptd-field button { padding: 8px 10px; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; background: rgba(18,19,19,.7); color: inherit; font: inherit; font-size: .78rem; cursor: pointer; }
.ptd-wallet { display: block; text-align: center; padding: 11px; border-radius: 8px; background: rgba(120,220,150,.16); border: 1px solid rgba(120,220,150,.5); color: #d8f5df; text-decoration: none; font-size: .86rem; }
.ptd-state { margin: 0; font-size: .82rem; color: rgba(244,244,241,.78); }
.ptd-hint { margin: 4px 0 0; font-size: .74rem; color: rgba(244,244,241,.55); }
.ptd-switch { border: 0; background: none; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
.pinstr-ton-dialog.is-paid .ptd-state { color: #8fe0a6; }
.pinstr-ton-dialog.is-paid [data-ton-qr] { display: none; }
.pinstr-composer-currency { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; }
.pcc-label { font-size: .82rem; color: rgba(244,244,241,.62); margin-right: 4px; }
.pcc-option { padding: 8px 16px; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; background: rgba(18,19,19,.7); color: inherit; font: inherit; font-size: .88rem; line-height: 1.2; cursor: pointer; }
.pcc-option small { opacity: .62; font-size: .92em; }
.pcc-option.is-active { border-color: rgba(120,220,150,.75); background: rgba(120,220,150,.16); color: #d8f5df; }
`;
  document.head.appendChild(style);
}

// A door for the case where every automatic trigger missed: from the console,
// pinstrCurrency.open() asks the question.
if (ON_PINSTR && typeof window !== 'undefined') {
  window.pinstrCurrency = { open: () => openChooser({ firstTime: true }), choice: readChoice };
}
