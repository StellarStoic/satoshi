/**
 * What a reader can give a note: a reaction, or a zap.
 *
 * This module is the pure half of the "sign the note's signature" dialog — every event it builds,
 * every URL it derives, and every payload it reads back. It touches no DOM and holds no session,
 * because the two things that must never be got wrong here are worth testing on their own: the
 * shape of the events (NIP-25 reactions, NIP-57 zap requests) and the arithmetic of the LNURL
 * handshake that turns a lightning address into an invoice.
 *
 * References, as read from the spec mirror:
 *   NIP-25  a reaction is kind 7, `content` holds the value, `e` names the event, `p` its author
 *   NIP-30  a custom (image) emoji adds ["emoji", <shortcode>, <image-url>] and the content is
 *           ":shortcode:" — plain Unicode needs none of that
 *   NIP-57  a zap request is kind 9734, is signed but NOT published, and goes to the recipient's
 *           lnurl-pay callback as a GET with amount/nostr/lnurl; their server answers with `pr`
 *
 * The payment itself is the reader's own wallet's business: this module returns an invoice and the
 * board shows it. It never holds, sends or sees a key beyond what the form asks the signer for.
 */

/** The block the reader picks a reaction from. Data, not markup, so a custom one is a one-line addition. */
export const REACTION_SET = Object.freeze([
  {id: 'yes', emoji: '\u2705', label: 'Yes'},
  {id: 'no', emoji: '\u274e', label: 'No'},
  {id: 'cool', emoji: '\u{1F192}', label: 'Cool'},
  {id: 'ok', emoji: '\u{1F197}', label: 'OK'},
  {id: 'warm', emoji: '\u{1F9E1}', label: 'Orange heart'},
]);

/** The amounts the dialog offers, in sats. A zap below the recipient's floor is raised to it. */
export const ZAP_AMOUNTS = Object.freeze([21, 100, 1000, 5000]);

/** How much of a zap receipt the board keeps: none. Read-back is a later pass. */

/**
 * The NIP-30 tag for a reaction, or null when the reaction is plain Unicode.
 *
 * A custom emoji is `content: ":shortcode:"` plus one image tag. Keeping the check here rather than
 * in the dialog means the set above can grow an image entry without any handler changing.
 */
export function emojiTagFor(reaction) {
  if (!reaction || !reaction.image) return null;
  const shortcode = String(reaction.shortcode || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(shortcode)) return null;
  return ['emoji', shortcode, String(reaction.image)];
}

/** What `content` a reaction carries: the shortcode for a custom emoji, the character otherwise. */
export function reactionContent(reaction) {
  if (!reaction) return '';
  if (reaction.image && emojiTagFor(reaction)) return `:${reaction.shortcode}:`;
  return String(reaction.emoji || '');
}

/**
 * A kind 7 reaction to one note.
 *
 * `e` carries the note's id and, as hints, the relay it is read from and its author — the spec
 * recommends both, and a receiver with neither has to guess where to look. `k` says what was
 * reacted to, which is how a reader of the reaction knows it was a note and not a profile.
 */
export function reactionTemplate({noteId, noteKind = 1, authorPubkey, reaction, relay = '', createdAt = Math.floor(Date.now() / 1000), pubkey = ''}) {
  const id = String(noteId || '').trim();
  const author = String(authorPubkey || '').trim();
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('A reaction needs the id of the note it is for.');
  if (!/^[0-9a-f]{64}$/.test(author)) throw new Error('A reaction needs the pubkey of the note it is for.');
  const content = reactionContent(reaction);
  if (!content) throw new Error('Pick a reaction first.');
  const tags = [];
  tags.push(relay ? ['e', id, relay, author] : ['e', id]);
  tags.push(relay ? ['p', author, relay] : ['p', author]);
  if (Number.isInteger(noteKind) && noteKind > 0) tags.push(['k', String(noteKind)]);
  const emoji = emojiTagFor(reaction);
  if (emoji) tags.push(emoji);
  return {kind: 7, content, created_at: createdAt, pubkey, tags};
}

/**
 * The bech32 alphabet, checksum and 5-bit regrouping LUD-01 uses for `lnurl`.
 *
 * Written out rather than imported: the vendored nostr-tools bundle predates `lnurlEncode`, and a
 * `lnurl` that is one bit wrong is refused by the recipient's server with nothing said about why.
 */
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values) {
  const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < 5; bit += 1) {
      if ((top >> bit) & 1) checksum ^= generator[bit];
    }
  }
  return checksum;
}

function bech32HrpExpand(hrp) {
  const expanded = [];
  for (const char of hrp) expanded.push(char.charCodeAt(0) >> 5);
  expanded.push(0);
  for (const char of hrp) expanded.push(char.charCodeAt(0) & 31);
  return expanded;
}

function convertBits(data, from, to, pad) {
  let accumulator = 0;
  let bits = 0;
  const result = [];
  const maxValue = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) throw new Error('Invalid value for bit conversion.');
    accumulator = (accumulator << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      result.push((accumulator >> bits) & maxValue);
    }
  }
  if (pad) {
    if (bits > 0) result.push((accumulator << (to - bits)) & maxValue);
  } else if (bits >= from || ((accumulator << (to - bits)) & maxValue) !== 0) {
    throw new Error('Invalid padding in the bit conversion.');
  }
  return result;
}

/** Encode bytes as bech32 with the given human-readable prefix. */
export function bech32Encode(hrp, bytes) {
  const data = convertBits([...bytes], 8, 5, true);
  const checksum = bech32Polymod([...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chars = [...data];
  for (let index = 0; index < 6; index += 1) chars.push((checksum >> (5 * (5 - index))) & 31);
  return hrp + '1' + chars.map(value => BECH32_CHARSET[value]).join('');
}

/** Decode a bech32 string into its prefix and bytes; throws when the checksum disagrees. */
export function bech32Decode(text) {
  const value = String(text || '').trim().toLowerCase();
  const split = value.lastIndexOf('1');
  if (split < 1 || split + 7 > value.length) throw new Error('That is not a bech32 string.');
  const hrp = value.slice(0, split);
  const data = [...value.slice(split + 1)].map(char => BECH32_CHARSET.indexOf(char));
  if (data.includes(-1)) throw new Error('That is not a bech32 string.');
  if (bech32Polymod([...bech32HrpExpand(hrp), ...data]) !== 1) throw new Error('That bech32 checksum does not check out.');
  return {hrp, bytes: Uint8Array.from(convertBits(data.slice(0, -6), 5, 8, false))};
}

/** A URL as an `lnurl` string, which is how a zap request names the recipient's pay endpoint. */
export function lnurlEncode(url) {
  const bytes = new TextEncoder().encode(String(url || '').trim());
  if (!bytes.length) throw new Error('There is no address to encode.');
  return bech32Encode('lnurl', bytes);
}

/** The URL behind an `lnurl` string. */
export function lnurlDecode(text) {
  const {hrp, bytes} = bech32Decode(text);
  if (hrp !== 'lnurl') throw new Error('That is not a lightning address.');
  return new TextDecoder().decode(bytes);
}

/**
 * A lightning address (`name@domain`) as the LNURL-pay endpoint that serves it.
 *
 * Strict on purpose: the host must be a hostname, because this string is fetched with the reader's
 * own network position. A lightning address that cannot be expressed as a plain https URL is not
 * one this board will call.
 */
export function lud16ToLnurlpUrl(lud16) {
  const value = String(lud16 || '').trim();
  const parts = value.split('@');
  if (parts.length !== 2) throw new Error('That is not a lightning address.');
  const [name, host] = [parts[0].trim(), parts[1].trim().toLowerCase()];
  if (!name || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new Error('That is not a lightning address.');
  }
  return `https://${host}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

/**
 * Read an LNURL-pay response into what a zap needs.
 *
 * `allowsNostr` is the whole question: only when the recipient's server says so — with a real
 * `nostrPubkey` beside it — can a zap request be honoured and a receipt come back. Without it the
 * board can still show an invoice, but the payment stays invisible on nostr, and saying so is
 * better than pretending.
 */
export function parseLnurlPay(payload) {
  const data = payload || {};
  if (typeof data.reason === 'string' && data.reason.trim()) {
    return {ok: false, error: data.reason.trim()};
  }
  const callback = typeof data.callback === 'string' ? data.callback.trim() : '';
  if (!/^https?:\/\/[^\s]+$/.test(callback)) {
    return {ok: false, error: 'That address answered without a payment callback.'};
  }
  const min = Number(data.minSendable);
  const max = Number(data.maxSendable);
  const nostrPubkey = typeof data.nostrPubkey === 'string' ? data.nostrPubkey.trim().toLowerCase() : '';
  const allowsNostr = data.allowsNostr === true && /^[0-9a-f]{64}$/.test(nostrPubkey);
  return {
    ok: true,
    callback,
    minSendable: Number.isFinite(min) && min > 0 ? min : 1000,
    maxSendable: Number.isFinite(max) && max > 0 ? max : Number.MAX_SAFE_INTEGER,
    allowsNostr,
    nostrPubkey: allowsNostr ? nostrPubkey : '',
  };
}

/**
 * Fit the reader's amount to what the recipient's server will accept.
 *
 * A zap below the floor is raised to it and one above the ceiling is lowered, because both are
 * ordinary (21 sats against a 100-sat floor, 5 000 against a 2 500 ceiling) and refusing the reader
 * over either would be rude. Out of range in a way that cannot be met — a floor above the ceiling —
 * is the one case that is a refusal.
 */
export function clampZapAmount(sats, pay) {
  const wanted = Math.floor(Number(sats));
  if (!Number.isFinite(wanted) || wanted <= 0) return {ok: false, error: 'Enter how many sats to zap.'};
  const min = Number(pay?.minSendable) > 0 ? Math.ceil(Number(pay.minSendable) / 1000) : 1;
  const max = Number(pay?.maxSendable) > 0 ? Math.floor(Number(pay.maxSendable) / 1000) : Number.MAX_SAFE_INTEGER;
  if (min > max) return {ok: false, error: 'That address cannot receive a zap.'};
  if (wanted < min) return {ok: true, sats: min, raised: true};
  if (wanted > max) return {ok: true, sats: max, lowered: true};
  return {ok: true, sats: wanted, raised: false, lowered: false};
}

/**
 * A zap request: kind 9734, signed, and sent to the callback instead of being published.
 *
 * Every tag here is load-bearing. `relays` says where the receipt must go (flat, not nested — the
 * spec is explicit), `amount` is millisats, `lnurl` is the recipient's pay endpoint encoded, `p` is
 * who is being paid, and `e` plus `k` say which note earned it.
 */
export function zapRequestTemplate({noteId, noteKind = 1, authorPubkey, amountSats, relays = [], comment = '', createdAt = Math.floor(Date.now() / 1000), pubkey = ''}) {
  const author = String(authorPubkey || '').trim();
  if (!/^[0-9a-f]{64}$/.test(author)) throw new Error('A zap needs the pubkey of the note it is for.');
  const sats = Math.floor(Number(amountSats));
  if (!Number.isFinite(sats) || sats <= 0) throw new Error('Enter how many sats to zap.');
  const list = [...new Set(relays.map(url => String(url || '').trim()).filter(url => /^wss?:\/\/[^\s]+$/.test(url)))];
  const tags = [];
  if (list.length) tags.push(['relays', ...list]);
  tags.push(['amount', String(sats * 1000)]);
  tags.push(['p', author]);
  const id = String(noteId || '').trim();
  if (/^[0-9a-f]{64}$/.test(id)) {
    tags.push(['e', id]);
    if (Number.isInteger(noteKind) && noteKind > 0) tags.push(['k', String(noteKind)]);
  }
  return {kind: 9734, content: String(comment || '').slice(0, 280), created_at: createdAt, pubkey, tags};
}

/** The GET the zap request becomes. All three parameters are the spec's, URI-encoded. */
export function zapCallbackUrl({callback, amountSats, event, lnurl}) {
  const base = String(callback || '').trim();
  if (!/^https?:\/\/[^\s]+$/.test(base)) throw new Error('That address answered without a payment callback.');
  const params = new URLSearchParams();
  params.set('amount', String(Math.floor(Number(amountSats)) * 1000));
  params.set('nostr', JSON.stringify(event));
  if (lnurl) params.set('lnurl', String(lnurl));
  return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
}

/** The invoice the callback answers with, or the reason it refused. */
/** The first value of a tag, or an empty string. */
function tagValue(event, name) {
  const tag = (event?.tags || []).find(entry => Array.isArray(entry) && entry[0] === name);
  return tag && tag.length > 1 ? String(tag[1] ?? '') : '';
}

/** Every value of a tag. A receipt names the note in one `e` and the zapper in another, and a
 *  reaction can name more than one event, so this reads all of them rather than the first. */
function tagValues(event, name) {
  return (event?.tags || []).filter(entry => Array.isArray(entry) && entry[0] === name)
    .map(entry => String(entry[1] ?? ''));
}

/**
 * What a bolt11 invoice asks for, in sats, or null when the invoice carries no amount.
 *
 * The amount lives in the human-readable prefix: `lnbc` then the digits then a multiplier, where m is
 * milli-bitcoin, u micro, n nano and p pico, and no multiplier means whole bitcoin. An amountless
 * invoice is `lnbc1…` - the `1` separator with nothing before it - and it cannot be read here, so it
 * is null rather than zero.
 */
export function invoiceAmountSats(invoice) {
  const text = String(invoice || '').trim().toLowerCase().replace(/^lightning:/, '');
  const match = text.match(/^lnbc([0-9]+)([munp]?)1/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const perBitcoin = {m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12}[match[2]];
  const bitcoin = match[2] ? amount * perBitcoin : amount;
  const sats = bitcoin * 1e8;
  return Number.isFinite(sats) && sats > 0 ? Math.round(sats) : null;
}

/**
 * What a zap receipt says was paid, in sats.
 *
 * The request the sender signed is carried in the receipt's `description` tag and its `amount` is in
 * millisats, which is the figure the invoice was made for. The bolt11 tag is the fallback, for a
 * receipt whose description cannot be read.
 */
export function zapReceiptSats(receipt) {
  const description = tagValue(receipt, 'description');
  if (description) {
    try {
      const request = JSON.parse(description);
      const msats = Number(tagValue(request, 'amount'));
      if (Number.isFinite(msats) && msats > 0) return Math.round(msats / 1000);
    } catch { /* not readable: the invoice knows too */ }
  }
  return invoiceAmountSats(tagValue(receipt, 'bolt11'));
}

/** The signed request a receipt carries, or null when it does not carry a readable one. */
export function zapReceiptRequest(receipt) {
  try {
    const request = JSON.parse(tagValue(receipt, 'description'));
    return request && typeof request === 'object' ? request : null;
  } catch { return null; }
}

/** Whether an event is a reaction to this note. NIP-25 puts the note it is about in an `e` tag. */
export function isReactionForNote(event, noteId) {
  return Number(event?.kind) === 7 && Boolean(noteId) && tagValues(event, 'e').includes(noteId);
}

/** Whether an event is a zap receipt for this note. NIP-57 puts the zapped note in an `e` tag. */
export function isReceiptForNote(event, noteId) {
  return Number(event?.kind) === 9735 && Boolean(noteId) && tagValues(event, 'e').includes(noteId);
}

/**
 * What a note has collected: how many reactions, and how many sats it was zapped.
 *
 * Counted per event, not per person: a reader who sends two reactions sent two, and the same event
 * arriving twice - from a second relay, or twice from one - is counted once by its id.
 */
export function giftTally(noteId, events) {
  const seen = new Set();
  let reactions = 0;
  let sats = 0;
  for (const event of events || []) {
    if (!event?.id || seen.has(event.id)) continue;
    if (isReactionForNote(event, noteId)) {
      seen.add(event.id);
      reactions += 1;
    } else if (isReceiptForNote(event, noteId)) {
      seen.add(event.id);
      const paid = zapReceiptSats(event);
      if (paid) sats += paid;
    }
  }
  return {reactions, sats};
}

/** Whether a receipt is the one for an invoice the reader was shown. */
export function receiptMatchesInvoice(receipt, invoice) {
  const wanted = String(invoice || '').trim().toLowerCase().replace(/^lightning:/, '');
  if (!wanted) return false;
  return tagValues(receipt, 'bolt11')
    .some(value => value.trim().toLowerCase().replace(/^lightning:/, '') === wanted);
}

export function parseInvoice(payload) {
  const data = payload || {};
  if (typeof data.pr === 'string' && /^ln(bc|tb|bcrt)[0-9a-z]+$/i.test(data.pr.trim())) {
    return {ok: true, invoice: data.pr.trim()};
  }
  if (typeof data.reason === 'string' && data.reason.trim()) return {ok: false, error: data.reason.trim()};
  if (typeof data.status === 'string' && data.status.toUpperCase() === 'ERROR') {
    return {ok: false, error: 'That address refused to make an invoice.'};
  }
  return {ok: false, error: 'That address answered without an invoice.'};
}
