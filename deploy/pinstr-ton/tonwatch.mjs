// tonwatch — reconciling TON transfers against Pinstr orders.
// TON has no invoice object, so the order id rides in the transfer comment and the
// only thing tying a payment to an order is that string plus the amount.

import { parseTonAddress, paymentMatches } from './tonQuote.mjs';

const TONCENTER = 'https://toncenter.com/api/v2/getTransactions';

export function normaliseTransactions(payload, destinationRaw) {
  const list = Array.isArray(payload?.result) ? payload.result : [];
  const out = [];
  for (const tx of list) {
    const msg = tx?.in_msg;
    if (!msg) continue;
    if (msg.destination && destinationRaw && msg.destination !== destinationRaw) continue;
    const value = String(msg.value ?? '0');
    if (!/^\d+$/.test(value) || value === '0') continue;
    const comment = typeof msg.message === 'string' ? msg.message.trim() : '';
    if (!comment) continue;
    const hash = tx?.transaction_id?.hash || '';
    const lt = String(tx?.transaction_id?.lt || '');
    if (!hash || !lt) continue;
    out.push({
      key: `${hash}:${lt}`,
      txHash: hash,
      lt,
      valueNano: value,
      comment,
      source: msg.source || null,
      timestamp: Number(tx.utime || 0),
    });
  }
  return out;
}

export function reconcile({ orders, transactions, creditedKeys = [], now = Date.now(), toleranceBps = 200 }) {
  const credited = new Set(creditedKeys);
  const paid = [];
  const claimed = new Set();
  const unmatched = [];

  for (const order of orders || []) {
    if (!order || !order.id) continue;
    const tx = (transactions || []).find((t) => !claimed.has(t.key) && !credited.has(t.key)
      && paymentMatches({ comment: t.comment, orderId: order.id, amountNano: t.valueNano, expectedNano: order.expectedNano, toleranceBps }));
    if (!tx) {
      if (order.expiresAtMs && now > order.expiresAtMs) unmatched.push({ id: order.id, reason: 'expired unpaid' });
      continue;
    }
    claimed.add(tx.key);
    paid.push({
      id: order.id,
      txHash: tx.txHash,
      lt: tx.lt,
      valueNano: tx.valueNano,
      expectedNano: order.expectedNano ?? null,
      overpaid: order.expectedNano ? BigInt(tx.valueNano) > BigInt(order.expectedNano) : false,
      ageSeconds: tx.timestamp ? Math.max(0, Math.floor(now / 1000) - tx.timestamp) : null,
    });
  }

  // A transfer whose comment matches no open order is not an error: it may be an old
  // order already published, or someone testing. Report it, never discount it silently.
  const orphanPayments = (transactions || []).filter((t) => !claimed.has(t.key) && !credited.has(t.key));
  return { paid, unmatched, orphanPayments };
}

export async function fetchIncoming({ address, limit = 50, apiKey = '', fetchImpl = fetch, timeoutMs = 15000 }) {
  const parsed = parseTonAddress(address);
  if (!parsed.valid) throw new Error('bad merchant address: ' + parsed.reason);
  const url = new URL(TONCENTER);
  url.searchParams.set('address', parsed.raw);
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 100)));
  // No to_lt/archival here: toncenter answers 500 when they are present, which reads
  // like an outage. Plain address and limit is the shape that works.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { accept: 'application/json', 'user-agent': 'pinstr-tonwatch/1.0' };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await fetchImpl(url.toString(), { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`toncenter ${res.status}`);
    const payload = await res.json();
    return { transactions: normaliseTransactions(payload, parsed.raw), raw: parsed.raw };
  } finally {
    clearTimeout(timer);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const address = process.env.PINSTR_TON_WALLET || '';
  if (!address) {
    console.error('set PINSTR_TON_WALLET');
    process.exit(1);
  }
  const { transactions, raw } = await fetchIncoming({ address, apiKey: process.env.TONCENTER_API_KEY || '' });
  console.log(JSON.stringify({ wallet: raw, incoming: transactions.length, transactions }, null, 2));
}
