import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [html, pwa, sitemap, seo, serviceWorker] = await Promise.all([
  readFile(new URL('nostrKeys.html', root), 'utf8'),
  readFile(new URL('pwa.js', root), 'utf8'),
  readFile(new URL('sitemap.xml', root), 'utf8'),
  readFile(new URL('seo.mjs', root), 'utf8'),
  readFile(new URL('sw.js', root), 'utf8'),
]);

const core = html.match(/<script id="nostr-keys-core">([\s\S]*?)<\/script>/)?.[1];
assert.ok(core, 'the downloadable HTML must contain its conversion code');
const context = {};
context.globalThis = context;
vm.runInNewContext(core, context);
const converter = context.NostrKeys;

const publicHex = '000000005e9dda01479c76c5f4fccbaebe4e7856e02f8e85adba05ad62ad6927';
const knownNpub = 'npub1qqqqqqz7nhdqz3uuwmzlflxt46lyu7zkuqhcapddhgz66c4ddynswreecw';
const secretOne = `${'0'.repeat(63)}1`;
const knownNsecOne = 'nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsmhltgl';
const curveOrder = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';

test('help separates newcomer guidance from technical details', () => {
  for (const expected of [
    'In simple terms',
    'Technical details',
    'NIP-19',
    'P = kG',
    'x-only',
    'crypto.getRandomValues',
    'Web Workers',
    'known-vector self-test',
  ]) {
    assert.ok(html.includes(expected), `help should explain ${expected}`);
  }
});

test('converts a known public key between hex and npub', () => {
  assert.equal(converter.encode('npub', converter.hexToBytes(publicHex)), knownNpub);
  assert.equal(converter.bytesToHex(converter.decode(knownNpub, 'npub')), publicHex);
});

test('converts a valid secret scalar between hex and nsec', () => {
  assert.equal(converter.encode('nsec', converter.hexToBytes(secretOne)), knownNsecOne);
  assert.equal(converter.bytesToHex(converter.decode(knownNsecOne, 'nsec')), secretOne);
  assert.equal(
    converter.bytesToHex(converter.publicBytes(converter.hexToBytes(secretOne))),
    '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
  );
});

test('rejects invalid secret scalars, checksums, lengths and prefixes', () => {
  assert.throws(() => converter.validSecret(converter.hexToBytes('0'.repeat(64))), /valid secp256k1/);
  assert.throws(() => converter.validSecret(converter.hexToBytes(curveOrder)), /valid secp256k1/);
  assert.throws(() => converter.decode(`${knownNpub.slice(0, -1)}q`, 'npub'), /checksum/);
  assert.throws(() => converter.decode(knownNpub, 'nsec'), /Expected a valid nsec/);
  assert.throws(() => converter.hexToBytes('abcd'), /exactly 64/);
});

test('page is downloadable, inspectable and explicit about secret-key safety', () => {
  assert.match(html, /download="satoshi-si-nostr-keys\.html"/);
  assert.match(html, /github\.com\/StellarStoic\/satoshi\/blob\/main\/nostrKeys\.html/);
  assert.match(html, /Do not use a website-generated key for an important identity/);
  assert.match(html, /If public-key hex · npub/);
  assert.match(html, /If secret-key hex · nsec/);
  assert.match(html, /Prefixes after npub1/);
  assert.match(html, /CPU workers/);
  assert.match(html, /#patternStatus\[data-state=error\]/);
  assert.match(html, /setAttribute\('aria-live','assertive'\)/);
  assert.match(html, /<script src="\/burgerMenu\.js"><\/script>/);
  assert.match(html, /class="help-trigger site-help-trigger info-modal-trigger"/);
  assert.match(html, /body\.keys-page\{[^}]*height:100dvh[^}]*overflow:hidden/);
  assert.match(html, /\.keys-shell\{[^}]*overflow-y:auto[^}]*scrollbar-gutter:stable/);
  assert.match(html, /window\.addEventListener\('pagehide'/);
  assert.doesNotMatch(core, /localStorage|sessionStorage|fetch\(|XMLHttpRequest/);
});

test('route is discoverable, cached, and excluded from analytics and AI chat', () => {
  assert.match(pwa, /Nostr keys/);
  assert.match(pwa, /\['\/wallet\.html', '\/nostrKeys\.html'\]/);
  assert.match(sitemap, /nostrKeys\.html/);
  assert.match(seo, /'\/nostrKeys\.html': \[/);
  assert.match(serviceWorker, /'\/nostrKeys\.html'/);
});
