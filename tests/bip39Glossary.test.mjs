import test from 'node:test';
import assert from 'node:assert/strict';
import { matchGlossaryTerms } from '../bip39Glossary.mjs';

test('compound terms win over their individual words', () => {
    const cases = {
        'entropy bits': 'entropy_bits',
        'checksum bits': 'checksum_bits',
        'checksum bit': 'checksum_bits',
        'random bits': 'entropy_bits',
        '64-byte seed': 'seed',
        'optional passphrase': 'passphrase',
        'Bitcoin wallet': 'wallet',
        'Bitcoin addresses': 'address',
        'BIP39 seed phrase': 'recovery',
        'English BIP39 word list': 'wordlist',
        '11-bit value': 'bits',
        'private keys': 'keys',
        'word index': 'index',
        'SHA-256 hash': 'sha256',
        'HMAC-SHA512': 'hmac',
        'PBKDF2-HMAC-SHA512': 'pbkdf2',
        'Unicode NFKD normalization': 'normalization'
    };
    for (const [text, key] of Object.entries(cases)) {
        assert.deepEqual(matchGlossaryTerms(text), [{text, key, index: 0}]);
    }
});

test('wrapped whitespace and capitalization preserve the original phrase', () => {
    const phrase = 'ENTROPY\n  bits';
    assert.deepEqual(matchGlossaryTerms(phrase), [{text: phrase, index: 0, key: 'entropy_bits'}]);
});

test('adjacent concepts remain distinct and substrings are not matched', () => {
    assert.deepEqual(matchGlossaryTerms('7 entropy bits and 4 checksum bits.').map(match => [match.text, match.key]), [
        ['entropy bits', 'entropy_bits'], ['checksum bits', 'checksum_bits']
    ]);
    assert.deepEqual(matchGlossaryTerms('keyboard bitstream saltwater'), []);
    assert.deepEqual(matchGlossaryTerms('entropy and bits').map(match => match.key), ['entropy', 'bits']);
});
