// SatWire: a message on the blockchain.
//
// The page does not build bitcoin transactions. SatWire's public API takes the message,
// hands back an address and an amount, and once that is paid it puts the message into an
// OP_RETURN itself. No key is needed for the public endpoints.
//
// Two things are folded into the single payment they ask for:
//   - their service fee (3000 sats, from GET /api/config/limits)
//   - their network fee at the chosen feerate
//   - our cut, sent as targetAddress + amountToSend, so the buyer pays once and SatWire
//     forwards our part with the same transaction.
//
// The API sends no CORS headers, so the browser cannot call it directly: the page talks to
// a thin endpoint on our own server which forwards the request. This module is the logic on
// both sides of that hop, so it can be tested without a network.

export const SATWIRE = {
  api: 'https://satwire.io/api',
  serviceFeeSats: 3000, // GET /api/config/limits -> serviceFeeSats
  minFeeRate: 2,        // sat/vB
  maxFeeRate: 500,
  maxPayloadBytes: 10000,
  lightning: false,     // GET /api/config/limits -> lightning: false, so on-chain only for now
};

// What we add on top of SatWire's own charges. Change in one place only.
export const CUT_SATS = 1000;
// Where our cut goes. D's own on-chain address (the one the old stego explainer showed);
// confirm with him before this ships.
export const CUT_ADDRESS = 'bc1q2ytw4gwrkw5jg6ekutcwrgw8x5nlkahyk54l5e';

export const POLL_INTERVAL_MS = 5000;

export function messageBytes(text) {
  return new TextEncoder().encode(String(text ?? '')).length;
}

// SatWire counts the message in bytes, not characters: an emoji or an accented letter is
// more than one. Checking bytes here means the page never sends what the server would reject.
export function validateMessage(text) {
  const value = String(text ?? '');
  if (!value.trim()) {
    return { ok: false, bytes: 0, error: 'Write a message first.' };
  }
  const bytes = messageBytes(value);
  if (bytes > SATWIRE.maxPayloadBytes) {
    return {
      ok: false,
      bytes,
      error: `Too long: ${bytes} bytes. The limit is ${SATWIRE.maxPayloadBytes}.`,
    };
  }
  return { ok: true, bytes, value };
}

export function requestBody({
  message,
  isPublic = false,
  feeRate = SATWIRE.minFeeRate,
  cutAddress = CUT_ADDRESS,
  cutSats = CUT_SATS,
} = {}) {
  const body = {
    message: String(message ?? ''),
    feeRate: Math.min(SATWIRE.maxFeeRate, Math.max(SATWIRE.minFeeRate, Number(feeRate) || SATWIRE.minFeeRate)),
    isPublic: Boolean(isPublic),
  };
  // Without an address or an amount the request is simply a normal SatWire order; with
  // both, their transaction pays us too. Send them together or not at all.
  if (cutAddress && cutSats > 0) {
    body.targetAddress = cutAddress;
    body.amountToSend = Math.round(cutSats);
  }
  return body;
}

export function satsToBtc(sats) {
  const whole = Math.max(0, Math.round(Number(sats) || 0));
  const btc = (whole / 100000000).toFixed(8);
  return btc.replace(/0+$/, '').replace(/\.$/, '');
}

export function bip21(address, sats) {
  if (!address) {
    throw new Error('a BIP21 code needs an address');
  }
  const amount = satsToBtc(sats);
  return amount ? `bitcoin:${address}?amount=${amount}` : `bitcoin:${address}`;
}

function fail(what) {
  throw new Error(`unexpected answer from the message service (${what})`);
}

export function parseRequest(json) {
  if (!json || typeof json !== 'object') {
    fail('not an object');
  }
  const requestId = json.requestId || json.id;
  const address = json.address;
  const sats = Number(json.requiredAmountSatoshis);
  if (!requestId || !address || !Number.isFinite(sats) || sats <= 0) {
    fail('no request id, address or amount');
  }
  return {
    requestId,
    address,
    sats: Math.round(sats),
    isPublic: Boolean(json.isPublic),
    bip21: bip21(address, sats),
  };
}

export function parseStatus(json) {
  if (!json || typeof json !== 'object') {
    fail('not an object');
  }
  const id = json.id || json.requestId;
  if (!id) {
    fail('no request id');
  }
  const sats = Number(json.requiredAmountSatoshis);
  return {
    id,
    status: String(json.status ?? ''),
    message: String(json.message ?? ''),
    address: json.address || '',
    sats: Number.isFinite(sats) ? Math.round(sats) : 0,
    paymentTxId: json.paymentTxId || null,
    paymentReceivedSats: Number.isFinite(Number(json.paymentReceivedSatoshis))
      ? Math.round(Number(json.paymentReceivedSatoshis))
      : null,
    confirmations: Number.isFinite(Number(json.paymentConfirmationCount))
      ? Number(json.paymentConfirmationCount)
      : null,
    opReturnTxId: json.opReturnTxId || null,
    opReturnHeight: Number.isFinite(Number(json.opReturnBlockHeight))
      ? Number(json.opReturnBlockHeight)
      : null,
    failureReason: json.failureReason || null,
    refundTxId: json.refundTxId || null,
    isPublic: Boolean(Number(json.isPublic ?? 0)) || json.isPublic === true,
  };
}

// The API's statuses are theirs, not ours, and the set may grow: anything unrecognised is
// shown as it arrives rather than being mapped onto a lie.
const WAITING = new Set(['pending_payment', 'pending', 'awaiting_payment', 'created']);

export function statusView(status) {
  const view = {
    label: status.status || 'unknown',
    detail: '',
    txid: null,
    done: false,
    failed: false,
  };
  if (status.opReturnTxId) {
    view.label = 'On the blockchain';
    view.txid = status.opReturnTxId;
    view.detail = status.opReturnHeight
      ? `Confirmed in block ${status.opReturnHeight}.`
      : 'Broadcast, waiting for a block.';
    view.done = true;
    return view;
  }
  if (status.refundTxId) {
    view.label = 'Refunded';
    view.txid = status.refundTxId;
    view.detail = 'The message could not be published and the payment was returned.';
    view.failed = true;
    return view;
  }
  if (status.failureReason) {
    view.label = 'Failed';
    view.detail = String(status.failureReason);
    view.failed = true;
    return view;
  }
  if (WAITING.has(status.status)) {
    view.label = 'Waiting for the payment';
    view.detail = 'The message goes out once the payment is seen on the network.';
    return view;
  }
  if (status.paymentTxId) {
    view.label = 'Payment seen';
    view.txid = status.opReturnTxId || status.paymentTxId;
    view.detail = status.confirmations
      ? `Confirming: ${status.confirmations} confirmation${status.confirmations === 1 ? '' : 's'}.`
      : 'Waiting for the first confirmation.';
    return view;
  }
  view.detail = 'Status from the message service: ' + (status.status || 'unknown') + '.';
  return view;
}

export function isTerminal(status) {
  const view = statusView(status);
  return view.done || view.failed;
}

// What the buyer is paying for, split out of the total they were quoted. We know their
// service fee and our own cut; the rest is the miner fee at the feerate we asked for.
export function priceBreakdown(totalSats, { cutSats = CUT_SATS, serviceSats = SATWIRE.serviceFeeSats } = {}) {
  const total = Math.max(0, Math.round(Number(totalSats) || 0));
  const service = Math.max(0, Math.round(serviceSats));
  const cut = Math.max(0, Math.round(cutSats));
  const network = Math.max(0, total - service - cut);
  return { total, service, cut, network };
}
