const SESSION_KEY = 'satoshi:nostr:session:v1';
const BUNKER_KEY = 'satoshi:nostr:bunker:v1';
const ANONYMOUS_KEY = 'satoshi:nostr:anonymous:v1';
const PREVIOUS_SESSION_KEY = 'satoshi:nostr:previous-session:v1';
const AMBER_PREFIX = 'satoshi:nostr:amber:';
const AMBER_MAX_AGE = 30 * 60 * 1000;
// How many unanswered requests of one action stay readable. Android decides which attempt's
// answer arrives, and it is not always the newest one, so a retry must not erase the attempt
// that is still on its way back.
const AMBER_KEPT_REQUESTS = 4;
const AMBER_RESULT_PARAM = 'nostr_signer_result';
const AMBER_ID_PARAM = 'nostr_signer_id';
/**
 * Where a signer's answer may sit. Our own callback ends with `nostr_signer=<id>.`, which is read
 * first; the rest are the names NIP-55 documents and the ones signers use in practice, because
 * the spec leaves that choice to the signer.
 */
const AMBER_RESULT_PARAMS = ['nostr_signer_result', 'result', 'event', 'signature', 'pubkey'];
const AMBER_ID_PARAMS = ['nostr_signer_id', 'id'];
const AMBER_REJECTED_PARAMS = ['rejected', 'nostr_signer_rejected'];
const AMBER_CALLBACK_PARAM = 'nostr_signer';
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

/** Mark the single note this temporary key published without discarding removal access yet. */
export function markAnonymousNotePublished(eventId) {
  const session = readJson(localStorage, SESSION_KEY);
  const saved = readJson(localStorage, ANONYMOUS_KEY);
  const id = String(eventId || '').toLowerCase();
  if (session?.method !== 'anonymous' || saved?.pubkey !== session.pubkey || !/^[0-9a-f]{64}$/.test(id)) {
    return null;
  }
  const nextSaved = {...saved, noteEventId: id};
  localStorage.setItem(ANONYMOUS_KEY, JSON.stringify(nextSaved));
  return saveSession(session.pubkey, 'anonymous', session.profile, {expiresAt: session.expiresAt, noteEventId: id});
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
  // Amber decodes the complete signer URI before it reads its parameters. In current builds,
  // a `?` inside callbackUrl is consequently mistaken for another signer-URI separator and
  // everything after it is lost. A fragment has no such delimiter, survives that parser, and
  // also keeps the returned identity/signature out of HTTP access logs.
  return `${location.origin}${location.pathname}#${AMBER_CALLBACK_PARAM}=${id}.`;
}

function openAmber(type, payload, id, options = {}) {
  const params = new URLSearchParams({type, callbackUrl: amberCallback(id), appName: 'satoshi.si', ...options});
  location.assign(`nostrsigner:${encodeURIComponent(payload)}?${params.toString()}`);
}

function parkAmberRequest(id, state) {
  // A retry must not invalidate an attempt the signer has already finished: Android decides
  // which answer arrives, and not always the newest one. Keep a bounded history of this
  // action's requests so a late answer still finds its record, and let the newest one be what
  // the page reports as in flight.
  const sameAction = [];
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(AMBER_PREFIX)) continue;
    const parked = readJson(localStorage, key);
    const expired = !parked || !Number.isFinite(parked.createdAt) || Date.now() - parked.createdAt > AMBER_MAX_AGE;
    if (expired) {
      localStorage.removeItem(key);
      continue;
    }
    if (parked.action === state.action) sameAction.push({key, createdAt: parked.createdAt});
  }
  sameAction.sort((left, right) => right.createdAt - left.createdAt);
  sameAction.slice(AMBER_KEPT_REQUESTS).forEach(item => localStorage.removeItem(item.key));
  localStorage.setItem(AMBER_PREFIX + id, JSON.stringify({
    ...state,
    createdAt: Date.now(),
    returnPath: `${location.pathname}${location.search || ''}`,
  }));
}

/**
 * Ask Amber for the identity.
 *
 * `copy` sends the request with no callback URL at all, which is the one return path that cannot
 * be lost between two apps: NIP-55 has a signer given no callback copy the result to the clipboard
 * instead, and Amber does exactly that. The reader then hands the value back with the button under
 * the login form.
 */
export function beginAmberLogin({copy = false} = {}) {
  if (!/Android/i.test(navigator.userAgent || '')) throw new Error('Amber login is available on Android.');
  const id = randomId();
  parkAmberRequest(id, {action: 'login', copy});
  if (copy) {
    const params = new URLSearchParams({type: 'get_public_key', appName: 'satoshi.si'});
    location.assign(`nostrsigner:?${params.toString()}`);
    return;
  }
  openAmber('get_public_key', '', id, {permissions: JSON.stringify([{type: 'sign_event', kind: 1}])});
}

/** A login request that was sent without a callback URL is waiting to be handed its value. */
export function amberClipboardPending() {
  const newest = pendingAmberRequest();
  return Boolean(newest && newest.action === 'login' && newest.copy);
}

/**
 * Take the value Amber copied, for a request sent with no callback URL. The request that is still
 * parked decides what is being handed over, never what the clipboard happens to hold.
 */
export async function adoptAmberClipboard() {
  const parked = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(AMBER_PREFIX)) continue;
    const state = readJson(localStorage, key);
    if (!state || !Number.isFinite(state.createdAt) || Date.now() - state.createdAt > AMBER_MAX_AGE) continue;
    parked.push({key, state});
  }
  parked.sort((left, right) => right.state.createdAt - left.state.createdAt);
  const waiting = parked[0];
  if (!waiting) throw new Error('Nothing is waiting for Amber. Start the sign-in again.');
  if (waiting.state.action !== 'login') throw new Error('That request is not a sign-in. Start the sign-in again.');
  if (!navigator.clipboard?.readText) {
    throw new Error('This browser will not let the page read the clipboard. Paste the key into the private key field instead.');
  }
  let text = '';
  try {
    text = (await navigator.clipboard.readText()) || '';
  } catch {
    throw new Error('The browser refused to read the clipboard. Tap again and allow it.');
  }
  const pubkey = text.trim().toLowerCase();
  if (!pubkey) throw new Error('The clipboard is empty. In Amber, copy the key it offered, then tap again.');
  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    throw new Error('That is not a public key. In Amber, copy the key it offered, then tap again.');
  }
  const session = saveSession(pubkey, 'amber');
  localStorage.removeItem(waiting.key);
  return {action: 'login', session};
}

export function beginAmberSigning(template, context = null) {
  const session = getNostrSession();
  if (!session || session.method !== 'amber') throw new Error('Connect Amber first.');
  const id = randomId();
  parkAmberRequest(id, {action: 'sign', template, context});
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
  let newest = null;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(AMBER_PREFIX)) continue;
    const state = readJson(localStorage, key);
    if (!state || !Number.isFinite(state.createdAt) || Date.now() - state.createdAt > AMBER_MAX_AGE) {
      localStorage.removeItem(key);
      index -= 1;
      continue;
    }
    if (!newest || state.createdAt > newest.createdAt) newest = state;
  }
  return newest;
}

/** The requests this browser has in flight; an answer is matched against one of them. */
function parkedAmberRequestIds() {
  const ids = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(AMBER_PREFIX)) ids.push(key.slice(AMBER_PREFIX.length));
  }
  return ids;
}

/**
 * The answer a signer left in this page's URL, or null.
 *
 * NIP-55 promises only that the signer "appends the result" to the callbackUrl, so the parameter
 * name is the signer's choice: the value may follow our own `nostr_signer=<id>.` in the fragment,
 * sit in a documented name like `result`, or arrive beside an echoed `id`. An id is only accepted
 * when it matches a request this page parked, which is what keeps an answer from a stale tab out.
 */
function amberReturn() {
  const chunks = [location.search.replace(/^\?/, ''), location.hash.replace(/^#/, '')].filter(Boolean);
  const pairs = chunks.flatMap(chunk => [...new URLSearchParams(chunk)]).filter(([, value]) => value);
  const parked = parkedAmberRequestIds();
  // Every parameter the answer was read from is recorded, so the page can take the answer out of
  // its own URL afterwards instead of reading the same one again on the next load.
  const used = [];
  const read = names => {
    for (const name of names) {
      const found = pairs.find(([key]) => key === name);
      if (found) {
        used.push(name);
        return found[1];
      }
    }
    return '';
  };
  const rejected = /^(true|1)$/i.test(read(AMBER_REJECTED_PARAMS));

  // An id echoed by name, or a parameter whose whole value is one of our ids.
  let id = read(AMBER_ID_PARAMS);
  if (!parked.includes(id)) id = parked.find(candidate => pairs.some(([, value]) => value === candidate)) || '';
  let result = '';
  for (const [name, value] of pairs) {
    const match = parked.find(candidate => value.startsWith(candidate));
    if (!match) continue;
    used.push(name);
    id = match;
    // What the signer appended behind our own parameter: `#nostr_signer=<id>.<key>`. Callbacks
    // from the previous build, whose id carried the result glued on, land here too.
    result = value.slice(match.length).replace(/^[.:]/, '');
    if (result) break;
  }
  // An id may also sit anywhere in the URL, matched against the requests in flight.
  if (!id) id = parked.find(candidate => location.href.includes(candidate)) || '';
  if (!result) result = read(AMBER_RESULT_PARAMS);
  // A signer that rebuilt the callback URL rather than appending to it leaves the value with no id
  // to match on at all. With exactly one request in flight the answer can only belong to it.
  if (!id && parked.length === 1 && (result || rejected)) id = parked[0];
  if (!id) return null;
  if (!result && !rejected) return null;
  return {id, result, rejected, used};
}

export function resumeAmber() {
  const params = new URLSearchParams(location.search);
  const answer = amberReturn();
  if (!answer) return null;
  const id = answer.id;
  let result = answer.result;
  const key = AMBER_PREFIX + id;
  const state = readJson(localStorage, key);
  if (!state || Date.now() - state.createdAt > AMBER_MAX_AGE) throw new Error('The Amber request expired. Please try again.');
  if (answer.rejected) {
    localStorage.removeItem(key);
    throw new Error(state.action === 'login'
      ? 'Amber refused that request, so nothing was signed in. Try again and approve it in Amber.'
      : 'Amber refused that signature. Your note is still here - pin it again.');
  }
  // Restore the board URL that was open before Android took over. The callback itself cannot
  // carry a query string because of Amber's parser, so it is parked with the request instead.
  params.delete(AMBER_CALLBACK_PARAM);
  params.delete(AMBER_ID_PARAM);
  params.delete(AMBER_RESULT_PARAM);
  // Whatever name the signer chose carries the answer, and leaving it in the URL would let the
  // next load read the same spent answer again.
  answer.used.forEach(name => params.delete(name));
  const fallbackPath = `${location.pathname}${params.size ? `?${params}` : ''}`;
  const returnPath = typeof state.returnPath === 'string' && /^\/[\w./~%-]*(?:\?[^#]*)?$/.test(state.returnPath)
    ? state.returnPath
    : fallbackPath;
  history.replaceState(null, '', returnPath);
  try { result = decodeURIComponent(result); } catch {}
  if (state.action === 'login') {
    const pubkey = result.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      throw new Error(result.trim()
        ? 'Amber did not return a usable key. Try again, or use the key Amber copies to the clipboard.'
        : 'Amber came back without a key. Try again, or use the key Amber copies to the clipboard.');
    }
    const session = saveSession(pubkey, 'amber');
    localStorage.removeItem(key);
    return {action: 'login', session};
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
  // Spend the request only after the return has been rebuilt and verified. Android can open
  // the callback in a second browser/PWA context; a half-read return must not consume it.
  localStorage.removeItem(key);
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
