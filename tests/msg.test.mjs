// Tests for the message tool. The fixtures are real answers from SatWire's public API,
// captured while probing the flow (both orders were cancelled afterwards).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SATWIRE,
  CUT_SATS,
  messageBytes,
  validateMessage,
  requestBody,
  satsToBtc,
  bip21,
  parseRequest,
  parseStatus,
  statusView,
  isTerminal,
  priceBreakdown,
} from '../msgModel.mjs';

// POST /api/message-request, 2026-10-17: message + our cut folded in.
const REQUEST = {
  requestId: 'e3e33e8d-95ce-44ac-a7f1-d7782f3c7cdb',
  address: 'bc1qgytcj5utuczsecrran65jzu5slxh5vwfahrgxg',
  requiredAmountSatoshis: 4326,
  isPublic: true,
  message: 'Send the specified amount to the address to embed your message.',
};

// GET /api/request-status/:id, same request, unpaid.
const STATUS = {
  id: 'e3e33e8d-95ce-44ac-a7f1-d7782f3c7cdb',
  status: 'pending_payment',
  createdAt: '2026-10-17T23:31:56.377Z',
  message: 'shape probe',
  payloadKind: 'text',
  address: 'bc1qgytcj5utuczsecrran65jzu5slxh5vwfahrgxg',
  requiredAmountSatoshis: 4326,
  targetAddress: 'bc1q2ytw4gwrkw5jg6ekutcwrgw8x5nlkahyk54l5e',
  amountToSend: 1000,
  feeRate: 2,
  paymentTxId: null,
  paymentReceivedSatoshis: null,
  paymentConfirmationCount: null,
  opReturnTxId: null,
  opReturnConfirmedAt: null,
  opReturnBlockHeight: null,
  failureReason: null,
  attemptCount: 0,
  refundTxId: null,
  refundedAt: null,
  isPublic: 1,
  publicAt: '2026-10-17T23:31:56.387Z',
  paymentMethod: null,
  lnInvoice: null,
};

test('a message is measured in bytes, because the limit is in bytes', () => {
  assert.equal(messageBytes('hello'), 5);
  assert.equal(messageBytes('čas'), 4); // č is two bytes
  assert.equal(messageBytes('⚡️'), 6);
  assert.equal(messageBytes(''), 0);
});

test('an empty or whitespace-only message is refused', () => {
  assert.equal(validateMessage('').ok, false);
  assert.equal(validateMessage('   \n\t ').ok, false);
});

test('a message over the payload limit is refused and says by how much', () => {
  const result = validateMessage('a'.repeat(SATWIRE.maxPayloadBytes + 1));
  assert.equal(result.ok, false);
  assert.equal(result.bytes, SATWIRE.maxPayloadBytes + 1);
  assert.match(result.error, new RegExp(String(SATWIRE.maxPayloadBytes)));
});

test('a message inside the limit passes and keeps its newlines', () => {
  const result = validateMessage('line one\nline two');
  assert.equal(result.ok, true);
  assert.equal(result.value, 'line one\nline two');
});

test('the request carries our cut alongside the message', () => {
  const body = requestBody({ message: 'hello', isPublic: false });
  assert.equal(body.message, 'hello');
  assert.equal(body.isPublic, false);
  assert.equal(body.feeRate, SATWIRE.minFeeRate);
  assert.equal(body.amountToSend, CUT_SATS);
  // SatWire needs both halves of the pair to forward part of the payment.
  assert.ok(body.targetAddress && body.targetAddress.startsWith('bc1'));
});

test('no cut address means an ordinary order, not a half-formed one', () => {
  const body = requestBody({ message: 'hello', cutSats: 0 });
  assert.equal(body.targetAddress, undefined);
  assert.equal(body.amountToSend, undefined);
});

test('a feerate outside their range is clamped rather than sent as is', () => {
  assert.equal(requestBody({ message: 'x', feeRate: 0 }).feeRate, SATWIRE.minFeeRate);
  assert.equal(requestBody({ message: 'x', feeRate: 99999 }).feeRate, SATWIRE.maxFeeRate);
});

test('sats become a bitcoin amount with eight decimals, trimmed', () => {
  assert.equal(satsToBtc(4326), '0.00004326');
  assert.equal(satsToBtc(100000000), '1');
  assert.equal(satsToBtc(0), '0');
});

test('the BIP21 code carries the amount so a wallet pays exactly what was quoted', () => {
  assert.equal(
    bip21('bc1qgytcj5utuczsecrran65jzu5slxh5vwfahrgxg', 4326),
    'bitcoin:bc1qgytcj5utuczsecrran65jzu5slxh5vwfahrgxg?amount=0.00004326',
  );
});

test('a real answer from the API parses into what the page needs', () => {
  const parsed = parseRequest(REQUEST);
  assert.equal(parsed.requestId, REQUEST.requestId);
  assert.equal(parsed.address, REQUEST.address);
  assert.equal(parsed.sats, 4326);
  assert.equal(parsed.isPublic, true);
  assert.equal(parsed.bip21, `bitcoin:${REQUEST.address}?amount=0.00004326`);
});

test('an answer missing the address, id or amount is an error, not a half page', () => {
  assert.throws(() => parseRequest({}), /unexpected answer/);
  assert.throws(() => parseRequest({ requestId: 'x', address: 'bc1' }), /unexpected answer/);
  assert.throws(() => parseRequest({ requestId: 'x', requiredAmountSatoshis: 10 }), /unexpected answer/);
  assert.throws(() => parseRequest(null), /unexpected answer/);
});

test('a real status parses, and an unpaid one reads as waiting', () => {
  const status = parseStatus(STATUS);
  assert.equal(status.status, 'pending_payment');
  assert.equal(status.sats, 4326);
  assert.equal(status.opReturnTxId, null);
  const view = statusView(status);
  assert.match(view.label, /Waiting for the payment/i);
  assert.equal(view.done, false);
  assert.equal(view.failed, false);
  assert.equal(isTerminal(status), false);
});

test('the message transaction is the end of the flow, and its id is shown', () => {
  const status = parseStatus({ ...STATUS, status: 'published', opReturnTxId: 'abc123', opReturnBlockHeight: 900001 });
  const view = statusView(status);
  assert.match(view.label, /blockchain/i);
  assert.equal(view.txid, 'abc123');
  assert.match(view.detail, /900001/);
  assert.equal(view.done, true);
  assert.equal(isTerminal(status), true);
});

test('a failure and a refund are both terminal, and say why', () => {
  const failed = statusView(parseStatus({ ...STATUS, failureReason: 'output too large' }));
  assert.equal(failed.failed, true);
  assert.match(failed.detail, /output too large/);

  const refunded = statusView(parseStatus({ ...STATUS, refundTxId: 'ff00' }));
  assert.equal(refunded.failed, true);
  assert.equal(refunded.txid, 'ff00');
});

test('a status we have never seen is shown as it arrived instead of being guessed', () => {
  const status = parseStatus({ ...STATUS, status: 'something_new' });
  const view = statusView(status);
  assert.match(view.detail, /something_new/);
  assert.equal(view.done, false);
});

test('the quote is split into their fee, the miner fee and our cut', () => {
  const parts = priceBreakdown(4326);
  assert.equal(parts.total, 4326);
  assert.equal(parts.service, SATWIRE.serviceFeeSats);
  assert.equal(parts.cut, CUT_SATS);
  assert.equal(parts.network, 4326 - SATWIRE.serviceFeeSats - CUT_SATS);
});
