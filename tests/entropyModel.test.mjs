import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBits, bip39Shape, bytesToBits, bytesToHex, diceEntropy, guessTime, textEntropy} from '../entropyModel.mjs';

test('byte formatting preserves leading zeroes', () => {
  assert.equal(bytesToBits(new Uint8Array([0, 255])), '0000000011111111');
  assert.equal(bytesToHex(new Uint8Array([0, 255])), '00ff');
});

test('bit analysis reports balance, changes, and runs', () => {
  assert.deepEqual(analyzeBits('001101'), {length: 6, ones: 3, zeros: 3, balance: 1, transitions: 3, longestRun: 2});
});

test('dice and BIP39 sizes use their defined information widths', () => {
  assert.equal(diceEntropy(50), 129);
  assert.deepEqual(bip39Shape(128), {entropy: 128, checksum: 4, words: 12});
  assert.deepEqual(bip39Shape(256), {entropy: 256, checksum: 8, words: 24});
});

test('repeated text has less observed entropy than varied text', () => {
  assert.ok(textEntropy('abcdefgh') > textEntropy('aaaaaaaa'));
  assert.match(guessTime(128), /10\^/);
});
