import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {STICKY_ANONYMOUS_PRICE_SATS, STICKY_MAX_CHARACTERS, STICKY_MEMBER_PRICE_SATS, STICKY_PRICE_SATS, makeDeletionTemplate, makeStickyTemplate, normaliseGeohash, parseStickyEvent, stickyContentHash, stickyOrderPrice, stickyPaymentRails} from '../stickyNotesModel.mjs';

const TEST_GEOHASH = 'u0qj7z0y1';

test('sticky notes accept up to 501 characters', () => {
  assert.equal(STICKY_MAX_CHARACTERS, 501);
});

test('uses the authoritative whole-satoshi order price', () => {
  assert.equal(STICKY_PRICE_SATS, 21);
  assert.equal(STICKY_MEMBER_PRICE_SATS, 11);
  assert.equal(STICKY_ANONYMOUS_PRICE_SATS, 42);
  assert.equal(stickyOrderPrice({sats: 11}), 11);
  assert.equal(stickyOrderPrice({sats: 21}), 21);
  assert.equal(stickyOrderPrice({sats: 42}), 42);
  assert.equal(stickyOrderPrice({sats: 10.5}), 21);
  assert.equal(stickyOrderPrice({sats: 0}), 21);
});

test('anonymous notes carry a signed identity-mode marker', () => {
  const template = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH, anonymous: true});
  assert.deepEqual(template.tags.find(tag => tag[0] === 'anonymous'), ['anonymous', '24h-local-key']);
  const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(parsed.anonymous, true);
});

test('sticky event round-trips its visual placement', () => {
  const template = makeStickyTemplate({content: '  hello cardboard  ', color: 'pink', font: 'handwritten', x: .25, y: .75, rotation: -4, geohash: TEST_GEOHASH});
  const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(parsed.content, 'hello cardboard');
  assert.equal(parsed.color, 'pink');
  assert.equal(parsed.font, 'handwritten');
  assert.equal(parsed.x, .25);
  assert.equal(parsed.y, .75);
  assert.equal(parsed.rotation, -4);
  assert.equal(parsed.geohash, TEST_GEOHASH);
});

test('a board geohash is required and carries searchable Nostr geo tags', () => {
  assert.equal(normaliseGeohash(' U0QJ7Z0Y1 '), TEST_GEOHASH);
  assert.equal(normaliseGeohash('u0qil'), '');
  assert.throws(() => makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0}), /geohash/i);
  const template = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH});
  assert.deepEqual(template.tags.find(tag => tag[0] === 'g'), ['g', TEST_GEOHASH]);
  assert.deepEqual(template.tags.find(tag => tag[0] === 'i'), ['i', `geo:${TEST_GEOHASH}`]);
  assert.deepEqual(template.tags.find(tag => tag[0] === 'k'), ['k', 'geo']);
});

test('content fingerprint binds the paid text and color', async () => {
  const first = await stickyContentHash('hello', 'yellow', 'typewriter', webcrypto);
  const same = await stickyContentHash(' hello ', 'yellow', 'typewriter', webcrypto);
  const changed = await stickyContentHash('hello', 'blue', 'typewriter', webcrypto);
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test('the board offers every payment rail returned by the service', () => {
  assert.deepEqual(stickyPaymentRails({payment: {
    arkAddress: 'ark1abc', paymentLink: 'bitcoin:?amount=0.00000021&ark=ark1abc',
    bolt11: 'lnbc210n1x', lightningUri: 'lightning:lnbc210n1x',
  }}), [
    {id: 'bark', label: 'Bark', uri: 'bitcoin:?amount=0.00000021&ark=ark1abc', copyValue: 'bitcoin:?amount=0.00000021&ark=ark1abc'},
    {id: 'lightning', label: 'Lightning', uri: 'lightning:lnbc210n1x', copyValue: 'lnbc210n1x'},
  ]);
});

test('single-rail and pending orders do not show unusable payment tabs', () => {
  assert.deepEqual(stickyPaymentRails({payment: {arkAddress: 'ark1abc'}}),
    [{id: 'bark', label: 'Bark', uri: 'ark1abc', copyValue: 'ark1abc'}]);
  assert.deepEqual(stickyPaymentRails({payment: {bolt11: 'lnbc110n1y'}}),
    [{id: 'lightning', label: 'Lightning', uri: 'lightning:lnbc110n1y', copyValue: 'lnbc110n1y'}]);
  assert.deepEqual(stickyPaymentRails({payment: null}), []);
});

test('deletion request targets one event on the satoshi relay', () => {
  const eventId = 'f'.repeat(64);
  const template = makeDeletionTemplate({eventId, createdAt: 123});
  assert.equal(template.kind, 5);
  assert.deepEqual(template.tags[0], ['e', eventId, 'wss://nostr.satoshi.si']);
});

test('font choices preview Bunny-hosted typefaces', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  assert.match(css, /fonts\.bunny\.net/);
  for (const name of ['Special Elite', 'Roboto Mono', 'Caveat', 'Lora']) assert.match(html, new RegExp(name));
  assert.match(css, /font-option--handwritten[^}]+Caveat/s);
  assert.match(css, /#noteCapacity\.is-almost-full/);
  assert.match(css, /#noteCapacity\.is-full/);
  assert.match(css, /sticky-note--dense/);
});

test('mobile board and note gestures support pinch zoom and two-finger rotation', async () => {
  const [script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /gesture\.scale \* distance\(\) \/ gesture\.distance/);
  assert.match(script, /rotation: gesture\.placement\.rotation \+ difference/);
  assert.match(css, /sticky-note--placing[^}]+touch-action:\s*none/);
  assert.match(css, /url\('\/img\/cork-board\.png'\)/);
  assert.match(css, /background-repeat:\s*repeat/);
  assert.match(script, /backgroundSize = `\$\{600 \* boardView\.scale\}px/);
  assert.match(script, /backgroundPosition = `\$\{boardView\.x\}px \$\{boardView\.y\}px`/);
});

test('payment sheet opens during invoice creation and pinned state stays complete', async () => {
  const [script, html] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /showPaymentPreparing\(quotedPrice\)/);
  assert.match(script, /setTimeout\(pollPayment, 3000\)/);
  assert.match(script, /textContent = 'Pinned'/);
  assert.match(script, /elements\.pin\.disabled = published/);
  assert.doesNotMatch(`${html}\n${script}`, /Bark/i);
});

test('board chrome stays compact over the corkboard', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(html, /class="sticky-header"/);
  assert.match(html, /id="nostrAccount"[\s\S]{0,180}lni-gear-1/);
  assert.match(html, /id="newSticky"[\s\S]{0,180}lni-plus/);
  assert.match(html, /lni-search-minus/);
  assert.match(html, /lni-search-plus/);
  assert.doesNotMatch(html, /id="zoomLevel"/);
  assert.match(css, /\.board-controls[^}]+left:\s*50%/);
  assert.doesNotMatch(script, /zoomLevel/);
  assert.doesNotMatch(html, /Global board/);
  assert.match(script, /'#g': \[activeGeohash\]/);
});

test('anonymous posting and signed-in profile details are present', async () => {
  const [html, script, session] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../nostrSession.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /Post anonymously · 42 sats/);
  for (const id of ['accountPicture', 'accountNip05', 'anonymousExpiry']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(script, /anonymousCountdown/);
  assert.match(script, /kinds: \[0\]/);
  assert.match(session, /ANONYMOUS_SESSION_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(session, /generateSecretKey\(\)/);
  assert.match(session, /localStorage\.removeItem\(ANONYMOUS_KEY\)/);
});
