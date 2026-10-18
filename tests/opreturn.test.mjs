import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  OP_RETURN, TOTAL_SATS, priceSats, validateMessage, bytesLeft, messageBytes,
  opReturnScript, scriptToText, chainMessage, latestFromBlocks, boardNote,
  BORDER_PAID, BORDER_CHAIN, orderView, isOrderTerminal, sharePattern, recentBoardNotes,
} from '../opreturnModel.mjs';
import { helpCopy, helpSections, PAGE_HELP } from '../siteHelp.mjs';
import { opReturnPaymentOptions, unifiedPaymentUri } from '../opreturnPayment.mjs';

test('OP_RETURN pages use the shared site navigation, controls, and footer', async () => {
  const pages = await Promise.all([
    readFile(new URL('../opreturn.html', import.meta.url), 'utf8'),
    readFile(new URL('../opreturnBoard.html', import.meta.url), 'utf8'),
  ]);
  for (const html of pages) {
    assert.match(html, /<script src="\/pwa\.js" defer><\/script>/);
    assert.match(html, /<nav id="menu"[^>]*><ul><\/ul><\/nav>/);
    assert.match(html, /data-live-footer/);
    assert.match(html, /lni lni-bolt-2/);
    assert.doesNotMatch(html, /id="helpIcon"/);
  }
  assert.match(pages[0], /id="listIcon"[\s\S]*lni-message-3-text/);
  assert.match(pages[0], /Read more[\s\S]*lni-message-3-text/);
  assert.equal((pages[0].match(/type="checkbox"/g) || []).length, 1);
  assert.doesNotMatch(pages[0], /id="isPublic"/);
  assert.match(pages[0], /recentBoardNotes\(data, 5\)/);
  assert.doesNotMatch(pages[0], /\.board-list\s*\{[^}]*overflow-y\s*:\s*auto/);
  assert.doesNotMatch(pages[0], /\.board-list\s*\{[^}]*max-height/);
  assert.match(pages[1], /id="writeIcon"[\s\S]*lni-pencil-1/);
});

test('OP_RETURN help separates plain guidance from public technical details', () => {
  for (const path of ['/opreturn.html', '/opreturnBoard.html']) {
    const sections = helpSections(PAGE_HELP[path]);
    assert.deepEqual(sections.map(section => section.label), ['In plain words', 'Technical']);
    assert.ok(sections[0].paragraphs.length >= 4, `${path} needs a useful plain explanation`);
    assert.ok(sections[1].paragraphs.length >= 4, `${path} needs useful technical detail`);
    const copy = helpCopy(PAGE_HELP[path]);
    assert.match(copy, /public/i);
    assert.match(copy, /OP_RETURN/i);
    assert.doesNotMatch(copy, /worker token|API key|key path|private endpoint|server path/i);
  }
  const writeHelp = helpCopy(PAGE_HELP['/opreturn.html']);
  assert.match(writeHelp, /80 basic English letters[\s\S]*20 orange hearts/i);
  assert.match(writeHelp, /UTF-8[\s\S]*OP_PUSHDATA1/);
  assert.match(helpCopy(PAGE_HELP['/opreturnBoard.html']), /readability heuristic/i);
});

test('a message is judged in bytes, and 80 is the wall', () => {
  assert.equal(messageBytes('abc'), 3);
  assert.equal(messageBytes('č'), 2);
  assert.equal(validateMessage('a'.repeat(80)).ok, true);
  assert.equal(validateMessage('a'.repeat(81)).ok, false);
  assert.equal(bytesLeft('a'.repeat(78)), 2);
});

test('an empty message, or one of pure control characters, is refused', () => {
  assert.equal(validateMessage('').ok, false);
  assert.equal(validateMessage('   ').ok, false);
  assert.equal(validateMessage('\u0001\u0002').ok, false);
  assert.equal(validateMessage('hi\nthere').ok, true, 'newlines are allowed');
});

test('the price is the service fee plus the miner fee, nothing hidden', () => {
  assert.equal(priceSats(), OP_RETURN.serviceSats + OP_RETURN.networkSatsEstimate);
  assert.equal(TOTAL_SATS, priceSats());
  assert.equal(priceSats({ serviceSats: 0, networkSats: 0 }), 0);
});

test('one payment request carries Ark, Lightning, and on-chain fallbacks', () => {
  const order = {sats: 1999, rails: {
    ark: {destination: 'ark1example'},
    lightning: {destination: 'lnbc19990n1example'},
    onchain: {destination: 'bc1qexample'},
  }};
  const combined = unifiedPaymentUri(order);
  assert.equal(combined, 'bitcoin:bc1qexample?amount=0.00001999&ark=ark1example&lightning=lnbc19990n1example');
  assert.deepEqual(opReturnPaymentOptions(order).map(option => option.id),
    ['unified', 'ark', 'lightning', 'onchain']);
  assert.equal(opReturnPaymentOptions(order)[0].uri, combined);
});

test('a single available payment rail stays usable without a combined tab', () => {
  assert.deepEqual(opReturnPaymentOptions({sats: 21, rails: {lightning: {destination: 'lnbc210n1x'}}}), [{
    id: 'lightning', label: 'Lightning', uri: 'lightning:lnbc210n1x', copyValue: 'lnbc210n1x',
  }]);
  assert.deepEqual(opReturnPaymentOptions({sats: 21, rails: {ark: {destination: 'ark1abc'}}}), [{
    id: 'ark', label: 'Ark', uri: 'bitcoin:?amount=0.00000021&ark=ark1abc',
    copyValue: 'bitcoin:?amount=0.00000021&ark=ark1abc',
  }]);
});

test('a message becomes an OP_RETURN script with the right push opcode', () => {
  assert.equal(opReturnScript('hi'), '6a026869');
  // 80 bytes needs OP_PUSHDATA1 (0x4c), because a direct push stops at 75
  const long = opReturnScript('x'.repeat(80));
  assert.ok(long.startsWith('6a4c50'), long.slice(0, 8));
  assert.equal(long.length, 2 + 2 + 2 + 160);
});

test('a script over the limit is refused rather than built', () => {
  assert.throws(() => opReturnScript('x'.repeat(81)), /limit/);
  assert.throws(() => opReturnScript(''), /something to say/);
});

test('scripts round-trip back to text, including emoji and accents', () => {
  for (const text of ['hi there', 'gm', 'čas ⚡️', 'x'.repeat(80)]) {
    assert.equal(scriptToText(opReturnScript(text)), text);
  }
});

test('what is not a readable message is not shown as one', () => {
  assert.equal(scriptToText('76a914' + '00'.repeat(20) + '88ac'), null, 'a p2pkh output');
  assert.equal(scriptToText('not hex'), null);
  assert.equal(scriptToText(null), null);
  assert.equal(scriptToText('6a'), null, 'nothing after OP_RETURN');
});

test('only an explicit branding choice gives a board message the accent border', () => {
  const unbranded = boardNote({ text: 'mine', txid: 'aa', mine: true });
  assert.equal(unbranded.border, BORDER_CHAIN);
  assert.equal('theme' in unbranded, false);
  const branded = boardNote({ text: 'mine', txid: 'bb', mine: true, viaSatoshi: true });
  assert.equal(branded.border, BORDER_PAID);
  assert.equal('theme' in branded, false);
});

test('the write-page board helper merges, sorts, deduplicates, and keeps five', () => {
  const paid = Array.from({ length: 4 }, (_, index) => ({
    txid: `paid-${index}`,
    text: `paid ${index}`,
    publishedAt: `2026-10-${String(index + 10).padStart(2, '0')}T00:00:00Z`,
  }));
  const chain = Array.from({ length: 4 }, (_, index) => ({
    txid: `chain-${index}`,
    text: `chain ${index}`,
    publishedAt: `2026-10-${String(index + 12).padStart(2, '0')}T00:00:00Z`,
  }));
  chain.push({ ...paid[3] });
  const notes = recentBoardNotes({ paid, chain }, 5);
  assert.equal(notes.length, 5);
  assert.equal(new Set(notes.map(note => note.txid)).size, 5);
  assert.deepEqual(notes.map(note => note.txid), ['chain-3', 'chain-2', 'paid-3', 'chain-1', 'paid-2']);
});

test('a transaction id deterministically styles only its share card', async () => {
  const txid = 'ab'.repeat(32);
  assert.deepEqual(sharePattern(txid), sharePattern(txid));
  assert.notEqual(sharePattern(txid).css, sharePattern('cd'.repeat(32)).css);
  assert.match(sharePattern(txid).css, /gradient/);

  const html = await readFile(new URL('../opreturn.html', import.meta.url), 'utf8');
  const boardHtml = await readFile(new URL('../opreturnBoard.html', import.meta.url), 'utf8');
  const cardModule = await readFile(new URL('../opreturnCard.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /id="themeRow"|id="theme"|Border of your note/);
  assert.doesNotMatch(html, /theme:\s*publicEl/);
  assert.match(html, /share-logo[\s\S]*android-chrome-192x192\.png/);
  assert.match(cardModule, /note\.viaSatoshi \? accent : '#7d848f'/);
  for (const page of [html, boardHtml]) {
    assert.match(page, /Transaction ID:[\s\S]*note\.txid \|\| 'unavailable'/);
    assert.match(page, /Date and time:/);
    assert.match(page, /share-brandmark[\s\S]*<span>satoshi\.si<\/span>/);
    assert.match(page, /downloadOpReturnCard/);
    assert.match(page, /shareOpReturnCard/);
    assert.match(page, /lni lni-xmark/);
    assert.match(page, /function fitShareText\(/);
    assert.doesNotMatch(page, /note\.txid\.slice\(0, 32\) \+ ['"](?:…|&hellip;)/);
  }
  assert.match(cardModule, /function wrapText\(/);
  assert.match(cardModule, /txid\.slice\(0, 32\)[\s\S]*txid\.slice\(32\)/);
  assert.match(cardModule, /fillText\('satoshi\.si'/);
  assert.match(helpCopy(PAGE_HELP['/opreturn.html']), /same transaction[\s\S]*same colors and shapes/i);
  assert.match(helpCopy(PAGE_HELP['/opreturnBoard.html']), /four CSS pattern families/i);
});

test('the latest feed flattens blocks newest first and drops the noise', () => {
  const blocks = [
    { height: 900002, timestamp: 1700000000, txs: [
      { txid: 'tx1', vout: [
        { scriptpubkey: '76a914' + '11'.repeat(20) + '88ac' },
        { scriptpubkey: opReturnScript('first message') },
      ] },
    ] },
    { height: 900001, timestamp: 1699999400, txs: [
      { txid: 'tx2', vout: [{ scriptpubkey: opReturnScript('second message') }] },
    ] },
  ];
  const latest = latestFromBlocks(blocks, 21);
  assert.deepEqual(latest.map(m => m.text), ['first message', 'second message']);
  assert.equal(latest[0].txid, 'tx1');
  assert.equal(latest[1].blockHeight, 900001);
});

test('the limit holds, and an unreadable entry is skipped not shown', () => {
  const blocks = [{ height: 1, timestamp: 0, txs: [
    { txid: 'a', vout: [{ scriptpubkey: '6a' }, { scriptpubkey: opReturnScript('ok then') }] },
  ] }];
  assert.equal(latestFromBlocks(blocks, 21).length, 1);
  assert.equal(chainMessage({ txid: 'x', scriptHex: '6a' }), null);
});

test('each order state gets plain words, and only two of them are the end', () => {
  assert.match(orderView({ state: 'awaiting_payment', sats: 1400 }).detail, /1400/);
  assert.equal(orderView({ state: 'published', blockHeight: 900001 }).done, true);
  assert.equal(orderView({ state: 'failed', reason: 'no coins' }).failed, true);
  assert.equal(orderView({ state: 'expired' }).failed, true);
  assert.equal(isOrderTerminal({ state: 'awaiting_payment' }), false);
  assert.equal(isOrderTerminal({ state: 'published' }), true);
  assert.match(orderView({ state: 'brand_new_thing' }).detail, /brand_new_thing/);
});
