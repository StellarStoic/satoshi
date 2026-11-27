// The Check LN tool decides what a pasted string is and what it says. These are the decisions that can be
// wrong without looking wrong, so they are tested against the BOLT11 specification's own vectors.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    bech32Decode,
    convertBits,
    decodeInvoice,
    describeLnurl,
    describePayRequest,
    detectKind,
    formatAmount,
    lnurlTarget,
} from '../lightningCheckModel.mjs';

// From lightning/bolts, 11-payment-encoding.md: 2500 micro-bitcoin, "1 cup coffee", 60 s expiry.
const COFFEE = 'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh';
// 25 milli-bitcoin, "coffee beans", and — unlike the vector above — it carries a payee node id (field "n").
const BEANS = 'lnbc25m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5vdhkven9v5sxyetpdeessp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygs9q5sqqqqqqqqqqqqqqqqsgqnp5qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqf9dt6rzhc3ynq3u7axf4xc3zaw3fy2kyqal6n86nh5j3lhgcutdjzhvswudd5l8ay9acgrrpd2e6vw9sdqxq6dzq983sgt7dpxk5wacqacdc2y';
// The same shape with a Japanese description, and with the amount in the prefix only once.
const NOONSENSE = 'lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpquwpc4curk03c9wlrswe78q4eyqc7d8d0xqzpu9qrsgqhtjpauu9ur7fw2thcl4y9vfvh4m9wlfyz2gem29g5ghe2aak2pm3ps8fdhtceqsaagty2vph7utlgj48u0ged6a337aewvraedendscp573dxr';
// LUD-01's own example, which must decode to a URL.
const LUD01 = 'lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns';

test('bech32 is decoded with its checksum checked, not assumed', () => {
    const coffee = bech32Decode(COFFEE);
    assert.equal(coffee.hrp, 'lnbc2500u');
    assert.equal(coffee.checksumOk, true);
    // one character changed: the checksum must notice, because that is the whole point of pasting it here
    const broken = COFFEE.slice(0, 40) + (COFFEE[40] === 'q' ? 'p' : 'q') + COFFEE.slice(41);
    assert.equal(bech32Decode(broken).checksumOk, false);
    assert.throws(() => bech32Decode('notbech32'), /separator|bech32 character/);
});

test('an invoice is read field by field against the spec vector', () => {
    const invoice = decodeInvoice(COFFEE, Date.UTC(2017, 5, 1, 13, 0, 0));
    assert.equal(invoice.type, 'invoice');
    assert.equal(invoice.network, 'mainnet');
    assert.equal(invoice.amountMsat, 250000000);
    assert.equal(invoice.amountSats, 250000);
    assert.equal(invoice.description, '1 cup coffee');
    assert.equal(invoice.expirySeconds, 60);
    assert.equal(invoice.createdAt, new Date(1496314658 * 1000).toISOString());
    assert.equal(invoice.expiresAt, new Date((1496314658 + 60) * 1000).toISOString());
    assert.match(invoice.paymentHash, /^[0-9a-f]{64}$/);
    // this vector carries no "n" field: an invoice is not required to name its node, and reporting one
    // that was never there would be invented data
    assert.equal(invoice.payeeNodeId, undefined);
    assert.equal(invoice.paymentSecret, '1111111111111111111111111111111111111111111111111111111111111111');
    assert.equal(invoice.signatureBytes, 65);
    assert.equal(invoice.signatureChecked, false);
    // read against a clock a year later, this invoice is dead, and saying so is the useful part
    const stale = decodeInvoice(COFFEE, Date.UTC(2018, 5, 1));
    assert.equal(stale.expired, true);
    assert.ok(stale.problems.some(p => /expired/.test(p.text) && p.level === 'error'));
});

test('a payee node id is read when the invoice carries one', () => {
    const invoice = decodeInvoice(BEANS, Date.UTC(2017, 5, 1, 13, 0, 0));
    // 25 milli-bitcoin is 2,500,000 sats: the multiplier is part of the amount, not decoration
    assert.equal(invoice.amountSats, 2500000);
    assert.equal(invoice.description, 'coffee beans');
    // the spec's own vector zeroes the node id, and at 32 bytes it is shorter than a compressed key:
    // the field is read and kept, and its length is flagged rather than quietly accepted
    assert.equal(invoice.payeeNodeId, '0'.repeat(64));
    assert.deepEqual(invoice.fieldTags, ['p', 'd', 's', '9', 'n']);
    assert.ok(invoice.problems.some(p => /node id is 32 bytes/.test(p.text)));
    assert.equal(invoice.paymentSecret, '1111111111111111111111111111111111111111111111111111111111111111');
    assert.equal(invoice.checksumOk, true);
});

test('a non-ASCII description survives the 5-bit regrouping', () => {
    const invoice = decodeInvoice(NOONSENSE, Date.UTC(2017, 5, 1, 13, 0, 0));
    assert.equal(invoice.description, 'ナンセンス 1杯');
    assert.equal(invoice.amountSats, 250000);
});

test('what was pasted is recognised before anything is fetched', () => {
    assert.equal(detectKind(COFFEE).kind, 'invoice');
    assert.equal(detectKind(`lightning:${COFFEE}`).kind, 'invoice');
    assert.equal(detectKind(LUD01).kind, 'lnurl');
    assert.equal(detectKind('one@satoshi.si').kind, 'address');
    assert.equal(detectKind('https://example.com/lnurlp/one').kind, 'endpoint');
    assert.equal(detectKind('a'.repeat(64)).kind, 'payment-hash');
    assert.equal(detectKind('   ').kind, 'empty');
    assert.equal(detectKind('hello world').kind, 'unknown');
    // whitespace from a wrapped paste must not break the reading
    assert.equal(detectKind(COFFEE.replace(/(.{60})/g, '$1\n')).kind, 'invoice');
});

test('an address becomes the well-known URL LUD-16 defines, and an lnurl becomes its own', () => {
    assert.deepEqual(lnurlTarget('one@satoshi.si').url, 'https://satoshi.si/.well-known/lnurlp/one');
    const decoded = lnurlTarget(LUD01);
    assert.equal(decoded.url.startsWith('https://'), true);
    assert.match(decoded.source, /LUD-01/);
    assert.throws(() => lnurlTarget(COFFEE), /not a Lightning address|lnurl/);
    assert.throws(() => lnurlTarget('lnurl1qqqqqq'), /too short|checksum|separator/);
});

test('a pay request is checked for the promises it makes, in millisatoshis', () => {
    const payload = {
        tag: 'payRequest',
        callback: 'https://example.com/lnurlp/one/callback',
        minSendable: 1000,
        maxSendable: 100000000,
        metadata: JSON.stringify([['text/plain', 'A test address'], ['image/png;base64', 'AAAA']]),
        commentAllowed: 255,
        allowsNostr: true,
        nostrPubkey: 'a'.repeat(64),
    };
    const described = describePayRequest(payload, 'https://example.com/.well-known/lnurlp/one');
    assert.equal(described.type, 'payRequest');
    assert.equal(described.minSats, 1);
    assert.equal(described.maxSats, 100000);
    assert.equal(described.description, 'A test address');
    assert.equal(described.hasImage, true);
    assert.equal(described.commentAllowed, 255);
    assert.deepEqual(described.problems, []);

    // maxSendable 0 means the address cannot receive at all, which must not read as an ordinary value
    const deaf = describePayRequest({...payload, maxSendable: 0}, 'https://example.com/x');
    assert.ok(deaf.problems.some(p => /cannot receive/.test(p.text)));

    const inverted = describePayRequest({...payload, minSendable: 5000, maxSendable: 1000}, 'https://example.com/x');
    assert.ok(inverted.problems.some(p => /minSendable is larger/.test(p.text)));

    const wrongTag = describePayRequest({...payload, tag: 'withdrawRequest'}, 'https://example.com/x');
    assert.ok(wrongTag.problems.some(p => /tag is/.test(p.text)));

    const badMetadata = describePayRequest({...payload, metadata: 'not json'}, 'https://example.com/x');
    assert.ok(badMetadata.problems.some(p => /metadata/.test(p.text)));

    const noPubkey = describePayRequest({...payload, nostrPubkey: undefined}, 'https://example.com/x');
    assert.ok(noPubkey.problems.some(p => /allowsNostr/.test(p.text)));
});

test('withdraw and login answers are described rather than misread as pay requests', () => {
    const login = describeLnurl({tag: 'login', k1: 'b'.repeat(64), callback: 'https://example.com/cb'}, 'https://example.com');
    assert.equal(login.type, 'auth');
    assert.deepEqual(login.problems, []);
    const brokenLogin = describeLnurl({tag: 'login', k1: 'nope'}, 'https://example.com');
    assert.ok(brokenLogin.problems.some(p => /k1/.test(p.text)));
    const withdraw = describeLnurl({tag: 'withdrawRequest', callback: 'https://example.com/cb', maxWithdrawable: 5000, minWithdrawable: 1000}, 'https://example.com');
    assert.equal(withdraw.maxWithdrawable, 5000);
    const unknown = describeLnurl({tag: 'somethingElse'}, 'https://example.com');
    assert.ok(unknown.problems.some(p => /not payRequest/.test(p.text)));
});

test('amounts are printed the way a reader counts them', () => {
    assert.equal(formatAmount(250000000), '250,000 sats');
    assert.equal(formatAmount(1000), '1 sat');
    assert.equal(formatAmount(1500), '1500 msat (1.5 sats)');
    assert.equal(formatAmount(null), 'any amount');
});

test('bit conversion refuses an incomplete group instead of padding it', () => {
    assert.deepEqual(convertBits([0, 0, 0], 5, 8, true), [0, 0]);
    assert.throws(() => convertBits([1], 5, 8, false), /incomplete/);
});
