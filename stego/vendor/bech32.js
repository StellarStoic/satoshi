"use strict";

const ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const ALPHABET_MAP = {};

// Map each character in the alphabet to its index
for (let i = 0; i < 32; i++) {
    ALPHABET_MAP[ALPHABET.charAt(i)] = i;
}

// Polymod step (used for checksum calculations)
function polymodStep(pre) {
    const b = pre >> 25;
    return (
        ((pre & 0x1ffffff) << 5) ^
        (-((b >> 0) & 1) & 0x3b6a57b2) ^
        (-((b >> 1) & 1) & 0x26508e6d) ^
        (-((b >> 2) & 1) & 0x1ea119fa) ^
        (-((b >> 3) & 1) & 0x3d4233dd) ^
        (-((b >> 4) & 1) & 0x2a1462b3)
    );
}

// Compute the prefix checksum
function prefixChk(prefix) {
    let chk = 1;
    for (let i = 0; i < prefix.length; i++) {
        const charCode = prefix.charCodeAt(i);
        if (charCode < 33 || charCode > 126) {
            return `Invalid prefix (${prefix})`;
        }
        chk = polymodStep(chk) ^ (charCode >> 5);
    }
    chk = polymodStep(chk);
    for (let i = 0; i < prefix.length; i++) {
        chk = polymodStep(chk) ^ (prefix.charCodeAt(i) & 0x1f);
    }
    return chk;
}

// Convert data between different bit sizes (5-bit, 8-bit)
function convert(data, inBits, outBits, pad) {
    let value = 0;
    let bits = 0;
    const maxV = (1 << outBits) - 1;
    const result = [];

    for (let i = 0; i < data.length; i++) {
        value = (value << inBits) | data[i];
        bits += inBits;
        while (bits >= outBits) {
            bits -= outBits;
            result.push((value >> bits) & maxV);
        }
    }
    if (pad) {
        if (bits > 0) {
            result.push((value << (outBits - bits)) & maxV);
        }
    } else {
        if (bits >= inBits) return "Excess padding";
        if ((value << (outBits - bits)) & maxV) return "Non-zero padding";
    }
    return result;
}

// Convert bytes to 5-bit words
function toWords(bytes) {
    return convert(bytes, 8, 5, true);
}

// Convert 5-bit words back to bytes (unsafe version)
function fromWordsUnsafe(words) {
    return convert(words, 5, 8, false);
}

// Convert 5-bit words back to bytes (safe version with error handling)
function fromWords(words) {
    const res = fromWordsUnsafe(words);
    if (Array.isArray(res)) return res;
    throw new Error(res);
}

// Get the appropriate library (bech32 or bech32m)
function getLibraryFromEncoding(encoding) {
    const encodingConst = encoding === "bech32" ? 1 : 0x2bc830a3;

    function encode(prefix, words, limit) {
        if (!limit) limit = 90;
        if (prefix.length + 7 + words.length > limit) {
            throw new TypeError("Exceeds length limit");
        }
        let chk = prefixChk(prefix);
        if (typeof chk === "string") {
            throw new Error(chk);
        }
        let result = prefix + "1";
        for (let i = 0; i < words.length; i++) {
            if (words[i] >> 5 !== 0) {
                throw new Error("Non 5-bit word");
            }
            chk = polymodStep(chk) ^ words[i];
            result += ALPHABET.charAt(words[i]);
        }
        for (let i = 0; i < 6; i++) {
            chk = polymodStep(chk);
        }
        chk ^= encodingConst;
        for (let i = 0; i < 6; i++) {
            result += ALPHABET.charAt((chk >> (5 * (5 - i))) & 31);
        }
        return result;
    }

    function decode(str, limit) {
        if (!limit) limit = 90;
        if (str.length < 8) return str + " too short";
        if (str.length > limit) return "Exceeds length limit";
        const lower = str.toLowerCase();
        const upper = str.toUpperCase();
        if (str !== lower && str !== upper) {
            return "Mixed-case string " + str;
        }
        str = lower;
        const pos = str.lastIndexOf("1");
        if (pos === -1) return "No separator character";
        if (pos === 0) return "Missing prefix";
        const prefix = str.slice(0, pos);
        const wordChars = str.slice(pos + 1);
        if (wordChars.length < 6) return "Data too short";
        let chk = prefixChk(prefix);
        if (typeof chk === "string") return chk;
        const words = [];
        for (let i = 0; i < wordChars.length; i++) {
            const char = wordChars.charAt(i);
            const val = ALPHABET_MAP[char];
            if (val === undefined) return "Unknown character " + char;
            chk = polymodStep(chk) ^ val;
            if (i + 6 >= wordChars.length) continue;
            words.push(val);
        }
        if (chk !== encodingConst) return "Invalid checksum";
        return { prefix, words };
    }

    return {
        encode,
        decode,
        toWords,
        fromWords,
        fromWordsUnsafe
    };
}

const bech32 = getLibraryFromEncoding("bech32");
const bech32m = getLibraryFromEncoding("bech32m");

// exports.bech32 = bech32;
// exports.bech32m = bech32m;
