import {RSVP_KIND} from '../stickyNotesModel.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {REACTION_SET, ZAP_AMOUNTS, emojiTagFor, reactionContent, reactionTemplate, bech32Encode, bech32Decode, lnurlEncode, lnurlDecode, lud16ToLnurlpUrl, parseLnurlPay, clampZapAmount, zapRequestTemplate, zapCallbackUrl, parseInvoice, rsvpTemplate} from '../noteGifts.mjs';
// The names this file's first import list predates, taken the same way rather than rewritten.
import {
  invoiceAmountSats, zapReceiptSats, zapReceiptRequest, giftTally,
  isReactionForNote, isReceiptForNote, receiptMatchesInvoice,
} from '../noteGifts.mjs';

test('an invoice says what it asks for, in sats', () => {
  assert.equal(invoiceAmountSats('lnbc210n1pabcdef'), 21, 'nano-bitcoin: 210 n is 21 sats');
  assert.equal(invoiceAmountSats('lnbc21u1pabcdef'), 2100, 'micro: 21 u is 2,100 sats');
  assert.equal(invoiceAmountSats('lnbc1m1pabcdef'), 100000, 'milli: 1 m is a thousandth of a bitcoin, so 100,000 sats');
  assert.equal(invoiceAmountSats('lnbc2m1pabcdef'), 200000);
  assert.equal(invoiceAmountSats('lnbc10p1pabcdef'), 0, 'a tenth of a sat is not a sat');
  assert.equal(invoiceAmountSats('lightning:lnbc210n1pabcdef'), 21, 'a lightning: prefix is not the invoice');
  assert.equal(invoiceAmountSats('  LNBC210N1PABCDEF  '), 21, 'case and space are the reader\u2019s, not the invoice\u2019s');
  assert.equal(invoiceAmountSats('lnbc1pabcdef'), null, 'an amountless invoice cannot be read here');
  assert.equal(invoiceAmountSats('lnurl1dp68gurn8ghj7'), null, 'not a bolt11 invoice at all');
  assert.equal(invoiceAmountSats(''), null);
  assert.equal(invoiceAmountSats(null), null);
});

test('a receipt says what was paid, and the request it carries is readable', () => {
  const request = {kind: 9734, tags: [['e', 'note-1'], ['amount', '21000']], pubkey: 'abc'};
  const receipt = {kind: 9735, tags: [['e', 'note-1'], ['p', 'abc'], ['description', JSON.stringify(request)], ['bolt11', 'lnbc1000n1pabcdef']]};
  assert.equal(zapReceiptSats(receipt), 21, 'millisats in the request are what was asked for');
  assert.deepEqual(zapReceiptRequest(receipt), request);
  // Without a readable description the invoice still knows what it asks for.
  const terse = {kind: 9735, tags: [['e', 'note-1'], ['description', 'not json'], ['bolt11', 'lnbc1000n1pabcdef']]};
  assert.equal(zapReceiptSats(terse), 100);
  assert.equal(zapReceiptSats({kind: 9735, tags: [['e', 'note-1']]}), null, 'nothing to read');
  assert.equal(zapReceiptRequest({kind: 9735, tags: []}), null);
});

test('a note\u2019s tally counts readers who reacted and adds up the sats zapped to it', () => {
  const reaction = (id, pubkey) => ({id, kind: 7, tags: [['e', 'note-1']], content: '\u{1F9E1}', pubkey});
  const other = {id: 'r3', kind: 7, tags: [['e', 'note-2']], content: '+', pubkey: 'carol'};
  const receipt = (id, msats) => ({id, kind: 9735, tags: [['e', 'note-1'], ['description', JSON.stringify({tags: [['amount', String(msats)]]})]]});
  const events = [reaction('r1', 'alice'), reaction('r2', 'bob'), other, receipt('z1', 21000), receipt('z2', 1000000)];
  assert.deepEqual(giftTally('note-1', events), {reactions: 2, sats: 1021});
  // One reader is one reaction, however many they send: six emoji from one key is one person.
  assert.deepEqual(giftTally('note-1', ['a', 'b', 'c', 'd', 'e', 'f'].map(id => reaction(id, 'alice'))),
    {reactions: 1, sats: 0});
  assert.deepEqual(giftTally('note-1', [reaction('r1', 'alice'), reaction('r4', 'alice'), reaction('r5', 'bob')]),
    {reactions: 2, sats: 0}, 'a reader who reacts twice is still one reader');
  // The same event from a second relay is the same event.
  assert.deepEqual(giftTally('note-1', [...events, reaction('r1', 'alice'), receipt('z1', 21000)]), {reactions: 2, sats: 1021});
  // A note nobody has touched shows nothing rather than zeroes.
  assert.deepEqual(giftTally('note-1', [other]), {reactions: 0, sats: 0});
  assert.deepEqual(giftTally('note-1', []), {reactions: 0, sats: 0});
  assert.deepEqual(giftTally('note-1', null), {reactions: 0, sats: 0});
  // A reaction with no key on it is nobody, not a nameless reader.
  assert.deepEqual(giftTally('note-1', [{id: 'r9', kind: 7, tags: [['e', 'note-1']], content: '+'}]),
    {reactions: 0, sats: 0});
  // Sats are money: they add up whoever sent them, so two zaps are two zaps.
  assert.deepEqual(giftTally('note-1', [receipt('z1', 100000), receipt('z2', 100000)]), {reactions: 0, sats: 200});
  // A receipt whose amount cannot be read adds a zap, not a wrong number.
  assert.deepEqual(giftTally('note-1', [{id: 'z3', kind: 9735, tags: [['e', 'note-1']]}]), {reactions: 0, sats: 0});
  assert.equal(isReactionForNote(reaction('r1', 'alice'), 'note-1'), true);
  assert.equal(isReactionForNote(reaction('r1', 'alice'), 'note-2'), false);
  assert.equal(isReceiptForNote(receipt('z1', 21000), 'note-1'), true);
  assert.equal(isReceiptForNote(reaction('r1', 'alice'), 'note-1'), false, 'a reaction is not a receipt');
});

test('the receipt for the invoice the reader was shown is recognised, and no other is', () => {
  const receipt = {kind: 9735, tags: [['bolt11', 'lnbc210n1pabcdef']]};
  assert.equal(receiptMatchesInvoice(receipt, 'lnbc210n1pabcdef'), true);
  assert.equal(receiptMatchesInvoice(receipt, '  LNBC210N1PABCDEF '), true);
  assert.equal(receiptMatchesInvoice(receipt, 'lightning:lnbc210n1pabcdef'), true);
  assert.equal(receiptMatchesInvoice(receipt, 'lnbc500n1pabcdef'), false, 'a different invoice is a different payment');
  assert.equal(receiptMatchesInvoice(receipt, ''), false);
  assert.equal(receiptMatchesInvoice(receipt, null), false);
  assert.equal(receiptMatchesInvoice({kind: 9735, tags: []}, 'lnbc210n1pabcdef'), false);
});

const NOTE = 'a'.repeat(64);
const AUTHOR = 'b'.repeat(64);

test('the reaction set is the five the reader asked for', () => {
  const points = REACTION_SET.map(item => [...item.emoji].map(char => char.codePointAt(0))).flat();
  assert.deepEqual(points, [0x2705, 0x274e, 0x1f192, 0x1f197, 0x1f9e1], 'white check, cross, cool, OK, orange heart');
  assert.equal(new Set(REACTION_SET.map(item => item.id)).size, REACTION_SET.length, 'ids are distinct');
  assert.equal(new Set(REACTION_SET.map(item => item.emoji)).size, REACTION_SET.length, 'no emoji twice');
  assert.deepEqual([...ZAP_AMOUNTS], [21, 100, 1000, 5000]);
});

test('a reaction is a kind 7 that names the note, its author and its kind', () => {
  const event = reactionTemplate({
    noteId: NOTE, noteKind: 1, authorPubkey: AUTHOR,
    reaction: REACTION_SET[0], relay: 'wss://nostr.satoshi.si', createdAt: 1700000000, pubkey: AUTHOR,
  });
  assert.equal(event.kind, 7);
  assert.equal(event.content, '\u2705');
  assert.equal(event.created_at, 1700000000);
  assert.equal(event.pubkey, AUTHOR);
  assert.deepEqual(event.tags, [
    ['e', NOTE, 'wss://nostr.satoshi.si', AUTHOR],
    ['p', AUTHOR, 'wss://nostr.satoshi.si'],
    ['k', '1'],
  ]);
});

test('a reaction without a relay hint still names the note rather than guessing', () => {
  const event = reactionTemplate({noteId: NOTE, authorPubkey: AUTHOR, reaction: REACTION_SET[3]});
  assert.deepEqual(event.tags, [['e', NOTE], ['p', AUTHOR], ['k', '1']]);
});

test('a reaction refuses a target it cannot name, and refuses to be empty', () => {
  assert.throws(() => reactionTemplate({noteId: 'nope', authorPubkey: AUTHOR, reaction: REACTION_SET[0]}), /id of the note/);
  assert.throws(() => reactionTemplate({noteId: NOTE, authorPubkey: 'short', reaction: REACTION_SET[0]}), /pubkey of the note/);
  assert.throws(() => reactionTemplate({noteId: NOTE, authorPubkey: AUTHOR, reaction: null}), /Pick a reaction/);
});

test('NIP-30 is wired for a custom emoji without the dialog knowing about it', () => {
  const custom = {id: 'pin', shortcode: 'pin', image: 'https://satoshi.si/emoji/pin.png', label: 'Pin'};
  assert.equal(reactionContent(custom), ':pin:');
  assert.deepEqual(emojiTagFor(custom), ['emoji', 'pin', 'https://satoshi.si/emoji/pin.png']);
  const event = reactionTemplate({noteId: NOTE, authorPubkey: AUTHOR, reaction: custom, relay: 'wss://nostr.satoshi.si'});
  assert.equal(event.content, ':pin:');
  assert.deepEqual(event.tags.at(-1), ['emoji', 'pin', 'https://satoshi.si/emoji/pin.png']);
  // A plain Unicode reaction carries no emoji tag at all, which is what NIP-30 asks.
  assert.equal(emojiTagFor(REACTION_SET[0]), null);
  // A shortcode the spec's character set forbids is not smuggled in.
  assert.equal(emojiTagFor({shortcode: 'pi n', image: 'https://x/y.png'}), null);
  assert.equal(reactionContent({shortcode: 'pi n', image: 'https://x/y.png'}), '');
});

test('bech32 agrees with the lnurl in the NIP-57 example', () => {
  // The spec's own Appendix A carries this string as a recipient's lnurl. Decoding it is the one
  // cross-check available without a lightning server, and it fails loudly on a bad checksum.
  const example = 'lnurl1dp68gurn8ghj7um5v93kketj9ehx2amn9uh8wetvdskkkmn0wahz7mrww4excup0dajx2mrv92x9xp';
  const url = lnurlDecode(example);
  assert.match(url, /^https:\/\/[^\s]+$/, 'it decodes to an https URL');
  assert.equal(lnurlEncode(url), example, 'and it re-encodes to exactly the spec string');
  assert.equal(bech32Decode(example).hrp, 'lnurl');
  assert.throws(() => bech32Decode(example.slice(0, -1) + 'q'), /checksum/);
  assert.throws(() => lnurlDecode(bech32Encode('npub', new TextEncoder().encode('x'))), /not a lightning address/);
});

test('a lightning address becomes the endpoint that serves it', () => {
  assert.equal(lud16ToLnurlpUrl('tip@example.com'), 'https://example.com/.well-known/lnurlp/tip');
  assert.equal(lud16ToLnurlpUrl('  Satoshi@Example.COM '), 'https://example.com/.well-known/lnurlp/Satoshi');
  assert.throws(() => lud16ToLnurlpUrl('example.com'), /not a lightning address/);
  assert.throws(() => lud16ToLnurlpUrl('a@b@example.com'), /not a lightning address/);
  assert.throws(() => lud16ToLnurlpUrl('tip@localhost'), /not a lightning address/);
  assert.throws(() => lud16ToLnurlpUrl('tip@example.com/../evil'), /not a lightning address/);
});

test('the lnurl-pay answer decides whether a zap can be recorded at all', () => {
  const good = parseLnurlPay({
    callback: 'https://example.com/lnurlp/tip/cb', minSendable: 1000, maxSendable: 100000000,
    allowsNostr: true, nostrPubkey: 'c'.repeat(64),
  });
  assert.equal(good.ok, true);
  assert.equal(good.allowsNostr, true);
  assert.equal(good.nostrPubkey, 'c'.repeat(64));
  assert.equal(good.minSendable, 1000);
  assert.equal(good.maxSendable, 100000000);

  // A wallet that pays invoices but says nothing about nostr: an invoice is still available, and the
  // board must not claim the payment will be seen on nostr.
  const plain = parseLnurlPay({callback: 'https://example.com/cb', minSendable: 1000, maxSendable: 2000000});
  assert.equal(plain.ok, true);
  assert.equal(plain.allowsNostr, false);
  assert.equal(plain.nostrPubkey, '');

  // A public key that is not a key, or a flag that is the string "true", is not support either.
  assert.equal(parseLnurlPay({callback: 'https://example.com/cb', allowsNostr: true, nostrPubkey: 'nope'}).allowsNostr, false);
  assert.equal(parseLnurlPay({callback: 'https://example.com/cb', allowsNostr: 'true', nostrPubkey: 'c'.repeat(64)}).allowsNostr, false);
  assert.equal(parseLnurlPay({reason: 'This user does not exist.'}).error, 'This user does not exist.');
  assert.equal(parseLnurlPay({minSendable: 1000}).ok, false, 'no callback is not a payable address');
});

test('a zap below the floor is raised and one above the ceiling lowered, and neither is a refusal', () => {
  const pay = {minSendable: 100000, maxSendable: 2000000};
  assert.deepEqual(clampZapAmount(500, pay), {ok: true, sats: 500, raised: false, lowered: false});
  assert.deepEqual(clampZapAmount(21, pay), {ok: true, sats: 100, raised: true});
  assert.deepEqual(clampZapAmount(5000, pay), {ok: true, sats: 2000, lowered: true});
  assert.equal(clampZapAmount(0, pay).ok, false);
  assert.equal(clampZapAmount(-1, pay).ok, false);
  assert.equal(clampZapAmount(NaN, pay).ok, false);
  assert.equal(clampZapAmount(100, {minSendable: 2000000, maxSendable: 1000}).ok, false, 'an impossible range is refused');
});

test('a zap request is a kind 9734 with the tags the spec names', () => {
  const event = zapRequestTemplate({
    noteId: NOTE, noteKind: 1, authorPubkey: AUTHOR, amountSats: 21, comment: 'Nice pin',
    relays: ['wss://nostr.satoshi.si', 'wss://nos.lol'], createdAt: 1700000000, pubkey: AUTHOR,
  });
  assert.equal(event.kind, 9734);
  assert.equal(event.content, 'Nice pin');
  // Appendix A: relays is a flat list, amount is millisats, p is who is paid, e and k name the note.
  assert.deepEqual(event.tags, [
    ['relays', 'wss://nostr.satoshi.si', 'wss://nos.lol'],
    ['amount', '21000'],
    ['p', AUTHOR],
    ['e', NOTE],
    ['k', '1'],
  ]);
  assert.equal(event.tags.find(tag => tag[0] === 'relays').some(part => Array.isArray(part)), false, 'relays are not nested');
  assert.throws(() => zapRequestTemplate({noteId: NOTE, authorPubkey: 'short', amountSats: 21}), /pubkey of the note/);
  assert.throws(() => zapRequestTemplate({noteId: NOTE, authorPubkey: AUTHOR, amountSats: 0}), /how many sats/);
});

test('a zap request drops junk relays and keeps the comment within reason', () => {
  const event = zapRequestTemplate({
    noteId: NOTE, authorPubkey: AUTHOR, amountSats: 100, relays: ['wss://nos.lol', 'wss://nos.lol', 'https://not-a-relay', '', 'wss://ditto.pub'],
    comment: 'x'.repeat(400),
  });
  assert.deepEqual(event.tags[0], ['relays', 'wss://nos.lol', 'wss://ditto.pub'], 'deduplicated, no https, no empties');
  assert.equal(event.content.length, 280);
});

test('the zap request becomes the GET the recipient\u2019s server expects', () => {
  const event = zapRequestTemplate({noteId: NOTE, authorPubkey: AUTHOR, amountSats: 100, relays: ['wss://nostr.satoshi.si'], pubkey: AUTHOR});
  const url = zapCallbackUrl({callback: 'https://example.com/lnurlp/tip/cb', amountSats: 100, event, lnurl: lnurlEncode('https://example.com/.well-known/lnurlp/tip')});
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://example.com/lnurlp/tip/cb');
  assert.equal(parsed.searchParams.get('amount'), '100000', 'millisats');
  assert.deepEqual(JSON.parse(parsed.searchParams.get('nostr')), event, 'the signed event travels as JSON');
  assert.equal(lnurlDecode(parsed.searchParams.get('lnurl')), 'https://example.com/.well-known/lnurlp/tip');
  // A callback that already carries a query keeps it.
  assert.match(zapCallbackUrl({callback: 'https://example.com/cb?k=1', amountSats: 21, event}), /^https:\/\/example\.com\/cb\?k=1&amount=21000/);
  assert.throws(() => zapCallbackUrl({callback: 'not a url', amountSats: 21, event}), /payment callback/);
});

test('the answer is an invoice or a reason, and nothing else passes for one', () => {
  assert.equal(parseInvoice({pr: 'lnbc10u1p3unwfusp5t9r3yymhpfqculx78u027lxspgxcr2n2987mx2j55nnfs95nxnz'}).ok, true);
  assert.equal(parseInvoice({pr: 'lntb1abcdef'}).ok, true);
  assert.equal(parseInvoice({reason: 'Amount too small'}).error, 'Amount too small');
  assert.equal(parseInvoice({status: 'ERROR'}).ok, false);
  assert.equal(parseInvoice({}).ok, false);
  assert.equal(parseInvoice({pr: 'https://example.com'}).ok, false, 'not every string is an invoice');
  assert.equal(parseInvoice({pr: 'lnbc 1p3unwfus'}).ok, false);
});

// ------------------------------------------------------------------ the answer to a calendar event
test('an RSVP is an addressable answer to one event coordinate', () => {
  const coordinate = `31923:${'a'.repeat(64)}:ridge`;
  const template = rsvpTemplate({coordinate, status: 'accepted', eventId: 'b'.repeat(64), authorPubkey: 'c'.repeat(64)});
  assert.equal(template.kind, 31925);
  assert.equal(template.content, '');
  assert.deepEqual(template.tags.slice(0, 3), [['a', coordinate], ['d', coordinate], ['status', 'accepted']]);
  // d is the coordinate itself, so answering again replaces the earlier answer instead of piling up
  assert.equal(template.tags[1][1], template.tags[0][1]);
});

test('an RSVP refuses what it cannot answer', () => {
  assert.throws(() => rsvpTemplate({coordinate: 'naddr1abc', status: 'accepted'}), /coordinate/);
  assert.throws(() => rsvpTemplate({coordinate: `31922:${'a'.repeat(64)}:x`, status: 'yes'}), /attending|maybe/i);
  for (const status of ['accepted', 'tentative', 'declined']) {
    assert.equal(rsvpTemplate({coordinate: `31922:${'a'.repeat(64)}:x`, status}).tags[2][1], status);
  }
});
