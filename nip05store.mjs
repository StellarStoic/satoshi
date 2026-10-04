// NIP-05 name store.
//
// The site is static, so this page can hold no key and cannot write
// .well-known/nostr.json. It talks to the order desk at nip05.satoshi.si, which
// prices names and records orders; a worker on D's Start9 creates the BTCPay
// invoice and commits the name once the payment settles.
//
// Two deliberate choices:
//   * The price shown while typing comes from the service's config, which is the
//     same list the worker bills from. A hardcoded table here would eventually
//     disagree with the invoice.
//   * The payment rails are rendered from whatever the invoice actually offers, so
//     a rail can never be shown to a buyer that the invoice cannot accept.

const API = 'https://nip05.satoshi.si';
const POLL_MS = 3000;
const POLL_LIMIT = 100; // about five minutes, then stop hammering the desk

const els = {
  name: document.getElementById('storeName'),
  pubkey: document.getElementById('storePubkey'),
  priceLine: document.getElementById('priceLine'),
  verdict: document.getElementById('verdict'),
  keyVerdict: document.getElementById('keyVerdict'),
  tiers: document.getElementById('tiers'),
  button: document.getElementById('createOrder'),
  orderState: document.getElementById('orderState'),
  payCard: document.getElementById('payCard'),
  payAmount: document.getElementById('payAmount'),
  payName: document.getElementById('payName'),
  payBlock: document.getElementById('payBlock'),
  doneCard: document.getElementById('doneCard'),
  doneName: document.getElementById('doneName'),
  doneVerify: document.getElementById('doneVerify'),
  doneRelay: document.getElementById('doneRelay'),
};

let config = null;
let pollTimer = null;
let polls = 0;
let shownRail = null;

// ---------------------------------------------------------------- npub decoding
// Same implementation the news page uses (bech32 with checksum verification), so
// there is one decoder behaviour across the site rather than two that disagree.
function bech32NpubToHex(npub) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const separator = npub.lastIndexOf('1');
  if (!npub.toLowerCase().startsWith('npub1') || separator < 1) throw new Error('Invalid npub');
  const encoded = [...npub.toLowerCase().slice(separator + 1)].map(c => alphabet.indexOf(c));
  if (encoded.some(value => value < 0) || encoded.length < 7) throw new Error('Invalid npub');
  const polymod = encoded.reduce((checksum, value) => {
    const top = checksum >>> 25;
    let next = ((checksum & 0x1ffffff) << 5) ^ value;
    [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].forEach((generator, index) => {
      if ((top >>> index) & 1) next ^= generator;
    });
    return next;
  }, 1);
  if (polymod !== 1) throw new Error('Invalid npub checksum');
  const values = encoded.slice(0, -6);
  let accumulator = 0;
  let bits = 0;
  const bytes = [];
  for (const value of values) {
    accumulator = (accumulator << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  if (bytes.length !== 32) throw new Error('Invalid npub length');
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function pubkeyFrom(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return { ok: false, message: '' };
  if (trimmed.toLowerCase().startsWith('npub1')) {
    try {
      return { ok: true, hex: bech32NpubToHex(trimmed), message: 'npub read, and its checksum is valid.' };
    } catch (error) {
      return { ok: false, message: `${error.message}. Check the key or paste it as 64 hex characters instead.` };
    }
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return { ok: true, hex: trimmed.toLowerCase(), message: 'Valid hex public key.' };
  if (/^[0-9a-fA-F]+$/.test(trimmed)) return { ok: false, message: `A hex public key is 64 characters; that one is ${trimmed.length}.` };
  return { ok: false, message: 'That is neither an npub nor a 64 character hex key.' };
}

// ------------------------------------------------------------------- pricing
function priceFor(length) {
  if (!config) return null;
  const tier = (config.tiers || []).find(t => length >= t.min && length <= t.max);
  return tier ? tier.sats : null;
}

function renderTiers(activeLength) {
  els.tiers.innerHTML = '';
  for (const tier of config.tiers || []) {
    const span = document.createElement('span');
    span.className = 'tier';
    const range = tier.min === tier.max ? `${tier.min} characters` : `${tier.min}+ characters`;
    span.textContent = `${range}: ${tier.sats.toLocaleString()} sats`;
    if (activeLength >= tier.min && activeLength <= tier.max) span.classList.add('active');
    els.tiers.appendChild(span);
  }
}

function localProblem(name) {
  if (!config) return 'Prices are still loading.';
  if (name.length < config.minLength) return `At least ${config.minLength} characters, please.`;
  if (name.length > config.maxLength) return `At most ${config.maxLength} characters.`;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name)) {
    return 'Letters, digits, dot, dash and underscore only, and it must start and end with a letter or digit.';
  }
  if ((config.reserved || []).includes(name.toLowerCase())) {
    return 'That name is reserved. Write to one@satoshi.si if you want it.';
  }
  return null;
}

function setVerdict(element, text, kind) {
  element.textContent = text || '';
  element.className = `verdict${kind ? ` ${kind}` : ''}`;
}

function updateButton() {
  const name = els.name.value.trim();
  const key = pubkeyFrom(els.pubkey.value);
  els.button.disabled = Boolean(localProblem(name)) || !key.ok || Boolean(els.verdict.dataset.blocked);
}

// -------------------------------------------------------------- availability
let checkTimer = null;
function onNameInput() {
  const name = els.name.value.trim();
  els.verdict.dataset.blocked = '';
  renderTiers(name.length);

  const problem = localProblem(name);
  if (problem) {
    setVerdict(els.verdict, problem, 'bad');
    els.priceLine.textContent = name ? 'No price at this length.' : 'Type a name to see its price.';
    updateButton();
    return;
  }

  const sats = priceFor(name.length);
  els.priceLine.innerHTML = `Price: <span class="price-sats">${sats.toLocaleString()} sats</span> — one-off.`;
  setVerdict(els.verdict, 'Checking whether it is still free…', 'muted');
  updateButton();

  clearTimeout(checkTimer);
  checkTimer = setTimeout(async () => {
    try {
      const response = await fetch(`${API}/nip05/v1/names/${encodeURIComponent(name)}`);
      const data = await response.json();
      if (els.name.value.trim() !== name) return; // the buyer kept typing
      if (data.available) {
        setVerdict(els.verdict, `${name}@satoshi.si is free.`, 'ok');
      } else {
        els.verdict.dataset.blocked = 'yes';
        setVerdict(els.verdict, data.message || 'That name is not available.', data.reason === 'pending' ? 'held' : 'bad');
      }
    } catch (error) {
      setVerdict(els.verdict, 'Could not reach the name service. Check your connection and try again.', 'bad');
    }
    updateButton();
  }, 350);
}

function onKeyInput() {
  const result = pubkeyFrom(els.pubkey.value);
  setVerdict(els.keyVerdict, result.message, result.ok ? 'ok' : (result.message ? 'bad' : 'muted'));
  updateButton();
}

// ------------------------------------------------------------------ rendering
function qrImage(value, kind) {
  const image = document.createElement('img');
  image.className = 'store-qr';
  image.alt = `${kind} QR code`;
  image.title = value; // the copier reads this
  loadQr().then(ready => {
    if (!ready) return;
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(kind === 'Lightning' ? value.toUpperCase() : (kind === 'On-chain' ? `bitcoin:${value}` : value));
      qr.make();
      image.src = typeof qr.createDataURL === 'function'
        ? qr.createDataURL(6, 8)
        : canvasQr(qr);
    } catch (error) {
      image.alt = 'QR code could not be drawn; use the text below.';
    }
  });
  return image;
}

function canvasQr(qr) {
  const count = qr.getModuleCount();
  const cell = 6;
  const margin = 8;
  const canvas = document.createElement('canvas');
  canvas.width = count * cell + margin * 2;
  canvas.height = canvas.width;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) context.fillRect(margin + column * cell, margin + row * cell, cell, cell);
    }
  }
  return canvas.toDataURL('image/png');
}

let qrPromise = null;
function loadQr() {
  if (!qrPromise) {
    qrPromise = new Promise(resolve => {
      if (typeof window.qrcode === 'function') return resolve(true);
      const script = document.createElement('script');
      script.src = '/qrCodeGenerator_1_4_4.js';
      script.onload = () => resolve(typeof window.qrcode === 'function');
      script.onerror = () => resolve(false);
      document.head.append(script);
    });
  }
  return qrPromise;
}

/** One rail, in the exact markup the site's copy-to-clipboard already understands. */
function railWrapper(label, value, kind) {
  const wrapper = document.createElement('div');
  wrapper.className = 'qr-code-wrapper rail-body';

  const wrapperLabel = document.createElement('strong');
  wrapperLabel.textContent = label;
  wrapper.appendChild(wrapperLabel);

  wrapper.appendChild(qrImage(value, kind));

  const text = document.createElement('p');
  text.className = 'qr-code-text store-value';
  text.textContent = value;
  wrapper.appendChild(text);

  const hint = document.createElement('p');
  hint.className = 'store-note';
  hint.textContent = 'Tap the code or the text to copy it.';
  wrapper.appendChild(hint);

  return wrapper;
}

function railParts(order) {
  const payment = order.payment || {};
  const parts = [];
  if (payment.bolt11) parts.push({ label: 'Lightning', value: payment.bolt11, kind: 'Lightning' });
  if (payment.address) parts.push({ label: 'On-chain', value: payment.address, kind: 'On-chain' });
  if (payment.ark) parts.push({ label: 'Ark', value: payment.ark, kind: 'Ark' });
  return parts;
}

function renderPayment(order) {
  const parts = railParts(order);
  if (!parts.length) {
    els.payBlock.innerHTML = '<p class="spinner-line"><span class="dot-pulse"></span> Waiting for the invoice…</p>';
    return;
  }
  const signature = parts.map(p => p.value).join('|');
  if (shownRail === signature) return; // do not rebuild while the buyer is looking
  shownRail = signature;

  els.payBlock.innerHTML = '';
  const tabs = document.createElement('div');
  tabs.className = 'rail-tabs';
  const body = document.createElement('div');
  els.payBlock.append(tabs, body);

  parts.forEach((part, index) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'rail-tab';
    tab.textContent = part.label;
    tab.addEventListener('click', () => {
      Array.from(tabs.children).forEach(child => child.classList.remove('active'));
      tab.classList.add('active');
      body.innerHTML = '';
      body.appendChild(railWrapper(part.label, part.value, part.kind));
    });
    tabs.appendChild(tab);
    if (index === 0) tab.click();
  });

  const note = document.createElement('p');
  note.className = 'store-note';
  note.textContent = 'Bitcoin or Lightning both work. The invoice settles in the background — this page updates by itself.';
  els.payBlock.appendChild(note);
}

function statusLine(text, kind) {
  els.orderState.innerHTML = '';
  const line = document.createElement('div');
  line.className = `status-line${kind ? ` ${kind}` : ''}`;
  line.textContent = text;
  els.orderState.appendChild(line);
}

function working(text) {
  els.orderState.innerHTML = '';
  const line = document.createElement('div');
  line.className = 'spinner-line';
  const dot = document.createElement('span');
  dot.className = 'dot-pulse';
  const span = document.createElement('span');
  span.textContent = text;
  line.append(dot, span);
  els.orderState.appendChild(line);
}

function showDone(order) {
  clearInterval(pollTimer);
  pollTimer = null;
  els.payCard.hidden = true;
  els.doneCard.hidden = false;
  els.doneName.textContent = `${order.name}@satoshi.si`;
  const url = `${config.verifyUrl}?name=${encodeURIComponent(order.name)}`;
  els.doneVerify.textContent = url;
  els.doneVerify.href = url;
  els.doneRelay.textContent = config.relayNote
    || 'You can now write to wss://nostr.satoshi.si.';
  statusLine('Payment settled and the name is registered.', 'ok');
}

function applyOrder(order) {
  if (order.status === 'paid') return showDone(order);

  if (order.status === 'expired') {
    clearInterval(pollTimer);
    pollTimer = null;
    els.payCard.hidden = true;
    statusLine('That invoice expired before it was paid. Nothing was charged — create the order again.', 'held');
    els.button.disabled = false;
    return undefined;
  }

  if (order.status === 'conflict' || order.status === 'failed') {
    clearInterval(pollTimer);
    pollTimer = null;
    els.payCard.hidden = true;
    statusLine(`Something needs a human: ${order.note || order.status}. Your payment is recorded — write to one@satoshi.si and it will be sorted out.`, 'held');
    return undefined;
  }

  if (order.status === 'awaiting_payment') {
    els.payCard.hidden = false;
    els.payAmount.textContent = `${(order.sats || 0).toLocaleString()} sats`;
    els.payName.textContent = `${order.name}@satoshi.si`;
    renderPayment(order);
    const minutes = order.expiresAt ? Math.max(0, Math.round((order.expiresAt - Math.floor(Date.now() / 1000)) / 60)) : null;
    statusLine(minutes === null ? 'Waiting for your payment.' : `Waiting for your payment. The invoice is good for about ${minutes} more minutes.`, 'held');
    return undefined;
  }

  working('Preparing your invoice. This takes up to a minute…');
  return undefined;
}

async function poll(orderId) {
  polls += 1;
  if (polls > POLL_LIMIT) {
    clearInterval(pollTimer);
    pollTimer = null;
    statusLine('Stopped checking. Open this page again to see the latest state — your order is safe.', 'held');
    return;
  }
  try {
    const response = await fetch(`${API}/nip05/v1/orders/${encodeURIComponent(orderId)}`);
    if (!response.ok) return;
    applyOrder(await response.json());
  } catch (error) {
    // A dropped poll is not news; the next one will pick it up.
  }
}

async function createOrder() {
  const name = els.name.value.trim();
  const key = pubkeyFrom(els.pubkey.value);
  if (localProblem(name) || !key.ok) return;

  els.button.disabled = true;
  working('Creating your order…');
  try {
    const response = await fetch(`${API}/nip05/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pubkey: key.hex }),
    });
    const data = await response.json();
    if (!response.ok) {
      setVerdict(els.verdict, data.error || 'The name could not be ordered.', data.reason === 'pending' ? 'held' : 'bad');
      els.button.disabled = false;
      statusLine('Order not created.', 'bad');
      return;
    }
    els.payCard.hidden = false;
    els.payName.textContent = `${data.name || name}@satoshi.si`;
    els.payAmount.textContent = `${(data.sats || 0).toLocaleString()} sats`;
    els.payBlock.innerHTML = '<p class="spinner-line"><span class="dot-pulse"></span> Asking for the invoice…</p>';
    working('Order created. Preparing your payment options…');
    poll(data.orderId);
    clearInterval(pollTimer);
    pollTimer = setInterval(() => poll(data.orderId), POLL_MS);
  } catch (error) {
    els.button.disabled = false;
    statusLine('Could not reach the name service. Check your connection and try again.', 'bad');
  }
}

async function start() {
  els.name.addEventListener('input', onNameInput);
  els.pubkey.addEventListener('input', onKeyInput);
  els.button.addEventListener('click', createOrder);

  try {
    const response = await fetch(`${API}/nip05/v1/config`);
    config = await response.json();
  } catch (error) {
    setVerdict(els.verdict, 'The name service is unreachable right now. Try again in a moment.', 'bad');
    return;
  }
  renderTiers(0);
  els.priceLine.textContent = 'Type a name to see its price.';
  setVerdict(els.verdict, '', 'muted');
  onKeyInput();
  updateButton();
}

start();
