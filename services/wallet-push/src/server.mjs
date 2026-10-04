import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import webpush from 'web-push';
import {AUTH_LIFETIME_OPTIONS, MAX_AUTH_SECONDS, currentMailboxCheckpoint, expiryTimerDelay, publicRecord, redactLogValue, validateDelegation} from './validation.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const protoDirectory = path.resolve(directory, '../proto');
const definition = protoLoader.loadSync([
  path.join(protoDirectory, 'bark_server.proto'),
  path.join(protoDirectory, 'mailbox_server.proto'),
], {keepCase: true, longs: String, defaults: true, oneofs: true});
const rpc = grpc.loadPackageDefinition(definition);

const PORT = Number(process.env.PORT || 8788);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://satoshi.si';
const STATE_FILE = process.env.STATE_FILE || path.resolve(directory, '../data/subscriptions.json');
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@satoshi.si';
const records = new Map();
const streams = new Map();
const rateLimits = new Map();
let persistenceQueue = Promise.resolve();

async function initializeVapid() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    const keyFile = path.join(path.dirname(STATE_FILE), 'vapid.json');
    try {
      const stored = JSON.parse(await fs.readFile(keyFile, 'utf8'));
      VAPID_PUBLIC_KEY = stored.publicKey;
      VAPID_PRIVATE_KEY = stored.privateKey;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const generated = webpush.generateVAPIDKeys();
      await fs.mkdir(path.dirname(keyFile), {recursive: true, mode: 0o700});
      await fs.writeFile(keyFile, JSON.stringify(generated), {mode: 0o600, flag: 'wx'});
      VAPID_PUBLIC_KEY = generated.publicKey;
      VAPID_PRIVATE_KEY = generated.privateKey;
    }
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('VAPID keys are invalid');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function corsHeaders(origin) {
  return origin === ALLOWED_ORIGIN ? {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
    vary: 'Origin',
  } : {};
}

function json(response, status, body, origin = '') {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(origin)});
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function allowRequest(address) {
  const now = Date.now();
  const recent = (rateLimits.get(address) || []).filter(time => now - time < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  rateLimits.set(address, recent);
  return true;
}

function persist() {
  persistenceQueue = persistenceQueue.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(STATE_FILE), {recursive: true, mode: 0o700});
    const temporary = `${STATE_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify([...records.values()], null, 2), {mode: 0o600});
    await fs.rename(temporary, STATE_FILE);
  });
  return persistenceQueue;
}

async function notify(record) {
  const payload = JSON.stringify({
    title: 'Bitcoin received',
    body: `Open the ${record.network === 'mainnet' ? 'mainnet' : 'Signet'} wallet to view the payment.`,
    tag: `bark-mailbox-${record.network}`,
    url: `/wallet.html?network=${record.network}`,
  });
  try {
    // 25 hours: longer than any authorization, so a phone that was offline for a
    // while still receives the alert when it reconnects instead of the push
    // service dropping it after two minutes.
    await webpush.sendNotification(record.subscription, payload, {TTL: 90_000, urgency: 'high'});
  } catch (error) {
    if ([404, 410].includes(error.statusCode)) {
      records.delete(record.id);
      stopWatcher(record.id);
      await persist();
      return;
    }
    console.error(`Push failed for ${record.id}: ${redactLogValue(error.statusCode || error.message)}`);
  }
}

function credentialsFor(serverAddress) {
  return serverAddress.startsWith('https://') ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
}

function rpcTarget(serverAddress) {
  const url = new URL(serverAddress);
  return `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
}

function stopWatcher(id) {
  const active = streams.get(id);
  streams.delete(id);
  active?.cancel?.();
  clearTimeout(active?.retryTimer);
  clearTimeout(active?.expiryTimer);
}

function startWatcher(record) {
  stopWatcher(record.id);
  if (record.expiresAt <= Math.floor(Date.now() / 1000)) return;

  const target = rpcTarget(record.serverAddress);
  const credentials = credentialsFor(record.serverAddress);
  const ark = new rpc.bark_server.ArkService(target, credentials);
  ark.Handshake({bark_version: 'satoshi-wallet-push/1.0.0'}, (error, handshake) => {
    ark.close();
    if (error) return retryWatcher(record, `handshake: ${error.message}`);
    const minimum = Number(handshake.min_protocol_version);
    const maximum = Number(handshake.max_protocol_version);
    const version = Math.min(5, maximum);
    if (!Number.isSafeInteger(version) || version < Math.max(4, minimum)) {
      return retryWatcher(record, `no compatible protocol (${minimum}-${maximum})`);
    }

    const metadata = new grpc.Metadata();
    metadata.set('pver', String(version));
    metadata.set('x-user-agent', 'satoshi-wallet-push/1.0.0');
    const mailbox = new rpc.mailbox_server.MailboxService(target, credentials);
    const call = mailbox.SubscribeMailbox({
      mailbox_id: Buffer.from(record.mailboxIdentifier, 'hex'),
      authorization: Buffer.from(record.authorization, 'hex'),
      checkpoint: record.checkpoint,
    }, metadata);
    // Arm the expiry in slices: setTimeout fires almost immediately above about
    // 24.8 days, so a one-year authorization scheduled in a single call would
    // tear its own watcher down the moment it started.
    const armExpiry = () => {
      const delay = expiryTimerDelay(record.expiresAt);
      if (delay <= 0) {
        stopWatcher(record.id);
        records.delete(record.id);
        void persist();
        return;
      }
      call.expiryTimer = setTimeout(armExpiry, delay);
    };
    armExpiry();
    streams.set(record.id, call);
    call.on('data', message => {
      record.checkpoint = String(message.checkpoint);
      void persist();
      const kind = message.message || '';
      if (message.arkoor || message.incoming_lightning_payment || kind === 'arkoor' || kind === 'incoming_lightning_payment') {
        void notify(record);
      }
    });
    call.on('error', error => {
      mailbox.close();
      if (error.code !== grpc.status.CANCELLED) retryWatcher(record, error.message);
    });
    call.on('end', () => {
      mailbox.close();
      if (streams.get(record.id) === call) retryWatcher(record, 'stream ended');
    });
  });
}

function retryWatcher(record, reason) {
  stopWatcher(record.id);
  if (!records.has(record.id) || record.expiresAt <= Math.floor(Date.now() / 1000)) return;
  console.warn(`Mailbox watcher ${record.id} reconnecting: ${redactLogValue(reason)}`);
  const retryTimer = setTimeout(() => startWatcher(record), 5000);
  streams.set(record.id, {retryTimer, cancel() { clearTimeout(retryTimer); }});
}

async function loadState() {
  try {
    const stored = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
    const now = Math.floor(Date.now() / 1000);
    for (const record of stored) if (record.expiresAt > now) records.set(record.id, record);
    await persist();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const record of records.values()) startWatcher(record);
}

function authorizedRecord(request, record) {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const supplied = crypto.createHash('sha256').update(token).digest();
  const expected = Buffer.from(record.secretHash, 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (origin && origin !== ALLOWED_ORIGIN) return json(response, 403, {error: 'Origin not allowed'});
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(origin));
    return response.end();
  }
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/wallet-notifications/v1/config') {
    return json(response, 200, {vapidPublicKey: VAPID_PUBLIC_KEY, authorizationSeconds: MAX_AUTH_SECONDS, authorizationOptions: AUTH_LIFETIME_OPTIONS}, origin);
  }
  if (request.method === 'GET' && url.pathname === '/wallet-notifications/v1/health') {
    return json(response, 200, {ok: true, watchers: streams.size}, origin);
  }
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!allowRequest(forwarded || request.socket.remoteAddress || 'unknown')) return json(response, 429, {error: 'Too many requests'}, origin);

  if (request.method === 'POST' && url.pathname === '/wallet-notifications/v1/subscriptions') {
    try {
      const body = await readJson(request);
      const validated = validateDelegation(body);
      const id = crypto.createHash('sha256').update(`${validated.subscription.endpoint}:${body.mailboxIdentifier}`).digest('hex').slice(0, 32);
      const secret = crypto.randomBytes(24).toString('base64url');
      const previous = records.get(id);
      const record = {
        id,
        secretHash: crypto.createHash('sha256').update(secret).digest('hex'),
        network: body.network,
        serverAddress: body.serverAddress,
        mailboxIdentifier: body.mailboxIdentifier.toLowerCase(),
        authorization: body.authorization.toLowerCase(),
        expiresAt: validated.expiresAt,
        subscription: validated.subscription,
        checkpoint: previous?.checkpoint || currentMailboxCheckpoint(),
      };
      records.set(id, record);
      await persist();
      startWatcher(record);
      return json(response, 201, {...publicRecord(record), secret}, origin);
    } catch (error) {
      return json(response, 400, {error: error.message}, origin);
    }
  }

  const subscriptionRoute = url.pathname.match(/^\/wallet-notifications\/v1\/subscriptions\/([a-f0-9]{32})$/);
  if (request.method === 'PUT' && subscriptionRoute) {
    try {
      const record = records.get(subscriptionRoute[1]);
      if (!record || !authorizedRecord(request, record)) return json(response, 404, {error: 'Subscription not found'}, origin);
      const body = await readJson(request);
      const validated = validateDelegation(body);
      const expectedId = crypto.createHash('sha256').update(`${validated.subscription.endpoint}:${body.mailboxIdentifier}`).digest('hex').slice(0, 32);
      if (expectedId !== record.id || body.network !== record.network || body.serverAddress !== record.serverAddress) {
        return json(response, 400, {error: 'Renewal does not match the existing subscription'}, origin);
      }
      record.authorization = body.authorization.toLowerCase();
      record.expiresAt = validated.expiresAt;
      record.subscription = validated.subscription;
      await persist();
      startWatcher(record);
      return json(response, 200, publicRecord(record), origin);
    } catch (error) {
      return json(response, 400, {error: error.message}, origin);
    }
  }

  if (request.method === 'DELETE' && subscriptionRoute) {
    const record = records.get(subscriptionRoute[1]);
    if (!record || !authorizedRecord(request, record)) {
      return json(response, 404, {error: 'Subscription not found'}, origin);
    }
    records.delete(record.id);
    stopWatcher(record.id);
    await persist();
    return json(response, 200, {removed: true}, origin);
  }
  return json(response, 404, {error: 'Not found'}, origin);
});

await initializeVapid();
await loadState();
server.listen(PORT, '127.0.0.1', () => console.log(`satoshi-wallet-push listening on 127.0.0.1:${PORT}`));

async function shutdown() {
  for (const id of streams.keys()) stopWatcher(id);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
