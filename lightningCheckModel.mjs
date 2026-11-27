// Rules behind the Check LN tool: what the reader pasted, and what it actually says.
//
// Pure on purpose. Everything here is decided without a network and without a DOM, so `node --test` covers
// the parts that can be silently wrong: bech32 checksums, BOLT11 field parsing, the millisatoshi
// arithmetic and the LUD-06 / LUD-16 / LUD-01 field checks.
//
// No cryptography is done here. A BOLT11 signature is reported as present and sized, never verified:
// verifying it needs ECDSA recovery over secp256k1, and a hand-written version of that is how a checker
// learns to say "valid" about anything.

export const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
    let checksum = 1;
    for (const value of values) {
        const top = checksum >>> 25;
        checksum = ((checksum & 0x1ffffff) << 5) ^ value;
        for (let bit = 0; bit < 5; bit += 1) {
            if ((top >>> bit) & 1) checksum ^= GENERATOR[bit];
        }
    }
    return checksum;
}

function hrpExpand(hrp) {
    const out = [];
    for (const char of hrp) out.push(char.charCodeAt(0) >>> 5);
    out.push(0);
    for (const char of hrp) out.push(char.charCodeAt(0) & 31);
    return out;
}

/**
 * bech32 → {hrp, words}.
 *
 * The 90-character limit of BIP-173 is deliberately not enforced: a Lightning invoice and an `lnurl` are
 * both far longer than a segwit address, and refusing them on length would reject every real input.
 */
export function bech32Decode(text) {
    const clean = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
    const split = clean.lastIndexOf('1');
    if (split < 1) throw new Error('no separator in the bech32 string');
    const hrp = clean.slice(0, split);
    const words = [];
    for (const char of clean.slice(split + 1)) {
        const index = BECH32_CHARSET.indexOf(char);
        if (index === -1) throw new Error(`"${char}" is not a bech32 character`);
        words.push(index);
    }
    if (words.length < 6) throw new Error('too short to carry a checksum');
    const checksumOk = polymod([...hrpExpand(hrp), ...words]) === 1;
    return {hrp, words: words.slice(0, -6), checksumOk};
}

/** 5-bit groups → bytes; `pad` is false for every bech32 payload that must round-trip exactly. */
export function convertBits(data, from, to, pad = false) {
    let accumulator = 0;
    let bits = 0;
    const out = [];
    const max = (1 << to) - 1;
    for (const value of data) {
        if (value < 0 || value >> from !== 0) throw new Error('bit conversion: value out of range');
        accumulator = (accumulator << from) | value;
        bits += from;
        while (bits >= to) {
            bits -= to;
            out.push((accumulator >>> bits) & max);
        }
    }
    if (pad) {
        if (bits > 0) out.push((accumulator << (to - bits)) & max);
    } else if (bits >= from || ((accumulator << (to - bits)) & max) !== 0) {
        throw new Error('bit conversion: incomplete group');
    }
    return out;
}

const toHex = (bytes) => bytes.map(b => b.toString(16).padStart(2, '0')).join('');

/**
 * What the reader pasted.
 *
 * One input has to take an invoice, an `lnurl`, a Lightning address and the `lightning:` URI wrappers that
 * wallets hand out, because the reader copies whatever their wallet or a shop page gave them.
 */
export function detectKind(raw) {
    let text = String(raw || '').trim();
    const uri = text.match(/^lightning:(.*)$/i);
    if (uri) text = uri[1].trim();
    text = text.replace(/\s+/g, '');
    if (!text) return {kind: 'empty', text: ''};
    const lower = text.toLowerCase();
    if (/^(lnbc|lntb|lnbcrt|lnsb|lnsb|lnbcrt)/.test(lower) && !lower.startsWith('lnurl')) return {kind: 'invoice', text: lower};
    if (lower.startsWith('lnurl')) return {kind: 'lnurl', text: lower};
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return {kind: 'address', text};
    if (/^https?:\/\//i.test(text)) return {kind: 'endpoint', text};
    if (/^[0-9a-f]{64}$/i.test(text)) return {kind: 'payment-hash', text: lower};
    return {kind: 'unknown', text};
}

/** The `https://` address a Lightning address or an `lnurl` points at (LUD-16, LUD-01). */
export function lnurlTarget(input) {
    const detected = typeof input === 'string' ? detectKind(input) : input;
    if (detected.kind === 'address') {
        const [name, domain] = detected.text.split('@');
        if (!name || !domain) throw new Error('an address needs a name before the @ and a domain after it');
        return {
            url: `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`,
            source: `Lightning address (LUD-16): ${name} at ${domain}`,
        };
    }
    if (detected.kind === 'lnurl') {
        const {hrp, words, checksumOk} = bech32Decode(detected.text);
        if (hrp !== 'lnurl') throw new Error(`that bech32 string is "${hrp}", not an lnurl`);
        if (!checksumOk) throw new Error('the lnurl checksum does not match — a character was lost or changed');
        const url = new TextDecoder().decode(new Uint8Array(convertBits(words, 5, 8, false)));
        if (!/^https?:\/\//i.test(url)) throw new Error('the lnurl does not decode to an http(s) address');
        return {url, source: 'LNURL (LUD-01), decoded from bech32'};
    }
    if (detected.kind === 'endpoint') return {url: detected.text, source: 'a URL used as an LNURL endpoint'};
    throw new Error('this is not a Lightning address or an lnurl');
}

const NETWORKS = {bc: 'mainnet', tb: 'testnet', bcrt: 'regtest', sb: 'signet', tbs: 'testnet (signet)'};
const MULTIPLIERS = {
    '': 100000000000n,     // 1 BTC = 1e11 msat
    m: 100000000n,         // milli 1e-3 BTC
    u: 100000n,            // micro 1e-6 BTC
    n: 100n,               // nano  1e-9 BTC
    p: 1n,                 // pico  1e-12 BTC = 0.1 msat, handled below
};

function readInt(words) {
    let value = 0n;
    for (const word of words) value = (value << 5n) | BigInt(word);
    return value;
}

/**
 * BOLT11 → every field it carries, plus what is wrong with it.
 *
 * Field order matters: the first 35 bits are the timestamp, the last 104 words are the 65-byte signature,
 * and everything between is tagged fields.
 */
export function decodeInvoice(raw, now = Date.now()) {
    const detected = detectKind(raw);
    if (detected.kind !== 'invoice') throw new Error('this is not a BOLT11 invoice');
    const {hrp, words, checksumOk} = bech32Decode(detected.text);
    const problems = [];

    const match = hrp.match(/^ln(bcrt|bc|tb|sb|tbs)([0-9]+)?([munp])?$/);
    if (!match) throw new Error(`"${hrp}" is not an invoice prefix (expected lnbc, lntb, lnbcrt or lnsb)`);
    const [, networkCode, amountDigits, multiplier = ''] = match;
    const network = NETWORKS[networkCode] || networkCode;

    let amountMsat = null;
    if (amountDigits) {
        // pico is the one multiplier with no whole-millisatoshi form: 1 picoshi = 0.1 msat
        amountMsat = multiplier === 'p'
            ? Number(amountDigits) / 10
            : Number(BigInt(amountDigits) * MULTIPLIERS[multiplier]);
    } else {
        problems.push({level: 'info', text: 'no amount in the invoice: the payer chooses (an "any amount" invoice)'});
    }

    if (words.length < 7 + 104) throw new Error('the data part is too short to be an invoice');
    const timestamp = Number(readInt(words.slice(0, 7)));
    const body = words.slice(7, words.length - 104);
    const signatureWords = words.slice(words.length - 104);

    const fields = [];
    let index = 0;
    const tagName = (word) => BECH32_CHARSET[word] ?? '?';
    while (index + 3 <= body.length) {
        const tag = tagName(body[index]);
        const length = (body[index + 1] << 5) | body[index + 2];
        const data = body.slice(index + 3, index + 3 + length);
        if (data.length !== length) {
            problems.push({level: 'error', text: `field "${tag}" claims ${length} words but the invoice ends first`});
            break;
        }
        fields.push({tag, data});
        index += 3 + length;
    }
    if (index !== body.length) problems.push({level: 'warn', text: 'there are trailing words after the last field'});

    const found = {};
    for (const {tag, data} of fields) {
        switch (tag) {
            case 'p': found.paymentHash = toHex(convertBits(data, 5, 8)); break;
            case 's': found.paymentSecret = toHex(convertBits(data, 5, 8)); break;
            case 'd': found.description = new TextDecoder().decode(new Uint8Array(convertBits(data, 5, 8))); break;
            case 'h': found.descriptionHash = toHex(convertBits(data, 5, 8)); break;
            case 'n': found.payeeNodeId = toHex(convertBits(data, 5, 8)); break;
            case 'x': found.expirySeconds = Number(readInt(data)); break;
            case 'c': found.minFinalCltvExpiry = Number(readInt(data)); break;
            case '9': found.features = readInt(data).toString(2); break;
            case 'r': found.routeHints = (found.routeHints || 0) + 1; break;
            case 'f': found.fallbackAddress = toHex(convertBits(data, 5, 8)); break;
            default: problems.push({level: 'info', text: `unknown field "${tag}" (${data.length} words)`});
        }
    }

    const expirySeconds = found.expirySeconds ?? 3600;
    const expiresAt = timestamp + expirySeconds;
    const signature = convertBits(signatureWords, 5, 8);
    if (signature.length !== 65) problems.push({level: 'error', text: `the signature is ${signature.length} bytes, not 65`});
    if (!checksumOk) problems.push({level: 'error', text: 'the bech32 checksum does not match — the invoice was copied incompletely'});
    if (!found.paymentHash) problems.push({level: 'error', text: 'no payment hash (field "p")'});
    if (found.payeeNodeId && found.payeeNodeId.length !== 66) {
        problems.push({level: 'warn', text: `the payee node id is ${found.payeeNodeId.length / 2} bytes, and a compressed public key is 33`});
    }
    if (found.description && found.descriptionHash) problems.push({level: 'warn', text: 'both a description and a description hash are present'});
    if (!found.description && !found.descriptionHash) problems.push({level: 'warn', text: 'neither a description nor a description hash'});

    const nowSeconds = Math.floor(now / 1000);
    const expired = expiresAt < nowSeconds;
    const remaining = expiresAt - nowSeconds;
    if (expired) problems.push({level: 'error', text: 'this invoice has expired and cannot be paid'});

    return {
        type: 'invoice',
        invoice: detected.text,
        network,
        amountMsat,
        amountSats: amountMsat === null ? null : amountMsat / 1000,
        createdAt: new Date(timestamp * 1000).toISOString(),
        expirySeconds,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        expired,
        secondsRemaining: remaining,
        ...found,
        signatureBytes: signature.length,
        signatureChecked: false,
        checksumOk,
        fieldTags: fields.map(f => f.tag),
        problems,
    };
}

/** The millisatoshi / satoshi pair, written the way a reader counts. */
export function formatAmount(msat) {
    if (msat === null || msat === undefined || Number.isNaN(msat)) return 'any amount';
    const sats = msat / 1000;
    if (!Number.isInteger(sats)) return `${msat} msat (${sats} sats)`;
    return `${sats.toLocaleString('en-US')} ${sats === 1 ? 'sat' : 'sats'}`;
}

/**
 * A pay request (LUD-06) read for what it promises.
 *
 * Amounts are millisatoshis here — the unit mistake that makes a 1,000-sat invoice look like a million.
 */
export function describePayRequest(payload, url, now = Date.now()) {
    const problems = [];
    const json = payload || {};
    if (json.tag !== 'payRequest') problems.push({level: 'error', text: `tag is "${json.tag}", expected "payRequest"`});
    let callbackOk = false;
    try {
        const callback = new URL(json.callback);
        callbackOk = callback.protocol === 'https:' || callback.protocol === 'http:';
        if (!callbackOk) problems.push({level: 'error', text: 'the callback is not an http(s) address'});
    } catch {
        problems.push({level: 'error', text: 'the callback is missing or not a URL'});
    }
    const min = Number(json.minSendable);
    const max = Number(json.maxSendable);
    if (!Number.isFinite(min) || min < 0) problems.push({level: 'error', text: 'minSendable is missing or not a number'});
    if (!Number.isFinite(max) || max <= 0) problems.push({level: 'error', text: 'maxSendable is missing or not a number'});
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) problems.push({level: 'error', text: 'minSendable is larger than maxSendable'});
    if (Number.isFinite(min) && Number.isFinite(max) && min === 0) problems.push({level: 'warn', text: 'minSendable is 0, which some wallets refuse'});
    if (Number.isFinite(max) && max === 0) problems.push({level: 'error', text: 'maxSendable is 0: this address cannot receive'});

    const metadata = [];
    let metadataProblem = null;
    try {
        const parsed = JSON.parse(json.metadata);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        for (const entry of parsed) {
            if (!Array.isArray(entry) || entry.length !== 2) throw new Error('an entry is not a [type, value] pair');
            metadata.push({type: entry[0], value: entry[1]});
        }
    } catch (error) {
        metadataProblem = `metadata is not the JSON array LUD-06 requires: ${error.message}`;
        problems.push({level: 'error', text: metadataProblem});
    }
    const descriptionEntry = metadata.find(entry => entry.type === 'text/plain' || entry.type === 'text/long-desc');
    const imageEntry = metadata.find(entry => /^image\//.test(entry.type));

    if (json.allowsNostr && !json.nostrPubkey) problems.push({level: 'warn', text: 'allowsNostr is set but there is no nostrPubkey'});
    if (json.nostrPubkey && !/^[0-9a-f]{64}$/i.test(json.nostrPubkey)) problems.push({level: 'warn', text: 'nostrPubkey is not a 32-byte hex key'});
    if (json.callback && url) {
        try {
            const a = new URL(json.callback);
            const b = new URL(url);
            if (a.host !== b.host && !json.callback.startsWith('https://')) {
                problems.push({level: 'warn', text: `the callback is on ${a.host} while the address is on ${b.host}`});
            }
        } catch { /* already reported */ }
    }
    if (json.successAction) {
        const sa = json.successAction;
        if (sa.tag === 'url') problems.push({level: 'info', text: 'a url success action is offered: the wallet opens it only after payment'});
        if (sa.tag === 'message') problems.push({level: 'info', text: 'a message success action is offered'});
        if (sa.tag === 'aes') problems.push({level: 'info', text: 'an aes success action is offered: the wallet decrypts a secret it already holds'});
    }

    return {
        type: 'payRequest',
        url,
        callback: json.callback,
        minSendable: min,
        maxSendable: max,
        minSats: Number.isFinite(min) ? min / 1000 : null,
        maxSats: Number.isFinite(max) ? max / 1000 : null,
        commentAllowed: json.commentAllowed ?? 0,
        allowsNostr: Boolean(json.allowsNostr),
        nostrPubkey: json.nostrPubkey || '',
        description: descriptionEntry ? descriptionEntry.value : '',
        hasImage: Boolean(imageEntry),
        metadata,
        successAction: json.successAction || null,
        disposable: Boolean(json.disposable),
        problems,
        checkedAt: new Date(now).toISOString(),
    };
}

/** A withdraw request, an auth request or anything else an LNURL endpoint can answer. */
export function describeOtherLnurl(payload) {
    const json = payload || {};
    const problems = [];
    const tag = json.tag || '(none)';
    if (tag === 'withdrawRequest') {
        if (!json.callback) problems.push({level: 'error', text: 'a withdraw request needs a callback'});
        if (!Number.isFinite(Number(json.maxWithdrawable))) problems.push({level: 'error', text: 'maxWithdrawable is missing'});
        if (!Number.isFinite(Number(json.minWithdrawable))) problems.push({level: 'warn', text: 'minWithdrawable is missing'});
    } else if (tag === 'login') {
        if (!json.k1 || !/^[0-9a-f]{64}$/i.test(json.k1)) problems.push({level: 'error', text: 'a login request needs a 32-byte hex k1'});
    } else {
        problems.push({level: 'warn', text: `tag "${tag}" is not payRequest, withdrawRequest or login`});
    }
    return {
        type: tag === 'login' ? 'auth' : tag,
        minWithdrawable: Number(json.minWithdrawable) || 0,
        maxWithdrawable: Number(json.maxWithdrawable) || 0,
        callback: json.callback || '',
        k1: json.k1 || '',
        defaultDescription: json.defaultDescription || '',
        problems,
    };
}

/** Which reader a `tag` calls for. */
export function describeLnurl(payload, url, now = Date.now()) {
    const tag = payload && payload.tag;
    if (tag === 'payRequest') return describePayRequest(payload, url, now);
    return describeOtherLnurl(payload);
}
