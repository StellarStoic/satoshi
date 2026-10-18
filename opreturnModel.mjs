// OP_RETURN: a message written into the bitcoin blockchain.
//
// This module is the whole of the logic that does not touch the network, so the page, the
// service and the tests all agree about the same rules:
//
//   - what a message may be (bytes, not characters, and 80 of them: one standard output)
//   - what it costs (our fee plus the miner's, both in sats, no fiat anywhere)
//   - how a message becomes a bitcoin script
//   - how an OP_RETURN on the chain is turned back into text for the board
//
// The money side uses the BTCPay server D already runs: the invoice is a normal BTCPay
// invoice (Ark/Bark or Lightning), and the message is published by spending from the
// store's on-chain wallet. Nothing is sent to a third party, so the whole fee stays here.

export const OP_RETURN = {
  // A standard (relayed) output carries 80 bytes of data. Bigger is possible and
  // non-standard, so the tool refuses instead of quietly building something miners drop.
  maxBytes: 80,
  // What we charge, in sats. SatWire takes 3000; we take less and still cover the miner.
  serviceSats: 1000,
  // The miner fee we plan for, sats. A one-output-plus-change tx at 2 sat/vB costs about
  // this much; the real number comes from the wallet when the transaction is built.
  networkSatsEstimate: 400,
  minFeeRate: 2,
  maxFeeRate: 500,
  // How many of the chain's latest messages the board shows.
  latestCount: 21,
};

export const TOTAL_SATS = OP_RETURN.serviceSats + OP_RETURN.networkSatsEstimate;

export function messageBytes(text) {
  return new TextEncoder().encode(String(text ?? '')).length;
}

export function validateMessage(text) {
  const value = String(text ?? '');
  if (!value.trim()) {
    return { ok: false, bytes: 0, error: 'Write a message first.' };
  }
  const bytes = messageBytes(value);
  if (bytes > OP_RETURN.maxBytes) {
    return {
      ok: false,
      bytes,
      error: `Too long: ${bytes} bytes. A message can be at most ${OP_RETURN.maxBytes}.`,
    };
  }
  // A run of control characters would publish invisible rubbish.
  if (!/[^\u0000-\u001f]/.test(value.replace(/[\n\r\t]/g, ''))) {
    return { ok: false, bytes, error: 'A message needs at least one readable character.' };
  }
  return { ok: true, bytes, value };
}

export function bytesLeft(text) {
  return OP_RETURN.maxBytes - messageBytes(text);
}

export function priceSats({ serviceSats = OP_RETURN.serviceSats, networkSats = OP_RETURN.networkSatsEstimate } = {}) {
  return Math.round(Math.max(0, serviceSats) + Math.max(0, networkSats));
}

// A bitcoin script is a byte string, so the message is hex from here on.
function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// OP_RETURN is 0x6a. The data follows as a push: one opcode for up to 75 bytes (0x01-0x4b),
// otherwise OP_PUSHDATA1 (0x4c) and a length byte.
export function opReturnScript(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  if (bytes.length === 0) {
    throw new Error('an OP_RETURN needs something to say');
  }
  if (bytes.length > OP_RETURN.maxBytes) {
    throw new Error(`a message of ${bytes.length} bytes is over the ${OP_RETURN.maxBytes}-byte limit`);
  }
  const push = bytes.length <= 75
    ? bytes.length.toString(16).padStart(2, '0')
    : '4c' + bytes.length.toString(16).padStart(2, '0');
  return '6a' + push + toHex(bytes);
}

// The reverse, for messages found on the chain: drop 0x6a and the push opcode, decode what
// is left as UTF-8. Anything that does not decode cleanly is not shown as text.
export function scriptToText(scriptHex) {
  if (typeof scriptHex !== 'string') {
    return null;
  }
  const hex = scriptHex.trim().toLowerCase();
  if (!hex.startsWith('6a')) {
    return null;
  }
  let from = 2;
  const opcode = parseInt(hex.slice(from, from + 2), 16);
  if (!Number.isFinite(opcode)) {
    return null;
  }
  if (opcode === 0x4c) {
    from = 6; // OP_PUSHDATA1 (0x4c) then one length byte, then the data
  } else if (opcode >= 0x01 && opcode <= 0x4b) {
    from = 4; // the push itself is the length
  } else {
    return null; // not a data push, so not a message
  }
  const body = hex.slice(from);
  if (body.length < 2 || body.length % 2 !== 0) {
    return null;
  }
  const bytes = new Uint8Array(body.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = parseInt(body.slice(i * 2, i * 2 + 2), 16);
    if (!Number.isFinite(byte)) {
      return null;
    }
    bytes[i] = byte;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Printable text only, judged by what must NOT appear: control characters. Accepting
    // is the wrong way round — a whitelist of Unicode categories rejects emoji variation
    // selectors and combining marks, which real messages contain.
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) {
      return null;
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}

// One entry from the chain, as the latest-21 feed hands it to the board.
export function chainMessage({ txid, scriptHex, blockHeight = null, blockTime = null } = {}) {
  const text = scriptToText(scriptHex);
  if (!txid || !text) {
    return null;
  }
  return { txid, text, blockHeight, blockTime };
}

// Blocks arrive newest first; this flattens their transactions into the board's 21, newest
// first, quietly dropping outputs that are not readable text (protocol markers, payments).
export function latestFromBlocks(blocks, limit = OP_RETURN.latestCount) {
  const found = [];
  for (const block of blocks || []) {
    for (const tx of block.txs || []) {
      for (const vout of tx.vout || []) {
        const scriptHex = vout.scriptpubkey || vout.scriptPubKey?.hex || vout.scriptpubkey_hex;
        if (!scriptHex || !String(scriptHex).toLowerCase().startsWith('6a')) {
          continue;
        }
        const entry = chainMessage({
          txid: tx.txid,
          scriptHex,
          blockHeight: block.height,
          blockTime: block.timestamp,
        });
        if (entry) {
          found.push(entry);
        }
      }
    }
    if (found.length >= limit) {
      break;
    }
  }
  return found.slice(0, limit);
}

// How a message becomes a note on the board. A message someone paid to show keeps the
// border of the theme they chose; the chain's own latest 21 are grey, so a reader can tell
// a paid message from a found one at a glance.
export const BORDER_PAID = 'theme';
export const BORDER_CHAIN = 'grey';

export function boardNote({ text, txid = null, mine = false, theme = null, publishedAt = null, source = 'chain' } = {}) {
  return {
    kind: 'opreturn',
    text: String(text ?? ''),
    txid,
    mine: Boolean(mine),
    border: mine ? BORDER_PAID : BORDER_CHAIN,
    theme: mine ? theme : null,
    publishedAt,
    source,
  };
}

export const ORDER_STATES = ['new', 'awaiting_payment', 'paid', 'published', 'failed', 'expired'];

// What the buyer is told, from what the service knows. Anything unrecognised is passed
// through rather than dressed up as progress.
export function orderView(order) {
  const view = { label: 'Unknown', detail: '', txid: order?.opReturnTxid || null, done: false, failed: false };
  switch (order?.state) {
    case 'new':
      view.label = 'Preparing the invoice';
      view.detail = 'This takes a moment.';
      break;
    case 'awaiting_payment':
      view.label = 'Waiting for the payment';
      view.detail = `Send exactly ${order.sats} sats. The message goes out once the payment is seen.`;
      break;
    case 'paid':
      view.label = 'Paid, publishing';
      view.detail = 'The transaction is being written and broadcast now.';
      break;
    case 'published':
      view.label = 'On the blockchain';
      view.detail = order.blockHeight
        ? `Confirmed in block ${order.blockHeight}.`
        : 'Broadcast and waiting for a block.';
      view.done = true;
      break;
    case 'failed':
      view.label = 'Failed';
      view.detail = order.reason || 'The message could not be published.';
      view.failed = true;
      break;
    case 'expired':
      view.label = 'Expired';
      view.detail = 'Nothing was paid, so nothing was published. Nothing is owed.';
      view.failed = true;
      break;
    default:
      view.detail = 'State from the service: ' + (order?.state || 'unknown');
  }
  return view;
}

export function isOrderTerminal(order) {
  const view = orderView(order);
  return view.done || view.failed;
}
