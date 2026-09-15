import test from 'node:test';
import assert from 'node:assert/strict';
import { wordlist, WORD_COUNTS, exampleWords, analyzeWords, flipEntropyBit, breakChecksum, validLastWords, deriveSeed, toHex } from '../bip39LabModel.mjs';

// First English test vector: https://github.com/trezor/python-mnemonic/blob/master/vectors.json
const zeroPhrase = `${'abandon '.repeat(11)}about`;
const trezorSeed = 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04';

test('official zero-entropy mnemonic and TREZOR passphrase seed', async () => {
    const words = exampleWords(12, 'zero');
    assert.equal(words.join(' '), zeroPhrase);
    const analysis = analyzeWords(words);
    assert.equal(toHex(analysis.entropy), '00'.repeat(16));
    assert.equal(analysis.checksum, '0011');
    assert.equal(analysis.expectedChecksum, '0011');
    assert.equal(await deriveSeed(words, 'TREZOR'), trezorSeed);
});

test('all supported phrase lengths have the correct bit layout and last-word choices', () => {
    for (const count of WORD_COUNTS) {
        const words = exampleWords(count);
        const analysis = analyzeWords(words);
        assert.equal(analysis.valid, true);
        assert.equal(analysis.entropyLength, count / 3 * 32);
        assert.equal(analysis.checksumLength, count / 3);
        assert.equal(analysis.wordBits.join('').length, count * 11);
        const endings = validLastWords(words);
        assert.equal(endings.length, 2 ** (11 - count / 3));
        assert.equal(new Set(endings).size, endings.length);
        assert.ok(endings.includes(words.at(-1)));
        for (const last of endings) assert.equal(analyzeWords([...words.slice(0, -1), last]).valid, true);
    }
});

test('breaking and repairing a checksum preserves the underlying entropy', async () => {
    const words = exampleWords();
    const original = analyzeWords(words);
    const broken = breakChecksum(words);
    const analysis = analyzeWords(broken);
    assert.equal(analysis.valid, false);
    assert.deepEqual(analysis.entropy, original.entropy);
    assert.deepEqual(analysis.correctedWords, words);
    assert.deepEqual(words, exampleWords());
    await assert.rejects(deriveSeed(broken), /Checksum/);
});

test('flipping a bit changes only that entropy bit and produces a valid checksum', () => {
    for (const count of [12, 24]) {
        const words = exampleWords(count);
        const original = analyzeWords(words);
        for (const index of [0, 7, 8, original.entropyLength - 1]) {
            const changed = analyzeWords(flipEntropyBit(words, index));
            assert.equal(changed.valid, true);
            const differences = [...original.entropyBits].flatMap((bit, i) => bit !== changed.entropyBits[i] ? [i] : []);
            assert.deepEqual(differences, [index]);
        }
    }
});

test('passphrases are optional, case-sensitive, whitespace-sensitive and NFKD normalized', async () => {
    const words = exampleWords(12, 'zero');
    const base = await deriveSeed(words);
    assert.equal(base, await deriveSeed(words, ''));
    assert.notEqual(base, await deriveSeed(words, 'satoshi'));
    assert.notEqual(await deriveSeed(words, 'satoshi'), await deriveSeed(words, 'Satoshi'));
    assert.notEqual(await deriveSeed(words, 'satoshi'), await deriveSeed(words, 'satoshi '));
    assert.equal(await deriveSeed(words, 'caf\u00e9'), await deriveSeed(words, 'cafe\u0301'));
});

test('word indices, four-letter prefixes, and input bounds', () => {
    assert.equal(wordlist.length, 2048);
    assert.equal(wordlist[0], 'abandon');
    assert.equal(wordlist[2047], 'zoo');
    assert.equal(new Set(wordlist.map(word => word.slice(0, 4))).size, 2048);
    assert.throws(() => exampleWords(13), /Unsupported/);
    assert.throws(() => flipEntropyBit(exampleWords(), 128), /Invalid bit/);
    assert.throws(() => analyzeWords(Array(12).fill('not-a-word')), /Choose words/);
});
