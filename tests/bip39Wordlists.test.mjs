import assert from 'node:assert/strict';
import test from 'node:test';
import {
  czechWordlist,
  englishWordlist,
  frenchWordlist,
  italianWordlist,
  japaneseWordlist,
  koreanWordlist,
  portugueseWordlist,
  simplifiedChineseWordlist,
  spanishWordlist,
  traditionalChineseWordlist,
} from '../vendor/bip39.mjs';
import {readBip39Position, wordAtBip39Position} from '../bip39Lookup.mjs';

const wordlists = {
  czechWordlist,
  englishWordlist,
  frenchWordlist,
  italianWordlist,
  japaneseWordlist,
  koreanWordlist,
  portugueseWordlist,
  simplifiedChineseWordlist,
  spanishWordlist,
  traditionalChineseWordlist,
};

test('bundles every official BIP39 wordlist with 2,048 unique words', () => {
  for (const [name, words] of Object.entries(wordlists)) {
    assert.equal(words.length, 2048, name);
    assert.equal(new Set(words.map(word => word.normalize('NFKD'))).size, 2048, name);
  }
});

test('reports one-based BIP39 word positions', () => {
  assert.equal(englishWordlist.indexOf('abandon') + 1, 1);
  assert.equal(englishWordlist.indexOf('man') + 1, 1079);
  assert.equal(englishWordlist.indexOf('zoo') + 1, 2048);
});

test('looks up one-based positions in the selected BIP39 wordlist', () => {
  assert.equal(wordAtBip39Position(englishWordlist, '1').word, 'abandon');
  assert.equal(wordAtBip39Position(englishWordlist, ' 2048 ').word, 'zoo');
  assert.equal(wordAtBip39Position(spanishWordlist, '1').word.normalize('NFC'), 'ábaco');
  assert.equal(wordAtBip39Position(japaneseWordlist, '15').word.normalize('NFC'), 'あずき');
});

test('distinguishes words from invalid BIP39 positions', () => {
  assert.deepEqual(readBip39Position('alien'), {isPosition: false, valid: false});
  assert.equal(readBip39Position('0').isPosition, true);
  assert.equal(readBip39Position('0').valid, false);
  assert.equal(readBip39Position('2049').valid, false);
});
