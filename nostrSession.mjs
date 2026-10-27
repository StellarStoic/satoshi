const SESSION_KEY = 'satoshi:nostr:session:v1';
const BUNKER_KEY = 'satoshi:nostr:bunker:v1';
const ANONYMOUS_KEY = 'satoshi:nostr:anonymous:v1';
const PREVIOUS_SESSION_KEY = 'satoshi:nostr:previous-session:v1';

// The identities this browser has signed in with. Public keys only, and not a secret: they are what
// lets a signer's answer be trusted as the reader's own rather than as whatever was on the clipboard.
const KNOWN_IDENTITIES_KEY = 'satoshi:nostr:known-identities:v1';
const KNOWN_IDENTITIES_MAX = 5;
const AMBER_PREFIX = 'satoshi:nostr:amber:';
const AMBER_MAX_AGE = 30 * 60 * 1000;
// How many unanswered requests of one action stay readable. Android decides which attempt's
// answer arrives, and it is not always the newest one, so a retry must not erase the attempt
// that is still on its way back.
const AMBER_KEPT_REQUESTS = 4;
// What the last clipboard hand-over was, kept past the request that carried it. A request leaves
// storage the moment its value is verified, and the page reloads on the way back from the signer,
// so the parked requests alone cannot say which flow the reader was in when they tap the hand-over
// button again - and a spent signing hand-over then read as a sign-in. Deliberately not under
// AMBER_PREFIX: everything under that prefix is enumerated as a parked request.
const AMBER_HANDOVER_KEY = 'satoshi:nostr:amber-handover:v1';
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

// A private key is a scalar in [1, n-1]. A 64-character hex string outside that range is still
// perfectly good text, so every shape check passes and the curve is the first thing to object --
// with "invalid scalar: out of range", which says nothing a reader can act on. Catch it at entry.
const CURVE_ORDER = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
const BAD_KEY_MESSAGE = 'That private key is not one the curve accepts. Check that it is the whole '
  + '64-character key (or an nsec), and not a public key or a blank value.';

function isSigningScalar(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return false;
  const hex = bytesToHex(bytes);
  if (!/[1-9a-f]/.test(hex)) return false;          // all zeros
  return hex < CURVE_ORDER;                         // equal length, so a string compare is exact
}

/** Whether a stored hex secret is one parseSecret would accept, without throwing. */
function storedSecretIsUsable(hex) {
  const clean = String(hex || '');
  if (!/^[0-9a-f]{64}$/i.test(clean)) return false;
  return isSigningScalar(Uint8Array.from(clean.toLowerCase().match(/.{2}/g), pair => Number.parseInt(pair, 16)));
}

function parseSecret(value) {
  const clean = String(value || '').trim();
  let bytes;
  if (/^nsec1/i.test(clean)) {
    const decoded = tools().nip19.decode(clean.toLowerCase());
    if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) throw new Error('That nsec is not valid.');
    bytes = new Uint8Array(decoded.data);
  } else {
    if (!/^[0-9a-f]{64}$/i.test(clean)) throw new Error('Enter a valid nsec or 64-character private key.');
    bytes = Uint8Array.from(clean.toLowerCase().match(/.{2}/g), pair => Number.parseInt(pair, 16));
  }
  if (!isSigningScalar(bytes)) throw new Error(BAD_KEY_MESSAGE);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function readJson(storage, key) {
  try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
}

function rememberIdentity(pubkey) {
  if (!/^[0-9a-f]{64}$/.test(pubkey || '')) return;
  const known = knownIdentities().filter(value => value !== pubkey);
  known.unshift(pubkey);
  localStorage.setItem(KNOWN_IDENTITIES_KEY, JSON.stringify(known.slice(0, KNOWN_IDENTITIES_MAX)));
}

/** Identities that have signed in on this browser, plus whoever is signed in or was before. */
function knownIdentities() {
  const stored = readJson(localStorage, KNOWN_IDENTITIES_KEY);
  const values = Array.isArray(stored) ? stored.filter(value => /^[0-9a-f]{64}$/.test(value)) : [];
  for (const key of [SESSION_KEY, ANONYMOUS_KEY, PREVIOUS_SESSION_KEY]) {
    const pubkey = readJson(localStorage, key)?.pubkey;
    if (/^[0-9a-f]{64}$/.test(pubkey || '') && !values.includes(pubkey)) values.push(pubkey);
  }
  return values;
}

function saveSession(pubkey, method, profile = null, extra = {}) {
  const session = {pubkey, method, npub: tools().nip19.npubEncode(pubkey), profile: profile || null, ...extra};
  rememberIdentity(pubkey);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent('satoshi-nostr-session', {detail: session}));
  return session;
}

export function getNostrSession() {
  let session = readJson(localStorage, SESSION_KEY);
  if (!session || !/^[0-9a-f]{64}$/.test(session.pubkey) || !session.method) return null;
  if (session.method === 'anonymous' && (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()
      || !storedSecretIsUsable(readJson(localStorage, ANONYMOUS_KEY)?.secret))) {
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

/** A hex pubkey as the npub a reader recognises, from the same tools the session uses. */
export function npubEncode(pubkey) {
  return tools().nip19.npubEncode(pubkey);
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

/**
 * The parameters an Amber intent carries. The app name is stated in this one place: the board's
 * copy on pinstr.si renames it, and a second copy of the literal is a second thing to rename.
 * An empty id means no callback URL, which is how the clipboard route asks for its answer.
 */
function amberParams(type, id, options = {}) {
  const params = new URLSearchParams({type, appName: 'satoshi.si'});
  if (id) params.set('callbackUrl', amberCallback(id));
  for (const [name, value] of Object.entries(options)) params.set(name, value);
  return params;
}

/** What the clipboard holds, or an empty string when this page may not read it. */
async function clipboardText() {
  if (!navigator.clipboard?.readText) return '';
  return (await navigator.clipboard.readText()) || '';
}

/**
 * A fingerprint of a clipboard value, so a later read can tell "the signer copied something" from
 * "this is what the reader had copied already" without this page storing anyone's copied text.
 * FNV-1a over the normalised value is enough for that comparison and cannot be read back.
 */
function clipboardHash(text) {
  const value = String(text).replace(/\s+/g, '').toLowerCase();
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

function openAmber(type, payload, id, options = {}) {
  location.assign(`nostrsigner:${encodeURIComponent(payload)}?${amberParams(type, id, options).toString()}`);
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
    // Read what is already on the clipboard while this tap's user activation is still live. Only its
    // fingerprint is kept, and only for one purpose: it is what stops a later automatic read from
    // adopting a key the reader copied for something else as their identity.
    clipboardText().then(text => {
      const parked = readJson(localStorage, AMBER_PREFIX + id);
      if (!parked) return;
      parked.clipboard = clipboardHash(text);
      localStorage.setItem(AMBER_PREFIX + id, JSON.stringify(parked));
    }).catch(() => {});
    // No id, so no callback URL: the signer copies the result to the clipboard instead of returning it.
    location.assign(`nostrsigner:?${amberParams('get_public_key', '').toString()}`);
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
 * Remember what the last clipboard hand-over was, replacing whatever was remembered before: it
 * describes the most recent one, and an older flow's line must never answer for a newer hand-over.
 * The shape is fixed here, so a record that was written before its outcome was known still reads
 * back with the same fields.
 */
function rememberAmberHandOver(record) {
  localStorage.setItem(AMBER_HANDOVER_KEY, JSON.stringify({
    action: record.action,
    message: record.message || '',
    error: Boolean(record.error),
    createdAt: Date.now(),
  }));
  return readJson(localStorage, AMBER_HANDOVER_KEY);
}

/**
 * The last clipboard hand-over this browser made, or null. It outlives the request that carried it,
 * which is the whole point: the button that hands the value over is tapped again after that request
 * is spent, and this is what says the tap is still the flow the hand-over belonged to.
 */
export function lastAmberHandOver() {
  const record = readJson(localStorage, AMBER_HANDOVER_KEY);
  if (!record || !Number.isFinite(record.createdAt) || Date.now() - record.createdAt > AMBER_MAX_AGE) {
    localStorage.removeItem(AMBER_HANDOVER_KEY);
    return null;
  }
  return record;
}

/**
 * What became of the hand-over the reader just made, in the words the page put in front of them -
 * the desk's refusal, or the note being pinned. Kept with the hand-over itself, so a second tap
 * repeats that line rather than reporting that nothing is waiting.
 */
export function noteAmberHandOverOutcome(message, error = false) {
  const handed = lastAmberHandOver();
  if (!handed) return null;
  return rememberAmberHandOver({...handed, message: message || '', error: Boolean(error)});
}

/**
 * Take the value Amber copied, for a request sent with no callback URL. The request that is still
 * parked decides what is being handed over, never what the clipboard happens to hold.
 */
export async function adoptAmberClipboard({silent = false} = {}) {
  // A silent read is the page finishing a sign-in by itself; it never reports anything, and the
  // request stays parked when it cannot be used, so the button under the form still works.
  const stop = message => {
    if (silent) return null;
    throw new Error(message);
  };
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
  if (!waiting) return stop('Nothing is waiting for Amber. Start the sign-in again.');
  if (waiting.state.action !== 'login') return stop('That request is not a sign-in. Start the sign-in again.');
  if (!navigator.clipboard?.readText) {
    return stop('This browser will not let the page read the clipboard. Paste the key into the private key field instead.');
  }
  let text = '';
  try {
    text = (await navigator.clipboard.readText()) || '';
  } catch {
    return stop('The browser refused to read the clipboard. Tap again and allow it.');
  }
  const pubkey = text.trim().toLowerCase();
  if (!pubkey) return stop('The clipboard is empty. In Amber, copy the key it offered, then tap again.');
  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    return stop('That is not a public key. In Amber, copy the key it offered, then tap again.');
  }
  // An automatic read must not take whatever happened to be on the clipboard, so a value that is
  // unchanged since the request was made is refused - unless it is a key this browser has signed in
  // with, which is the reader's own whatever the clipboard did. That is the ordinary case for a
  // return visit: the same identity is copied again, so the value does not change at all.
  const unchanged = Boolean(waiting.state.clipboard) && waiting.state.clipboard === clipboardHash(pubkey);
  if (silent && unchanged && !knownIdentities().includes(pubkey)) return null;
  const session = saveSession(pubkey, 'amber');
  localStorage.removeItem(waiting.key);
  // A sign-in that has been handed over is remembered as a sign-in: a later tap on the same button
  // must still speak to the sign-in, and never answer for a signature hand-over that came before.
  rememberAmberHandOver({action: 'login'});
  return {action: 'login', session};
}

/**
 * Take the signature Amber copied, for a signing request sent with no callback URL. The same rules
 * as the login hand-over: the request that is still parked decides what is being handed over, never
 * what the clipboard happens to hold, and a silent read never swallows a value the reader copied
 * before asking.
 */
export async function adoptAmberSignature({silent = false, onStatus = null} = {}) {
  // A silent read is the page finishing a signing round trip by itself; it never reports anything,
  // and the request stays parked when it cannot be used, so the button still works. `onStatus` is
  // how even a silent read says where it stopped: the board turns those codes into one line the
  // reader can see, because a round trip between two apps has to be diagnosable from the page and not
  // from a log nobody on a phone can open. It never changes what the read returns.
  const report = (code, message) => {
    if (typeof onStatus === 'function') onStatus(code, message);
  };
  const stop = (code, message) => {
    report(code, message);
    if (silent) return null;
    throw new Error(message);
  };
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
  if (!waiting) return stop('no-request', 'Nothing is waiting for Amber. Start the signing again.');
  if (waiting.state.action !== 'sign' || !waiting.state.copy) {
    return stop('not-handoff', 'That request is not a signing hand-off. Start the signing again.');
  }
  if (!navigator.clipboard?.readText) {
    return stop('no-api', 'This browser will not let the page read the clipboard. Pin the note again to sign it.');
  }
  let text = '';
  try {
    text = (await navigator.clipboard.readText()) || '';
  } catch {
    return stop('refused', 'The browser refused to read the clipboard. Tap again and allow it.');
  }
  const signature = text.trim();
  if (!signature) {
    return stop('empty', 'The clipboard is empty. In Amber, approve the note and copy the signature it offered, then tap again.');
  }
  // Amber overwrites the clipboard, so a read that still carries the sentinel this page wrote before
  // handing off has not been answered yet: it is not this signature, however valid it looks. A
  // sentinel is never adopted, by a silent read or by the reader's own tap - it is a marker, not a
  // signature. Older parked requests carry a fingerprint of the clipboard instead of the sentinel;
  // both are honoured for the silent read, and only the sentinel is refused to a tap as well.
  const sentinel = waiting.state.sentinel;
  const planted = sentinel || waiting.state.clipboard;
  const unchanged = Boolean(planted) && planted === clipboardHash(signature);
  if (unchanged) {
    if (silent) {
      report('waiting', 'Amber has not replaced the clipboard with its signature yet.');
      return null;
    }
    if (sentinel && sentinel === clipboardHash(signature)) {
      return stop('waiting', 'Amber has not put its signature on the clipboard yet. Approve the note in Amber, then tap again.');
    }
  } else {
    // Something other than this page's own marker is on the clipboard. That is the moment the round
    // trip may be about to finish, so it is worth saying the read is happening.
    report('copied', 'A value Amber could have copied is on the clipboard.');
  }
  let event;
  try {
    event = signedEventFrom(waiting.state, signature, getNostrSession());
  } catch (error) {
    return stop('invalid', error.message);
  }
  // Spend the request only after the return has been rebuilt and verified, exactly as the callback
  // route does: a half-read return must not consume the attempt still on its way back. And spend it
  // only if it is *still* parked, because two reads of one clipboard can overlap - a poll tick and
  // the reader's tap - and the signature is compact and identical in both: the read that no longer
  // finds the request is the loser, and it hands back nothing rather than a second copy of an answer
  // that is already on its way to the desk.
  if (localStorage.getItem(waiting.key) === null) {
    return stop('spent', 'That signature was already handed over.');
  }
  localStorage.removeItem(waiting.key);
  // Remembered as a signature hand-over, because from here on the request that carried it is gone:
  // this is what a second tap on the button reads, before the note's own outcome is even known.
  rememberAmberHandOver({action: 'sign'});
  return {action: 'sign', event, context: waiting.state.context};
}

/**
 * Ask Amber to sign an event.
 *
 * `copy` is the same route beginAmberLogin's copy takes for an identity: the request is sent with no
 * callback URL at all, so NIP-55 has the signer copy the signature to the clipboard instead of
 * returning it. That is the one return path Android cannot drop between the two apps - the callback
 * needs a main-thread Activity context on Amber's side that is not always there - and Amber shows
 * the ordinary "wants you to sign a short text note" flow either way.
 */
export function beginAmberSigning(template, context = null, {copy = false} = {}) {
  const session = getNostrSession();
  if (!session || session.method !== 'amber') throw new Error('Connect Amber first.');
  const id = randomId();
  parkAmberRequest(id, {action: 'sign', template, context, copy});
  if (copy) {
    // A fresh random sentinel goes on the clipboard *before* Amber is opened, while this tap's user
    // activation is still live. Amber answers by copying, which replaces whatever is there, so a read
    // that still carries this sentinel has not been answered yet - and a signature the reader copied
    // for something else can never be mistaken for this note's. This replaces the earlier "fingerprint
    // whatever is already copied" guard, whose async read could be cancelled by the very navigation to
    // the signer that follows it, so nothing was recorded at all. Only a hash of the sentinel is kept.
    const sentinel = `amber-waiting:${randomId()}`;
    const parked = readJson(localStorage, AMBER_PREFIX + id);
    if (parked) {
      parked.sentinel = clipboardHash(sentinel);
      localStorage.setItem(AMBER_PREFIX + id, JSON.stringify(parked));
    }
    navigator.clipboard?.writeText?.(sentinel)?.catch?.(() => {});
    // No id, so no callback URL: the signer copies the signature to the clipboard instead of
    // returning it. The exact unsigned event is parked above, so the page can rebuild and verify the
    // signed event from the template while the signature travels on its own.
    location.assign(`nostrsigner:${encodeURIComponent(JSON.stringify(template))}?${amberParams('sign_event', '', {current_user: session.pubkey, returnType: 'signature', compressionType: 'none'}).toString()}`);
    return;
  }
  // Returning the whole event can turn a long note and its tags into a callback URL large
  // enough for Android to drop. The signature is compact; the exact unsigned event is already
  // parked above, so the page can rebuild and verify the signed event when Amber returns.
  openAmber('sign_event', JSON.stringify(template), id, {current_user: session.pubkey, returnType: 'signature', compressionType: 'none'});
}

/** A signing request that was sent without a callback URL is waiting to be handed its signature. */
export function amberSignaturePending() {
  const newest = pendingAmberRequest();
  return Boolean(newest && newest.action === 'sign' && newest.copy);
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

/**
 * The signed event a signer's answer stands for, rebuilt from the parked template and verified.
 *
 * The signature is compact, so the exact unsigned event parked with the request is what the signed
 * event is rebuilt from - and the answer is only trusted once it verifies against the pubkey this
 * browser knows. Both the callback return and the clipboard hand-over come through here, so the two
 * routes cannot drift apart.
 */
function signedEventFrom(state, result, session) {
  const clean = String(result || '').trim();
  let event = null;
  let signature = /^[0-9a-f]{128}$/i.test(clean) ? clean.toLowerCase() : '';
  if (!signature) {
    // A signer may hand the signature back on its own, wrapped in JSON (`{"sig": "..."}`), or as a
    // whole event. Both carry a 128-hex `.sig`; only a full event also carries the id and pubkey that
    // let it be trusted exactly as it came, which is what tells the two shapes apart.
    let parsed;
    try { parsed = JSON.parse(clean); } catch { throw new Error('Amber did not return a usable signature. Please pin again.'); }
    if (parsed && typeof parsed === 'object' && typeof parsed.sig === 'string'
        && /^[0-9a-f]{128}$/i.test(parsed.sig) && (!parsed.id || !parsed.pubkey)) {
      signature = parsed.sig.toLowerCase();
    } else {
      event = parsed;
      // Full-event replies created by the previous version remain usable while their request is
      // still inside the thirty-minute return window.
      if (!event || typeof event !== 'object') throw new Error('Amber did not return a usable signature. Please pin again.');
    }
  }
  if (signature) {
    if (!session?.pubkey || !state.template) throw new Error('The Amber signing session could not be restored. Please pin again.');
    const unsigned = {...state.template, pubkey: session.pubkey};
    event = {...unsigned, id: tools().getEventHash(unsigned), sig: signature};
  }
  if (!tools().verifyEvent(event) || event.pubkey !== session?.pubkey) throw new Error('Amber returned an invalid signed event.');
  return event;
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
  const session = getNostrSession();
  const event = signedEventFrom(state, result, session);
  // Spend the request only after the return has been rebuilt and verified. Android can open
  // the callback in a second browser/PWA context; a half-read return must not consume it.
  localStorage.removeItem(key);
  return {action: 'sign', event, context: state.context};
}

/**
 * The relays a NIP-46 connection is offered on. One belongs to this project, so a signer that can
 * reach it needs nothing else; the other is a widely used public relay, because a phone that cannot
 * reach ours must still be able to answer.
 */
const NOSTR_CONNECT_RELAYS = ['wss://nostr.satoshi.si', 'wss://relay.damus.io'];
// The invitation this page has already given a signer. It is kept so a reload while the reader is
// still enrolling in Amber can wait on the same client key and secret instead of minting a second
// one. Ten minutes: long enough to walk Amber's own screens, short enough that a stale offer is never
// resumed. A spent invitation is removed, so every fresh attempt carries a new secret.
const NOSTR_CONNECT_KEY = 'satoshi:nostr:nostrconnect:v1';
const NOSTR_CONNECT_MAX_AGE = 10 * 60 * 1000;

/** The invitation this page has already given a signer, if it is still worth waiting on. */
export function pendingNostrConnect() {
  const saved = readJson(localStorage, NOSTR_CONNECT_KEY);
  if (!saved?.uri || !/^[0-9a-f]{64}$/.test(String(saved.clientSecret || '')) || !Array.isArray(saved.relays)) return null;
  if (!Number.isFinite(saved.createdAt) || Date.now() - saved.createdAt > NOSTR_CONNECT_MAX_AGE) {
    localStorage.removeItem(NOSTR_CONNECT_KEY);
    return null;
  }
  return saved;
}

/**
 * Wait for a signer to answer one invitation.
 *
 * The client keypair is the page's own throwaway one, so the reader's identity never reaches this
 * side: the signer only sees a request encrypted to that key. The finished connection is stored in
 * the same shape a `bunker://` link produces, which is what lets later visits reconnect with no code
 * at all. The invitation leaves storage as soon as the wait ends - answered, cancelled or expired -
 * so a spent one is never resumed and a new attempt always carries a new secret.
 */
function awaitNostrConnect(clientSecret, uri, relays, timeout) {
  const storedParams = new URLSearchParams();
  relays.forEach(relay => storedParams.append('relay', relay));
  let signer = null;
  let cancelled = false;
  let timer = 0;
  const promise = new Promise((resolve, reject) => {
    // A code nobody scans would otherwise hold a subscription open for the life of the page, so the
    // offer expires on its own and says so.
    timer = setTimeout(() => {
      cancelled = true;
      localStorage.removeItem(NOSTR_CONNECT_KEY);
      try { signer?.close?.(); } catch {}
      reject(new Error('Amber did not answer. Show a new code and try again.'));
    }, timeout);
    window.NostrBunker.BunkerSigner.fromURI(clientSecret, uri, {
      onauth: url => window.open(url, '_blank', 'noopener,noreferrer'),
    }).then(connected => {
      signer = connected;
      if (cancelled) {
        try { connected.close?.(); } catch {}
        throw new Error('The code was closed before it was answered.');
      }
      return connected.getPublicKey();
    }).then(pubkey => {
      clearTimeout(timer);
      localStorage.removeItem(NOSTR_CONNECT_KEY);
      localStorage.setItem(BUNKER_KEY, JSON.stringify({
        url: `bunker://${pubkey}?${storedParams.toString()}`,
        clientSecret: bytesToHex(clientSecret),
      }));
      bunkerSigner = signer;
      clientSecret.fill(0);
      resolve(saveSession(pubkey, 'bunker'));
    }).catch(error => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
      localStorage.removeItem(NOSTR_CONNECT_KEY);
      try { signer?.close?.(); } catch {}
    },
  };
}

/**
 * Start a NIP-46 connection a signer walks into from a code, or from an invitation handed to the
 * signer app on the same phone.
 *
 * This is the route for a browser with no signer app to hand a `nostrsigner:` intent to: a desktop
 * can show a code, and Amber on a phone can read it. The page makes its own throwaway client keypair
 * and the finished connection is stored in the same shape a `bunker://` link produces, which is what
 * lets later visits reconnect with no code at all.
 */
export function beginNostrConnect({relays = NOSTR_CONNECT_RELAYS, timeout = 5 * 60 * 1000} = {}) {
  if (!window.NostrBunker?.BunkerSigner?.fromURI) throw new Error('Nostr connect tools did not load.');
  const clientSecret = tools().generateSecretKey();
  const params = new URLSearchParams();
  relays.forEach(relay => params.append('relay', relay));
  const secret = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  params.set('secret', secret);
  // The name the signer shows its reader is this page's own host, so an origin serving the same board
  // under another name is never mislabelled as the other one.
  params.set('name', location.host);
  params.set('url', `${location.origin}${location.pathname}`);
  params.set('perms', 'get_public_key,sign_event:1');
  // getPublicKey already answers in hex, so this is not encoded again.
  const uri = `nostrconnect://${tools().getPublicKey(clientSecret)}?${params.toString()}`;
  // Recorded before it is handed over: a reload while the reader is still in Amber finds the same
  // client key and secret and keeps waiting, rather than abandoning an invitation Amber already holds.
  localStorage.setItem(NOSTR_CONNECT_KEY, JSON.stringify({
    uri, clientSecret: bytesToHex(clientSecret), secret, relays, createdAt: Date.now(),
  }));
  return {uri, ...awaitNostrConnect(clientSecret, uri, relays, timeout)};
}

/** Keep waiting on the invitation already given to a signer, after a reload. */
export function resumeNostrConnect({timeout = 5 * 60 * 1000} = {}) {
  if (!window.NostrBunker?.BunkerSigner?.fromURI) throw new Error('Nostr connect tools did not load.');
  const saved = pendingNostrConnect();
  if (!saved) throw new Error('There is no connection waiting for Amber.');
  // The secret is the one inside the saved URI - the signer echoes it back - so it is decoded, never
  // minted again: a second secret would make the signer's answer fail the handshake.
  const clientSecret = Uint8Array.from(saved.clientSecret.match(/.{2}/g), pair => Number.parseInt(pair, 16));
  return {uri: saved.uri, ...awaitNostrConnect(clientSecret, saved.uri, saved.relays, timeout)};
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
  if (session.method === 'telegram') {
    return globalThis.PinstrTelegramSigner?.pubkey === session.pubkey
      && typeof globalThis.PinstrTelegramSigner?.signEvent === 'function';
  }
  if (session.method === 'amber') return /Android/i.test(navigator.userAgent || '');
  if (session.method === 'anonymous') {
    const saved = readJson(localStorage, ANONYMOUS_KEY);
    return saved?.pubkey === session.pubkey && saved?.expiresAt > Date.now() && storedSecretIsUsable(saved.secret);
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
  if (session.method === 'telegram') {
    const signer = globalThis.PinstrTelegramSigner;
    if (!signer || signer.pubkey !== session.pubkey || typeof signer.signEvent !== 'function') {
      throw new Error('Sign in with Telegram again to sign this note.');
    }
    return signer.signEvent(template);
  }
  if (session.method === 'private') {
    if (!privateSecret) throw new Error('Enter your private key again to sign. It was not saved by this site.');
    return tools().finalizeEvent(template, privateSecret);
  }
  if (session.method === 'bunker') {
    if (!await signerReady()) throw new Error('Reconnect your bunker to sign.');
    return bunkerSigner.signEvent(template);
  }
  if (session.method === 'amber') {
    // Sent without a callback on purpose. Amber's return through the callback URL is dropped between
    // the two apps on Android - the signature gets made, Amber closes, and the page is never told -
    // so a signing request goes out the way signing in already goes: without a callback, Amber copies
    // the signature, and the board reads it when the reader comes back.
    beginAmberSigning(template, context, {copy: true});
    return null;
  }
  if (session.method === 'anonymous') {
    const saved = readJson(localStorage, ANONYMOUS_KEY);
    if (!saved || saved.pubkey !== session.pubkey || saved.expiresAt <= Date.now()
        || !storedSecretIsUsable(saved.secret)) {
      throw new Error('This temporary identity has expired. Create a new anonymous identity.');
    }
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
