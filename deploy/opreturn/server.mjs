// satoshi.si OP_RETURN service.
//
// Runs on the VPS and is the only piece the browser talks to. It holds the order queue,
// validates messages, serves the board feed, and rolls a small index of readable OP_RETURNs
// found on the chain. It never touches BTCPay: that lives behind D's router, reachable only
// from the Start9 box, whose worker claims orders from here and reports back.
//
// No dependencies. Node's own http, fs, crypto and fetch.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { OP_RETURN, validateMessage, priceSats, latestFromBlocks, boardNote } from './opreturnModel.mjs';

const PORT = Number(process.env.OPRETURN_PORT || 8791);
const DATA_DIR = process.env.OPRETURN_DATA || path.resolve('./data');
const WORKER_TOKEN = (process.env.OPRETURN_WORKER_TOKEN || '').trim();
const ALLOWED_ORIGINS = (process.env.OPRETURN_ORIGINS || 'https://satoshi.si,https://pinstr.si').split(',').map(s => s.trim());
const CHAIN_BASE = process.env.OPRETURN_CHAIN_BASE || 'https://mempool.space/api';
// Their blocks hold a few thousand transactions and the API pages 25 at a time, so the index
// is filled by a rolling scan instead of one impossible pass: a few pages each refresh,
// walking backwards from the tip, so the newest readable messages show up within minutes.
const SCAN_PAGES_PER_REFRESH = Math.max(1, Number(process.env.OPRETURN_SCAN_PAGES || 3));
const SCAN_INTERVAL_MS = Number(process.env.OPRETURN_SCAN_INTERVAL_MS || 120000);
const KEEP_MESSAGES = 60;

const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CHAIN_FILE = path.join(DATA_DIR, 'chain.json');
const ORDER_TTL_MS = 24 * 3600 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  fs.renameSync(tmp, file);
}

let orders = readJson(ORDERS_FILE, {});
let chain = readJson(CHAIN_FILE, { messages: [], cursor: null });

function saveOrders() {
  // Anything older than a day is dead weight; the tool is for a message, not a ledger.
  const cutoff = Date.now() - ORDER_TTL_MS;
  for (const [id, order] of Object.entries(orders)) {
    if (order.createdAtMs < cutoff) {
      delete orders[id];
    }
  }
  writeJson(ORDERS_FILE, orders);
}

function saveChain() {
  chain.messages = chain.messages.slice(0, KEEP_MESSAGES);
  writeJson(CHAIN_FILE, chain);
}

function newId() {
  return crypto.randomBytes(9).toString('base64url');
}

function publicOrder(order) {
  return {
    id: order.id,
    state: order.state,
    sats: order.sats,
    message: order.message,
    isPublic: order.isPublic,
    theme: order.theme,
    rails: order.rails || {},
    invoiceId: order.invoiceId || null,
    opReturnTxid: order.opReturnTxid || null,
    blockHeight: order.blockHeight || null,
    reason: order.reason || null,
    createdAt: new Date(order.createdAtMs).toISOString(),
  };
}

function send(res, status, body, extraHeaders = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  res.end(payload);
}

function cors(res, req) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-max-age', '600');
  }
}

function body(req, limit = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

function workerAuthorized(req) {
  if (!WORKER_TOKEN) {
    return false;
  }
  const header = req.headers.authorization || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (given.length !== WORKER_TOKEN.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(WORKER_TOKEN));
}

// ---------------------------------------------------------------- chain index ----

let scanning = false;

async function chainGet(pathname) {
  const response = await fetch(CHAIN_BASE + pathname, {
    headers: { 'user-agent': 'satoshi.si-opreturn/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    throw new Error(`chain ${response.status}`);
  }
  return response.json();
}

async function scanOnce() {
  if (scanning) {
    return;
  }
  scanning = true;
  try {
    const blocks = await chainGet('/v1/blocks');
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return;
    }
    let index = 0;
    let page = 0;
    if (chain.cursor) {
      index = blocks.findIndex(b => b.id === chain.cursor.blockId);
      index = index >= 0 ? index : 0;
      page = chain.cursor.page || 0;
    }
    for (let step = 0; step < SCAN_PAGES_PER_REFRESH; step += 1) {
      const block = blocks[index];
      if (!block) {
        index = blocks.length - 1;
        page = 0;
        continue;
      }
      let txs = [];
      try {
        txs = await chainGet(`/block/${block.id}/txs/${page * 25}`);
      } catch {
        txs = [];
      }
      if (!Array.isArray(txs) || txs.length === 0) {
        index += 1;
        page = 0;
        continue;
      }
      const seen = new Set(chain.messages.map(m => m.txid));
      const found = latestFromBlocks([{ height: block.height, timestamp: block.timestamp, txs }], 25);
      for (const message of found) {
        if (!seen.has(message.txid)) {
          chain.messages.push(message);
          seen.add(message.txid);
        }
      }
      chain.messages.sort((a, b) => (b.blockHeight || 0) - (a.blockHeight || 0));
      page += 1;
      if (txs.length < 25) {
        index += 1;
        page = 0;
      }
    }
    chain.cursor = { blockId: blocks[Math.min(index, blocks.length - 1)].id, page };
    saveChain();
  } catch (error) {
    console.error('scan failed:', error.message);
  } finally {
    scanning = false;
  }
}

setInterval(scanOnce, SCAN_INTERVAL_MS);
scanOnce();

// ------------------------------------------------------------------- routes ----

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  cors(res, req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (route === '/opreturn/v1/health' && req.method === 'GET') {
      send(res, 200, {
        ok: true,
        priceSats: priceSats(),
        limits: { maxBytes: OP_RETURN.maxBytes },
        orders: Object.keys(orders).length,
        chainMessages: chain.messages.length,
        scannedAt: chain.cursor ? new Date().toISOString() : null,
      });
      return;
    }

    // What a visitor needs to draw the form before writing anything.
    if (route === '/opreturn/v1/config' && req.method === 'GET') {
      send(res, 200, {
        priceSats: priceSats(),
        serviceSats: OP_RETURN.serviceSats,
        networkSats: OP_RETURN.networkSatsEstimate,
        maxBytes: OP_RETURN.maxBytes,
        latestCount: OP_RETURN.latestCount,
      });
      return;
    }

    if (route === '/opreturn/v1/orders' && req.method === 'POST') {
      const payload = await body(req);
      const check = validateMessage(payload.message);
      if (!check.ok) {
        send(res, 400, { error: check.error, code: 'invalid_message' });
        return;
      }
      const theme = typeof payload.theme === 'string' ? payload.theme.slice(0, 40) : null;
      const order = {
        id: newId(),
        state: 'new',
        message: check.value,
        bytes: check.bytes,
        sats: priceSats(),
        isPublic: Boolean(payload.isPublic),
        theme: payload.isPublic ? theme : null,
        createdAtMs: Date.now(),
        rails: {},
      };
      orders[order.id] = order;
      saveOrders();
      send(res, 201, publicOrder(order));
      return;
    }

    const orderMatch = route.match(/^\/opreturn\/v1\/orders\/([A-Za-z0-9_-]{6,40})$/);
    if (orderMatch && req.method === 'GET') {
      const order = orders[orderMatch[1]];
      if (!order) {
        send(res, 404, { error: 'no such order', code: 'not_found' });
        return;
      }
      send(res, 200, publicOrder(order));
      return;
    }

    // The board: messages that were paid for, plus the readable ones found on the chain.
    if (route === '/opreturn/v1/latest' && req.method === 'GET') {
      const paid = Object.values(orders)
        .filter(o => o.state === 'published' && o.isPublic)
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, OP_RETURN.latestCount)
        .map(o => boardNote({
          text: o.message,
          txid: o.opReturnTxid,
          mine: true,
          theme: o.theme,
          publishedAt: new Date(o.createdAtMs).toISOString(),
          source: 'tool',
        }));
      const fromChain = chain.messages
        .slice(0, OP_RETURN.latestCount)
        .map(m => boardNote({
          text: m.text,
          txid: m.txid,
          publishedAt: m.blockTime ? new Date(m.blockTime * 1000).toISOString() : null,
          source: 'chain',
        }));
      send(res, 200, { paid, chain: fromChain });
      return;
    }

    // ---- worker routes: the Start9 box, holding the token, is the only caller ----
    if (route.startsWith('/opreturn/v1/worker/')) {
      if (!workerAuthorized(req)) {
        send(res, 401, { error: 'unauthorized', code: 'unauthorized' });
        return;
      }
      if (route === '/opreturn/v1/worker/pending' && req.method === 'GET') {
        const pending = Object.values(orders)
          .filter(o => o.state === 'new')
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
          .slice(0, 10)
          .map(publicOrder);
        const watching = Object.values(orders)
          .filter(o => o.state === 'awaiting_payment' || o.state === 'paid')
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
          .slice(0, 20)
          .map(publicOrder);
        send(res, 200, { pending, watching });
        return;
      }
      const workerOrder = route.match(/^\/opreturn\/v1\/worker\/orders\/([A-Za-z0-9_-]{6,40})$/);
      if (workerOrder && req.method === 'POST') {
        const order = orders[workerOrder[1]];
        if (!order) {
          send(res, 404, { error: 'no such order', code: 'not_found' });
          return;
        }
        const payload = await body(req);
        const allowed = ['state', 'rails', 'invoiceId', 'opReturnTxid', 'blockHeight', 'reason'];
        for (const field of allowed) {
          if (field in payload) {
            order[field] = payload[field];
          }
        }
        order.updatedAtMs = Date.now();
        saveOrders();
        send(res, 200, publicOrder(order));
        return;
      }
      send(res, 404, { error: 'not found', code: 'not_found' });
      return;
    }

    send(res, 404, { error: 'not found', code: 'not_found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const status = message.includes('too large') ? 413 : message.includes('not JSON') ? 400 : 500;
    send(res, status, { error: message, code: 'bad_request' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`opreturn service on 127.0.0.1:${PORT}, price ${priceSats()} sats, worker token ${WORKER_TOKEN ? 'set' : 'MISSING'}`);
});
