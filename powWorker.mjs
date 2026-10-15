// The mining loop, off the main thread.
//
// One worker per core the board lends to it, each scanning its own slice of the nonce
// space (worker i takes i, i+count, i+2*count…), so no two ever repeat each other's work.
// Progress goes back in batches rather than per hash: a message per try would cost more
// than the hash does, and the reader only needs the number to move four times a second.
import { mineChunk } from './powMining.mjs';

let stopped = false;

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === 'stop') {
    stopped = true;
    return;
  }
  if (message.type !== 'mine') return;

  const { chunk = 3000, target, stride = 1 } = message;
  const headBytes = new Uint8Array(message.headBytes);
  const tailBytes = new Uint8Array(message.tailBytes);
  let start = Number.isInteger(message.start) ? message.start : 0;

  for (;;) {
    if (stopped) return;
    const slice = mineChunk({ headBytes, tailBytes, start, stride, tries: chunk, target });
    if (slice.id) {
      self.postMessage({
        type: 'found', nonce: slice.nonce, id: slice.id, bits: slice.bits, hashes: slice.tries,
      });
      return;
    }
    start += chunk * stride;
    self.postMessage({ type: 'progress', hashes: slice.tries, best: slice.best });
  }
};
