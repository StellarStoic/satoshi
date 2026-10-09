import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {MENTION_MAX, MENTION_TAG, mentionFilterAvailability, mentionIssue, mentionLabel, mentionPubkeys, mentionTokens, noteMentions, npubEncode, stickyTextParts, GEOHASH_MIN_LENGTH, STICKY_LIVELINESS, STICKY_DEFAULT_LIVELINESS, STICKY_MIN_LIVELINESS_SECONDS, STICKY_MAX_LIVELINESS_SECONDS, isStickyExpired, stickyExpiration, stickyLiveliness, STICKY_ANONYMOUS_PRICE_SATS, STICKY_MAX_CHARACTERS, STICKY_SUB_MEMBER_WEEK_SATS, STICKY_SUB_MEMBER_YEAR_SATS, STICKY_SUB_WEEK_SATS, STICKY_SUB_WEEKS_PER_YEAR, STICKY_SUB_YEAR_DISCOUNT, STICKY_SUB_YEAR_SATS, describeStickyAction, encodeGeohash, geohashBounds, geohashMatchesBoard, geohashNeighbours, geohashPrecisionForZoom, geohashPrefixes, clampBoardView, ROTATION_MIN, ROTATION_MAX, clampRotation, STICKY_PIN_COLOURS, pinColourFor,
  geohashSetIssue, geohashTouches, makeDeletionTemplate, makeStickyTemplate, mapZoomForGeohashPrecision, normaliseGeohash, parseStickyEvent, stickyContentHash, stickyDay, stickyOrderPrice, stickyPaymentRails, stickySubscriptionPrice} from '../stickyNotesModel.mjs';

const TEST_GEOHASH = 'u0qj7z0y1';

test('sticky notes accept up to 501 characters', () => {
  assert.equal(STICKY_MAX_CHARACTERS, 501);
});

test('prices are the subscription plans, and nothing else counts as one', () => {
  assert.equal(STICKY_SUB_WEEK_SATS, 10);
  assert.equal(STICKY_SUB_YEAR_SATS, 411);
  assert.equal(STICKY_SUB_MEMBER_WEEK_SATS, 5);
  assert.equal(STICKY_SUB_MEMBER_YEAR_SATS, 205);
  assert.equal(STICKY_ANONYMOUS_PRICE_SATS, 42);

  assert.equal(stickySubscriptionPrice('week'), 10);
  assert.equal(stickySubscriptionPrice('week', {member: true}), 5);
  assert.equal(stickySubscriptionPrice('year'), 411);
  assert.equal(stickySubscriptionPrice('year', {member: true}), 205);
  assert.equal(stickySubscriptionPrice('month'), null, 'no invented plans');

  // The yearly price is the weekly one with 21% off, not a number typed twice.
  assert.equal(STICKY_SUB_YEAR_SATS,
    Math.round(STICKY_SUB_WEEK_SATS * STICKY_SUB_WEEKS_PER_YEAR * (1 - STICKY_SUB_YEAR_DISCOUNT)));
  assert.equal(STICKY_SUB_MEMBER_YEAR_SATS,
    Math.round(STICKY_SUB_MEMBER_WEEK_SATS * STICKY_SUB_WEEKS_PER_YEAR * (1 - STICKY_SUB_YEAR_DISCOUNT)));

  // Only prices this service actually quotes are displayed; anything else is not
  // a price it issued, so the board falls back rather than showing it.
  assert.equal(stickyOrderPrice({sats: 10}), 10);
  assert.equal(stickyOrderPrice({sats: 411}), 411);
  assert.equal(stickyOrderPrice({sats: 0}), 0, 'a covered note costs nothing');
  assert.equal(stickyOrderPrice({sats: 42}), 42);
  assert.equal(stickyOrderPrice({sats: 11}), STICKY_SUB_WEEK_SATS, 'the retired per-note price is not shown');
  assert.equal(stickyOrderPrice({sats: 10.5}), STICKY_SUB_WEEK_SATS);
  assert.equal(stickyOrderPrice({sats: 43}), STICKY_SUB_WEEK_SATS);
});

test('the composer says what posting costs, and what a subscription changes', () => {
  const stranger = {active: false, prices: {weekSats: 10, yearSats: 411, member: false}};
  const member = {active: false, prices: {weekSats: 5, yearSats: 205, member: true}};
  const covered = {active: true, expiresAt: 1800000000, plan: 'week', prices: {weekSats: 5, yearSats: 205, member: true}};

  const off = describeStickyAction({subscription: stranger});
  assert.equal(off.needsSubscription, true);
  assert.equal(off.label, 'Subscribe & pin · 10 sats');
  assert.match(off.state, /10 sats a week or 411 sats a year/);

  const half = describeStickyAction({subscription: member, plan: 'year'});
  assert.equal(half.label, 'Subscribe & pin · 205 sats');
  assert.match(half.state, /half price with your satoshi\.si name/);

  const on = describeStickyAction({subscription: covered});
  assert.equal(on.needsSubscription, false);
  assert.equal(on.price, 0, 'a covered note is never given a price');
  assert.equal(on.label, 'Pin it · included');
  assert.match(on.state, /Subscription active until 2027-01-15/);
  assert.equal(describeStickyAction({subscription: covered, action: 'remove'}).label, 'Remove · included');
  assert.equal(describeStickyAction({subscription: covered, action: 'remove'}).price, 0);

  const anon = describeStickyAction({anonymous: true, subscription: covered});
  assert.equal(anon.needsSubscription, false);
  assert.equal(anon.price, 42, 'an anonymous message is priced even while a subscription runs');
  assert.equal(anon.label, 'Post anonymously · 42 sats');
  assert.match(anon.state, /never applies/);

  // Nothing from the desk yet: the base prices are shown, never "free".
  assert.equal(describeStickyAction({}).label, 'Subscribe & pin · 10 sats');
  assert.equal(describeStickyAction({}).price, 10);
  assert.equal(stickyDay(1800000000), '2027-01-15');
  assert.equal(stickyDay(null), '');
});

test('public sticky-note copy has no retired per-note pricing', async () => {
  const [html, readme, context, contract] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../AI_CONTEXT.md', import.meta.url), 'utf8'),
    readFile(new URL('../docs/pay-service.md', import.meta.url), 'utf8'),
  ]);
  const copy = `${html}\n${readme}\n${context}\n${contract}`;
  assert.doesNotMatch(copy, /\b11 sats\b|Post note · 11|Remove · 11|\/sticky\/v1\/quote/);
  assert.match(copy, /10 sats/);
  assert.match(copy, /411 sats/);
  assert.match(copy, /subscription_required/);
  assert.match(context, /one to nine connected cells/);
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

test('new multilingual font keys survive signed event parsing', () => {
  for (const font of ['noto-sans', 'noto-serif', 'noto-mono', 'patrick-hand', 'roboto-slab']) {
    const template = makeStickyTemplate({content: 'Pozdrav κόσμος Привет', color: 'green', font, x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH});
    const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
    assert.equal(parsed.font, font);
  }
});

test('a board geohash is required and carries searchable Nostr geo tags', () => {
  assert.equal(normaliseGeohash(' U0QJ7Z0Y1 '), TEST_GEOHASH);
  assert.equal(normaliseGeohash('u0qil'), '');
  assert.throws(() => makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0}), /geohash/i);
  const template = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH});
  assert.deepEqual(template.tags.find(tag => tag[0] === 'g'), ['g', TEST_GEOHASH]);
  assert.deepEqual(template.tags.find(tag => tag[0] === 'i'), ['i', `geo:${TEST_GEOHASH}`]);
  assert.deepEqual(template.tags.find(tag => tag[0] === 'k'), ['k', 'geo']);
  // Every parent that is still a code: the chain stops at 4 characters, because a
  // shorter code is a region rather than a board.
  assert.deepEqual(template.tags.filter(tag => tag[0] === 'g').map(tag => tag[1]),
    geohashPrefixes(TEST_GEOHASH).filter(prefix => prefix.length >= GEOHASH_MIN_LENGTH));
  assert.deepEqual(template.tags.find(tag => tag[0] === 'geohash'), ['geohash', 'prefix']);
});

test('geohash depth includes only the selected number of child levels', () => {
  assert.deepEqual(geohashPrefixes('u24jed'), ['u24jed', 'u24je', 'u24j', 'u24', 'u2', 'u']);
  assert.equal(geohashMatchesBoard('u24jed', 'u24j', 2), true);
  assert.equal(geohashMatchesBoard('u24jed', 'u24j', 1), false);
  assert.equal(geohashMatchesBoard('u24jed', 'u24je', 1), true);
  assert.equal(geohashMatchesBoard('u24jed', 'u24jed', 0, true), true);
  assert.equal(geohashMatchesBoard('u24jed', 'u24je', 11, true), false);
});

test('map coordinates round-trip through geohash cells up to precision 9', () => {
  assert.equal(encodeGeohash(42.6, -5.6, 5), 'ezs42');
  const hash = encodeGeohash(46.0569, 14.5058, 9);
  const bounds = geohashBounds(hash);
  assert.equal(hash.length, 9);
  assert.ok(bounds.south <= 46.0569 && bounds.north >= 46.0569);
  assert.ok(bounds.west <= 14.5058 && bounds.east >= 14.5058);
  assert.equal(encodeGeohash(bounds.center.lat, bounds.center.lng, 9), hash);
  assert.equal(geohashPrecisionForZoom(2), 4, 'a shallower zoom than 4 characters is not offered');
  assert.equal(geohashPrecisionForZoom(9), 4);
  assert.equal(geohashPrecisionForZoom(20), 8);
  assert.equal(geohashPrecisionForZoom(21), 9);
  assert.equal(mapZoomForGeohashPrecision(9), 21);
  assert.equal(mapZoomForGeohashPrecision(2), mapZoomForGeohashPrecision(4), 'zoom for 4 is the floor');
});

test('a geohash code is 4 to 9 characters', () => {
  assert.equal(normaliseGeohash('u4p'), '', '3 characters is a region, not a place');
  assert.equal(normaliseGeohash('u4pr'), 'u4pr', '4 is the shallowest code');
  assert.equal(normaliseGeohash('u4pr7z0y1'), 'u4pr7z0y1', '9 is the deepest');
  assert.equal(normaliseGeohash('u4pr7z0y1x'), '', '10 is deeper than the grid goes');
  assert.equal(normaliseGeohash('u4pr7z0i'), '', 'i is not in the geohash alphabet');
  assert.equal(normaliseGeohash('U4PR7Z0Y'), 'u4pr7z0y', 'codes are lowercase');
});

test('cells stick together when they share a side or a corner', () => {
  const cell = 'u4pr7z0y';
  const neighbours = geohashNeighbours(cell);
  assert.equal(neighbours.length, 8, 'a cell has eight neighbours');
  assert.ok(neighbours.every(neighbour => geohashTouches(cell, neighbour)));
  assert.equal(geohashTouches(cell, cell), false, 'a cell is not its own neighbour');
  assert.equal(geohashTouches(cell, 'u4pr7z0'), false, 'a shallower cell is a parent, not a neighbour');
  assert.equal(geohashTouches(cell, 'u4pr7z0y1'), false, 'a deeper cell is a child, not a neighbour');
  assert.equal(geohashTouches(cell, '9q8yyk8y'), false, 'another country does not stick');
});

test('a board may be a clump of touching cells, within the rules', () => {
  const cell = 'u4pr7z0y';
  const neighbours = geohashNeighbours(cell);
  const nine = [cell, ...neighbours];
  assert.equal(geohashSetIssue([cell]), '', 'one cell on its own is a board');
  assert.equal(geohashSetIssue([cell, neighbours[0]]), '', 'and so are two that touch');
  assert.equal(geohashSetIssue(nine), '', 'a cell and its eight neighbours is the widest clump');
  const tenth = geohashNeighbours(neighbours[0]).find(neighbour => !nine.includes(neighbour));
  assert.equal(geohashSetIssue([...nine, tenth]), 'A note can sit on at most 9 cells.');
  assert.equal(geohashSetIssue([cell, cell]), 'Each cell can be chosen once.');
  assert.equal(geohashSetIssue([cell, 'u4pr7z0']), 'Every cell has to be cut to the same depth.');
  assert.equal(geohashSetIssue([cell, 'u4pr7z00']), 'Cells have to stick together — pick ones that touch.');
  assert.equal(geohashSetIssue([cell, '9q8yyk8y']), 'Cells have to stick together — pick ones that touch.');
  assert.equal(geohashSetIssue([]), 'Choose at least one cell.');
  assert.equal(geohashSetIssue('u4p'), 'A geohash is 4 to 9 characters from 0-9 and b-h, j, k, m, n, p-z.');
});

test('a clump may reach out two steps, but not fall apart', () => {
  const cell = 'u4pr7z0y';
  const step = geohashNeighbours(cell)[0];
  const beyond = geohashNeighbours(step).find(neighbour => neighbour !== cell && !geohashNeighbours(cell).includes(neighbour));
  assert.equal(geohashTouches(cell, beyond), false, 'two steps away');
  assert.equal(geohashSetIssue([cell, step, beyond]), '', 'it still holds together through the middle cell');
  assert.equal(geohashSetIssue([cell, step, beyond, '9q8yyk8y']),
    'Cells have to stick together — pick ones that touch.', 'one loose cell breaks the clump');
});

test('exact-geohash notes publish and parse as exact only', () => {
  const template = makeStickyTemplate({content: 'local only', color: 'blue', x: .5, y: .5, rotation: 0, geohash: 'u24jed', exactGeohash: true});
  assert.deepEqual(template.tags.filter(tag => tag[0] === 'g'), [['g', 'u24jed']]);
  assert.deepEqual(template.tags.find(tag => tag[0] === 'geohash'), ['geohash', 'exact']);
  const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(parsed.geohash, 'u24jed');
  assert.equal(parsed.exactGeohash, true);
});

test('a note on several cells names every cell, and stays on those boards', () => {
  const cell = 'u4pr7z0y';
  const step = geohashNeighbours(cell)[0];
  const cells = [cell, step];

  const exact = makeStickyTemplate({content: 'corner shop', color: 'green', x: .4, y: .6, rotation: 3, geohash: cell, geohashes: cells, exactGeohash: true});
  assert.deepEqual(exact.tags.filter(tag => tag[0] === 'g'), [['g', cell], ['g', step]]);
  assert.deepEqual(exact.tags.find(tag => tag[0] === 'i'), ['i', `geo:${cell}`],
    'the cell the note was written on stays its primary');
  const parsed = parseStickyEvent({...exact, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.deepEqual(parsed.geohashes, cells);
  assert.equal(parsed.geohash, cell);

  const prefix = makeStickyTemplate({content: 'corner shop', color: 'green', x: .4, y: .6, rotation: 3, geohashes: cells});
  const named = prefix.tags.filter(tag => tag[0] === 'g').map(tag => tag[1]);
  assert.ok(named.includes(cell) && named.includes(step), 'both cells are named');
  assert.ok(named.includes('u4pr7z0'), 'and the boards above them');
  const parsedPrefix = parseStickyEvent({...prefix, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.deepEqual(parsedPrefix.geohashes, cells,
    'the shallower tags are boards, not cells, so they cannot count as cells of the note');
  assert.equal(parsedPrefix.exactGeohash, false);
});

test('a note on several cells belongs to each of those boards', () => {
  const cell = 'u4pr7z0y';
  const step = geohashNeighbours(cell)[0];
  const cells = [cell, step];
  assert.equal(geohashMatchesBoard(cells, cell, 0), true, 'the board it was written on');
  assert.equal(geohashMatchesBoard(cells, step, 0), true, 'and the neighbour it also sits on');
  assert.equal(geohashMatchesBoard(cells, 'u4pr7z0', 1), true, 'the board above it, within depth');
  assert.equal(geohashMatchesBoard(cells, 'u4pr7z0', 0), false, 'but not beyond the depth the reader chose');
  assert.equal(geohashMatchesBoard(cell, cells, 0, true), true, 'a clump board shows a note on any of its cells');
  assert.equal(geohashMatchesBoard(cells, 'u4pr7z0', 1, true), false, 'an exact note is only on the cells it names');
  assert.equal(geohashMatchesBoard(cells, '9q8yyk8y', 9), false, 'and never on an unrelated board');
});

test('legacy single-geohash notes stay exact instead of widening unexpectedly', () => {
  const template = makeStickyTemplate({content: 'old note', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: 'u24jed', exactGeohash: true});
  template.tags = template.tags.filter(tag => tag[0] !== 'geohash');
  const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(parsed.exactGeohash, true);
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

test('font dropdown previews broad Bunny-hosted typeface families', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  assert.match(css, /fonts\.bunny\.net/);
  for (const name of ['Special Elite', 'Caveat', 'Noto Sans', 'Noto Serif', 'Roboto', 'Open Sans', 'Lora']) assert.match(html, new RegExp(name));
  assert.match(html, /<select id="noteFont"/);
  assert.doesNotMatch(html, /class="font-option/);
  assert.ok((html.match(/<option class="font-preview--/g) || []).length >= 18);
  assert.match(css, /font-preview--handwritten[^}]+Caveat/s);
  assert.match(css, /font-preview--noto-sans[^}]+Noto Sans/s);
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
  assert.match(script, /sats === 0/);
  // A note covered by a subscription is born settled, so this path now names the
  // subscription rather than a free membership.
  assert.match(script, /Included in your subscription/);
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
  assert.match(script, /'#g': \[\.\.\.activeGeohashes\]/);
  assert.match(html, /id="boardDepth"/);
  assert.match(html, /id="rememberStickyBoard"[^>]+role="switch"/);
  assert.match(html, /id="shareStickyBoard"/);
  assert.match(html, /id="exactGeohashNote"/);
  assert.match(html, /id="openGeohashMap"/);
  assert.match(script, /waitForGeohashMapLayout/);
  assert.match(script, /if \(existingMap\) map\.resize\(\)/);
  assert.match(script, /openGeohashMap\(\)\.catch/);
  assert.match(html, /id="geohashMapDialog"/);
  assert.doesNotMatch(html, /vendor\/leaflet/);
  assert.match(script, /vendor\/maplibre\/maplibre-gl\.js/);
  assert.match(script, /tiles\.openfreemap\.org\/styles\//);
  assert.doesNotMatch(script, /tile\.openstreetmap\.org/);
  assert.match(script, /geohashPrecisionForZoom/);
  // the credit is ours to give: the OpenFreeMap styles ship no attribution of
  // their own, and the data is OpenStreetMap's
  assert.match(script, /customAttribution/);
  assert.match(script, /href="https:\/\/openfreemap\.org\/"/);
  assert.match(script, /openstreetmap\.org\/copyright/);
  assert.match(script, /searchParams\.get\('g'\)/);
  assert.match(script, /searchParams\.set\('g', cells\.join\(','\)\)/);
  assert.match(script, /BOARD_REMEMBER_KEY/);
  assert.match(script, /localStorage\.removeItem\(BOARD_KEY\)/);
});

test('published notes resolve a readable author label in relay batches', async () => {
  const [script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /author\.textContent = '~anonymous'/);
  assert.match(script, /profile\.name \|\| profile\.display_name \|\| profile\.displayName \|\| profile\.nip05/);
  assert.match(script, /`~\$\{shortAuthor\(pubkey\)\}`/);
  assert.match(script, /readAuthorProfilesFromRelay/);
  assert.match(script, /authors: pubkeys/);
  assert.match(script, /authorProfilesLoading/);
  assert.match(css, /\.sticky-note__author\s*\{[^}]*right:\s*10px;[^}]*bottom:\s*7px;/s);
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

test('dragging a paid note onto the bin asks before discarding it', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  // a red bin, hidden until a note is actually being placed
  assert.match(html, /id="discardBin"[\s\S]{0,200}lni-trash-3/);
  assert.match(html, /id="discardBin"[^>]*hidden/);
  assert.match(css, /\.discard-bin \{[^}]*position: fixed/);
  assert.match(css, /\.discard-bin\.is-armed/);
  // the confirmation offers both answers and says the payment is not refunded
  assert.match(html, /id="discardDialog"[\s\S]{0,1500}id="discardNoteConfirm"[\s\S]{0,400}id="discardNoteCancel"/);
  assert.match(html, /Yes, discard/);
  assert.match(html, /No, keep it/);
  assert.match(html, /not refunded/);
  // it appears with placement mode, arms under the pointer, and asks on drop
  assert.match(script, /elements\.discardBin\.hidden = false/);
  assert.match(script, /setBinArmed\(isOverBin\(event\.clientX, event\.clientY\)\)/);
  assert.match(script, /if \(dropped\) openDiscardDialog\(origin\)/);
  // yes drops the note and its pending, no puts it back where the drag started
  assert.match(script, /function discardPendingNote[\s\S]{0,1200}savePending\(null\)/);
  assert.match(script, /function keepDiscardedNote[\s\S]{0,400}setPlacement\(restore\)/);
});

test('a board may be one cell or a clump of touching ones', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  // the chooser takes a list, and says how long a code may be
  assert.match(html, /id="boardGeohash"[^>]*maxlength="95"/);
  assert.match(html, /4 to 9 characters/);
  assert.match(html, /u0qj7z0y,u0qj7z0z/);
  // the map picks cells, and shows which ones may be added to the area
  assert.match(script, /function toggleMapCell\(cell\)/);
  assert.match(script, /geohashMapCells\.some\(chosen => geohashTouches\(chosen, geohash\)\)/);
  assert.match(html, /id="clearGeohashSelection"/);
  assert.match(script, /elements\.clearGeohashSelection\.addEventListener/);
  assert.match(html, /id="geohashMapStatus"/);
  // the cells this area may grow into are drawn dashed by their own line layer,
  // and nothing Leaflet-shaped is left in the page's stylesheet
  assert.match(script, /filter: \['==', \['get', 'touchable'\], 1\]/);
  assert.match(script, /'line-dasharray': \[5, 3\]/);
  assert.doesNotMatch(css, /leaflet/);
  // the whole area is what gets used, and the old single-cell path is gone
  assert.match(script, /elements\.boardGeohash\.value = geohashMapCells\.join\(','\)/);
  assert.doesNotMatch(script, /setMapSelection/);
  assert.doesNotMatch(script, /composingGeohash = activeGeohash/);
  // the board remembers, links and shares every cell
  assert.match(script, /const BOARD_CELLS_KEY = 'satoshi:sticky:geohash-cells:v1'/);
  assert.match(script, /searchParams\.set\('g', activeGeohashes\.join\(','\)\)/);
  // and orders, publishes and reads for every cell it covers
  assert.match(script, /geohash: activeGeohash, geohashes: \[\.\.\.activeGeohashes\]/);
  assert.match(script, /'#g': \[\.\.\.activeGeohashes\]/);
  assert.match(script, /geohashMatchesBoard\(sticky\.geohashes \?\? sticky\.geohash, activeGeohashes/);
});

test('every control the board reaches for is in its element map', async () => {
  // A wiring line for an element that was never mapped throws on load, and the
  // whole board then does nothing at all — the failure mode this test exists for.
  const [script, html] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);
  const defined = new Map([...script.matchAll(/([A-Za-z_$][\w$]*):\s*document\.getElementById\('([^']+)'\)/g)]
    .map(match => [match[1], match[2]]));
  assert.ok(defined.size >= 60, `the element map looks short: ${defined.size} entries`);
  const used = [...new Set([...script.matchAll(/elements\.([A-Za-z_$][\w$]*)/g)].map(match => match[1]))];
  const unmapped = used.filter(name => !defined.has(name));
  assert.deepEqual(unmapped, [], `used but not mapped: ${unmapped.join(', ')}`);
  const missing = used.map(name => defined.get(name)).filter(id => id && !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `mapped but not in the markup: ${missing.join(', ')}`);
});

test('a note names when it disappears, from a ladder of five terms', () => {
  assert.deepEqual(STICKY_LIVELINESS.map(rung => rung.key), ['1d', '1w', '1m', '6m', '12m']);
  assert.deepEqual(STICKY_LIVELINESS.map(rung => rung.seconds),
    [86400, 7 * 86400, 30 * 86400, 180 * 86400, 365 * 86400]);
  assert.equal(STICKY_DEFAULT_LIVELINESS, '1m');
  assert.equal(STICKY_MIN_LIVELINESS_SECONDS, 86400);
  assert.equal(STICKY_MAX_LIVELINESS_SECONDS, 365 * 86400, 'a year is the longest a note may live');
  assert.equal(stickyLiveliness('1w').label, '1 week');
  assert.equal(stickyLiveliness('2w'), null, 'the ladder is what is offered, not a free range');
  assert.equal(stickyExpiration(1000, '1d'), 1000 + 86400);
  assert.equal(stickyExpiration(1000, 'nonsense'), stickyExpiration(1000, STICKY_DEFAULT_LIVELINESS));
});

test('every note carries exactly one expiration tag, in unix seconds', () => {
  const createdAt = 1700000000;
  for (const rung of STICKY_LIVELINESS) {
    const template = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
      geohash: TEST_GEOHASH, liveliness: rung.key, createdAt});
    const tags = template.tags.filter(tag => tag[0] === 'expiration');
    assert.equal(tags.length, 1, `${rung.key} must be stated once`);
    assert.equal(tags[0][1], String(createdAt + rung.seconds));
    assert.match(tags[0][1], /^\d+$/, 'a unix timestamp in seconds, as NIP-40 asks');
  }
  // the default is a month, and a term nobody offered is refused rather than guessed
  const fallback = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, createdAt});
  assert.equal(fallback.tags.find(tag => tag[0] === 'expiration')[1], String(createdAt + 30 * 86400));
  assert.throws(() => makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, liveliness: 'forever', createdAt}), /how long the note should live/);
});

test('the corkboard has a wooden rail, and it sits outside the cork', async () => {
  const [html, page, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /<div id="corkFrame" class="cork-frame" aria-hidden="true">/,
    'the frame is in the markup');
  assert.equal((html.match(/cork-frame__rail cork-frame__rail--/g) || []).length, 4,
    'a rail on each of the four edges');
  assert.ok(html.indexOf('id="corkFrame"') < html.indexOf('cork-frame__rail--right'),
    'the rails are inside the frame element');

  // Decoration, never a target: it must not swallow clicks meant for the cork.
  assert.match(css, /\.cork-frame \{[^}]*pointer-events: none/,
    'the frame does not take pointer events');
  // The rail extends outward from the board, so no note is ever covered by it.
  assert.match(css, /\.cork-frame \{ position: absolute; inset: calc\(var\(--cork-frame, 90px\) \* -1\)/,
    'the frame is drawn outside the cork');
  assert.match(css, /repeating-linear-gradient/, 'the wood is drawn from gradients, with no image to fetch');
  assert.match(css, /var\(--cork-frame, 90px\)/, 'the rail thickness comes from one variable');
  assert.match(css, /box-shadow: 0 0 0 var\(--cork-surround, 420px\)/, 'a solid band sits outside the rail');
  assert.match(page, /setProperty\('--cork-surround'/, 'the band is sized from the window, in board pixels');

  // One source of truth for that variable, and Fit board must not crop the rail. The margin
  // is what leaves the rail visible rather than flush on the window edge, which is how the
  // border went missing on a phone.
  assert.match(page, /const BOARD_FRAME_WIDTH = \d+;/);
  assert.match(page, /const BOARD_FIT_MARGIN = 0\.94;/);
  assert.match(page, /setProperty\('--cork-frame', `\$\{BOARD_FRAME_WIDTH\}px`\)/,
    'the constant is published to the stylesheet');
  assert.match(page, /BOARD_FIT_MARGIN \* Math\.min\(\s*\n?\s*rect\.width \/ \(CANVAS_WIDTH \+ frame\),\s*\n?\s*rect\.height \/ \(CANVAS_HEIGHT \+ frame\),\s*\n?\s*\)/,
    'Fit board fits the rail as well as the cork, with margin left around it');
  // The rail is also the limit: nothing may be panned into the cork that lies past it.
  assert.match(page, /clampViewToBoard\(\)/, 'the transform holds the line');
  assert.match(page, /frame: BOARD_FRAME_WIDTH,/);
});

test('a note reads its expiration back, and one that names none is not drawn', () => {
  const createdAt = 1700000000;
  const template = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, liveliness: '1w', createdAt});
  const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(parsed.expiration, createdAt + 7 * 86400);
  assert.equal(isStickyExpired(parsed, createdAt), false);
  assert.equal(isStickyExpired(parsed, createdAt + 7 * 86400), true, 'the moment it names is the end of it');
  assert.equal(isStickyExpired(parsed, createdAt + 8 * 86400), true);

  // A note with no expiration tag at all — older than the rule, or written past
  // the desk — would sit on the relay forever, so the board does not read it.
  const withoutExpiration = {...template,
    tags: template.tags.filter(tag => tag[0] !== 'expiration'),
    id: 'c'.repeat(64), pubkey: 'b'.repeat(64)};
  assert.equal(parseStickyEvent(withoutExpiration), null, 'no moment, no note');
  assert.equal(parseStickyEvent({...withoutExpiration, tags: [...withoutExpiration.tags, ['expiration', '0']]}), null,
    'a zero is not a moment either');
  assert.equal(parseStickyEvent({...withoutExpiration, tags: [...withoutExpiration.tags, ['expiration', 'soon']]}), null,
    'and neither is a word');
  assert.equal(isStickyExpired(null), false, 'a missing note is not an expired one');
});

test('the composer asks how long a note lives, and the menu says when it goes', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="noteLiveliness"[^>]*type="range"[^>]*min="0"[^>]*max="4"[^>]*step="1"/);
  assert.match(html, /id="noteLivelinessValue"/);
  assert.match(html, /id="noteLivelinessTicks"/);
  assert.match(html, /id="noteLivelinessHint"/);
  assert.match(html, /Disappears after/);
  assert.match(html, /id="noteExpiresAt"/, 'the note menu shows when a note goes');
  assert.match(script, /elements\.liveliness\.addEventListener\('input'/);
  assert.match(script, /liveliness: pending\.liveliness \|\| STICKY_DEFAULT_LIVELINESS/,
    'the published note carries the term the writer chose');
  assert.match(script, /isStickyExpired\(sticky\)/, 'an expired note is not drawn');
  assert.match(script, /renderLiveliness\(\)/, 'the slider is built from the ladder, not from markup');
  // the note menu reads the term off the event, and a note without one shows no row
  assert.match(script, /elements\.noteExpiresAt\.hidden = !expiresAt/);
  assert.match(script, /tag\?\.\[0\] === 'expiration'/);
});

// ---------------------------------------------------------------- mentions
const ALICE = 'cc'.repeat(32);
const BOB = 'dd'.repeat(32);
const ALICE_NPUB = npubEncode(ALICE);

test('the board speaks npub too, by NIP-19\u2019s own examples', () => {
  assert.equal(npubEncode('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'),
    'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6');
  assert.equal(npubEncode(ALICE), ALICE_NPUB);
  assert.equal(npubEncode('nope'), null);
  assert.equal(npubEncode('A'.repeat(64)), npubEncode('a'.repeat(64)), 'case is not identity');
});

test('a mention is a whole npub token, not a piece of one', () => {
  assert.deepEqual(mentionTokens(`hi nostr:${ALICE_NPUB} there`), [ALICE_NPUB]);
  assert.deepEqual(mentionTokens(`hi ${ALICE_NPUB} there`), [ALICE_NPUB]);
  assert.deepEqual(mentionTokens(`hi nostr:${ALICE_NPUB} ${ALICE_NPUB}`), [ALICE_NPUB], 'once, however often');
  assert.deepEqual(mentionTokens(`nostr:${ALICE_NPUB}x`), [], 'a longer word is not a mention');
  assert.deepEqual(mentionTokens('no mention here'), []);

  const parts = stickyTextParts(`hi nostr:${ALICE_NPUB} bye`);
  assert.deepEqual(parts.map(part => part.type), ['text', 'mention', 'text']);
  assert.equal(parts[1].npub, ALICE_NPUB);
  assert.equal(parts[1].token, `nostr:${ALICE_NPUB}`);
  assert.deepEqual(stickyTextParts('plain note').map(part => part.type), ['text']);
  assert.deepEqual(stickyTextParts('').map(part => part.type), []);
});

test('a note tags one entry per person, and only real keys', () => {
  assert.deepEqual(mentionPubkeys([['p', ALICE], ['p', ALICE], ['p', BOB.toUpperCase()], ['t', 'other'], ['p', 'short']]),
    [ALICE, BOB], 'the order the tags carry, deduplicated, uppercase folded');
  assert.deepEqual(mentionPubkeys([]), []);
});

test('the text is what makes a tag true', () => {
  assert.equal(mentionIssue(`hi nostr:${ALICE_NPUB}`, [ALICE]), '');
  assert.match(mentionIssue('hi there', [ALICE]), /has to name the person/);
  assert.match(mentionIssue(`hi nostr:${ALICE_NPUB}`, [ALICE, ALICE]), /only be tagged once/);
  assert.match(mentionIssue(`hi nostr:${ALICE_NPUB}`, new Array(MENTION_MAX + 1).fill(ALICE)), /up to 5/);
});

test('a pinned note carries a ["p", …] tag per person it names', () => {
  const content = `hi nostr:${ALICE_NPUB} and nostr:${npubEncode(BOB)}`;
  const note = makeStickyTemplate({content, color: 'yellow', x: 0.4, y: 0.4, rotation: 0, geohash: TEST_GEOHASH,
    mentions: [ALICE, BOB]});
  assert.deepEqual(note.tags.filter(tag => tag[0] === MENTION_TAG), [[MENTION_TAG, ALICE], [MENTION_TAG, BOB]]);

  // Nothing to tag, nothing added: a note without mentions has no ["p", …] tag.
  const plain = makeStickyTemplate({content: 'just a note', color: 'yellow', x: 0.4, y: 0.4, rotation: 0, geohash: TEST_GEOHASH});
  assert.equal(plain.tags.filter(tag => tag[0] === MENTION_TAG).length, 0);

  // And the board refuses to build a tag the text does not back up.
  assert.throws(() => makeStickyTemplate({content: 'nog', color: 'yellow', x: 0.4, y: 0.4, rotation: 0,
    geohash: TEST_GEOHASH, mentions: [ALICE]}), /has to name the person/);
  assert.throws(() => makeStickyTemplate({content, color: 'yellow', x: 0.4, y: 0.4, rotation: 0,
    geohash: TEST_GEOHASH, mentions: ['not-a-key']}), /valid Nostr public key/);
});

test('a note read off the relay carries the people it tags', () => {
  const event = {kind: 1, id: 'a'.repeat(64), pubkey: BOB, created_at: 1000,
    content: `hi nostr:${ALICE_NPUB}`,
    tags: [['t', 'satoshi-sticky'], ['sticky', 'v1', 'yellow', '0.50000', '0.50000', '0.00', 'typewriter'],
      ['g', TEST_GEOHASH], ['expiration', '1794044775'], [MENTION_TAG, ALICE], [MENTION_TAG, 'nonsense']]};
  const sticky = parseStickyEvent(event);
  assert.deepEqual(sticky.mentions, [ALICE]);
  assert.equal(noteMentions(sticky, ALICE), true);
  assert.equal(noteMentions(sticky, BOB), false);
  assert.equal(noteMentions(sticky, ALICE.toUpperCase()), true, 'case is not identity');
  assert.equal(noteMentions({mentions: []}, ALICE), false);
  assert.equal(noteMentions(sticky, ''), false);
});

test('the tag filter knows who it can work for', () => {
  assert.equal(mentionFilterAvailability(null).available, false);
  assert.match(mentionFilterAvailability(null).reason, /Log in/);

  const anon = mentionFilterAvailability({pubkey: ALICE, method: 'anonymous'});
  assert.equal(anon.available, false, 'a throwaway identity has no name to be tagged under');
  assert.match(anon.reason, /satoshi\.si name/);

  const named = mentionFilterAvailability({pubkey: ALICE, method: 'nip07'});
  assert.equal(named.available, true);
  assert.match(named.reason, /tag you/);
});

test('a mention shows a name, and falls back to the npub only last', () => {
  assert.equal(mentionLabel(['Alice', 'alice@satoshi.si', ALICE_NPUB]), 'Alice');
  assert.equal(mentionLabel(['', '   ', 'alice@satoshi.si']), 'alice@satoshi.si');
  assert.equal(mentionLabel([], ALICE_NPUB), `@${ALICE_NPUB.slice(0, 12)}…`);
  assert.equal(mentionLabel([], ''), '@someone');
});

test('a note tags people by @, and the wire form is the whole npub', async () => {
  const [script, html, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  // The composer keeps the name; the note keeps the key. A chip is not editable
  // text, so the name cannot be rewritten without dropping the tag with it.
  assert.match(script, /sticky-editor__mention/);
  assert.match(script, /chip\.dataset\.pubkey = entry\.pubkey/);
  assert.match(script, /out \+= `nostr:\$\{node\.dataset\.npub\}`/, 'the chip becomes the npub');
  assert.match(script, /editorMentions\(\)/, 'every note carries the keys it tagged');
  assert.match(script, /mentions,/);
  // The picker: markup, the @ trigger, and the keyboard.
  assert.match(html, /id="mentionMenu"/);
  assert.match(html, /id="mentionOptions"/);
  assert.match(script, /\/\(\?:\^\|\\s\)@\(\[\^\\s@\]\*\)\$\//, 'typing @ starts a mention');
  assert.match(script, /handleMentionKeys/);
  // Anyone with a NIP-05 name can be tagged, on any domain: the board asks.
  assert.match(script, /well-known\/nostr\.json\?name=/);
  assert.match(script, /nip05/);
  // The person button, top right, and what it does.
  assert.match(html, /id="mentionFilter"[^>]*>[^<]*<i class="lni lni-user-4"/, 'a person silhouette');
  assert.match(html, /id="mentionFilter"[^>]*aria-pressed="false"[^>]*disabled/);
  assert.match(script, /elements\.mentionFilter\.disabled = !available/);
  assert.match(script, /noteMentions\(sticky, key\)/);
  assert.match(css, /sticky-note--filtered-out\s*\{\s*display:\s*none/);
});

test('the board can start from where the reader is', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  // the control and the four sizes it offers
  assert.match(html, /id="shareArea"/);
  assert.match(html, /id="areaDialog"/);
  assert.match(html, /id="areaStatus"[^>]*aria-live="polite"/);
  assert.match(script, /const AREA_SCALES = \[8, 7, 5, 4\]/);
  const offered = [...html.matchAll(/data-area-precision="(\d+)"/g)].map(match => match[1]);
  assert.deepEqual(offered, ['8', '7', '5', '4'], 'the markup offers exactly the sizes the script lists');
  for (const label of ['Building', 'Neighbourhood', 'City', 'State']) assert.match(html, new RegExp(`>${label}<`));
  // every size is a depth the board accepts: shorter than four is a region, not a place
  for (const precision of offered) {
    assert.ok(Number(precision) >= 4 && Number(precision) <= 9, `${precision} is a board depth`);
  }
  // the position is read from the device, used in the page, and never sent
  assert.match(script, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(script, /encodeGeohash\(coords\.latitude, coords\.longitude, precision\)/);
  assert.match(script, /selectBoard\(cell\)/);
  assert.match(script, /enableHighAccuracy: precision >= 7/);
  assert.match(html, /turned into a geohash here and never sent to satoshi\.si/);
  // every way it can fail says what to do instead
  for (const code of [1, 2, 3]) assert.match(script, new RegExp(`code === ${code}`));
  assert.match(script, /has no location support/);
  assert.match(script, /Pin the current note before changing corkboards/);
  // a vague fix is not presented as a certain cell, and the comparison is in metres:
  // geohashCellDimensions() answers in degrees, which is what made every size read "0 m"
  assert.match(script, /coords\.accuracy <= geohashCellHeightMetres\(precision\)/);
  assert.match(script, /const DEGREE_METRES = 111320/);
  assert.match(script, /geohashCellDimensions\(precision\)\.height \* DEGREE_METRES/);
  assert.match(script, /may be the cell next door/);
  assert.match(css, /\.area-scale\b/);
});

test('the four "around me" sizes really are a building, a neighbourhood, a city and a state', () => {
  // The page quotes a cell's height in metres. Measure the depths it offers through the
  // model's own bounds instead of trusting the page's arithmetic: at Ljubljana's latitude
  // the four choices must land on the scales they are named after.
  const heights = [8, 7, 5, 4].map(precision => {
    const cell = encodeGeohash(46.0569, 14.5058, precision);
    const {south, north} = geohashBounds(cell);
    return (north - south) * 111320;
  });
  const [building, neighbourhood, city, state] = heights;
  assert.ok(building >= 15 && building <= 25, `a building-sized cell is about 19 m, got ${Math.round(building)}`);
  assert.ok(neighbourhood >= 120 && neighbourhood <= 190,
    `a neighbourhood-sized cell is about 153 m, got ${Math.round(neighbourhood)}`);
  assert.ok(city >= 4000 && city <= 6000, `a city-sized cell is about 4.9 km, got ${Math.round(city)}`);
  assert.ok(state >= 15000 && state <= 25000, `a state-sized cell is about 20 km, got ${Math.round(state)}`);
  // and each one is a depth the board accepts
  for (const precision of [8, 7, 5, 4]) assert.ok(precision >= GEOHASH_MIN_LENGTH && precision <= 9);
});

test('a place can be kept, and the kept place outranks the board you last browsed', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="lockToggle"[^>]*role="switch"/);
  assert.match(html, /id="unlockButton"[^>]*hidden/);
  assert.match(html, /id="lockCaption"/);
  assert.match(script, /const LOCKED_PLACE_KEY = 'satoshi:sticky:locked-place:v1'/);
  assert.match(script, /localStorage\.setItem\(LOCKED_PLACE_KEY/);
  assert.match(script, /localStorage\.removeItem\(LOCKED_PLACE_KEY\)/);
  // the order of precedence: a link somebody sent, then the place kept, then the board
  // that was last open
  const flat = script.replace(/\s+/g, ' ');
  assert.match(flat,
    /linkedCells\.length \? linkedCells : \(lockedCells\.length \? lockedCells : \(rememberBoard/);
  // while a place is kept the address bar keeps no board, which is what makes the lock
  // survive a reload; a link still arrives as a ?g= and wins
  assert.match(script, /if \(lockedCells\.length\) boardUrl\.searchParams\.delete\('g'\)/);
  // keeping a place also forgets the last board, so the two memories cannot disagree
  assert.match(flat, /forgetActiveBoard\(\); updateBoardUrl\(\); renderLockControls\(\);/);
  // and the flow really keeps it, rather than only showing the switch
  assert.match(script, /if \(keep\) lockThisPlace\(\[cell\], precision\)/);
  assert.match(script, /const keep = elements\.lockToggle\.checked/);
});

test('saved places carry a name the reader chose, and stay in the browser', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  for (const id of ['savedPlacesPanel', 'savedPlacesList', 'savedPlaceName', 'savePlaceButton', 'savedPlaceStatus']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  // the panel lives in the geohash picker, above its footer
  assert.ok(html.indexOf('id="savedPlacesPanel"') < html.indexOf('class="geohash-map-selection"'),
    'saved places belong inside the geohash picker dialog');
  assert.match(script, /const SAVED_PLACES_KEY = 'satoshi:sticky:saved-places:v1'/);
  assert.match(script, /localStorage\.setItem\(SAVED_PLACES_KEY/);
  // a name is user text: it is set with textContent, never exploded into markup
  assert.match(script, /name\.textContent = place\.name/);
  const renderer = script.slice(script.indexOf('function renderSavedPlaces'), script.indexOf('function saveCurrentPlace'));
  assert.ok(renderer.length > 200, 'the saved-places renderer should have been found');
  assert.ok(!/innerHTML/.test(renderer), 'user-chosen names must not go through innerHTML');
  // saving takes the cells selected on the map, and the same name replaces its entry
  const flat = script.replace(/\s+/g, ' ');
  assert.match(flat, /const cells = geohashMapCells\.length \? \[\.\.\.geohashMapCells\] : geohashCellsFrom\(elements\.boardGeohash\.value\)/);
  assert.match(flat, /savedPlaces\.findIndex\(place => place\.name\.toLowerCase\(\) === name\.toLowerCase\(\)\)/);
  assert.match(flat, /It stays in this browser\./);
  // a saved place is a shortcut, not the kept place
  assert.match(flat, /elements\.geohashMapDialog\.close\(\); selectBoard\(cells\);/);
  assert.match(script, /const SAVED_PLACES_MAX = 24/);
});

test('the rail is the board\u2019s limit, so the view cannot leave the framed sheet', () => {
  const viewport = {width: 1000, height: 800};
  // where the rail's four outer edges land on screen: -90 is the rail on the near side,
  // 2690/1890 on the far side of the 2600x1800 cork
  const rails = view => ({
    left: view.x - 90 * view.scale,
    right: view.x + 2690 * view.scale,
    top: view.y - 90 * view.scale,
    bottom: view.y + 1890 * view.scale,
  });

  // dragged far past the right and bottom: the rail's near edges land exactly on the window
  const pulled = rails(clampBoardView({x: 5000, y: 5000, scale: .6}, viewport));
  assert.equal(pulled.left, 0, 'the left rail stops at the left window edge');
  assert.equal(pulled.top, 0, 'the top rail stops at the top window edge');

  // dragged far past the left and top: the rail's far edges land on the window
  const pushed = rails(clampBoardView({x: -5000, y: -5000, scale: .6}, viewport));
  assert.equal(pushed.right, 1000, 'the right rail stops at the right window edge');
  assert.equal(pushed.bottom, 800, 'the bottom rail stops at the bottom window edge');

  // a view already inside the board is left alone
  assert.deepEqual(clampBoardView({x: -300, y: -120, scale: .6}, viewport), {scale: .6, x: -300, y: -120});

  // a phone at low zoom cannot fill the window, so the framed sheet is centred instead
  const small = rails(clampBoardView({x: 999, y: 999, scale: .28}, viewport));
  assert.ok(small.left > 0 && small.right < 1000, 'the framed sheet is centred, not pinned');
  assert.equal(Math.round(small.left), Math.round(1000 - small.right), 'the margins match');
});

test('every pan, zoom and fit goes through the limit, and fitting leaves daylight', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const transform = script.slice(script.indexOf('function applyBoardTransform()'), script.indexOf('function fitBoard()'));
  assert.match(transform, /clampViewToBoard\(\)/, 'the transform clamps before it draws');
  assert.ok(transform.indexOf('clampViewToBoard()') < transform.indexOf('elements.canvas.style.transform'),
    'the clamp happens before the transform is written, not after');
  assert.match(script, /const BOARD_FIT_MARGIN = 0\.94;/);
  assert.match(script, /boardView\.scale = BOARD_FIT_MARGIN \* Math\.min\(/);
  // the pan gesture re-anchors at the edge, or dragging back feels stuck
  assert.match(script, /gesture\.boardX = boardView\.x;\n      gesture\.boardY = boardView\.y;/);
  assert.match(script, /clampBoardView\(boardView, \{width: rect\.width, height: rect\.height\}, \{\n    canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, frame: BOARD_FRAME_WIDTH,/);
});

test('opening a board keeps the wooden rail, instead of deleting it with the canvas', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const html = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');

  // the rail is markup inside the canvas, not something the script builds
  const canvasStart = html.indexOf('id="stickyCanvas"');
  assert.ok(canvasStart > 0 && html.indexOf('id="corkFrame"', canvasStart) > canvasStart,
    'the frame lives inside the canvas, so it pans and zooms with the board');

  // so the place that clears the canvas must keep it
  assert.match(page, /elements\.canvas\.replaceChildren\(elements\.corkFrame\)/,
    'clearing the canvas keeps the rail');
  assert.doesNotMatch(page, /elements\.canvas\.replaceChildren\(\)/,
    'a bare clear would delete the board\u2019s own edge');
  assert.match(page, /corkFrame: document\.getElementById\('corkFrame'\)/);
  // and nothing else clears that canvas
  assert.equal((page.match(/elements\.canvas\.replaceChildren/g) || []).length, 1,
    'one place clears the canvas, and it keeps the rail');
});

test('a note may be pinned as crooked as 75 degrees, and no further', () => {
  assert.equal(ROTATION_MIN, -75);
  assert.equal(ROTATION_MAX, 75);
  // both limits are reachable and kept exactly
  assert.equal(clampRotation(-75), -75);
  assert.equal(clampRotation(75), 75);
  assert.equal(clampRotation(74.5), 74.5);
  // a tilt past either end is pulled back to the limit rather than refused
  assert.equal(clampRotation(180), 75);
  assert.equal(clampRotation(-180), -75);
  // nonsense is still upright
  assert.equal(clampRotation('sideways'), 0);
  assert.equal(clampRotation(undefined), 0);
});

test('every note is held down by a pin whose colour comes from the note itself', () => {
  assert.deepEqual([...STICKY_PIN_COLOURS],
    ['red', 'blue', 'yellow', 'green', 'white', 'purple', 'magenta', 'black']);

  // the same note always gets the same pin, and it is always a real pin
  const id = 'b1f2'.padEnd(64, 'a');
  assert.equal(pinColourFor(id), pinColourFor(id));
  assert.ok(STICKY_PIN_COLOURS.includes(pinColourFor(id)));

  // a note id is a sha256 and its own bytes decide: eight ids differing in the last bytes
  // must cover all eight pins exactly, which is what a board of notes sees
  const lead = 'a'.repeat(56);
  const byId = new Set();
  for (let tail = 0; tail < 8; tail += 1) {
    byId.add(pinColourFor(`${lead}${tail.toString(16).padStart(8, '0')}`));
  }
  assert.equal(byId.size, STICKY_PIN_COLOURS.length, `ids reached only ${byId.size} of 8 pins`);

  // a seed that is not an id (the pubkey and time fallback) still spreads
  const seen = new Set();
  for (let index = 0; index < 200; index += 1) {
    seen.add(pinColourFor(`note-${index}`));
  }
  assert.equal(seen.size, STICKY_PIN_COLOURS.length, `fallback seeds reached only ${seen.size} of 8 pins`);

  // a note with nothing usable as a seed still gets a pin
  assert.ok(STICKY_PIN_COLOURS.includes(pinColourFor(undefined)));
  assert.ok(STICKY_PIN_COLOURS.includes(pinColourFor('')));
});

test('the note is held down by a picture, and an installed board still has its pins', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = await readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

  assert.match(page, /pinArt\.src = `\/img\/pin_\$\{pinColourFor\(/);
  assert.match(page, /pinArt\.className = 'sticky-note__pin-art'/);
  assert.match(page, /pinArt\.alt = ''/);
  assert.match(page, /pin\.appendChild\(pinArt\)/);
  // the pin image must not swallow clicks: the button around it is the way into the menu
  assert.match(page, /aria-label', 'Open note details'/);
  assert.match(css, /\.sticky-note__pin-art \{[^}]*pointer-events: none/);

  // the painted red dot is gone
  assert.doesNotMatch(css, /#c32920/);
  // the sprite sits inside the note, which clips what is inside it
  assert.match(css, /\.sticky-note__pin \{[^}]*overflow: visible/);

  // The sprite is the artwork's pin: head, needle and the shadow it casts. A sprite that is
  // roughly as tall as it is wide has lost the needle and the shadow.
  for (const colour of STICKY_PIN_COLOURS) {
    const png = await readFile(new URL(`../img/pin_${colour}.png`, import.meta.url));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.ok(height / width > 1.5,
      `pin_${colour}.png keeps the needle and shadow (${width}x${height})`);
  }
  // the CSS must show the sprite at the width it was cut to, or the pins come out the wrong size
  assert.match(css, /\.sticky-note__pin-art \{[^}]*width: 48px/);
  // a global img { max-width: 100% } caps the art at the button's 40px and pulls the head off
  // centre, so the art has to opt out of it
  assert.match(css, /\.sticky-note__pin-art \{[^}]*max-width: none/);
  // the artwork's shadow IS the shadow: a CSS drop-shadow would double it
  assert.doesNotMatch(css, /\.sticky-note__pin-art \{[^}]*drop-shadow/);

  // every sprite is precached, or an installed board shows notes with no pins
  for (const colour of STICKY_PIN_COLOURS) {
    assert.match(worker, new RegExp(`/img/pin_${colour}\\.png'`));
  }
});
