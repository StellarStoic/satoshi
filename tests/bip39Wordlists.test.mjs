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
