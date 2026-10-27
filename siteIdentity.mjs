/**
 * siteIdentity — one answer to "who is this reader, and can this page ask them to sign?"
 *
 * The site already had a single identity: `nostrSession.mjs` owns six ways to sign in (browser extension,
 * pasted key, a throwaway identity, Amber, a bunker, the Telegram app) and writes all of them to one
 * origin-wide record. What it did not have was a way to *use* that from a page that does not already carry
 * the two vendor bundles — 246 KB of nostr-tools and 74 KB of bunker — or a single place that owns the
 * awkward part: three of the six methods cannot answer inside the call that asks them.
 *
 *   - an extension, a pasted key or a Telegram app sign and return the event;
 *   - Amber opens, and the signature arrives later through the clipboard;
 *   - a bunker waits on a relay wake-up that may outlive the tap.
 *
 * Every page used to re-implement that difference, and the ones that did not simply could not sign with
 * Amber (the BTC Map review form shipped that way). So:
 *
 *   readIdentity()          who is signed in, with nothing loaded and nothing to import
 *   signOrHandOver(tpl)     ask for a signature; returns {event} or {pending} and never throws the dance at you
 *   resumeHandOver()        call on load: finishes an Amber hand-over that happened while you were away
 *   onIdentityChange(cb)    fires when the reader signs in or out, including in another tab
 *
 * Nothing here is loaded until asked for: importing this module costs a few kilobytes, and the two vendor
 * bundles are injected only on the first signing attempt.
 */

/** The record `nostrSession.mjs` writes. One string, in one place, because two would drift. */
export const SESSION_KEY = 'satoshi:nostr:session:v1';
const ANONYMOUS_KEY = 'satoshi:nostr:anonymous:v1';
const SESSION_EVENT = 'satoshi-nostr-session';

const TOOLS_SRC = '/stego/vendor/nostr-tools.bundle.js';
const BUNKER_SRC = '/stego/vendor/nostr-bunker.bundle.js';

const HEX64 = /^[0-9a-f]{64}$/;

function readJson(store, key) {
  try {
    const raw = store?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * The identity this browser is signed in as, or null.
 *
 * This reads the same record the session module writes and checks the same things it checks — a 64-hex
 * pubkey and a known method — because a page that only wants to *show* who is signed in should not have to
 * load a signer to find out. A throwaway identity that has expired is reported as nobody, which is what the
 * session module would also conclude.
 */
export function readIdentity(store = globalThis.localStorage) {
  const session = readJson(store, SESSION_KEY);
  if (!session || !HEX64.test(String(session.pubkey || '')) || !session.method) return null;
  if (session.method === 'anonymous') {
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null;
    const saved = readJson(store, ANONYMOUS_KEY);
    if (!saved || saved.pubkey !== session.pubkey || !saved.secret) return null;
  }
  return session;
}

/** A short name for the identity: the profile's name, else the npub, else a fragment of the key. */
export function identityLabel(session = readIdentity()) {
  if (!session) return '';
  const name = String(session.profile?.display_name || session.profile?.name || '').trim();
  if (name) return name;
  const npub = String(session.npub || '');
  if (npub) return `${npub.slice(0, 9)}…${npub.slice(-5)}`;
  return `${String(session.pubkey).slice(0, 10)}…`;
}

let bundlePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => resolve(), {once: true});
    script.addEventListener('error', () => reject(new Error(`Could not load ${src.split('/').pop()}`)), {once: true});
    document.head.append(script);
  });
}

/**
 * The two vendor bundles, injected once and on demand.
 *
 * `nostr-tools` is needed by every method that signs in this page; `nostr-bunker` only by the remote-signer
 * ones, so it is skipped when the page is already past that point and the identity is local.
 */
export function ensureBundles({bunker = true} = {}) {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      if (!globalThis.window?.NostrTools) await loadScript(TOOLS_SRC);
      if (bunker && !globalThis.window?.NostrBunker) await loadScript(BUNKER_SRC);
    })().catch(error => {
      bundlePromise = null;      // a failed load is retried by the next attempt rather than cached for ever
      throw error;
    });
  }
  return bundlePromise;
}

let sessionModulePromise = null;

/** The session module itself, imported on demand. It is the only thing that knows the six methods. */
export function sessionModule() {
  if (!sessionModulePromise) {
    sessionModulePromise = import('./nostrSession.mjs').catch(error => {
      sessionModulePromise = null;
      throw error;
    });
  }
  return sessionModulePromise;
}

/** Whether this identity can sign in *this* page without leaving it for another app. */
export async function canSignNow() {
  const session = readIdentity();
  if (!session) return false;
  const module = await sessionModule();
  try {
    return await module.signerReady();
  } catch {
    return false;
  }
}

/**
 * Ask for a signature, whatever the signer turns out to be.
 *
 * Returns `{event}` when the signer answered inside the call, or `{pending: true, reason, resume}` when it
 * cannot — Amber's clipboard hand-over, a bunker that is not awake yet, a Telegram app that is not holding
 * the key. A page shows "approve it in your signer" and calls `resumeHandOver()` on the next load; it never
 * has to know which of the six methods it is talking to.
 */
export async function signOrHandOver(template, context = null) {
  const session = readIdentity();
  if (!session) {
    const error = new Error('Connect a Nostr identity first.');
    error.code = 'no-identity';
    throw error;
  }

  // Amber on Android signs through its own app and hands the signature back on the clipboard; it never
  // returns from this call, so this is a hand-over by design rather than a failure.
  if (session.method === 'amber') {
    const module = await sessionModule();
    module.beginAmberSigning(template, context, {copy: true});
    return {
      pending: true,
      reason: 'amber',
      message: 'Approve it in Amber. Come back to this page and it is sent automatically.',
      resume: () => adoptPendingSignature(context),
    };
  }

  await ensureBundles({bunker: session.method === 'bunker'});
  const module = await sessionModule();

  if (session.method === 'bunker' && !await module.signerReady()) {
    try {
      await module.reconnectBunker();
    } catch (error) {
      return {
        pending: true,
        reason: 'signer-unreachable',
        message: error?.message || 'Your signer did not answer.',
        resume: () => adoptPendingSignature(context),
      };
    }
  }

  if (!await module.signerReady()) {
    return {
      pending: true,
      reason: 'signer-not-open',
      message: 'Open the app that holds this identity, then try again.',
      resume: () => adoptPendingSignature(context),
    };
  }

  const event = await module.signNostrEvent(template, context);
  if (!event) {
    // the one remaining case: a method that answered by copying instead of returning
    return {
      pending: true,
      reason: 'amber',
      message: 'Approve it in Amber. Come back to this page and it is sent automatically.',
      resume: () => adoptPendingSignature(context),
    };
  }
  return {event};
}

/**
 * Finish a hand-over that was left waiting: the signature Amber copied, or the clipboard it parked.
 * Safe to call on every load — it reports "nothing waiting" rather than throwing.
 */
export async function resumeHandOver() {
  const session = readIdentity();
  if (!session) return {idle: true};
  if (session.method !== 'amber') return {idle: true};
  const module = await sessionModule();
  if (module.amberSignaturePending()) {
    const answer = await module.adoptAmberSignature({silent: true});
    if (answer?.event) return {event: answer.event};
  }
  if (module.amberClipboardPending()) {
    const answer = await module.adoptAmberClipboard({silent: true});
    if (answer?.session) return {session: answer.session};
  }
  return {idle: true};
}

async function adoptPendingSignature(context) {
  const module = await sessionModule();
  if (module.amberSignaturePending()) {
    const answer = await module.adoptAmberSignature({onStatus: context?.onStatus});
    if (answer?.event) return {event: answer.event};
  }
  return {pending: true, reason: 'amber', message: 'Nothing waiting yet — approve it in Amber first.'};
}

/** Sign in with the browser extension, if there is one. Loads what it needs. */
export async function signInWithExtension() {
  await ensureBundles({bunker: false});
  const module = await sessionModule();
  return module.loginWithExtension();
}

/** Forget this identity on this origin. The page is told, so its own affordances follow. */
export async function signOut() {
  const module = await sessionModule();
  const result = module.logoutNostr?.() ?? null;
  globalThis.window?.dispatchEvent?.(new CustomEvent(SESSION_EVENT, {detail: {session: readIdentity()}}));
  return result;
}

/**
 * Be told when the identity changes — in this tab, in another tab, or when a page signs in on the reader's
 * behalf. Returns an unsubscribe function.
 */
export function onIdentityChange(callback, {immediate = true} = {}) {
  if (typeof callback !== 'function') return () => {};
  const handler = () => callback(readIdentity());
  globalThis.window?.addEventListener?.(SESSION_EVENT, handler);
  const onStorage = event => {
    if (event.key === SESSION_KEY) handler();
  };
  globalThis.window?.addEventListener?.('storage', onStorage);
  if (immediate) handler();
  return () => {
    globalThis.window?.removeEventListener?.(SESSION_EVENT, handler);
    globalThis.window?.removeEventListener?.('storage', onStorage);
  };
}
