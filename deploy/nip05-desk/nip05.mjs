/**
 * The free door: is the name a writer offers actually theirs?
 *
 * A NIP-05 name is a promise a domain makes: `https://<domain>/.well-known/nostr.json?name=<local>`
 * answers with the pubkey that name belongs to. That is the whole of a NIP-05 — nothing is
 * registered, nothing is signed, and no central list exists. So the only way to know whether
 * `alice@example.com` may pin for free as pubkey `abc…` is to ask example.com, and compare.
 *
 * Which makes this the one place where the desk fetches an address a stranger chose. Every rule
 * below exists because of that, and none of them is decoration:
 *
 *   - HTTPS only, and the answer must come from the address itself: a redirect is not followed.
 *     A domain that redirects its well-known elsewhere is entitled to, but following it would let
 *     a stranger point this desk at an address of their choosing, which is the shape of every
 *     server-side request forgery. Not following it costs a rare domain its free door; following
 *     it costs the desk its own network.
 *   - Loopback, private ranges, link-local and bare hostnames are refused before a socket is
 *     opened, in the decimal, hex and IPv4-in-IPv6 spellings, because `127.0.0.1`, `2130706433`
 *     and `[::ffff:7f00:1]` are the same address and all three reach the desk's own neighbour.
 *   - The body is capped and the whole exchange has a deadline. An unresponsive domain costs a few
 *     seconds of one request, never a hung order.
 *   - Answers are cached for an hour, because a name either answers or does not, and a cache is
 *     also what stops a caller from making this desk hammer a third party by ordering in a loop.
 *   - Only a handful of lookups run at once. Beyond that the caller is told the door is busy and
 *     pays the price instead — the desk is never held open by a slow domain.
 */

/** How long a domain has to answer before the look-up is abandoned. */
export const NIP05_TIMEOUT_MS = 2500;

/** How long an answer, either way, is remembered. */
export const NIP05_CACHE_SECONDS = 3600;

/** How many names are remembered at once. */
export const NIP05_CACHE_MAX = 400;

/** How much of a well-known answer is read, in bytes. */
export const NIP05_BODY_MAX = 64 * 1024;

/** How many lookups may be in flight at once. */
export const NIP05_INFLIGHT_MAX = 6;

const LOCAL_RE = /^[a-z0-9._-]{1,64}$/;
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Names that never leave this machine, in the spellings that reach it. */
const PRIVATE_HOST_RE = /^(?:localhost|.*\.(?:localhost|local|internal|home|lan|localdomain|test|invalid|example|onion)|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|\d+|\d+\.\d+\.\d+\.\d+|\dx[0-9a-f]+|\[.*\])$/;

/**
 * Split `name@domain` into its halves, or null when it is not a NIP-05 name at all.
 *
 * The local part is lowercased with the domain: a NIP-05 document is keyed by the name as the
 * writer typed it, and every server in practice publishes lowercase, so asking with the spelling
 * the writer used is the safer question — which is what `parseNip05Name` preserves, while the
 * shape check lives in sticky.mjs beside the mined-note claim that shares it.
 */
export function parseNip05Name(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text.length > 128 || text.includes('/') || text.includes(':')) return null;
  const at = text.lastIndexOf('@');
  if (at <= 0 || at === text.length - 1) return null;
  const local = text.slice(0, at);
  const domain = text.slice(at + 1);
  if (!LOCAL_RE.test(local) || !DOMAIN_RE.test(domain)) return null;
  if (domain.length > 253) return null;
  if (isPrivateHost(domain)) return null;
  return { name: text, local, domain };
}

/**
 * Is this domain something the desk must not be talked into fetching?
 *
 * A hostname without a dot is a machine on this box's own network; an all-numeric label is an
 * address in one of the several ways an address can be written; a bracketed literal is IPv6.
 */
export function isPrivateHost(domain) {
  const host = String(domain || '').toLowerCase().replace(/\.$/, '');
  if (!host || !host.includes('.')) return true;
  if (PRIVATE_HOST_RE.test(host)) return true;
  // `127.1`, `192.168.1`, `10.1` — an address written with fewer than four parts.
  if (/^\d+(?:\.\d+){1,3}$/.test(host)) return true;
  // IPv6 literals arrive bracketed in a URL and unbracketed once a caller trims them.
  if (host.includes(':') || /^[0-9a-f]{1,4}(?::[0-9a-f]{0,4})+$/.test(host)) return true;
  return false;
}

/** A remembered answer, either way. */
export function createNip05Cache() {
  return new Map();
}

/**
 * Ask a domain whether it answers for a name, and whether that name is this key.
 *
 * @param {string} name  the NIP-05 name as the writer offered it, `name@domain`
 * @param {string} pubkey  the hex pubkey the order is being bought for
 * @param {{fetchImpl?: Function, timeoutMs?: number, cache?: Map, now?: number}} options
 *   fetchImpl and now are injected so the look-up can be tested without a network.
 * @returns {Promise<{ok: boolean, name?: string, pubkey?: string, reason?: string, cached?: boolean}>}
 *   `ok` is true only when the domain answered, the answer was for this exact key, and nothing
 *   about the exchange was refused. Every other outcome is `ok: false` with a short reason.
 */
export async function verifyNip05Name(name, pubkey, { fetchImpl = globalThis.fetch, timeoutMs = NIP05_TIMEOUT_MS,
  cache = null, now = Math.floor(Date.now() / 1000), inflight = null } = {}) {
  const parsed = parseNip05Name(name);
  if (!parsed) return { ok: false, reason: 'not a NIP-05 name' };
  const key = String(pubkey || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) return { ok: false, reason: 'not a hex pubkey' };
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no fetch available' };

  const cacheKey = parsed.name;
  if (cache) {
    const hit = cache.get(cacheKey);
    if (hit && now - hit.at < NIP05_CACHE_SECONDS) {
      const ok = hit.pubkey === key;
      return { ok, name: parsed.name, ...(ok ? { pubkey: key } : { reason: 'the name answers for another key' }), cached: true };
    }
    if (hit) cache.delete(cacheKey);
  }

  if (inflight && inflight.count >= NIP05_INFLIGHT_MAX) return { ok: false, reason: 'too many lookups in flight' };
  if (inflight) inflight.count += 1;

  const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.local)}`;
  let answer = null;
  let reason = null;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',                     // the answer must come from the name's own domain
      headers: { accept: 'application/json', 'user-agent': 'pinstr-desk (nip05 check)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      reason = `the domain answered ${response.status}`;
    } else {
      const text = await readCapped(response, NIP05_BODY_MAX);
      try {
        const document = JSON.parse(text);
        const listed = document && document.names && document.names[parsed.local];
        // NIP-05 allows a relay hint map as well as the pubkey; only the pubkey decides.
        const value = Array.isArray(listed) ? listed[0] : listed;
        if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value)) reason = 'the name is not in the document';
        else answer = value.toLowerCase();
      } catch {
        reason = 'the answer was not JSON';
      }
    }
  } catch (error) {
    reason = error && error.name === 'TimeoutError' ? 'the domain did not answer in time' : 'the domain could not be reached';
  } finally {
    if (inflight) inflight.count -= 1;
  }

  if (answer === null) {
    // A failure is remembered too, and for the same hour: a name that does not answer should not be
    // asked again by the next order, or a broken domain becomes a way to make this desk wait.
    if (cache) remember(cache, cacheKey, null, now);
    return { ok: false, name: parsed.name, reason };
  }
  if (cache) remember(cache, cacheKey, answer, now);
  if (answer !== key) return { ok: false, name: parsed.name, reason: 'the name answers for another key' };
  return { ok: true, name: parsed.name, pubkey: answer };
}

/** Read at most `limit` bytes of a response body, as text. */
async function readCapped(response, limit) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    return text.slice(0, limit);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let read = 0;
  try {
    while (read < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      read += value.length;
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  const merged = new Uint8Array(Math.min(read, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, merged.length - offset);
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= merged.length) break;
  }
  return new TextDecoder().decode(merged);
}

/** Store one answer, keeping the map from growing without end. */
function remember(cache, name, pubkey, now) {
  cache.set(name, { pubkey, at: now });
  if (cache.size <= NIP05_CACHE_MAX) return;
  // Oldest first, and a Map iterates in insertion order, so the first key is the oldest entry.
  for (const key of cache.keys()) {
    cache.delete(key);
    if (cache.size <= NIP05_CACHE_MAX) break;
  }
}
