import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nsecToBytes, decodeBech32 } from './bech32.mjs';

// Ground truth: the site's own nostr-tools bundle, loaded out of the repo, encodes the
// keys. The decoder here has to agree with it byte for byte.
const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.join(here, '..', '..', 'stego', 'vendor', 'nostr-tools.bundle.js');
const src = fs.readFileSync(bundle, 'utf8');
const NostrTools = new Function(src + '\nreturn NostrTools;')();

function secret(seed) {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = (seed * 31 + i * 17) & 0xff;
  return out;
}

test('decodes every nsec that nostr-tools produces', () => {
  for (const seed of [1, 2, 7, 99]) {
    const bytes = secret(seed);
    const nsec = NostrTools.nip19.nsecEncode(bytes);
    const back = nsecToBytes(nsec);
    assert.equal(Buffer.from(back).toString('hex'), Buffer.from(bytes).toString('hex'), `seed ${seed}`);
  }
});

test('the npub of the same key is not accepted as an nsec', () => {
  const bytes = secret(3);
  const npub = NostrTools.nip19.npubEncode(NostrTools.getPublicKey(bytes));
  assert.throws(() => nsecToBytes(npub), /not an nsec/);
});

test('a corrupted nsec fails the checksum', () => {
  const nsec = NostrTools.nip19.nsecEncode(secret(5));
  const broken = nsec.slice(0, -1) + (nsec.endsWith('q') ? 'p' : 'q');
  assert.equal(decodeBech32(broken), null);
});

test('rubbish is rejected without throwing', () => {
  for (const bad of ['', 'nsec', 'nsec1', null, 'notabech32string']) {
    assert.equal(decodeBech32(bad), null);
  }
});
