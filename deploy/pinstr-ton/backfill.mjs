
// One-off: every Telegram account that existed before names and faces gets them now, so nobody
// has to sign in twice for a profile the server can already sign. Logs one line per account,
// including the ones it could not touch, so a partial run is visible rather than silent.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { refreshTelegramProfile } from './api.mjs';

const secret = process.env.PINSTR_TG_SESSION_SECRET;
const dir = process.env.PINSTR_TG_PROFILE_DIR || '/opt/pinstr-tg/profiles';
const relays = (process.env.PINSTR_TG_RELAYS || 'wss://nostr.satoshi.si')
  .split(',').map((s) => s.trim()).filter(Boolean);

if (!secret) { console.error('no session secret in the environment'); process.exit(1); }
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
console.log(`accounts: ${files.length} | relays: ${relays.join(',')}`);
let done = 0, skipped = 0;
for (const file of files) {
  let record;
  try {
    record = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  } catch (err) {
    console.log(`${file} unreadable: ${String(err.message || err).slice(0, 80)}`); skipped += 1; continue;
  }
  const tgId = record.tgId ?? path.basename(file, '.json');
  if (!record.sealed || record.deleted) { console.log(`${file} skipped: no live key`); skipped += 1; continue; }
  try {
    const out = await refreshTelegramProfile({ tgId, record: { ...record, dir }, relays, secret });
    if (out.refreshed) done += 1;
    console.log(`${file} pubkey=${record.pubkey.slice(0, 12)}… published=${out.published} minted=${out.minted} name=${out.name || '-'} nip05=${out.nip05 || '-'}${out.reason ? ' reason=' + out.reason : ''}`);
  } catch (err) {
    skipped += 1;
    console.log(`${file} failed: ${String(err.message || err).slice(0, 120)}`);
  }
}
console.log(`done: ${done} refreshed, ${skipped} skipped`);
