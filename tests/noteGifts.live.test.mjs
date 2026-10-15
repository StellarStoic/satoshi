import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {parseLnurlPay, clampZapAmount, zapRequestTemplate, zapCallbackUrl, parseInvoice, lnurlEncode, lnurlDecode} from '../noteGifts.mjs';

/**
 * The half of a zap that is a conversation with someone else's server, driven end to end.
 *
 * The unit tests pin the shapes; this pins the *handshake* against a server that speaks it — that
 * the lnurl-pay answer is read, the amount is fitted to what is accepted, the signed request comes
 * back verbatim as the `nostr` parameter, and the answer's `pr` becomes the invoice. A port is
 * opened on loopback for the duration and closed after, so nothing outside this test is touched.
 */
test('a zap walks the lnurl handshake against a server that speaks it', async () => {
  const invoice = 'lnbc1' + 'q'.repeat(60);
  const seen = {};
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (url.pathname.startsWith('/.well-known/lnurlp/')) {
      response.end(JSON.stringify({
        callback: `http://127.0.0.1:${server.address().port}/cb`,
        minSendable: 100000, maxSendable: 2000000,
        allowsNostr: true, nostrPubkey: 'c'.repeat(64),
      }));
      return;
    }
    if (url.pathname === '/cb') {
      seen.amount = url.searchParams.get('amount');
      seen.nostr = JSON.parse(url.searchParams.get('nostr'));
      seen.lnurl = url.searchParams.get('lnurl');
      response.end(JSON.stringify({pr: invoice}));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({reason: 'no such endpoint'}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/.well-known/lnurlp/tip`;
  try {
    // 1. The address answers with what it accepts, and that it knows nostr.
    const pay = parseLnurlPay(await (await fetch(url, {headers: {Accept: 'application/json'}})).json());
    assert.equal(pay.ok, true);
    assert.equal(pay.allowsNostr, true);

    // 2. The reader's 21 sats are raised to the floor this address states.
    const fit = clampZapAmount(21, pay);
    assert.deepEqual(fit, {ok: true, sats: 100, raised: true});

    // 3. A request, signed the way the page signs it (the shape is what travels).
    const event = {
      ...zapRequestTemplate({noteId: 'a'.repeat(64), authorPubkey: 'b'.repeat(64), amountSats: fit.sats, relays: ['wss://nostr.satoshi.si']}),
      pubkey: 'd'.repeat(64), id: 'e'.repeat(64), sig: 'f'.repeat(128),
    };
    const lnurl = lnurlEncode(url);

    // 4. It becomes the GET, and the server sees every part of it.
    const answer = await (await fetch(zapCallbackUrl({callback: pay.callback, amountSats: fit.sats, event, lnurl}))).json();
    assert.equal(seen.amount, '100000', 'millisats, for the amount that was fitted');
    assert.deepEqual(seen.nostr, event, 'the signed request arrives verbatim');
    assert.equal(lnurlDecode(seen.lnurl), url, 'and the lnurl says which endpoint was asked');
    assert.deepEqual(parseInvoice(answer), {ok: true, invoice});
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
