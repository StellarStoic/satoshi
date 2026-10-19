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

if (ON_PINSTR && typeof document !== 'undefined') start();

function start() {
  injectStyles();
  mountChooser();
  mountTonPanel();
  // Ask on arrival if nothing is chosen, and again on every sign-in: the choice is remembered but
  // re-confirmed, because a reader who came for a quick pin may not remember what they picked.
  if (!readChoice()) setTimeout(() => openChooser({ firstTime: true }), 1200);
  document.addEventListener('satoshi-nostr-session', () => setTimeout(() => openChooser({}), 600));
  document.addEventListener('pinstr-currency-changed', applyCurrency);
  applyCurrency();
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

let chooser = null;

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

// ---------------------------------------------------------------- the TON panel

let tonDialog = null;
let tonPoll = null;

function mountTonPanel() {
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
    if (event.target.closest('[data-ton-close]')) { stopTonPoll(); tonDialog.close(); return; }
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
      if (!payment.open) return;
      if (readChoice() !== 'ton') return;
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
  const payment = document.getElementById('paymentDialog');
  if (payment && payment.open) payment.close();
  tonDialog.querySelector('[data-ton-state]').textContent = 'Preparing the TON amount…';
  tonDialog.showModal();
  let quote;
  try {
    const response = await fetch(`/pinstr/v1/orders/${encodeURIComponent(orderId)}/ton`, { headers: { accept: 'application/json' } });
    quote = await response.json();
  } catch (err) {
    tonDialog.querySelector('[data-ton-state]').textContent = 'Could not reach the desk for a TON amount. Try again, or switch to Bitcoin.';
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

function drawQr(text) {
  const host = tonDialog.querySelector('[data-ton-qr]');
  host.textContent = '';
  if (typeof window.qrcode !== 'function') {
    const script = document.createElement('script');
    script.src = '/qrCodeGenerator_1_4_4.js';
    script.onload = () => drawQr(text);
    document.head.appendChild(script);
    return;
  }
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    host.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
  } catch {
    host.textContent = 'QR could not be drawn — use the wallet link below.';
  }
}

function startTonPoll(orderId) {
  stopTonPoll();
  tonPoll = setInterval(async () => {
    if (!tonDialog.open) { stopTonPoll(); return; }
    try {
      const response = await fetch(`/pinstr/v1/orders/${encodeURIComponent(orderId)}`, { headers: { accept: 'application/json' } });
      const order = await response.json();
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
.ptd-qr { display: grid; place-items: center; padding: 10px; background: #fff; border-radius: 8px; min-height: 150px; }
.ptd-qr svg { width: 170px; height: 170px; display: block; }
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
`;
  document.head.appendChild(style);
}
