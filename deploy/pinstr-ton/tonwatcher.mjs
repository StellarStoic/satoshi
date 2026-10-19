
// tonwatcher — the settling loop tonwatch.mjs never had.
//
// TON has no invoice object, so a payment is identified by the order id in the transfer comment and
// the amount that was asked for. Every transaction settles at most once: its key is remembered, so a
// restart or an overlapping poll cannot credit the same transfer twice.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchIncoming, normaliseTransactions, reconcile } from './tonwatch.mjs';

const WALLET = process.env.PINSTR_TON_WALLET || '';
const API_KEY = process.env.PINSTR_TON_API_KEY || '';
const DESK = (process.env.PINSTR_DESK_URL || 'http://127.0.0.1:8790').replace(/\/$/, '');
const TOKEN = process.env.PINSTR_WORKER_TOKEN || '';
const ORDERS_FILE = process.env.PINSTR_ORDERS_FILE || '/var/lib/satoshi-nip05/sticky.json';
const STATE_FILE = process.env.TONWATCH_STATE || '/var/lib/tonwatch/state.json';
const INTERVAL_MS = Number(process.env.TONWATCH_INTERVAL_MS || 60_000);
const TOLERANCE_BPS = Number(process.env.TONWATCH_TOLERANCE_BPS || 200);
const MAX_REMEMBERED = 2000;

// Mirror of the desk's ladder. If the two ever disagree the desk is right; this only decides which
// transfers look like payment for an order, and a mismatch shows up as an unsettled transfer.
const LADDER = { anonymous: 500_000_000n, week: 1_000_000_000n, year: 3_000_000_000n };
const FEE = 10_000_000n;

export function expectedNanoFor(order) {
  const action = order && order.action === 'subscribe'
    ? (order.plan === 'year' ? 'year' : 'week')
    : 'anonymous';
  const price = LADDER[action];
  return price ? (price + FEE).toString() : null;
}

function log(fields) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...fields }));
}

function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { settled: Array.isArray(parsed.settled) ? parsed.settled : [] };
  } catch {
    return { settled: [] };
  }
}

function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true, mode: 0o700 });
  state.settled = state.settled.slice(-MAX_REMEMBERED);
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, STATE_FILE);
}

function waitingOrders(now) {
  let store;
  try {
    store = JSON.parse(readFileSync(ORDERS_FILE, 'utf8'));
  } catch (err) {
    log({ event: 'orders_unreadable', error: String(err.message || err).slice(0, 120) });
    return [];
  }
  const orders = store.orders || store;
  const out = [];
  for (const order of Object.values(orders)) {
    if (!order || !order.id) continue;
    if (order.status !== 'awaiting_invoice' && order.status !== 'awaiting_payment') continue;
    const expectedNano = expectedNanoFor(order);
    if (!expectedNano) continue;
    out.push({ id: order.id, expectedNano, expiresAtMs: order.expiresAt ? order.expiresAt * 1000 : 0 });
  }
  return out;
}

async function settle(id, tx) {
  const response = await fetch(`${DESK}/pinstr/v1/worker/orders/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ status: 'paid', tx: tx.txHash }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function tick(state) {
  const orders = waitingOrders(Date.now());
  if (orders.length === 0) {
    log({ event: 'idle', waiting: 0 });
    return;
  }
  let transactions = [];
  try {
    const { transactions: fetched } = await fetchIncoming({ address: WALLET, apiKey: API_KEY });
    transactions = fetched;
  } catch (err) {
    log({ event: 'fetch_failed', error: String(err.message || err).slice(0, 160) });
    return;
  }
  const { paid, unmatched } = reconcile({
    orders,
    transactions,
    creditedKeys: state.settled,
    toleranceBps: TOLERANCE_BPS,
  });
  log({ event: 'tick', waiting: orders.length, incoming: transactions.length, paid: paid.length, unmatched: unmatched.length });
  for (const entry of paid) {
    const tx = entry.tx || entry.transaction || {};
    try {
      const result = await settle(entry.id, tx);
      if (result.ok) {
        state.settled.push(tx.key || `${tx.txHash}:${tx.lt}`);
        saveState(state);
        log({ event: 'settled', orderId: entry.id, txHash: tx.txHash, valueNano: tx.valueNano });
      } else {
        log({ event: 'settle_refused', orderId: entry.id, status: result.status, error: JSON.stringify(result.body).slice(0, 160) });
      }
    } catch (err) {
      log({ event: 'settle_failed', orderId: entry.id, error: String(err.message || err).slice(0, 160) });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!WALLET) {
    console.error('set PINSTR_TON_WALLET');
    process.exit(1);
  }
  if (!TOKEN) {
    console.error('set PINSTR_WORKER_TOKEN');
    process.exit(1);
  }
  const state = loadState();
  log({ event: 'start', wallet: WALLET, desk: DESK, intervalMs: INTERVAL_MS, remembered: state.settled.length });
  let running = true;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { running = false; log({ event: 'stopping', signal }); });
  }
  while (running) {
    await tick(state);
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
  log({ event: 'stopped' });
}
