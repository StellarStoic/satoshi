const SESSION_KEY = 'satoshi:nostr:session:v1';
const BUNKER_KEY = 'satoshi:nostr:bunker:v1';
const ANONYMOUS_KEY = 'satoshi:nostr:anonymous:v1';
const PREVIOUS_SESSION_KEY = 'satoshi:nostr:previous-session:v1';
const AMBER_PREFIX = 'satoshi:nostr:amber:';
const AMBER_MAX_AGE = 30 * 60 * 1000;
const AMBER_RESULT_PARAM = 'nostr_signer_result';
const AMBER_ID_PARAM = 'nostr_signer_id';
export const ANONYMOUS_SESSION_MS = 24 * 60 * 60 * 1000;
let privateSecret = null;
let bunkerSigner = null;

function tools() {
  if (!window.NostrTools) throw new Error('Nostr tools did not load.');
  return window.NostrTools;
}

function parseSecret(value) {
  const clean = String(value || '').trim();
  if (/^nsec1/i.test(clean)) {
    const decoded = tools().nip19.decode(clean.toLowerCase());
    if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) throw new Error('That nsec is not valid.');
    return new Uint8Array(decoded.data);
  }
  if (!/^[0-9a-f]{64}$/i.test(clean)) throw new Error('Enter a valid nsec or 64-character private key.');
  return Uint8Array.from(clean.match(/.{2}/g), pair => Number.parseInt(pair, 16));
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}

function saveSession(pubkey, method, profile = null, extra = {}) {
  const session = {pubkey, method, npub: tools().nip19.npubEncode(pubkey), profile: profile || null, ...extra};
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent('satoshi-nostr-session', {detail: session}));
  return session;
}

export function getNostrSession() {
  let session = readJson(localStorage, SESSION_KEY);
  if (!session || !/^[0-9a-f]{64}$/.test(session.pubkey) || !session.method) return null;
  if (session.method === 'anonymous' && (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now())) {
    localStorage.removeItem(ANONYMOUS_KEY);
    session = readJson(localStorage, PREVIOUS_SESSION_KEY);
    localStorage.removeItem(PREVIOUS_SESSION_KEY);
    if (session?.pubkey && session?.method) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }
  return session;
}

/**
 * The session parked while a temporary identity is in use, or null. Logging out of the
 * temporary identity restores it, so this is what a "switch back" affordance names — and
 * that a real signer is waiting behind a throwaway one is something the page has to say
 * out loud rather than discover at the next payment.
 */
export function parkedSession() {
  const session = readJson(localStorage, PREVIOUS_SESSION_KEY);
  if (!session || !/^[0-9a-f]{64}$/.test(session.pubkey) || !session.method) return null;
  return session;
}

export function loginAnonymously() {
  const current = getNostrSession();
  if (current?.method === 'anonymous' && current.expiresAt > Date.now()) return current;
  if (current) localStorage.setItem(PREVIOUS_SESSION_KEY, JSON.stringify(current));
  const secret = tools().generateSecretKey();
  const pubkey = tools().getPublicKey(secret);
  const expiresAt = Date.now() + ANONYMOUS_SESSION_MS;
  localStorage.setItem(ANONYMOUS_KEY, JSON.stringify({pubkey, secret: bytesToHex(secret), expiresAt}));
  secret.fill(0);
  return saveSession(pubkey, 'anonymous', {name: 'Anonymous'}, {expiresAt});
}

export function updateNostrProfile(pubkey, profile) {
  const session = getNostrSession();
  if (!session || session.pubkey !== pubkey || session.method === 'anonymous') return session;
  return saveSession(session.pubkey, session.method, profile, session.expiresAt ? {expiresAt: session.expiresAt} : {});
}

export function shortNpub(npub) {
  return `${npub.slice(0, 9)}...${npub.slice(-5)}`;
}

export async function loginWithExtension() {
  if (!window.nostr?.getPublicKey || !window.nostr?.signEvent) throw new Error('No Nostr browser extension was found.');
  const pubkey = await window.nostr.getPublicKey();
  if (!/^[0-9a-f]{64}$/.test(pubkey)) throw new Error('The extension returned an invalid public key.');
  return saveSession(pubkey, 'extension');
}

export function loginWithPrivateKey(value) {
  const secret = parseSecret(value);
  privateSecret?.fill?.(0);
  privateSecret = secret;
  return saveSession(tools().getPublicKey(secret), 'private');
}

function randomId() {
  return crypto.randomUUID?.() || bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

function amberCallback(id) {
  // NIP-55 signers append the encoded result to the callback URL verbatim. The result slot
  // therefore has to be the final part of the URL; putting an id or fragment after it makes
  // Amber append the answer somewhere the page cannot read as the result.
  const params = new URLSearchParams({[AMBER_ID_PARAM]: id});
  return `${location.origin}${location.pathname}?${params.toString()}&${AMBER_RESULT_PARAM}=`;
}

function openAmber(type, payload, id, options = {}) {
  const params = new URLSearchParams({type, callbackUrl: amberCallback(id), ...options});
  location.assign(`nostrsigner:${encodeURIComponent(payload)}?${params.toString()}`);
}

export function beginAmberLogin() {
  if (!/Android/i.test(navigator.userAgent || '')) throw new Error('Amber login is available on Android.');
  const id = randomId();
  localStorage.setItem(AMBER_PREFIX + id, JSON.stringify({createdAt: Date.now(), action: 'login'}));
  openAmber('get_public_key', '', id, {permissions: JSON.stringify([{type: 'sign_event', kind: 1}])});
}

export function beginAmberSigning(template, context = null) {
  const session = getNostrSession();
  if (!session || session.method !== 'amber') throw new Error('Connect Amber first.');
  const id = randomId();
  localStorage.setItem(AMBER_PREFIX + id, JSON.stringify({createdAt: Date.now(), action: 'sign', template, context}));
  // Returning the whole event can turn a long note and its tags into a callback URL large
  // enough for Android to drop. The signature is compact; the exact unsigned event is already
  // parked above, so the page can rebuild and verify the signed event when Amber returns.
  openAmber('sign_event', JSON.stringify(template), id, {current_user: session.pubkey, returnType: 'signature', compressionType: 'none'});
}

/**
 * A signing request that was never answered, or null. A round trip that does not come back
 * — the signer app reopened instead of returned to — leaves its request parked and throws
 * nothing, so this is how the page knows a signature was asked for and never arrived.
 */
export function pendingAmberRequest() {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(AMBER_PREFIX)) continue;
    const state = readJson(localStorage, key);
    if (!state || !Number.isFinite(state.createdAt)) continue;
    if (Date.now() - state.createdAt > AMBER_MAX_AGE) continue;
    return state;
  }
  return null;
}

export function resumeAmber() {
  const params = new URLSearchParams(location.search);
  const fragment = location.hash.match(/^#nostr_signer=([a-z0-9-]+)\.(.*)$/i);
  // An answer arrives in one of two shapes: the query NIP-55 specifies, or the fragment this
  // page used to ask for. A signer that follows only one of them must still get through.
  const id = fragment?.[1] || params.get(AMBER_ID_PARAM) || '';
  const inQuery = fragment ? '' : params.get(AMBER_RESULT_PARAM);
  if (!id || !fragment && !inQuery) return null;
  // The query is dropped with the fragment: the answer must not be read twice.
  history.replaceState(null, '', location.pathname);
  const key = AMBER_PREFIX + id;
  const state = readJson(localStorage, key);
  localStorage.removeItem(key);
  if (!state || Date.now() - state.createdAt > AMBER_MAX_AGE) throw new Error('The Amber request expired. Please try again.');
  let result = fragment ? fragment[2] : inQuery;
  if (fragment) { try { result = decodeURIComponent(result); } catch {} }
  if (state.action === 'login') {
    const pubkey = result.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(pubkey)) throw new Error('Amber returned an invalid public key.');
    return {action: 'login', session: saveSession(pubkey, 'amber')};
  }
  const clean = result.trim();
  const session = getNostrSession();
  let event;
  if (/^[0-9a-f]{128}$/i.test(clean)) {
    if (!session?.pubkey || !state.template) throw new Error('The Amber signing session could not be restored. Please pin again.');
    const unsigned = {...state.template, pubkey: session.pubkey};
    event = {...unsigned, id: tools().getEventHash(unsigned), sig: clean.toLowerCase()};
  } else {
    // Full-event replies created by the previous version remain usable while their request is
    // still inside the thirty-minute return window.
    try { event = JSON.parse(clean); } catch { throw new Error('Amber did not return a usable signature. Please pin again.'); }
  }
  if (!tools().verifyEvent(event) || event.pubkey !== session?.pubkey) throw new Error('Amber returned an invalid signed event.');
  return {action: 'sign', event, context: state.context};
}

async function connectBunker(saved) {
  if (!window.NostrBunker) throw new Error('Nostr bunker tools did not load.');
  const pointer = await window.NostrBunker.parseBunkerInput(saved.url);
  if (!pointer?.pubkey || !pointer.relays?.length) throw new Error('Enter a bunker:// link with at least one relay.');
  const clientSecret = Uint8Array.from(saved.clientSecret.match(/.{2}/g), pair => Number.parseInt(pair, 16));
  const signer = window.NostrBunker.BunkerSigner.fromBunker(clientSecret, pointer, {
    onauth: url => window.open(url, '_blank', 'noopener,noreferrer'),
  });
  await signer.connect({name: 'satoshi.si', url: location.origin + '/stickyNotes.html'});
  bunkerSigner = signer;
  return signer;
}

async function persistentBunkerUrl(url) {
  const pointer = await window.NostrBunker.parseBunkerInput(url);
  if (!pointer?.pubkey || !pointer.relays?.length) throw new Error('Enter a bunker:// link with at least one relay.');
  const params = new URLSearchParams();
  pointer.relays.forEach(relay => params.append('relay', relay));
  return `bunker://${pointer.pubkey}?${params.toString()}`;
}

export async function loginWithBunker(url) {
  const clean = String(url || '').trim();
  if (!clean.startsWith('bunker://')) throw new Error('Enter a valid bunker:// connection link.');
  const clientSecret = tools().generateSecretKey();
  const saved = {url: clean, clientSecret: bytesToHex(clientSecret)};
  clientSecret.fill(0);
  const signer = await connectBunker(saved);
  const pubkey = await signer.getPublicKey();
  // The optional bunker secret is a one-use invitation. Keep the established
  // client keypair, but discard that invitation before persisting the session.
  saved.url = await persistentBunkerUrl(clean);
  localStorage.setItem(BUNKER_KEY, JSON.stringify(saved));
  return saveSession(pubkey, 'bunker');
}

/**
 * The bunker connection this browser saved, or null. It carries the client keypair the
 * service authorized, which is what makes connecting again possible without the link.
 */
export function savedBunker() {
  const saved = readJson(localStorage, BUNKER_KEY);
  if (!saved?.url || !/^[0-9a-f]{64}$/.test(String(saved.clientSecret || ''))) return null;
  return saved;
}

/**
 * Come back in with the bunker this browser already knows. A bunker:// link is usually a
 * one-use invitation, and the client keypair the service authorized is the saved one — so a
 * reader who signs out must not lose the ability to connect, because the page may never be
 * handed that link a second time.
 */
export async function reconnectBunker() {
  const saved = savedBunker();
  if (!saved) throw new Error('No bunker connection is saved in this browser.');
  const signer = await connectBunker(saved);
  return saveSession(await signer.getPublicKey(), 'bunker');
}

export async function signerReady() {
  const session = getNostrSession();
  if (!session) return false;
  if (session.method === 'private') return Boolean(privateSecret);
  if (session.method === 'extension') return Boolean(window.nostr?.signEvent);
  if (session.method === 'amber') return /Android/i.test(navigator.userAgent || '');
  if (session.method === 'anonymous') {
    const saved = readJson(localStorage, ANONYMOUS_KEY);
    return saved?.pubkey === session.pubkey && saved?.expiresAt > Date.now() && /^[0-9a-f]{64}$/.test(saved.secret || '');
  }
  if (session.method === 'bunker') {
    if (bunkerSigner) return true;
    const saved = readJson(localStorage, BUNKER_KEY);
    if (!saved?.url || !saved?.clientSecret) return false;
    await connectBunker(saved);
    return true;
  }
  return false;
}

export async function signNostrEvent(template, context = null) {
  const session = getNostrSession();
  if (!session) throw new Error('Log in to Nostr first.');
  if (session.method === 'extension') return window.nostr.signEvent(template);
  if (session.method === 'private') {
    if (!privateSecret) throw new Error('Enter your private key again to sign. It was not saved by this site.');
    return tools().finalizeEvent(template, privateSecret);
  }
  if (session.method === 'bunker') {
    if (!await signerReady()) throw new Error('Reconnect your bunker to sign.');
    return bunkerSigner.signEvent(template);
  }
  if (session.method === 'amber') {
    beginAmberSigning(template, context);
    return null;
  }
  if (session.method === 'anonymous') {
    const saved = readJson(localStorage, ANONYMOUS_KEY);
    if (!saved || saved.pubkey !== session.pubkey || saved.expiresAt <= Date.now()) throw new Error('This temporary identity has expired. Create a new anonymous identity.');
    const secret = parseSecret(saved.secret);
    try { return tools().finalizeEvent(template, secret); } finally { secret.fill(0); }
  }
  throw new Error('This signer is not supported.');
}

export function logoutNostr() {
  const session = readJson(localStorage, SESSION_KEY);
  privateSecret?.fill?.(0);
  privateSecret = null;
  bunkerSigner?.close?.().catch(() => {});
  bunkerSigner = null;
  if (session?.method === 'anonymous') {
    localStorage.removeItem(ANONYMOUS_KEY);
    const previous = readJson(localStorage, PREVIOUS_SESSION_KEY);
    localStorage.removeItem(PREVIOUS_SESSION_KEY);
    if (previous?.pubkey && previous?.method) localStorage.setItem(SESSION_KEY, JSON.stringify(previous));
    else localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent('satoshi-nostr-session', {detail: previous || null}));
    return;
  }
  localStorage.removeItem(SESSION_KEY);
  // The bunker connection stays. It holds the client keypair the service authorized — a
  // connection that cannot simply be re-created — and the link is usually a one-use
  // invitation, so signing out must not cost the reader their way back in. Connecting a
  // different bunker replaces it.
  localStorage.removeItem(PREVIOUS_SESSION_KEY);
  window.dispatchEvent(new CustomEvent('satoshi-nostr-session', {detail: null}));
}
