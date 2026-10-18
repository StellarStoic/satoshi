import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OP_RETURN, TOTAL_SATS, priceSats, validateMessage, bytesLeft, messageBytes,
  opReturnScript, scriptToText, chainMessage, latestFromBlocks, boardNote,
  BORDER_PAID, BORDER_CHAIN, orderView, isOrderTerminal,
} from '../opreturnModel.mjs';

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
  for (const text of ['hi', 'gm', 'čas ⚡️', 'x'.repeat(80)]) {
    assert.equal(scriptToText(opReturnScript(text)), text);
  }
});

test('what is not a readable message is not shown as one', () => {
  assert.equal(scriptToText('76a914' + '00'.repeat(20) + '88ac'), null, 'a p2pkh output');
  assert.equal(scriptToText('not hex'), null);
  assert.equal(scriptToText(null), null);
  assert.equal(scriptToText('6a'), null, 'nothing after OP_RETURN');
});

test('the board keeps a paid message and a found one apart', () => {
  const paid = boardNote({ text: 'mine', txid: 'aa', mine: true, theme: 'woven' });
  assert.equal(paid.border, BORDER_PAID);
  assert.equal(paid.theme, 'woven');
  const found = boardNote({ text: 'theirs', txid: 'bb' });
  assert.equal(found.border, BORDER_CHAIN);
  assert.equal(found.theme, null);
});

test('the latest feed flattens blocks newest first and drops the noise', () => {
  const blocks = [
    { height: 900002, timestamp: 1700000000, txs: [
      { txid: 'tx1', vout: [
        { scriptpubkey: '76a914' + '11'.repeat(20) + '88ac' },
        { scriptpubkey: opReturnScript('first') },
      ] },
    ] },
    { height: 900001, timestamp: 1699999400, txs: [
      { txid: 'tx2', vout: [{ scriptpubkey: opReturnScript('second') }] },
    ] },
  ];
  const latest = latestFromBlocks(blocks, 21);
  assert.deepEqual(latest.map(m => m.text), ['first', 'second']);
  assert.equal(latest[0].txid, 'tx1');
  assert.equal(latest[1].blockHeight, 900001);
});

test('the limit holds, and an unreadable entry is skipped not shown', () => {
  const blocks = [{ height: 1, timestamp: 0, txs: [
    { txid: 'a', vout: [{ scriptpubkey: '6a' }, { scriptpubkey: opReturnScript('ok') }] },
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
