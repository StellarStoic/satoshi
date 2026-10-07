import {
  STICKY_COLORS,
  STICKY_FONTS,
  STICKY_ANONYMOUS_PRICE_SATS,
  STICKY_MAX_CHARACTERS,
  STICKY_PRICE_SATS,
  STICKY_TOPIC,
  clampPlacement,
  clampRotation,
  makeDeletionTemplate,
  makeStickyTemplate,
  normaliseGeohash,
  normaliseStickyText,
  parseStickyEvent,
  stickyContentHash,
  stickyOrderPrice,
  stickyPaymentRails,
} from './stickyNotesModel.mjs';
import {
  beginAmberLogin,
  getNostrSession,
  loginAnonymously,
  loginWithBunker,
  loginWithExtension,
  loginWithPrivateKey,
  logoutNostr,
  resumeAmber,
  shortNpub,
  signNostrEvent,
  signerReady,
  updateNostrProfile,
} from './nostrSession.mjs';
import {payServiceUrl} from './paymentService.mjs';

const API = document.querySelector('meta[name="sticky-api"]')?.content || payServiceUrl('sticky');
const RELAY = 'wss://nostr.satoshi.si';
const PENDING_KEY = 'satoshi:sticky:pending:v1';
const BOARD_KEY = 'satoshi:sticky:geohash:v1';
const elements = {
  board: document.getElementById('stickyBoard'), canvas: document.getElementById('stickyCanvas'), boardStatus: document.getElementById('boardStatus'),
  account: document.getElementById('nostrAccount'), newSticky: document.getElementById('newSticky'),
  openBoard: document.getElementById('openStickyBoard'), boardDialog: document.getElementById('boardDialog'),
  boardChooser: document.getElementById('boardChooser'), boardGeohash: document.getElementById('boardGeohash'),
  boardChooserStatus: document.getElementById('boardChooserStatus'),
  login: document.getElementById('loginDialog'), loginStatus: document.getElementById('loginStatus'),
  accountDialog: document.getElementById('accountDialog'), accountName: document.getElementById('accountName'),
  accountNpub: document.getElementById('accountNpub'), accountMethod: document.getElementById('accountMethod'),
  accountPicture: document.getElementById('accountPicture'), accountNip05: document.getElementById('accountNip05'),
  anonymousExpiry: document.getElementById('anonymousExpiry'), logout: document.getElementById('logoutNostr'),
  composer: document.getElementById('composerDialog'), editor: document.getElementById('stickyEditor'),
  draft: document.getElementById('draftNote'), colors: document.getElementById('colorSwatches'),
  capacity: document.getElementById('noteCapacity'), pay: document.getElementById('payForSticky'),
  paymentStatus: document.getElementById('paymentStatus'), placementControls: document.getElementById('placementControls'),
  paymentDialog: document.getElementById('paymentDialog'), payment: document.getElementById('stickyPayment'), paymentAmount: document.getElementById('stickyPaymentAmount'),
  paymentQr: document.getElementById('stickyPaymentQr'), paymentValue: document.getElementById('stickyPaymentValue'),
  paymentRails: document.getElementById('stickyPaymentRails'), paymentHint: document.getElementById('stickyPaymentHint'),
  copyPayment: document.getElementById('copyStickyPayment'),
  pin: document.getElementById('pinSticky'), bunker: document.getElementById('bunkerInput'),
  privateKey: document.getElementById('privateKeyInput'), font: document.getElementById('noteFont'),
  zoomOut: document.getElementById('zoomOut'), zoomIn: document.getElementById('zoomIn'),
  zoomFit: document.getElementById('zoomFit'),
  noteMenu: document.getElementById('noteMenu'), noteEventId: document.getElementById('noteEventId'),
  notePostedAt: document.getElementById('notePostedAt'), copyNoteId: document.getElementById('copyNoteId'),
  removeSticky: document.getElementById('removeSticky'), noteMenuStatus: document.getElementById('noteMenuStatus'),
};

let selectedColor = 'yellow';
let selectedFont = 'typewriter';
let lastValidEditor = '';
let pending = readPending();
let placingNote = null;
let paymentTimer = null;
let boardSocket = null;
let boardConnectionVersion = 0;
const rendered = new Set();
const noteEvents = new Map();
const pendingDeletions = new Map();
let selectedNoteId = '';
let quotedPrice = STICKY_PRICE_SATS;
let quotedPubkey = '';
let currentPaymentValue = '';
let currentRails = [];
let currentRailId = '';
let profileFetchPubkey = '';
let composingPubkey = '';
let composingGeohash = '';
let activeGeohash = normaliseGeohash(localStorage.getItem(BOARD_KEY));
if (pending?.action === 'pin' && Object.hasOwn(pending, 'geohash')) {
  activeGeohash = normaliseGeohash(pending.geohash);
  if (activeGeohash) localStorage.setItem(BOARD_KEY, activeGeohash);
  else localStorage.removeItem(BOARD_KEY);
}
const boardView = {scale: .6, x: 0, y: 0};
const CANVAS_WIDTH = 2600;
const CANVAS_HEIGHT = 1800;

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
}

function savePending(value) {
  pending = value;
  if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  else localStorage.removeItem(PENDING_KEY);
}

function status(target, message, error = false) {
  target.textContent = message;
  target.classList.toggle('is-error', error);
}

function showDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function sessionLabel(session) {
  if (session?.method === 'anonymous') return 'Anonymous';
  return session?.profile?.display_name || session?.profile?.name || (session ? shortNpub(session.npub) : 'Log in');
}

function safeProfilePicture(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function readProfileFromRelay(url, pubkey) {
  return new Promise(resolve => {
    const socket = new WebSocket(url);
    const subscription = `sticky-profile-${crypto.randomUUID?.() || Date.now()}`;
    let newest = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { socket.close(); } catch {}
      resolve(newest);
    };
    const timer = setTimeout(finish, 3500);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, {authors: [pubkey], kinds: [0], limit: 5}])));
    socket.addEventListener('message', message => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EOSE') { clearTimeout(timer); finish(); return; }
      if (data[0] !== 'EVENT' || !window.NostrTools.verifyEvent(data[2]) || data[2].pubkey !== pubkey) return;
      if (!newest || data[2].created_at > newest.created_at) newest = data[2];
    });
    socket.addEventListener('error', finish);
  });
}

async function loadAccountProfile(session) {
  if (!session || session.method === 'anonymous' || profileFetchPubkey === session.pubkey) return;
  profileFetchPubkey = session.pubkey;
  const results = await Promise.allSettled([
    readProfileFromRelay(RELAY, session.pubkey),
    readProfileFromRelay('wss://relay.damus.io', session.pubkey),
    readProfileFromRelay('wss://nos.lol', session.pubkey),
    readProfileFromRelay('wss://relay.ditto.pub', session.pubkey),
  ]);
  const events = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const event = events.filter(Boolean).sort((left, right) => right.created_at - left.created_at)[0];
  if (!event || getNostrSession()?.pubkey !== session.pubkey) return;
  try {
    const source = JSON.parse(event.content || '{}');
    const profile = {
      name: String(source.name || '').trim().slice(0, 80),
      display_name: String(source.display_name || source.displayName || '').trim().slice(0, 80),
      nip05: String(source.nip05 || '').trim().slice(0, 180),
      picture: safeProfilePicture(source.picture),
    };
    updateNostrProfile(session.pubkey, profile);
  } catch {}
}

function anonymousCountdown(expiresAt) {
  const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function updateAnonymousCountdown() {
  const session = getNostrSession();
  if (session?.method !== 'anonymous') {
    elements.anonymousExpiry.hidden = true;
    return;
  }
  elements.anonymousExpiry.hidden = false;
  elements.anonymousExpiry.innerHTML = `Local access expires in <strong>${anonymousCountdown(session.expiresAt)}</strong>`;
}

function updateAccount() {
  const session = getNostrSession();
  const accountLabel = session ? `Nostr account: ${sessionLabel(session)}` : 'Log in to Nostr';
  elements.account.setAttribute('aria-label', accountLabel);
  elements.account.title = accountLabel;
  if (session) {
    elements.accountName.textContent = sessionLabel(session);
    elements.accountNpub.textContent = session.npub;
    elements.accountMethod.textContent = session.method === 'anonymous' ? 'Temporary local Nostr identity' : `Signer: ${session.method === 'private' ? 'private key (not saved)' : session.method}`;
    const nip05 = session.profile?.nip05 || '';
    elements.accountNip05.textContent = nip05;
    elements.accountNip05.hidden = !nip05 || session.method === 'anonymous';
    const picture = session.method === 'anonymous' ? '' : safeProfilePicture(session.profile?.picture);
    elements.accountPicture.hidden = !picture;
    if (picture) {
      elements.accountPicture.src = picture;
      elements.accountPicture.alt = `${sessionLabel(session)} profile image`;
    }
    else elements.accountPicture.removeAttribute('src');
    elements.logout.querySelector('span').textContent = session.method === 'anonymous' ? 'Leave anonymous mode' : 'Log out';
    loadAccountProfile(session);
  } else {
    elements.accountName.textContent = '';
    elements.accountNpub.textContent = '';
    elements.accountMethod.textContent = '';
    elements.accountNip05.hidden = true;
    elements.accountPicture.hidden = true;
  }
  updateAnonymousCountdown();
  refreshPriceQuote(session);
}

function renderQuotedPrice(discountApplied = false) {
  const pinLabel = elements.pay.querySelector('span');
  const removeLabel = elements.removeSticky.querySelector('span');
  const anonymous = getNostrSession()?.method === 'anonymous';
  pinLabel.textContent = anonymous ? `Post anonymously · ${STICKY_ANONYMOUS_PRICE_SATS} sats` : discountApplied ? `NIP-05 price: ${quotedPrice} sats` : `Pay ${quotedPrice} sats`;
  removeLabel.textContent = anonymous ? `Remove for ${STICKY_PRICE_SATS} sats` : discountApplied ? `Remove for ${quotedPrice} sats · NIP-05 price` : `Remove for ${quotedPrice} sats`;
}

async function refreshPriceQuote(session) {
  if (!session) {
    quotedPubkey = '';
    quotedPrice = STICKY_PRICE_SATS;
    renderQuotedPrice(false);
    return;
  }
  if (session.method === 'anonymous') {
    quotedPubkey = session.pubkey;
    quotedPrice = STICKY_ANONYMOUS_PRICE_SATS;
    renderQuotedPrice(false);
    return;
  }
  if (quotedPubkey === session.pubkey) return;
  quotedPubkey = session.pubkey;
  quotedPrice = STICKY_PRICE_SATS;
  renderQuotedPrice(false);
  try {
    const quote = await api(`/quote?pubkey=${encodeURIComponent(session.pubkey)}`);
    if (getNostrSession()?.pubkey !== session.pubkey) return;
    quotedPrice = stickyOrderPrice(quote);
    renderQuotedPrice(Boolean(quote.discount?.applied));
  } catch {
    // The created order remains authoritative; a missing preview never blocks checkout.
  }
}

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {'content-type': 'application/json', ...(options.headers || {})},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
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
      document.head.appendChild(script);
    });
  }
  return qrPromise;
}

async function renderPayment(order) {
  const rails = stickyPaymentRails(order);
  if (!rails.length) {
    elements.paymentQr.hidden = true;
    elements.paymentValue.textContent = '';
    elements.paymentHint.textContent = 'Preparing invoice...';
    return false;
  }
  const sats = stickyOrderPrice(order, pending?.sats || STICKY_PRICE_SATS);
  currentRails = rails;
  elements.paymentAmount.textContent = rails.length > 1 ? `Pay ${sats} sats` : `Pay ${sats} sats with ${rails[0].label}`;
  elements.paymentRails.hidden = rails.length < 2;
  elements.paymentRails.replaceChildren(...rails.map(rail => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rail-tab';
    button.dataset.rail = rail.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    const icon = document.createElement('i');
    icon.className = `lni lni-${rail.id === 'lightning' ? 'bolt' : 'map-marker-1'}`;
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, Object.assign(document.createElement('span'), {textContent: rail.label}));
    button.addEventListener('click', () => selectRail(rail.id));
    return button;
  }));
  elements.paymentQr.hidden = false;
  elements.paymentValue.hidden = false;
  elements.copyPayment.hidden = false;
  elements.paymentHint.textContent = `Waiting for the ${sats}-sat payment...`;
  showDialog(elements.paymentDialog);
  const wanted = rails.some(rail => rail.id === currentRailId) ? currentRailId : rails[0].id;
  await selectRail(wanted);
  return true;
}

async function selectRail(id) {
  const rail = currentRails.find(item => item.id === id) || currentRails[0];
  if (!rail) return;
  currentRailId = rail.id;
  currentPaymentValue = rail.copyValue || rail.uri;
  for (const button of elements.paymentRails.querySelectorAll('.rail-tab')) {
    const active = button.dataset.rail === rail.id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  }
  elements.paymentValue.textContent = rail.uri;
  elements.paymentQr.alt = `${rail.label} payment QR code`;
  if (await loadQr()) {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(rail.uri);
      qr.make();
      elements.paymentQr.src = qr.createDataURL(6, 8);
      elements.paymentQr.hidden = false;
    } catch { elements.paymentQr.removeAttribute('src'); }
  }
}

function showPaymentPreparing(sats = quotedPrice) {
  currentRails = [];
  currentRailId = '';
  currentPaymentValue = '';
  elements.paymentAmount.textContent = `Pay ${sats} sats`;
  elements.paymentRails.hidden = true;
  elements.paymentRails.replaceChildren();
  elements.paymentQr.hidden = true;
  elements.paymentQr.removeAttribute('src');
  elements.paymentValue.hidden = true;
  elements.copyPayment.hidden = true;
  elements.paymentHint.textContent = 'Preparing invoice...';
  showDialog(elements.paymentDialog);
}

async function copyPayment() {
  if (!currentPaymentValue) return;
  try {
    await navigator.clipboard.writeText(currentPaymentValue);
    elements.copyPayment.querySelector('span').textContent = 'Payment copied';
    setTimeout(() => { elements.copyPayment.querySelector('span').textContent = 'Copy payment'; }, 1800);
  } catch { status(elements.paymentStatus, 'Could not copy the payment.', true); }
}

function noteAtPlacement(note, placement) {
  note.style.left = `${placement.x * 100}%`;
  note.style.top = `${placement.y * 100}%`;
  note.style.setProperty('--rotation', `${placement.rotation}deg`);
}

function noteBelongsToBoard(sticky) {
  return Boolean(activeGeohash) && sticky.geohash === activeGeohash;
}

function updateBoardControl() {
  const label = activeGeohash ? `Corkboard: ${activeGeohash}` : 'Choose a geohash corkboard';
  elements.openBoard.setAttribute('aria-label', label);
  elements.openBoard.title = label;
}

function selectBoard(geohash) {
  if (placingNote) {
    status(elements.boardChooserStatus, 'Pin the current note before changing corkboards.', true);
    return;
  }
  const nextGeohash = normaliseGeohash(geohash);
  if (!nextGeohash) {
    status(elements.boardChooserStatus, 'Enter a valid geohash first.', true);
    return;
  }
  activeGeohash = nextGeohash;
  localStorage.setItem(BOARD_KEY, activeGeohash);
  updateBoardControl();
  closeNoteMenu();
  boardConnectionVersion += 1;
  try { boardSocket?.close(); } catch {}
  boardSocket = null;
  rendered.clear();
  noteEvents.clear();
  pendingDeletions.clear();
  elements.canvas.replaceChildren();
  elements.boardStatus.hidden = false;
  status(elements.boardStatus, `Opening corkboard ${activeGeohash}...`);
  elements.boardDialog.close();
  connectBoard(boardConnectionVersion);
}

function applyBoardTransform() {
  elements.canvas.style.transform = `translate(${boardView.x}px, ${boardView.y}px) scale(${boardView.scale})`;
  elements.board.style.backgroundSize = `${600 * boardView.scale}px ${600 * boardView.scale}px`;
  elements.board.style.backgroundPosition = `${boardView.x}px ${boardView.y}px`;
}

function fitBoard() {
  const rect = elements.board.getBoundingClientRect();
  boardView.scale = Math.min(rect.width / CANVAS_WIDTH, rect.height / CANVAS_HEIGHT);
  boardView.x = (rect.width - CANVAS_WIDTH * boardView.scale) / 2;
  boardView.y = (rect.height - CANVAS_HEIGHT * boardView.scale) / 2;
  applyBoardTransform();
}

function setZoom(nextScale, clientX = innerWidth / 2, clientY = innerHeight / 2) {
  const rect = elements.board.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const worldX = (pointX - boardView.x) / boardView.scale;
  const worldY = (pointY - boardView.y) / boardView.scale;
  boardView.scale = Math.min(2.5, Math.max(.28, nextScale));
  boardView.x = pointX - worldX * boardView.scale;
  boardView.y = pointY - worldY * boardView.scale;
  applyBoardTransform();
}

function renderNote(sticky, event = null, temporary = false) {
  if (!temporary && rendered.has(sticky.id)) return null;
  if (!temporary) rendered.add(sticky.id);
  const note = document.createElement('article');
  note.className = `sticky-note sticky-note--${sticky.color} sticky-note--font-${sticky.font || 'typewriter'}${temporary ? ' sticky-note--placing' : ''}`;
  note.classList.toggle('sticky-note--dense', sticky.content.length > 280);
  if (sticky.id) note.dataset.eventId = sticky.id;
  note.dataset.createdAt = String(sticky.createdAt || 0);
  note.tabIndex = temporary ? 0 : -1;
  const text = document.createElement('div');
  text.className = 'sticky-note__text';
  const textContent = document.createElement('span');
  textContent.textContent = sticky.content;
  text.appendChild(textContent);
  note.appendChild(text);
  if (!temporary) {
    const pin = document.createElement('span');
    pin.className = 'sticky-note__pin';
    pin.setAttribute('role', 'button');
    pin.tabIndex = 0;
    pin.setAttribute('aria-label', 'Open note details');
    pin.addEventListener('click', click => { click.stopPropagation(); openNoteMenu(sticky.id, pin); });
    pin.addEventListener('keydown', key => {
      if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); openNoteMenu(sticky.id, pin); }
    });
    note.appendChild(pin);
    const author = document.createElement('span');
    author.className = 'sticky-note__author';
    author.textContent = sticky.anonymous ? 'Anonymous' : shortAuthor(sticky.pubkey);
    note.appendChild(author);
  }
  noteAtPlacement(note, sticky);
  const nextNewer = [...elements.canvas.querySelectorAll('.sticky-note:not(.sticky-note--placing)')]
    .find(existing => Number(existing.dataset.createdAt || 0) > Number(sticky.createdAt || 0));
  elements.canvas.insertBefore(note, nextNewer || placingNote || null);
  fitPublishedTypography(note, text, textContent, sticky.font || 'typewriter');
  document.fonts?.ready?.then(() => {
    if (note.isConnected) fitPublishedTypography(note, text, textContent, sticky.font || 'typewriter');
  });
  if (!temporary && event) noteEvents.set(sticky.id, {event, sticky, element: note});
  return note;
}

function shortAuthor(pubkey) {
  try { return shortNpub(window.NostrTools.nip19.npubEncode(pubkey)); } catch { return 'Nostr user'; }
}

function connectBoard(version = boardConnectionVersion) {
  if (!activeGeohash) {
    status(elements.boardStatus, 'Choose a geohash to open its corkboard.');
    elements.boardStatus.hidden = false;
    return;
  }
  const subscription = `sticky-${Date.now()}`;
  const socket = new WebSocket(RELAY);
  boardSocket = socket;
  const timeout = setTimeout(() => status(elements.boardStatus, 'The board is taking longer than usual to open.'), 6000);
  socket.addEventListener('open', () => {
    const noteFilter = {kinds: [1], '#t': [STICKY_TOPIC], '#g': [activeGeohash], limit: 500};
    socket.send(JSON.stringify(['REQ', subscription,
      noteFilter,
      {kinds: [5], '#t': ['satoshi-sticky-delete'], limit: 500},
    ]));
  });
  socket.addEventListener('message', message => {
    try {
      const data = JSON.parse(message.data);
      if (data[0] === 'EOSE' && data[1] === subscription) {
        clearTimeout(timeout);
        elements.boardStatus.hidden = true;
        return;
      }
      if (data[0] !== 'EVENT' || data[1] !== subscription || !window.NostrTools.verifyEvent(data[2])) return;
      const event = data[2];
      if (event.kind === 5) {
        processDeletion(event);
        return;
      }
      const sticky = parseStickyEvent(event);
      if (!sticky || !noteBelongsToBoard(sticky)) return;
      const deletion = pendingDeletions.get(sticky.id);
      if (deletion?.pubkey === sticky.pubkey) return;
      renderNote(sticky, event);
    } catch {}
  });
  socket.addEventListener('error', () => {
    clearTimeout(timeout);
    status(elements.boardStatus, 'The Nostr board is temporarily unavailable.', true);
  });
  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    if (!document.hidden && version === boardConnectionVersion) setTimeout(() => connectBoard(version), 5000);
  }, {once: true});
}

function processDeletion(event) {
  const target = event.tags?.find(tag => tag?.[0] === 'e')?.[1];
  if (!/^[0-9a-f]{64}$/.test(target || '')) return;
  const existing = noteEvents.get(target);
  if (existing && existing.event.pubkey === event.pubkey) {
    existing.element.remove();
    noteEvents.delete(target);
    rendered.delete(target);
    if (selectedNoteId === target) closeNoteMenu();
  } else {
    pendingDeletions.set(target, event);
  }
}

function selectColor(color) {
  if (!STICKY_COLORS.includes(color)) return;
  elements.draft.classList.remove(...STICKY_COLORS.map(item => `sticky-note--${item}`));
  elements.draft.classList.add(`sticky-note--${color}`);
  elements.colors.querySelectorAll('[data-color]').forEach(button => button.classList.toggle('is-selected', button.dataset.color === color));
  selectedColor = color;
}

function selectFont(font) {
  if (!STICKY_FONTS.includes(font)) return;
  elements.draft.classList.remove(...STICKY_FONTS.map(item => `sticky-note--font-${item}`));
  elements.draft.classList.add(`sticky-note--font-${font}`);
  elements.font.querySelectorAll('[data-font]').forEach(button => {
    const selected = button.dataset.font === font;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  });
  selectedFont = font;
  requestAnimationFrame(() => {
    fitDraftTypography();
    updateCapacity();
  });
  document.fonts?.ready?.then(() => {
    if (elements.draft.isConnected && selectedFont === font) fitDraftTypography();
  });
}

function baseFontSize(font, draft = false) {
  const sizes = {typewriter: draft ? 18 : 17, mono: draft ? 17 : 16, handwritten: draft ? 24 : 22, serif: draft ? 18 : 17};
  return sizes[font] || sizes.typewriter;
}

function fitDraftTypography() {
  let size = baseFontSize(selectedFont, true);
  elements.draft.style.setProperty('--note-font-size', `${size}px`);
  const fits = () => {
    const verticalInset = elements.draft.classList.contains('sticky-note--dense') ? size * 2.84 : 44;
    const availableHeight = elements.draft.clientHeight - verticalInset;
    return elements.editor.scrollHeight <= availableHeight + 1 && elements.editor.scrollWidth <= elements.editor.clientWidth + 1;
  };
  while (size > 10 && !fits()) {
    size -= 1;
    elements.draft.style.setProperty('--note-font-size', `${size}px`);
  }
  return fits();
}

function fitPublishedTypography(note, textBox, textContent, font) {
  let size = baseFontSize(font);
  note.style.setProperty('--note-font-size', `${size}px`);
  while (size > 10 && (textContent.getBoundingClientRect().height > textBox.clientHeight + 1 || textContent.scrollWidth > textBox.clientWidth + 1)) {
    size -= 1;
    note.style.setProperty('--note-font-size', `${size}px`);
  }
}

function editorOverflows() {
  return !fitDraftTypography();
}

function updateCapacity() {
  const length = normaliseStickyText(elements.editor.textContent).length;
  const full = length >= STICKY_MAX_CHARACTERS;
  const almostFull = !full && length >= Math.floor(STICKY_MAX_CHARACTERS * .9);
  elements.draft.classList.toggle('sticky-note--dense', length > 280);
  elements.capacity.classList.toggle('is-almost-full', almostFull);
  elements.capacity.classList.toggle('is-full', full);
  if (!length) elements.capacity.textContent = 'The paper is empty';
  else if (full) elements.capacity.textContent = 'The note is full';
  else if (almostFull) elements.capacity.textContent = `${STICKY_MAX_CHARACTERS - length} characters left`;
  else elements.capacity.textContent = `${length} characters`;
}

function handleEditorInput() {
  const text = elements.editor.textContent;
  elements.draft.classList.toggle('sticky-note--dense', normaliseStickyText(text).length > 280);
  if (text.length > STICKY_MAX_CHARACTERS) {
    elements.editor.textContent = lastValidEditor;
    updateCapacity();
    fitDraftTypography();
    const selection = window.getSelection();
    selection.selectAllChildren(elements.editor);
    selection.collapseToEnd();
    return;
  }
  if (editorOverflows()) {
    elements.editor.textContent = lastValidEditor;
    updateCapacity();
    fitDraftTypography();
    const selection = window.getSelection();
    selection.selectAllChildren(elements.editor);
    selection.collapseToEnd();
    return;
  }
  lastValidEditor = text;
  updateCapacity();
}

async function ensureReadySigner() {
  if (await signerReady().catch(() => false)) return true;
  showDialog(elements.login);
  throw new Error('Reconnect your signer before paying.');
}

async function startPayment() {
  try {
    status(elements.paymentStatus, '');
    const session = getNostrSession();
    if (!session) { showDialog(elements.login); return; }
    if (composingPubkey && composingPubkey !== session.pubkey) throw new Error('Your active Nostr identity changed. Reopen the note and try again.');
    if (!activeGeohash || composingGeohash !== activeGeohash) throw new Error('Choose the geohash corkboard again, then reopen the note.');
    await ensureReadySigner();
    const content = normaliseStickyText(elements.editor.textContent);
    if (!content) throw new Error('Write something on the note first.');
    if (editorOverflows()) throw new Error('The note is too full.');
    elements.pay.disabled = true;
    status(elements.paymentStatus, 'Preparing invoice...');
    showPaymentPreparing(quotedPrice);
    const contentHash = await stickyContentHash(content, selectedColor, selectedFont);
    const order = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({pubkey: session.pubkey, action: 'pin', contentHash, geohash: activeGeohash, ...(session.method === 'anonymous' ? {anonymous: true} : {})}),
    });
    const sats = stickyOrderPrice(order, session.method === 'anonymous' ? STICKY_ANONYMOUS_PRICE_SATS : STICKY_PRICE_SATS);
    if (session.method === 'anonymous' && sats !== STICKY_ANONYMOUS_PRICE_SATS) throw new Error('Anonymous posting is not ready on the payment service yet. No note was published.');
    savePending({orderId: order.id, action: 'pin', content, color: selectedColor, font: selectedFont, geohash: activeGeohash, contentHash, sats, anonymous: session.method === 'anonymous', status: 'waiting'});
    const railReady = await renderPayment(order);
    if (!railReady && order.checkoutLink) location.assign(order.checkoutLink);
    else if (!railReady) status(elements.paymentStatus, 'Preparing invoice...');
    status(elements.paymentStatus, `Waiting for the ${sats}-sat payment...`);
    pollPayment();
  } catch (error) {
    if (elements.paymentDialog.open && !pending?.orderId) elements.paymentDialog.close();
    status(elements.paymentStatus, error.message, true);
    elements.pay.disabled = false;
  }
}

async function pollPayment() {
  clearTimeout(paymentTimer);
  if (!pending?.orderId) return;
  try {
    const order = await api(`/orders/${encodeURIComponent(pending.orderId)}`);
    if (pending.action === 'pin') await renderPayment(order);
    if (order.paid && order.publishToken) {
      if (elements.paymentDialog.open) elements.paymentDialog.close();
      savePending({...pending, status: 'paid', publishToken: order.publishToken});
      if (pending.action === 'remove') await publishRemoval();
      else {
        if (elements.composer.open) elements.composer.close();
        beginPlacement();
      }
      return;
    }
    if (['expired', 'invalid', 'cancelled'].includes(String(order.status || '').toLowerCase())) throw new Error('The invoice expired. Start again when you are ready.');
    const invoicePending = String(order.status || '').toLowerCase() === 'awaiting_invoice' || !order.payment;
    status(pending.action === 'remove' ? elements.noteMenuStatus : elements.paymentStatus,
      invoicePending ? 'Preparing invoice...' : 'Waiting for payment...');
    if (invoicePending) elements.paymentHint.textContent = 'Preparing invoice...';
    paymentTimer = setTimeout(pollPayment, 3000);
  } catch (error) {
    status(pending?.action === 'remove' ? elements.noteMenuStatus : elements.paymentStatus, error.message, true);
    elements.pay.disabled = false;
  }
}

function beginPlacement() {
  if (pending?.action !== 'pin' || !pending?.content || pending.status !== 'paid') return;
  placingNote?.remove();
  const board = elements.board.getBoundingClientRect();
  const placement = pending.placement || {
    x: clampPlacement(((board.width / 2) - boardView.x) / (CANVAS_WIDTH * boardView.scale)),
    y: clampPlacement(((board.height / 2) - boardView.y) / (CANVAS_HEIGHT * boardView.scale)),
    rotation: 0,
  };
  savePending({...pending, placement});
  placingNote = renderNote({...pending, ...placement}, null, true);
  elements.placementControls.hidden = false;
  elements.pin.disabled = false;
  elements.pin.querySelector('span').textContent = 'Pin note';
  installPlacementGestures(placingNote);
  placingNote.focus();
}

function currentPlacement() {
  return pending?.placement || {x: .5, y: .5, rotation: 0};
}

function setPlacement(next) {
  const placement = {
    x: clampPlacement(next.x), y: clampPlacement(next.y), rotation: clampRotation(next.rotation),
  };
  savePending({...pending, placement});
  noteAtPlacement(placingNote, placement);
}

function installPlacementGestures(note) {
  const pointers = new Map();
  let gesture = null;

  const point = event => ({x: event.clientX, y: event.clientY});
  const angleBetween = () => {
    const [first, second] = [...pointers.values()];
    return Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;
  };
  const resetSinglePointer = () => {
    const [remaining] = pointers.entries();
    if (!remaining) { gesture = null; return; }
    gesture = {id: remaining[0], startX: remaining[1].x, startY: remaining[1].y, placement: {...currentPlacement()}, rotate: false};
  };

  note.addEventListener('pointerdown', event => {
    event.preventDefault();
    note.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 1) {
      gesture = {id: event.pointerId, startX: event.clientX, startY: event.clientY, placement: {...currentPlacement()}, rotate: event.shiftKey};
    } else if (pointers.size === 2) {
      gesture = {angle: angleBetween(), placement: {...currentPlacement()}, twoFinger: true};
    }
  });
  note.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2 && gesture.twoFinger) {
      let difference = angleBetween() - gesture.angle;
      if (difference > 180) difference -= 360;
      if (difference < -180) difference += 360;
      setPlacement({...gesture.placement, rotation: gesture.placement.rotation + difference});
      return;
    }
    if (gesture.id !== event.pointerId) return;
    if (gesture.rotate || event.shiftKey) {
      setPlacement({...gesture.placement, rotation: gesture.placement.rotation + (event.clientX - gesture.startX) / 10});
    } else {
      setPlacement({...gesture.placement,
        x: gesture.placement.x + (event.clientX - gesture.startX) / (CANVAS_WIDTH * boardView.scale),
        y: gesture.placement.y + (event.clientY - gesture.startY) / (CANVAS_HEIGHT * boardView.scale)});
    }
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) resetSinglePointer();
    else if (!pointers.size) gesture = null;
  };
  note.addEventListener('pointerup', release);
  note.addEventListener('pointercancel', release);
  note.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const placement = currentPlacement();
    if (event.shiftKey) {
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      setPlacement({...placement, rotation: placement.rotation + direction});
    } else {
      setPlacement({...placement,
        x: placement.x + (event.key === 'ArrowLeft' ? -.01 : event.key === 'ArrowRight' ? .01 : 0),
        y: placement.y + (event.key === 'ArrowUp' ? -.01 : event.key === 'ArrowDown' ? .01 : 0)});
    }
  });
}

async function publishPinnedNote(resumedEvent = null) {
  let published = false;
  try {
    elements.pin.disabled = true;
    if (!resumedEvent) await ensureReadySigner();
    const placement = currentPlacement();
    const template = makeStickyTemplate({...pending, ...placement, anonymous: Boolean(pending.anonymous)});
    const event = resumedEvent || await signNostrEvent(template, {orderId: pending.orderId, action: 'pin'});
    if (!event) return;
    if (!window.NostrTools.verifyEvent(event)) throw new Error('Your signer returned an invalid event.');
    const result = await api(`/orders/${encodeURIComponent(pending.orderId)}/publish`, {
      method: 'POST', headers: {authorization: `Bearer ${pending.publishToken}`}, body: JSON.stringify({event}),
    });
    const sticky = parseStickyEvent(event);
    placingNote?.remove(); placingNote = null;
    if (sticky) renderNote(sticky, event);
    elements.placementControls.hidden = true;
    savePending(null);
    elements.editor.textContent = '';
    lastValidEditor = '';
    elements.pay.disabled = false;
    published = true;
    elements.pin.querySelector('span').textContent = 'Pinned';
    status(elements.boardStatus, result.message || 'Your note is pinned.');
    elements.boardStatus.hidden = false;
    setTimeout(() => { elements.boardStatus.hidden = true; }, 3500);
  } catch (error) {
    status(elements.boardStatus, error.message, true);
    elements.boardStatus.hidden = false;
  } finally {
    elements.pin.disabled = published;
  }
}

function closeNoteMenu() {
  elements.noteMenu.hidden = true;
  selectedNoteId = '';
  status(elements.noteMenuStatus, '');
}

function openNoteMenu(eventId, pin) {
  const record = noteEvents.get(eventId);
  if (!record) return;
  selectedNoteId = eventId;
  elements.noteEventId.textContent = eventId;
  elements.notePostedAt.dateTime = new Date(record.event.created_at * 1000).toISOString();
  elements.notePostedAt.textContent = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(record.event.created_at * 1000);
  elements.removeSticky.hidden = getNostrSession()?.pubkey !== record.event.pubkey;
  elements.noteMenu.hidden = false;
  const pinRect = pin.getBoundingClientRect();
  const menuRect = elements.noteMenu.getBoundingClientRect();
  elements.noteMenu.style.left = `${Math.min(innerWidth - menuRect.width - 12, Math.max(12, pinRect.left - menuRect.width / 2))}px`;
  elements.noteMenu.style.top = `${Math.min(innerHeight - menuRect.height - 12, Math.max(12, pinRect.bottom + 8))}px`;
}

async function copySelectedNoteId() {
  if (!selectedNoteId) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(selectedNoteId);
    else {
      const field = document.createElement('textarea');
      field.value = selectedNoteId;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed');
      field.remove();
    }
    elements.copyNoteId.querySelector('span').textContent = 'ID copied';
    setTimeout(() => { elements.copyNoteId.querySelector('span').textContent = 'Copy ID'; }, 1800);
  } catch {
    status(elements.noteMenuStatus, 'Could not copy the event ID.', true);
  }
}

async function startRemovalPayment() {
  try {
    const record = noteEvents.get(selectedNoteId);
    const session = getNostrSession();
    if (!record || !session || record.event.pubkey !== session.pubkey) throw new Error('Only the note author can remove it.');
    await ensureReadySigner();
    elements.removeSticky.disabled = true;
    status(elements.noteMenuStatus, 'Preparing invoice...');
    showPaymentPreparing(STICKY_PRICE_SATS);
    const order = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({pubkey: session.pubkey, action: 'remove', targetEventId: selectedNoteId}),
    });
    const sats = stickyOrderPrice(order);
    savePending({orderId: order.id, action: 'remove', targetEventId: selectedNoteId, sats, status: 'waiting'});
    const railReady = await renderPayment(order);
    if (!railReady && order.checkoutLink) location.assign(order.checkoutLink);
    status(elements.noteMenuStatus, `Waiting for the ${sats}-sat payment...`);
    pollPayment();
  } catch (error) {
    if (elements.paymentDialog.open && !pending?.orderId) elements.paymentDialog.close();
    status(elements.noteMenuStatus, error.message, true);
    elements.removeSticky.disabled = false;
  }
}

async function publishRemoval(resumedEvent = null) {
  try {
    if (!resumedEvent) await ensureReadySigner();
    const template = makeDeletionTemplate({eventId: pending.targetEventId});
    const event = resumedEvent || await signNostrEvent(template, {orderId: pending.orderId, action: 'remove'});
    if (!event) return;
    if (!window.NostrTools.verifyEvent(event)) throw new Error('Your signer returned an invalid deletion event.');
    const result = await api(`/orders/${encodeURIComponent(pending.orderId)}/publish`, {
      method: 'POST', headers: {authorization: `Bearer ${pending.publishToken}`}, body: JSON.stringify({event}),
    });
    processDeletion(event);
    savePending(null);
    closeNoteMenu();
    status(elements.boardStatus, result.message || 'Your note was removed.');
    elements.boardStatus.hidden = false;
    setTimeout(() => { elements.boardStatus.hidden = true; }, 3500);
  } catch (error) {
    const target = elements.noteMenu.hidden ? elements.boardStatus : elements.noteMenuStatus;
    status(target, error.message, true);
    if (target === elements.boardStatus) elements.boardStatus.hidden = false;
  } finally {
    elements.removeSticky.disabled = false;
  }
}

function installBoardNavigation() {
  const pointers = new Map();
  let gesture = null;

  const point = event => ({x: event.clientX, y: event.clientY});
  const distance = () => {
    const [first, second] = [...pointers.values()];
    return Math.hypot(second.x - first.x, second.y - first.y);
  };
  const midpoint = () => {
    const [first, second] = [...pointers.values()];
    return {x: (first.x + second.x) / 2, y: (first.y + second.y) / 2};
  };
  const beginPinch = () => {
    const center = midpoint();
    const rect = elements.board.getBoundingClientRect();
    const localX = center.x - rect.left;
    const localY = center.y - rect.top;
    gesture = {
      pinch: true,
      distance: Math.max(1, distance()),
      scale: boardView.scale,
      worldX: (localX - boardView.x) / boardView.scale,
      worldY: (localY - boardView.y) / boardView.scale,
    };
  };
  const resetPan = () => {
    const [remaining] = pointers.entries();
    if (!remaining) { gesture = null; return; }
    gesture = {id: remaining[0], x: remaining[1].x, y: remaining[1].y, boardX: boardView.x, boardY: boardView.y};
  };

  elements.board.addEventListener('pointerdown', event => {
    if (event.target.closest('.sticky-note')) return;
    closeNoteMenu();
    elements.board.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    elements.board.classList.add('is-panning');
    if (pointers.size === 1) resetPan();
    else if (pointers.size === 2) beginPinch();
  });
  elements.board.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2 && gesture.pinch) {
      const center = midpoint();
      const rect = elements.board.getBoundingClientRect();
      boardView.scale = Math.min(2.5, Math.max(.28, gesture.scale * distance() / gesture.distance));
      boardView.x = center.x - rect.left - gesture.worldX * boardView.scale;
      boardView.y = center.y - rect.top - gesture.worldY * boardView.scale;
    } else if (gesture.id === event.pointerId) {
      boardView.x = gesture.boardX + event.clientX - gesture.x;
      boardView.y = gesture.boardY + event.clientY - gesture.y;
    }
    applyBoardTransform();
  });
  const stop = event => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) resetPan();
    else if (!pointers.size) {
      gesture = null;
      elements.board.classList.remove('is-panning');
    }
  };
  elements.board.addEventListener('pointerup', stop);
  elements.board.addEventListener('pointercancel', stop);
  elements.board.addEventListener('wheel', event => {
    event.preventDefault();
    setZoom(boardView.scale * (event.deltaY < 0 ? 1.12 : .89), event.clientX, event.clientY);
  }, {passive: false});
}

async function handleLogin(method) {
  try {
    status(elements.loginStatus, 'Connecting...');
    if (method === 'extension') await loginWithExtension();
    else if (method === 'amber') { beginAmberLogin(); return; }
    else if (method === 'bunker') await loginWithBunker(elements.bunker.value);
    else if (method === 'anonymous') loginAnonymously();
    else if (method === 'private') {
      loginWithPrivateKey(elements.privateKey.value);
      elements.privateKey.value = '';
    }
    updateAccount();
    elements.login.close();
    if (pending?.status === 'paid') {
      if (pending.action === 'remove') await publishRemoval();
      else beginPlacement();
    } else {
      openComposer();
    }
  } catch (error) { status(elements.loginStatus, error.message, true); }
}

function openComposer() {
  if (!activeGeohash) {
    status(elements.boardChooserStatus, 'Choose a geohash before writing a note.');
    showDialog(elements.boardDialog);
    requestAnimationFrame(() => elements.boardGeohash.focus());
    return;
  }
  const session = getNostrSession();
  if (!session) { showDialog(elements.login); return; }
  composingPubkey = session.pubkey;
  composingGeohash = activeGeohash;
  elements.pay.disabled = false;
  showDialog(elements.composer);
  requestAnimationFrame(() => elements.editor.focus());
}

elements.account.addEventListener('click', () => getNostrSession() ? showDialog(elements.accountDialog) : showDialog(elements.login));
elements.newSticky.addEventListener('click', openComposer);
elements.openBoard.addEventListener('click', () => {
  elements.boardGeohash.value = activeGeohash;
  status(elements.boardChooserStatus, '');
  showDialog(elements.boardDialog);
  requestAnimationFrame(() => elements.boardGeohash.focus());
});
elements.boardChooser.addEventListener('submit', event => {
  event.preventDefault();
  const value = elements.boardGeohash.value.trim().toLowerCase();
  if (!normaliseGeohash(value)) {
    status(elements.boardChooserStatus, 'Enter a valid geohash using 0-9 and b-h, j, k, m, n, p-z.', true);
    return;
  }
  selectBoard(value);
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => handleLogin(button.dataset.login)));
elements.logout.addEventListener('click', () => { logoutNostr(); elements.accountDialog.close(); updateAccount(); });
elements.accountPicture.addEventListener('error', () => { elements.accountPicture.hidden = true; });
elements.colors.addEventListener('click', event => selectColor(event.target.closest('[data-color]')?.dataset.color));
elements.font.addEventListener('click', event => selectFont(event.target.closest('[data-font]')?.dataset.font));
elements.editor.addEventListener('beforeinput', () => { lastValidEditor = elements.editor.textContent; });
elements.editor.addEventListener('input', handleEditorInput);
elements.editor.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); });
elements.pay.addEventListener('click', startPayment);
elements.copyPayment.addEventListener('click', copyPayment);
elements.placementControls.addEventListener('click', event => {
  const rotate = event.target.closest('[data-rotate]');
  if (rotate) setPlacement({...currentPlacement(), rotation: currentPlacement().rotation + Number(rotate.dataset.rotate)});
});
elements.pin.addEventListener('click', () => publishPinnedNote());
elements.zoomOut.addEventListener('click', () => setZoom(boardView.scale - .15));
elements.zoomIn.addEventListener('click', () => setZoom(boardView.scale + .15));
elements.zoomFit.addEventListener('click', fitBoard);
elements.copyNoteId.addEventListener('click', copySelectedNoteId);
elements.removeSticky.addEventListener('click', startRemovalPayment);
document.getElementById('closeNoteMenu').addEventListener('click', closeNoteMenu);
document.addEventListener('pointerdown', event => {
  if (!elements.noteMenu.hidden && !event.target.closest('#noteMenu') && !event.target.closest('.sticky-note__pin')) closeNoteMenu();
});
window.addEventListener('satoshi-nostr-session', updateAccount);
window.addEventListener('beforeunload', () => { try { boardSocket?.close(); } catch {} });
window.addEventListener('resize', () => { if (boardView.scale < .5) fitBoard(); });
setInterval(() => {
  const before = elements.account.getAttribute('aria-label');
  updateAnonymousCountdown();
  const session = getNostrSession();
  const after = session ? `Nostr account: ${sessionLabel(session)}` : 'Log in to Nostr';
  if (before !== after) updateAccount();
}, 1000);

updateAccount();
updateBoardControl();
installBoardNavigation();
requestAnimationFrame(fitBoard);
if (activeGeohash) connectBoard();
else {
  status(elements.boardStatus, 'Choose a geohash to open its corkboard.');
  showDialog(elements.boardDialog);
  requestAnimationFrame(() => elements.boardGeohash.focus());
}
let resumedSigning = false;
try {
  const amber = resumeAmber();
  if (amber?.action === 'login') { updateAccount(); openComposer(); }
  if (amber?.action === 'sign' && pending?.orderId === amber.context?.orderId) {
    resumedSigning = true;
    if (amber.context.action === 'remove') await publishRemoval(amber.event);
    else await publishPinnedNote(amber.event);
  }
} catch (error) {
  status(elements.boardStatus, error.message, true);
}
if (!resumedSigning && pending?.status === 'waiting') {
  if (pending.action === 'remove') {
    status(elements.boardStatus, 'Checking your note-removal payment...');
    elements.boardStatus.hidden = false;
  } else {
    selectColor(pending.color);
    selectFont(pending.font || 'typewriter');
    elements.editor.textContent = pending.content;
    lastValidEditor = pending.content;
    showDialog(elements.composer);
    status(elements.paymentStatus, 'Checking your payment...');
  }
  pollPayment();
} else if (!resumedSigning && pending?.status === 'paid') {
  if (pending.action === 'remove') publishRemoval();
  else beginPlacement();
}
