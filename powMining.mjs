// Posting a note by mining it, instead of paying for it (NIP-13).
//
// A note's id is the sha256 of the event itself, so "a difficulty" is a price with an
// unusual property: it is paid to nobody, it cannot be refunded, and it proves the effort
// went into THIS note — the id hashes the content, the tags, the pubkey and the timestamp
// together, so a note mined cheaply cannot be swapped for different words.
//
// Two things live here. The mining itself, which has to run off the main thread or the
// board would freeze for minutes; and the SHA-256 it needs, which has to be synchronous.
// WebCrypto's digest returns a promise per call, and a promise per hash costs more than
// the hash does. So this module carries its own SHA-256 — and the test that pins it against
// Node's crypto, and against an id computed by the desk, is the test that matters: a hash
// that disagreed with the desk's by one byte would not fail loudly, it would mine for ever.
//
// The desk checks the work itself, from the event alone (see verifyPublishEvent). Nothing
// here is trusted: this side only has to arrive at the same number the desk will count.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

// Scratch, reused rather than reallocated: mining calls this millions of times, and an
// allocation per try costs more than the hash. One instance per thread — a worker has its
// own copy of this module — so there is nothing shared to race with.
const schedule = new Uint32Array(64);
const state = new Uint32Array(8);
let buffer = new Uint8Array(1024);

const rotr = (value, bits) => ((value >>> bits) | (value << (32 - bits))) >>> 0;
const encoder = new TextEncoder();

/** SHA-256 of a byte array, returned as 64 lowercase hex characters. */
export function sha256Bytes(bytes) {
  const length = bytes.length;
  const total = (Math.floor((length + 9) / 64) + 1) * 64;
  if (buffer.length < total) buffer = new Uint8Array(Math.max(total * 2, 1024));
  const padded = buffer.subarray(0, total);
  padded.fill(0);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer, padded.byteOffset, total);
  // The 64-bit big-endian bit length. The high word is 0 below 512 MiB, which a note's
  // JSON is by six orders of magnitude, but write it properly rather than assuming.
  view.setUint32(total - 8, Math.floor(length / 536870912));
  view.setUint32(total - 4, (length << 3) >>> 0);

  state.set(INITIAL);
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i += 1) schedule[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const w15 = schedule[i - 15];
      const w2 = schedule[i - 2];
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) >>> 0;
    }
    let a = state[0]; let b = state[1]; let c = state[2]; let d = state[3];
    let e = state[4]; let f = state[5]; let g = state[6]; let h = state[7];
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + schedule[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  let hex = '';
  for (let i = 0; i < 8; i += 1) hex += state[i].toString(16).padStart(8, '0');
  return hex;
}

/** SHA-256 of a string, returned as 64 lowercase hex characters. */
export function sha256Hex(message) {
  return sha256Bytes(encoder.encode(message));
}

/**
 * The id NIP-01 gives an event: the sha256 of its canonical serialisation. The id does not
 * cover the signature and the signature covers the id, so mining happens on the event
 * *before* it is signed — which is also what lets a remote signer sign an already-mined event.
 */
export function eventIdOf(event) {
  return sha256Hex(JSON.stringify([
    0, event.pubkey, event.created_at, event.kind, event.tags, event.content,
  ]));
}

/**
 * How much work an id carries: its leading zero bits, counted as NIP-13 counts them.
 * Returns -1 for something that is not an id, so a caller cannot mistake a typo for work.
 */
export function leadingZeroBits(id) {
  const value = String(id || '');
  if (!/^[0-9a-f]{64}$/i.test(value)) return -1;
  let bits = 0;
  for (const character of value) {
    const nibble = parseInt(character, 16);
    if (nibble === 0) {
      bits += 4;
      continue;
    }
    return bits + Math.clz32(nibble) - 28;
  }
  return bits;
}

/**
 * The bytes of the event that do NOT change between two tries, and the bytes that follow
 * the nonce — so mining never rebuilds the whole event as text. Only the digits of the
 * nonce change between attempts, which is the difference between tens of thousands of
 * tries a second per thread and a few thousand.
 *
 * The nonce tag is appended after the note's own tags, which is the order the signed event
 * must keep: the id hashes the tag array as given, so a mined note whose tags were
 * reordered before signing would no longer carry the work.
 */
export function prepareMiningInput(template, claimBits) {
  if (!template || typeof template !== 'object') throw new Error('a template is required to mine');
  const { pubkey, created_at: createdAt, kind, content } = template;
  if (typeof pubkey !== 'string' || !pubkey) throw new Error('the template needs a pubkey to mine');
  for (const [name, value] of [['created_at', createdAt], ['kind', kind]]) {
    if (!Number.isInteger(value)) throw new Error(`the template needs an integer ${name} to mine`);
  }
  const tags = (Array.isArray(template.tags) ? template.tags : [])
    .filter(tag => !(Array.isArray(tag) && tag[0] === 'nonce'));
  // `[0,pub,at,kind,` then the tags array with its closing bracket removed, so the nonce tag
  // is appended INSIDE it after the note's own tags. An empty tag array would leave a stray
  // comma, which is not JSON at all, so it is spelled out rather than sliced.
  const tagsJson = JSON.stringify(tags);
  const tagsOpen = tagsJson === '[]' ? '[' : `${tagsJson.slice(0, -1)},`;
  const head = `${JSON.stringify([0, pubkey, createdAt, kind]).slice(0, -1)},${tagsOpen}["nonce","`;
  const tail = `","${claimBits}"]],${JSON.stringify([content === undefined ? '' : content]).slice(1)}`;
  return { headBytes: encoder.encode(head), tailBytes: encoder.encode(tail) };
}

/**
 * One slice of the nonce space, searched for an id that carries `target` leading zero bits.
 *
 * The caller owns the slices: a worker takes every `stride`-th nonce from its own `start`,
 * so several threads never repeat each other's work. Returns the hit, or how many tries it
 * made and the best difficulty it saw — which is what a progress line reports, because
 * "best so far" is the only honest number while the answer is still unknown.
 */
export function mineChunk({ headBytes, tailBytes, start, stride, tries, target }) {
  const digits = new Uint8Array(24);
  const message = new Uint8Array(headBytes.length + 24 + tailBytes.length);
  const fixed = headBytes.length;
  let best = 0;
  for (let i = 0; i < tries; i += 1) {
    const nonce = start + i * stride;
    const text = encoder.encode(String(nonce));
    message.set(headBytes, 0);
    message.set(text, fixed);
    message.set(tailBytes, fixed + text.length);
    const id = sha256Bytes(message.subarray(0, fixed + text.length + tailBytes.length));
    const worked = leadingZeroBits(id);
    if (worked > best) best = worked;
    if (worked >= target) return { nonce, id, bits: worked, tries: i + 1, best };
  }
  return { tries, best };
}

/** How long a difficulty should take at a measured rate. Null when the rate is unknown. */
export function estimateSeconds(bits, hashesPerSecond) {
  if (!(hashesPerSecond > 0)) return null;
  return Math.pow(2, bits) / hashesPerSecond;
}

/** A duration as a sentence a person would say, for a progress line. */
export function describeSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'a moment';
  if (seconds < 60) return `about ${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = seconds / 60;
  if (minutes < 2) return 'about a minute';
  if (minutes < 50) return `about ${Math.round(minutes)} minutes`;
  return `about ${Math.round(minutes / 60)} hour${Math.round(minutes / 60) === 1 ? '' : 's'}`;
}

/** How many workers to lend to mining: the machine's cores less one, and no more than four. */
export function workerCount(max = 4, cores = globalThis.navigator?.hardwareConcurrency) {
  const available = Number.isInteger(cores) && cores > 1 ? cores - 1 : 1;
  return Math.max(1, Math.min(max, available));
}

const WORKER_URL = () => new URL('./powWorker.mjs', import.meta.url);

/**
 * Mine a note until its id carries `bits` leading zero bits.
 *
 * Resolves with the winning nonce and id, or `{cancelled: true}` if the reader stopped it.
 * The template must already be complete — content, tags, placement, the expiry — because
 * every one of those feeds the id: change anything afterwards and the work is gone, which
 * is exactly why the work is worth accepting.
 *
 * Runs in workers when the browser has them, and on the main thread (slower, in slices that
 * let the page breathe) when it does not, which is also the path the tests take in Node.
 */
export async function mineNote({
  template, bits, claimBits = bits, signal, onProgress, maxWorkers = 4, chunk = 3000,
} = {}) {
  const target = Math.max(1, Math.floor(bits));
  const { headBytes, tailBytes } = prepareMiningInput(template, claimBits);
  let hashes = 0;
  let best = 0;
  const startedAt = Date.now();
  const report = () => {
    if (typeof onProgress !== 'function') return;
    const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
    const rate = hashes / seconds;
    onProgress({
      hashes, best, rate, seconds,
      secondsLeft: estimateSeconds(target, rate),
    });
  };

  if (signal?.aborted) return { cancelled: true };
  const onAbort = () => { /* handled by each path below */ };
  signal?.addEventListener?.('abort', onAbort);

  const finish = result => {
    signal?.removeEventListener?.('abort', onAbort);
    return result;
  };

  if (typeof Worker === 'function') {
    const count = workerCount(maxWorkers);
    let workers = [];
    try {
      workers = Array.from({ length: count }, (_, index) => {
        const worker = new Worker(WORKER_URL(), { type: 'module' });
        // Worker i takes nonces i, i+count, i+2*count… so no two repeat each other's work.
        worker.postMessage({
          type: 'mine', chunk, target, stride: count, start: index, headBytes, tailBytes,
        });
        return worker;
      });
    } catch {
      workers.forEach(worker => worker.terminate?.());
      workers = [];
    }

    if (workers.length) {
      const settled = await new Promise(resolve => {
        let done = false;
        const stop = result => {
          if (done) return;
          done = true;
          workers.forEach(worker => worker.terminate?.());
          resolve(result);
        };
        workers.forEach(worker => {
          worker.onmessage = event => {
            const data = event.data || {};
            if (data.type === 'progress') {
              hashes += data.hashes || 0;
              if ((data.best || 0) > best) best = data.best;
              report();
            } else if (data.type === 'found') {
              hashes += data.hashes || 0;
              stop({ ok: true, nonce: data.nonce, id: data.id, bits: data.bits, hashes });
            }
          };
          // A worker that cannot even load (an old browser, a blocked module worker) must not
          // leave the reader staring at a progress bar: fall back to the main thread instead.
          worker.onerror = () => stop({ fallback: true });
        });
        signal?.addEventListener?.('abort', () => stop({ cancelled: true }), { once: true });
        report();
      });
      if (!settled.fallback) return finish(settled);
      hashes = 0;
      best = 0;
    }
  }

  // The main thread, in slices: no worker, or none that would load. Slower, and it yields
  // between slices so the dialog keeps drawing its progress.
  let start = 0;
  for (;;) {
    if (signal?.aborted) return finish({ cancelled: true });
    const slice = mineChunk({ headBytes, tailBytes, start, stride: 1, tries: chunk, target });
    hashes += slice.tries;
    if (slice.best > best) best = slice.best;
    if (slice.id) return finish({ ok: true, nonce: slice.nonce, id: slice.id, bits: slice.bits, hashes });
    start += chunk;
    report();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
