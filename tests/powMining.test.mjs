// What posting with work depends on: that this miner's hash is the desk's hash, and that
// mining finds an id the desk will actually accept.
//
// The two ids pinned below were computed by the desk's own eventId (src/nostr.mjs in the
// desk). A disagreement here does not fail loudly on a real note — it mines for ever, on a
// reader's phone — so it is pinned from this side, and again from the desk's side by
// deploy/check-frontend-contract.mjs, which loads this module and compares the two.
//
// Mining in Node runs the main-thread path (there is no browser `Worker` here), which is
// also the fallback a browser without module workers takes: both paths are exercised by the
// same tests, and the slices are short so the suite stays quick.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  sha256Hex, sha256Bytes, eventIdOf, leadingZeroBits, prepareMiningInput, mineChunk,
  mineNote, estimateSeconds, describeSeconds, workerCount,
} from '../powMining.mjs';

const FIXTURE = {
  pubkey: '1'.repeat(64), created_at: 1700000000, kind: 1,
  tags: [['t', 'pinstr']], content: 'hello board',
};

test('this miner hashes exactly what the desk hashes', () => {
  // Against Node's own sha256, for the shapes a note actually is: empty, one block, more
  // than one block, and text that is not ASCII.
  for (const message of ['', 'a', 'hello board', 'žaba 🐸 na kolesu', 'x'.repeat(500)]) {
    assert.equal(sha256Hex(message), createHash('sha256').update(message, 'utf8').digest('hex'),
      `sha256 of ${JSON.stringify(message)}`);
  }
  assert.equal(sha256Bytes(new Uint8Array([0, 1, 2, 255])),
    createHash('sha256').update(Buffer.from([0, 1, 2, 255])).digest('hex'));
});

test('an id this miner computes is the id the desk computes', () => {
  assert.equal(eventIdOf(FIXTURE), 'fc879b19a0cdbbcdb17b42a976395e5e7d8f06847c458a5e1875e16cf03c9329');
  // …and with the nonce tag appended, which is where a mined note differs from a typed one.
  assert.equal(eventIdOf({ ...FIXTURE, tags: [...FIXTURE.tags, ['nonce', '7', '8']] }),
    'dc71023cb0e9d265f9d5b6590d87291652f3921ebd801c4b5b3a776b5b8e39fe');
});

test('leading zero bits are counted the way NIP-13 counts them', () => {
  assert.equal(leadingZeroBits('0'.repeat(64)), 256);
  assert.equal(leadingZeroBits('1' + '0'.repeat(63)), 3);
  assert.equal(leadingZeroBits('8' + '0'.repeat(63)), 0);
  assert.equal(leadingZeroBits('0'.repeat(10) + '8' + '0'.repeat(53)), 40);
  for (const junk of ['', 'abc', undefined, null, 'g'.repeat(64)]) {
    assert.equal(leadingZeroBits(junk), -1, `${JSON.stringify(junk)} is not an id`);
  }
});

test('the bytes mining reuses are exactly the bytes of the event', () => {
  // The optimisation is that only the nonce's digits are rebuilt per try. That is only safe
  // if head + digits + tail is byte-for-byte the event's own JSON, so it is checked against
  // the honest, slow construction the desk uses.
  const { headBytes, tailBytes } = prepareMiningInput(FIXTURE, 25);
  const decode = bytes => new TextDecoder().decode(bytes);
  for (const nonce of ['0', '42', '999999']) {
    const assembled = `${decode(headBytes)}${nonce}${decode(tailBytes)}`;
    const honest = JSON.stringify([0, FIXTURE.pubkey, FIXTURE.created_at, FIXTURE.kind,
      [...FIXTURE.tags, ['nonce', nonce, '25']], FIXTURE.content]);
    assert.equal(assembled, honest, `nonce ${nonce}`);
    assert.equal(sha256Hex(assembled), eventIdOf({ ...FIXTURE, tags: [...FIXTURE.tags, ['nonce', nonce, '25']] }));
  }

  // A template that already carries a nonce tag — a second attempt at the same note, or a
  // retry after a reload — is mined without it, so the tag cannot end up in the event twice.
  const twice = prepareMiningInput({ ...FIXTURE, tags: [...FIXTURE.tags, ['nonce', '1', '8']] }, 25);
  assert.equal(`${decode(twice.headBytes)}5${decode(twice.tailBytes)}`,
    JSON.stringify([0, FIXTURE.pubkey, FIXTURE.created_at, FIXTURE.kind,
      [...FIXTURE.tags, ['nonce', '5', '25']], FIXTURE.content]),
  'the old nonce tag is dropped, not mined into the event twice');
});

test('a slice of the nonce space is searched, and the hit carries the work', () => {
  const { headBytes, tailBytes } = prepareMiningInput(FIXTURE, 8);
  const slice = mineChunk({ headBytes, tailBytes, start: 0, stride: 1, tries: 20000, target: 8 });
  assert.ok(slice.id, 'eight bits should be found well inside twenty thousand tries');
  assert.ok(leadingZeroBits(slice.id) >= 8, `found ${slice.id} at ${leadingZeroBits(slice.id)} bits`);
  assert.equal(eventIdOf({ ...FIXTURE, tags: [...FIXTURE.tags, ['nonce', String(slice.nonce), '8']] }),
    slice.id, 'the nonce in the tag is the nonce that produced the id');
  assert.ok(slice.best >= 8 && slice.best <= 32, 'and it reports the best it saw');

  // A strided worker starts somewhere else in the same space: its hit is still a hit.
  const other = mineChunk({ headBytes, tailBytes, start: 1, stride: 2, tries: 20000, target: 8 });
  assert.ok(other.id && leadingZeroBits(other.id) >= 8);
  assert.equal(other.nonce % 2, 1, 'a stride of two only ever takes every second nonce');
});

test('mining a note finds an id the desk will accept', async () => {
  const seen = [];
  const result = await mineNote({
    template: { ...FIXTURE, content: 'mined on the board' },
    bits: 8, maxWorkers: 1, chunk: 500,
    onProgress: progress => seen.push(progress),
  });
  assert.equal(result.ok, true);
  assert.ok(leadingZeroBits(result.id) >= 8, `${result.id} carries ${leadingZeroBits(result.id)} bits`);
  assert.equal(eventIdOf({
    ...FIXTURE, content: 'mined on the board',
    tags: [...FIXTURE.tags, ['nonce', String(result.nonce), '8']],
  }), result.id, 'the winning nonce rebuilds the id');
  assert.ok(seen.every(p => Number.isFinite(p.hashes) && Number.isFinite(p.rate)),
    'anything reported is a real number the dialog can draw');
});

test('mining can be called off, and says so', async () => {
  const controller = new AbortController();
  const seen = [];
  const mining = mineNote({
    template: { ...FIXTURE, content: 'this one is stopped' },
    bits: 30, chunk: 500, maxWorkers: 1,   // far too hard to finish during the test
    onProgress: progress => { seen.push(progress); if (progress.hashes > 0) controller.abort(); },
    signal: controller.signal,
  });
  const result = await mining;
  assert.equal(result.cancelled, true, 'a reader who stops mining gets nothing published');
  assert.ok(seen.length >= 1, 'progress is reported while it mines, which is what was stopped');
  assert.ok(seen.some(p => p.secondsLeft > 0 || p.secondsLeft === null),
    'and it says how long is left, or that it cannot yet');

  // And an already-aborted signal never starts.
  const dead = new AbortController();
  dead.abort();
  assert.equal((await mineNote({ template: FIXTURE, bits: 8, signal: dead.signal })).cancelled, true);
});

test('what a reader is told about the wait', () => {
  // 2^25 tries at a measured rate, which is the number the payment dialog shows.
  assert.equal(estimateSeconds(25, 2 ** 25 / 300), 300);
  assert.equal(estimateSeconds(25, 0), null);
  assert.equal(describeSeconds(estimateSeconds(25, 2 ** 25 / 60)), 'about a minute');
  assert.equal(describeSeconds(300), 'about 5 minutes');
  assert.equal(describeSeconds(30), 'about 30 seconds');
  assert.equal(describeSeconds(0), 'a moment');
  assert.equal(describeSeconds(7200), 'about 2 hours');
  // Cores are lent, not taken: one is left for the page itself, and never more than four.
  assert.equal(workerCount(4, 8), 4);
  assert.equal(workerCount(4, 4), 3);
  assert.equal(workerCount(4, 2), 1);
  assert.equal(workerCount(4, null), 1, 'cores unknown: lend one thread, never assume');
  assert.equal(workerCount(4, undefined) > 0, true, 'undefined asks for the machine\'s own count');
  assert.equal(workerCount(4, 1), 1);
});
