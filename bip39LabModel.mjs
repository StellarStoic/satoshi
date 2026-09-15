import { entropyToMnemonic, mnemonicToSeed, validateMnemonic, wordlist } from './vendor/bip39.mjs';

export { wordlist };
export const WORD_COUNTS = [12, 15, 18, 21, 24];
export const wordIndex = new Map(wordlist.map((word, index) => [word, index]));
export const toBits = bytes => Array.from(bytes, byte => byte.toString(2).padStart(8, '0')).join('');
export const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

function bytesFromBits(bits) {
    return Uint8Array.from(bits.match(/.{8}/g), byte => parseInt(byte, 2));
}

export function exampleWords(count = 12, preset = 'counting') {
    if (!WORD_COUNTS.includes(count)) throw new Error('Unsupported word count');
    const entropy = new Uint8Array(count / 3 * 4);
    if (preset === 'random') crypto.getRandomValues(entropy);
    else if (preset === 'counting') entropy.forEach((_, i) => { entropy[i] = i; });
    else if (preset !== 'zero') throw new Error('Unknown example');
    return entropyToMnemonic(entropy, wordlist).split(' ');
}

export function analyzeWords(words) {
    const count = words.length;
    if (!WORD_COUNTS.includes(count)) throw new Error('Unsupported word count');
    const indices = words.map(word => wordIndex.get(word));
    if (indices.includes(undefined)) throw new Error('Choose words from the English BIP39 list');
    const wordBits = indices.map(index => index.toString(2).padStart(11, '0'));
    const bits = wordBits.join('');
    const checksumLength = count / 3;
    const entropyLength = bits.length - checksumLength;
    const entropyBits = bits.slice(0, entropyLength);
    const entropy = bytesFromBits(entropyBits);
    // The library computes the checksum; this layer only exposes its bit layout.
    const correctedWords = entropyToMnemonic(entropy, wordlist).split(' ');
    const expectedChecksum = wordIndex.get(correctedWords.at(-1)).toString(2).padStart(11, '0').slice(-checksumLength);
    return {
        indices, wordBits, entropy, entropyBits, entropyLength, checksumLength,
        checksum: bits.slice(-checksumLength), expectedChecksum, correctedWords,
        valid: validateMnemonic(words.join(' '), wordlist)
    };
}

export function flipEntropyBit(words, bitIndex) {
    const { entropy, entropyLength } = analyzeWords(words);
    if (!Number.isInteger(bitIndex) || bitIndex < 0 || bitIndex >= entropyLength) throw new Error('Invalid bit index');
    entropy[Math.floor(bitIndex / 8)] ^= 1 << (7 - bitIndex % 8);
    return entropyToMnemonic(entropy, wordlist).split(' ');
}

export function breakChecksum(words) {
    const result = [...words];
    result[result.length - 1] = wordlist[wordIndex.get(result.at(-1)) ^ 1];
    return result;
}

export function validLastWords(words) {
    const { entropyLength, wordBits } = analyzeWords(words);
    const prefix = wordBits.slice(0, -1).join('');
    const remaining = entropyLength - prefix.length;
    return Array.from({ length: 2 ** remaining }, (_, value) => {
        const entropy = bytesFromBits(prefix + value.toString(2).padStart(remaining, '0'));
        return entropyToMnemonic(entropy, wordlist).split(' ').at(-1);
    });
}

export async function deriveSeed(words, passphrase = '') {
    if (!validateMnemonic(words.join(' '), wordlist)) throw new Error('Checksum must match before deriving the demo seed');
    return toHex(await mnemonicToSeed(words.join(' '), passphrase));
}
