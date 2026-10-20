import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto, createHash} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import {MENTION_MAX, MENTION_TAG, mentionFilterAvailability, mentionIssue, mentionLabel, mentionPubkeys, mentionTokens, noteMentions, npubEncode, stickyTextParts, GEOHASH_MIN_LENGTH, STICKY_LIVELINESS, STICKY_DEFAULT_LIVELINESS, STICKY_MIN_LIVELINESS_SECONDS, STICKY_MAX_LIVELINESS_SECONDS, isStickyExpired, stickyExpiration, stickyExpiryCountdown, stickyLiveliness, STICKY_ANONYMOUS_PRICE_SATS, STICKY_MAX_CHARACTERS, stickyNoteLength, MAP_SEARCH_PRECISION, placeSearchResults, placeSearchUrl, linkRunIsComplete, STICKY_SUB_MEMBER_WEEK_SATS, STICKY_SUB_MEMBER_YEAR_SATS, STICKY_SUB_WEEK_SATS, STICKY_SUB_WEEKS_PER_YEAR, STICKY_SUB_YEAR_DISCOUNT, STICKY_SUB_YEAR_SATS, describeStickyAction, STICKY_MEMBER_TIERS, stickyMemberTier, stickyTierPrice, stickyDiscountSentence, boardPatternCss, BOARD_TEXTURES, encodeGeohash, geohashBounds, geohashMatchesBoard, geohashNeighbours, geohashPrecisionForZoom, geohashPrefixes, clampBoardView, ROTATION_MIN, ROTATION_MAX, clampRotation, STICKY_PIN_COLOURS, STICKY_PIN_LEFT_MIN, STICKY_PIN_LEFT_MAX, pinColourFor, pinLeftFor, STICKY_TOPIC, STICKY_HASHTAG_MAX, normaliseStickyHashtags, stickyHashtagIssue,
  geohashSetIssue, geohashTouches, makeStickyTemplate, mapZoomForGeohashPrecision, normaliseGeohash, parseStickyEvent, stickyContentHash, stickyPictureDigest, stickyDay, stickyOrderPrice, stickyPaymentRails, stickySubscriptionPrice, STICKY_NOTE_VIEWS, stickyVisibleNoteIds,
 stickyPowOffer, stickyPowSentence, stickyPowProgress, stickyPowDifficulty,
  boardBitmapSize,
  boardPatternScale,
  apiHeaders,
  anonymousForQuote,
  BOARD_TILE_PX,
  BOARD_IMAGE_PX,
  BOARD_BITMAP_MAX,
  BOARD_BITMAP_MIN,
  geohashCellsForPrecision,
  geohashCellDimensions,
  geohashGridFits,
  GRID_MIN_CELL_PX,
  LINK_DISPLAY_MAX,
  linkDisplay,
  linkHref,
  boardPlateFontSize,
  boardLampCount,
  boardLampLit,
  BOARD_LAMP_SOCKETS,
  GEOHASH_MAX_LENGTH,
  GEOHASH_MAX_BOARD_DEPTH,
  boardShareUrl,
  linkMatches,
  AMBER_HAND_OVER_WAITING_LINE,
  AMBER_HANDED_OVER_LINE,
  spentAmberHandOver,
  STICKY_IMAGE_GRADES,
  STICKY_IMAGE_TAG,
  STICKY_IMAGE_DEFAULT_GRADE,
  STICKY_IMAGE_MAX_BYTES,
  stickyImageGrade,
  stickyImageIssue,
  stickyImageUrl,  stickyPaymentBadge, STICKY_PAYMENT_TAG, STICKY_PAYMENT_BADGES,
  coveredPinNotes, PIN_COVERED_SHARE, PIN_RAISE_MS,
  USER_RELAY_LIMIT, relayLampFor, relayHostLabel, normaliseUserRelay, addUserRelay, removeUserRelay,
  animatedPicture, isGiftAction, noteStackOrder,
} from '../stickyNotesModel.mjs';
import {readFileSync, existsSync} from 'node:fs';

const TEST_GEOHASH = 'u0qj7z0y1';

test('a note draws http(s) and www links as parts, never as the raw address', () => {
  const parts = stickyTextParts('see https://example.com/a/b for more');
  assert.deepEqual(parts.map(part => part.type), ['text', 'link', 'text']);
  assert.equal(parts[1].href, 'https://example.com/a/b');
  assert.equal(parts[1].url, 'https://example.com/a/b');
  assert.equal(parts[2].text, ' for more');
  const www = stickyTextParts('www.example.com').filter(part => part.type === 'link');
  assert.equal(www.length, 1);
  assert.equal(www[0].href, 'https://www.example.com');
});

test('a link lets the sentence keep its punctuation, but a bracket it opened stays', () => {
  const dotted = stickyTextParts('read https://example.com/x.');
  assert.deepEqual(dotted.map(part => part.type), ['text', 'link', 'text']);
  assert.equal(dotted[1].href, 'https://example.com/x');
  assert.equal(dotted[2].text, '.');
  const wiki = stickyTextParts('https://en.wikipedia.org/wiki/Board_(material)').find(part => part.type === 'link');
  assert.equal(wiki.href, 'https://en.wikipedia.org/wiki/Board_(material)');
  const wrapped = stickyTextParts('(see https://example.com/x)').find(part => part.type === 'link');
  assert.equal(wrapped.href, 'https://example.com/x');
  const listy = stickyTextParts('links: https://a.example.com, https://b.example.com!').filter(part => part.type === 'link');
  assert.deepEqual(listy.map(part => part.href), ['https://a.example.com', 'https://b.example.com']);
});

test('only http(s) links are openable, so a javascript: run never becomes one', () => {
  assert.equal(linkHref('javascript:alert(1)'), '');
  assert.equal(linkHref('data:text/html,<script>'), '');
  assert.equal(linkHref('nostr:npub1example'), '');
  assert.equal(linkHref('  '), '');
  assert.deepEqual(stickyTextParts('javascript:alert(1)').map(part => part.type), ['text']);
  assert.deepEqual(stickyTextParts('try javascript:alert(1) now').map(part => part.type), ['text']);
  assert.deepEqual(stickyTextParts('mailto:someone@example.com').map(part => part.type), ['text']);
  assert.deepEqual(stickyTextParts('https://').map(part => part.type), ['text']);
  assert.deepEqual(linkMatches('nothing to see'), []);
});

test('mentions and links share one note without eating each other', () => {
  const parts = stickyTextParts(`hi nostr:${ALICE_NPUB} see https://example.com now`);
  assert.deepEqual(parts.map(part => part.type), ['text', 'mention', 'text', 'link', 'text']);
  assert.equal(parts[1].npub, ALICE_NPUB);
  assert.equal(parts[3].href, 'https://example.com');
});

test('the link dialog shows 200 characters first and keeps the rest behind the arrow', () => {
  assert.equal(LINK_DISPLAY_MAX, 200);
  const long = `https://example.com/${'a'.repeat(400)}`;
  const shown = linkDisplay(long);
  assert.equal(shown.truncated, true);
  assert.equal(shown.head.length, 200);
  assert.equal(shown.head + shown.tail, long);
  assert.equal(shown.total, long.length);
  const short = linkDisplay('https://example.com/a');
  assert.equal(short.truncated, false);
  assert.equal(short.head, 'https://example.com/a');
  assert.equal(short.tail, '');
  assert.equal(linkDisplay('x'.repeat(LINK_DISPLAY_MAX)).truncated, false);
  assert.equal(linkDisplay('x'.repeat(LINK_DISPLAY_MAX + 1)).truncated, true);
  assert.equal(linkDisplay('x'.repeat(LINK_DISPLAY_MAX + 1)).head.length, LINK_DISPLAY_MAX);
});

test('the board labels a link "link" and confirms the address before opening it', async () => {
  const [script, html] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /const LINK_LABEL = 'link';/);
  assert.match(script, /link\.textContent = LINK_LABEL;/);
  assert.match(script, /openLinkDialog\(href\)/);
  assert.match(script, /linkDialogRest\.hidden = true;/);
  assert.match(html, /id="linkDialog"/);
  assert.match(html, /Do you really want to open the following link\?/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /id="linkExpand"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(script, /sticky-note__link[^;]*href = part\.url/);
});

test('Pinstr notes accept up to 501 characters', () => {
  assert.equal(STICKY_MAX_CHARACTERS, 501);
});

test('Pinstr cleans up to three one-word hashtags and always carries its reserved topic', () => {
  assert.equal(STICKY_TOPIC, 'pinstr');
  assert.equal(STICKY_HASHTAG_MAX, 3);
  assert.equal(stickyHashtagIssue(' mountains, quote, #sausage '), '');
  assert.deepEqual(normaliseStickyHashtags(' mountains, quote, #sausage '), ['mountains', 'quote', 'sausage']);
  assert.deepEqual(normaliseStickyHashtags('#Mountains, mountains, pinstr'), ['mountains']);
  assert.deepEqual(normaliseStickyHashtags('slow,   friyay'), ['slow', 'friyay']);
  assert.match(stickyHashtagIssue('slow, flying above, friyay'), /flying above.*spaces/i);
  assert.match(stickyHashtagIssue('one,two,three,four'), /no more than 3/i);
  assert.match(stickyHashtagIssue('okay, not!okay'), /letters, numbers/i);

  const template = makeStickyTemplate({content:'hello', color:'yellow', x:.5, y:.5, rotation:0,
    geohash:TEST_GEOHASH, hashtags:' mountains, quote, #sausage '});
  assert.deepEqual(template.tags.filter(tag => tag[0] === 't'), [
    ['t', 'pinstr'], ['t', 'mountains'], ['t', 'quote'], ['t', 'sausage'],
  ]);
  const parsed = parseStickyEvent({...template, id:'a'.repeat(64), pubkey:'b'.repeat(64)});
  assert.deepEqual(parsed.hashtags, ['mountains', 'quote', 'sausage']);
  assert.equal(parseStickyEvent({...template, id:'a'.repeat(64), pubkey:'b'.repeat(64),
    tags: template.tags.filter(tag => tag[0] !== 't')}), null, 'a note without pinstr is not a Pinstr event');
  assert.equal(parseStickyEvent({...template, id:'a'.repeat(64), pubkey:'b'.repeat(64),
    tags: [...template.tags, ['t', 'pinstr']]}), null, 'the reserved topic must occur exactly once');
  assert.throws(() => makeStickyTemplate({content:'hello', color:'yellow', x:.5, y:.5, rotation:0,
    geohash:TEST_GEOHASH, hashtags:'slow, flying above, friyay'}), /spaces/i);
});

test('the Pinstr composer blocks payment for invalid hashtags and restores valid ones', async () => {
  const [html, page] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="noteHashtags"/);
  assert.match(html, /id="hashtagStatus"[^>]*aria-live="polite"/);
  assert.match(page, /const \{issue: hashtagProblem, tags: hashtags\} = validateHashtags\(\);\s+if \(hashtagProblem\) throw new Error\(hashtagProblem\);/);
  assert.match(page, /hashtags,\s+geohash: activeGeohash/);
  assert.match(page, /elements\.hashtags\.value = \(pending\.hashtags \|\| \[\]\)\.join\(', '\);/);
  assert.match(page, /'#t': \[STICKY_TOPIC\]/, 'only the Pinstr topic is queried');
  assert.doesNotMatch(page, /kinds: \[5\]/, 'the board does not query deletion events');
});

test('prices are the subscription plans, and nothing else counts as one', () => {
  assert.equal(STICKY_SUB_WEEK_SATS, 10);
  assert.equal(STICKY_SUB_YEAR_SATS, 411);
  assert.equal(STICKY_SUB_MEMBER_WEEK_SATS, 5);
  assert.equal(STICKY_SUB_MEMBER_YEAR_SATS, 205);
  assert.equal(STICKY_ANONYMOUS_PRICE_SATS, 69);

  assert.equal(stickySubscriptionPrice('week'), 10);
  assert.equal(stickySubscriptionPrice('week', {member: true}), 5);
  assert.equal(stickySubscriptionPrice('year'), 411);
  assert.equal(stickySubscriptionPrice('year', {member: true}), 205);
  assert.equal(stickySubscriptionPrice('month'), null, 'no invented plans');

  // D's ladder, read off the board's own table: 3 characters free, 4 half, 5+ a quarter.
  assert.deepEqual(STICKY_MEMBER_TIERS.map(t => [t.maxNameLength, t.offPercent]),
    [[3, 100], [4, 50], [null, 25]]);
  assert.equal(stickySubscriptionPrice('week', {offPercent: 100}), 0);
  assert.equal(stickySubscriptionPrice('year', {offPercent: 100}), 0);
  assert.equal(stickySubscriptionPrice('week', {offPercent: 25}), 7, 'floor(10 x 0.75)');
  assert.equal(stickySubscriptionPrice('year', {offPercent: 25}), 308, 'floor(411 x 0.75)');
  assert.equal(stickySubscriptionPrice('week', {member: true, offPercent: 25}), 7,
    'the desk\u2019s own answer wins over the older half-price fallback');
  assert.equal(stickyMemberTier(3).offPercent, 100);
  assert.equal(stickyMemberTier(4).offPercent, 50);
  assert.equal(stickyMemberTier(9).offPercent, 25, 'the top tier is open-ended');
  assert.equal(stickyMemberTier(0), null, 'no name is not a tier');
  assert.equal(stickyMemberTier(undefined), null);

  // The yearly price is the weekly one with 21% off, not a number typed twice.
  assert.equal(STICKY_SUB_YEAR_SATS,
    Math.round(STICKY_SUB_WEEK_SATS * STICKY_SUB_WEEKS_PER_YEAR * (1 - STICKY_SUB_YEAR_DISCOUNT)));
  assert.equal(STICKY_SUB_MEMBER_YEAR_SATS, stickyTierPrice('year', 50));

  // Only prices this service actually quotes are displayed; anything else is not
  // a price it issued, so the board falls back rather than showing it.
  assert.equal(stickyOrderPrice({sats: 10}), 10);
  assert.equal(stickyOrderPrice({sats: 411}), 411);
  assert.equal(stickyOrderPrice({sats: 0}), 0, 'a covered note costs nothing');
  assert.equal(stickyOrderPrice({sats: 5}), 5);
  assert.equal(stickyOrderPrice({sats: 205}), 205);
  assert.equal(stickyOrderPrice({sats: 7}), 7, 'the 25% tier\u2019s weekly price is a price we quote');
  assert.equal(stickyOrderPrice({sats: 308}), 308, 'and so is its yearly one');
  assert.equal(stickyOrderPrice({sats: 69}), 69);
  assert.equal(stickyOrderPrice({sats: 42}), STICKY_SUB_WEEK_SATS, 'a retired removal price is not displayed');
  assert.equal(stickyOrderPrice({sats: 11}), STICKY_SUB_WEEK_SATS, 'the retired per-note price is not shown');
  assert.equal(stickyOrderPrice({sats: 10.5}), STICKY_SUB_WEEK_SATS);
  assert.equal(stickyOrderPrice({sats: 70}), STICKY_SUB_WEEK_SATS);
});

test('the composer says what posting costs, and what a subscription changes', () => {
  const stranger = {active: false, prices: {weekSats: 10, yearSats: 411, member: false, memberOffPercent: 0}};
  const member = {active: false, prices: {weekSats: 5, yearSats: 205, member: true, memberOffPercent: 50, memberNameLength: 4}};
  const freeName = {active: false, prices: {weekSats: 0, yearSats: 0, member: true, memberOffPercent: 100, memberNameLength: 3}};
  const quarter = {active: false, prices: {weekSats: 7, yearSats: 308, member: true, memberOffPercent: 25, memberNameLength: 9}};
  const covered = {active: true, expiresAt: 1800000000, plan: 'week', prices: {weekSats: 5, yearSats: 205, member: true, memberOffPercent: 50}};

  const off = describeStickyAction({subscription: stranger});
  assert.equal(off.needsSubscription, true);
  assert.equal(off.label, 'Subscribe & pin · 10 sats');
  assert.match(off.state, /10 sats a week or 411 sats a year/);
  assert.match(off.state, /3-character name posts free, 4 characters take 50% off, 5 or more take 25% off/);

  const half = describeStickyAction({subscription: member, plan: 'year'});
  assert.equal(half.label, 'Subscribe & pin · 205 sats');
  assert.match(half.state, /Your satoshi\.si name takes 50% off/);

  // A three-character name pays nothing, and the board must say so rather than
  // offering a plan at "0 sats a week or 0 sats a year".
  const free = describeStickyAction({subscription: freeName});
  assert.equal(free.label, 'Subscribe & pin · free');
  assert.equal(free.price, 0);
  assert.match(free.state, /Pinstr is free for a 3-character satoshi\.si name/);
  assert.match(free.state, /nothing to pay/);
  assert.doesNotMatch(free.state, /0 sats a week/);

  const quarterOff = describeStickyAction({subscription: quarter, plan: 'year'});
  assert.equal(quarterOff.label, 'Subscribe & pin · 308 sats');
  assert.match(quarterOff.state, /takes 25% off/);

  // The sentence itself: each tier says its own share, and a stranger is told the ladder.
  assert.equal(stickyDiscountSentence({member: true, offPercent: 100}), 'Pinstr is free for a 3-character satoshi.si name.');
  assert.equal(stickyDiscountSentence({member: true, offPercent: 50}), 'Your satoshi.si name takes 50% off.');
  assert.equal(stickyDiscountSentence({member: true, offPercent: 25}), 'Your satoshi.si name takes 25% off.');
  assert.match(stickyDiscountSentence({member: false}), /3-character name posts free/);

  const on = describeStickyAction({subscription: covered});
  assert.equal(on.needsSubscription, false);
  assert.equal(on.price, 0, 'a covered note is never given a price');
  assert.equal(on.label, 'Place your note');
  assert.match(on.state, /Subscription active until 2027-01-15/);

  const anon = describeStickyAction({anonymous: true, subscription: covered});
  assert.equal(anon.needsSubscription, false);
  assert.equal(anon.price, 69, 'an anonymous note is priced even while a subscription runs');
  assert.equal(anon.label, 'Post anonymously · 69 sats');
  assert.match(anon.state, /One key can post one note/);
  assert.match(anon.state, /cannot buy a weekly or yearly subscription/);

  // A parked named account is an implementation detail, not a promise that an anonymous
  // key will return or survive leaving anonymous mode.
  const anonParked = describeStickyAction({anonymous: true, subscription: covered, parked: 'Alice'});
  assert.doesNotMatch(anonParked.state, /switch back|Alice/);

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

test('a note draws a badge only for a payment this board knows how to draw', () => {
  assert.equal(stickyPaymentBadge('bitcoin').icon, 'lni-bitcoin');
  assert.equal(stickyPaymentBadge('pow').icon, 'lni-hammer-1');
  assert.equal(stickyPaymentBadge('cash').icon, 'lni-dollar-circle');
  assert.deepEqual(STICKY_PAYMENT_BADGES.map(b => b.id), ['pow', 'bitcoin', 'cash']);
  assert.equal(stickyPaymentBadge(' CASH ').id, 'cash', 'the desk sends lowercase; the board forgives the rest');
  // A word the desk does not sell under draws nothing at all. A wrong badge is worse than a
  // missing one: it claims a payment, and the reader has no way to check it.
  assert.equal(stickyPaymentBadge('gold'), null);
  assert.equal(stickyPaymentBadge(''), null);
  assert.equal(stickyPaymentBadge(undefined), null);
  assert.equal(stickyPaymentBadge(null), null);
  assert.equal(stickyPaymentBadge({id: 'cash'}), null, 'a value that is not a word is not a badge');
});

test('the badge word rides in the event, inside the id the signature covers', () => {
  const template = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, paid: 'pow'});
  assert.deepEqual(template.tags.find(t => t[0] === STICKY_PAYMENT_TAG), ['paid', 'pow']);

  // A note with nothing to say about payment carries no tag at all — which is every note
  // published before the badge existed, and the desk publishes those rather than refusing them.
  const plain = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH});
  assert.equal(plain.tags.some(t => t[0] === STICKY_PAYMENT_TAG), false);

  // A word this board cannot draw is refused where the writer's own browser notices, rather
  // than signed, published and drawn as nothing after they have paid.
  assert.throws(() => makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, paid: 'gold'}), /not a way this desk sells/);
});

test('a note reads its own badge back, and a stranger\'s word as nothing', () => {
  const template = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, paid: 'bitcoin'});
  const signed = {...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)};
  assert.equal(parseStickyEvent(signed).paid, 'bitcoin');

  const plain = makeStickyTemplate({content: 'hello', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH});
  assert.equal(parseStickyEvent({...plain, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)}).paid, null);

  const foreign = {...plain, tags: [...plain.tags, ['paid', 'gold']],
    id: 'a'.repeat(64), pubkey: 'b'.repeat(64)};
  assert.equal(parseStickyEvent(foreign).paid, null, 'a word this board does not draw is not a payment');
  // The note itself still shows: the badge is a decoration, never a condition of being a note.
  assert.equal(parseStickyEvent(foreign).color, 'yellow');
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
  // Every parent that is still a code: the chain stops at 3 characters, because a
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

test('the reader’s board dropdown offers only the levels the cell actually has', async () => {
  const [html, script, model] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    import('../stickyNotesModel.mjs'),
  ]);
  const { boardDepthCeiling } = model;

  // A cell of n letters has 9 - n levels under it. The menu used to be a fixed list of 0..6, so an eight-letter
  // board offered "5 levels deeper" - four levels that do not exist - and the board then filtered by a depth it
  // could never reach.
  assert.deepEqual(
    [[3, 6], [4, 5], [6, 3], [8, 1], [9, 0]].map(([length, expected]) => [length, boardDepthCeiling(['u'.repeat(length)])]),
    [[3, 6], [4, 5], [6, 3], [8, 1], [9, 0]],
  );
  assert.equal(boardDepthCeiling(['u267', 'u267tn']), 5, 'the shallowest cell decides how deep the board can look');
  assert.equal(boardDepthCeiling([]), GEOHASH_MAX_BOARD_DEPTH, 'with no cell there is nothing to cut the list to');

  // The menu is built for the cell, not written into the markup.
  const select = html.match(/<select id="boardDepth">([\s\S]*?)<\/select>/)[1];
  assert.doesNotMatch(select, /<option value="[1-6]">/, 'no fixed list of levels is baked into the page');
  assert.match(script, /function boardDepthOptions\(cells\)/, 'the rows are computed from the cells');
  assert.match(script, /options\.push\(\{value: ceiling, label: ceiling === 1 \? 'All child boards \(1 level\)' : 'All child boards'\}\)/,
    'the last row is the ceiling, whatever it is');
  assert.match(script, /function renderDepthOptions\(/, 'and a pass rebuilds them');
  assert.match(script, /elements\.boardGeohash\.addEventListener\('input', \(\) => renderDepthOptions\(/,
    'the menu follows the cell being typed');
  // The pick itself is clamped to that ceiling, so the control can never sit on a level the board refuses.
  assert.match(script, /boardDepth = Math\.min\(steps, boardDepthCeiling\(geohashCellsFrom\(/);
  assert.match(script, /boardDepth = Math\.min\(boardDepth, boardDepthCeiling\(cells\)\)/,
    'and opening a board clamps the stored depth to that board');
  // and the top of the range is the word the dropdown uses for it, rather than a rung that is not there.
  assert.match(script, /boardDepth >= ceiling \? 'all child boards'/);
  // Six is the whole range and not an arbitrary cap: a note is at most nine characters and a board
  // at least three, so no board is ever more than six levels from a note and the ceiling cuts nothing
  // that a reader could have asked for.
  assert.equal(GEOHASH_MAX_BOARD_DEPTH, 6);
  assert.equal(GEOHASH_MAX_BOARD_DEPTH, GEOHASH_MAX_LENGTH - GEOHASH_MIN_LENGTH);
  assert.equal(geohashMatchesBoard(TEST_GEOHASH, TEST_GEOHASH.slice(0, GEOHASH_MIN_LENGTH), GEOHASH_MAX_BOARD_DEPTH), true,
    'the deepest a note can sit under a board is six levels, and the ceiling reaches it');
  assert.equal(geohashMatchesBoard(TEST_GEOHASH, TEST_GEOHASH.slice(0, GEOHASH_MIN_LENGTH), 11), true,
    'a stale eleven reads as the deepest level rather than as something no cell has');
});

test('map coordinates round-trip through geohash cells up to precision 9', () => {
  assert.equal(encodeGeohash(42.6, -5.6, 5), 'ezs42');
  const hash = encodeGeohash(46.0569, 14.5058, 9);
  const bounds = geohashBounds(hash);
  assert.equal(hash.length, 9);
  assert.ok(bounds.south <= 46.0569 && bounds.north >= 46.0569);
  assert.ok(bounds.west <= 14.5058 && bounds.east >= 14.5058);
  assert.equal(encodeGeohash(bounds.center.lat, bounds.center.lng, 9), hash);
  assert.equal(geohashPrecisionForZoom(2), 3, 'shallow zooms go out to the country scale');
  assert.equal(geohashPrecisionForZoom(6), 3);
  assert.equal(geohashPrecisionForZoom(9), 4, 'and stop at 4 once a cell is readable');
  assert.equal(geohashPrecisionForZoom(20), 8);
  assert.equal(geohashPrecisionForZoom(21), 9);
  assert.equal(mapZoomForGeohashPrecision(9), 21);
  assert.equal(mapZoomForGeohashPrecision(2), mapZoomForGeohashPrecision(3), 'zoom for 3 is the floor');
});

test('a geohash code is 3 to 9 characters', () => {
  assert.equal(normaliseGeohash('u4p'), 'u4p', '3 is the shallowest code');
  assert.equal(normaliseGeohash('u4'), '', '2 characters is a region, not a place');
  assert.equal(normaliseGeohash('u4pr'), 'u4pr', '4 is a place inside it');
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
  assert.equal(geohashSetIssue('u4'), 'A geohash is 3 to 9 characters from 0-9 and b-h, j, k, m, n, p-z.');
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

test('a changed grid carries the chosen area instead of choosing one for the reader', () => {
  const cell = 'u4pr7z0y';
  // Zooming out: the same place, one grid up.
  assert.deepEqual(geohashCellsForPrecision([cell], 5), {cells: ['u4pr7'], lost: false});
  assert.deepEqual(geohashCellsForPrecision([cell, 'u4pr7z0z'], 7), {cells: ['u4pr7z0'], lost: false},
    'cells that share a coarser cell are that one cell up there');
  assert.deepEqual(geohashCellsForPrecision([cell, cell], 7).cells, ['u4pr7z0'], 'and are never listed twice');
  // A carried clump is still a legal board: coarser cells of touching cells touch.
  const clump = [cell, ...geohashNeighbours(cell).slice(0, 2)];
  assert.equal(geohashSetIssue(geohashCellsForPrecision(clump, 6).cells), '');
  // Zooming in cannot be carried: a finer cell is not derivable from a coarser one, and the
  // answer is to lose the area rather than to put a cell on the map nobody tapped.
  assert.deepEqual(geohashCellsForPrecision(['u4pr7'], 8), {cells: [], lost: true});
  // Outside the geohash range nothing carries either.
  assert.deepEqual(geohashCellsForPrecision([cell], 2), {cells: [], lost: true});
  // Nothing chosen is not reported as lost, and a region is not a cell.
  assert.deepEqual(geohashCellsForPrecision([], 5), {cells: [], lost: false});
  assert.deepEqual(geohashCellsForPrecision(['u4'], 5), {cells: [], lost: false});
});

test('the picker never chooses a cell by itself, and a tap outside the area starts a new one', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // Zooming carries the reader's area over, or drops it with the reason said — it never paints
  // a cell nobody tapped, which is what made a pinch look like a random selection.
  assert.match(script, /geohashCellsForPrecision\(geohashMapCells, precision\)/);
  assert.doesNotMatch(script, /setMapCells\(\[encodeGeohash\(/);
  assert.match(script, /Zooming changed the grid/);
  // The picker's own opening view fires `zoomend` too, and is not the reader zooming.
  assert.match(script, /if \(geohashMapOpening\)/);
  // A tap on a cell that touches nothing is a reader pointing somewhere else, not a mistake.
  assert.match(script, /Started a new area here/);
  assert.match(script, /function toggleMapCell\(cell\)/);
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

test('a note published by the reach build still renders for the reader that reads it now', () => {
  // The build that gave a note a reach of its own wrote a digit in the `geohash` tag and, at the
  // last of it, a `["reach","inside"]` marker beside it. Those events are already on the relay and
  // cannot be rewritten, so this reader has to keep drawing them: no tag a note carries may throw
  // it out, and no note may be shown on a wider board than it was written for.
  const reachEvent = tags => ({kind: 1, id: 'a'.repeat(64), pubkey: 'b'.repeat(64), created_at: 2000,
    content: 'written by the reach build', tags: [
      ['t', STICKY_TOPIC], ['client', 'satoshi.si'],
      ...tags,
      ['i', 'geo:u0m71d'], ['k', 'geo'],
      ['sticky', 'v1', 'yellow', '0.50000', '0.50000', '0.00', 'typewriter'],
      ['expiration', String(Math.floor(Date.now() / 1000) + 86400)],
    ]});

  // The shape the last reach build wrote: its own cell, the rung as a digit, and the marker that said
  // which way the rung counted.
  const inside = parseStickyEvent(reachEvent([['g', 'u0m71d'], ['geohash', '3'], ['reach', 'inside']]));
  assert.ok(inside, 'a note carrying the digit and the marker parses rather than being dropped');
  assert.deepEqual(inside.geohashes, ['u0m71d'], 'the one cell it names is the cell it sits on');
  assert.equal(inside.geohash, 'u0m71d');
  assert.equal(inside.exactGeohash, true,
    'a scope word this reader does not know stays on the note’s own board, never a wider one');
  assert.equal(geohashMatchesBoard(inside.geohashes, 'u0m71d', 0, inside.exactGeohash), true,
    'so the board it was written on still shows it');
  assert.equal(geohashMatchesBoard(inside.geohashes, 'u0m71d', 6, inside.exactGeohash), true,
    'and a reader who opened their board out still sees it on its own cell');
  for (const board of ['u0m71', 'u0m7', 'u0m']) {
    assert.equal(geohashMatchesBoard(inside.geohashes, board, 6, inside.exactGeohash), false,
      `${board} is above the cell: the note is never drawn wider than it was written`);
  }

  // The shape the brief middle build wrote: the rung as a digit, and the boards above the cell named
  // as `g` tags. The deepest tag is still the cell, and the digit is still a word this reader reads
  // as "this cell only" rather than as a reach it cannot honour.
  const widened = parseStickyEvent(reachEvent([['g', 'u0m71d'], ['g', 'u0m71'], ['g', 'u0m7'], ['g', 'u0m'], ['geohash', '6']]));
  assert.ok(widened, 'the digit alone parses too');
  assert.deepEqual(widened.geohashes, ['u0m71d'], 'the shallower tags are boards, not cells of the note');
  assert.equal(widened.exactGeohash, true);
  assert.equal(geohashMatchesBoard(widened.geohashes, 'u0m71', 6, widened.exactGeohash), false,
    'and those boards are not shown it on this reader’s word alone');
});

test('content fingerprint binds the paid text and color', async () => {
  const first = await stickyContentHash('hello', 'yellow', 'typewriter', webcrypto);
  const same = await stickyContentHash(' hello ', 'yellow', 'typewriter', webcrypto);
  const changed = await stickyContentHash('hello', 'blue', 'typewriter', webcrypto);
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test('the board leads with one combined payment QR and retains every returned rail', () => {
  assert.deepEqual(stickyPaymentRails({payment: {
    arkAddress: 'ark1abc', paymentLink: 'bitcoin:?amount=0.00000021&ark=ark1abc',
    bolt11: 'lnbc210n1x', lightningUri: 'lightning:lnbc210n1x',
  }}), [
    {id: 'unified', label: 'Any wallet', uri: 'bitcoin:?amount=0.00000021&ark=ark1abc&lightning=lnbc210n1x', copyValue: 'bitcoin:?amount=0.00000021&ark=ark1abc&lightning=lnbc210n1x', unified: true},
    {id: 'ark', label: 'Ark', uri: 'bitcoin:?amount=0.00000021&ark=ark1abc', copyValue: 'bitcoin:?amount=0.00000021&ark=ark1abc'},
    {id: 'lightning', label: 'Lightning', uri: 'lightning:lnbc210n1x', copyValue: 'lnbc210n1x'},
  ]);

  assert.deepEqual(stickyPaymentRails({sats: 21, payment: {
    arkAddress: 'ark1abc', bolt11: 'lnbc210n1x', onchainAddress: 'bc1qexample',
  }}), [
    {id: 'unified', label: 'Any wallet', uri: 'bitcoin:bc1qexample?amount=0.00000021&ark=ark1abc&lightning=lnbc210n1x', copyValue: 'bitcoin:bc1qexample?amount=0.00000021&ark=ark1abc&lightning=lnbc210n1x', unified: true},
    {id: 'ark', label: 'Ark', uri: 'bitcoin:?amount=0.00000021&ark=ark1abc', copyValue: 'bitcoin:?amount=0.00000021&ark=ark1abc'},
    {id: 'lightning', label: 'Lightning', uri: 'lightning:lnbc210n1x', copyValue: 'lnbc210n1x'},
    {id: 'onchain', label: 'On-chain', uri: 'bitcoin:bc1qexample?amount=0.00000021', copyValue: 'bitcoin:bc1qexample?amount=0.00000021'},
  ]);
});

test('single-rail and pending orders do not show unusable payment tabs', () => {
  assert.deepEqual(stickyPaymentRails({payment: {arkAddress: 'ark1abc'}}),
    [{id: 'ark', label: 'Ark', uri: 'bitcoin:?ark=ark1abc', copyValue: 'bitcoin:?ark=ark1abc'}]);
  assert.deepEqual(stickyPaymentRails({payment: {bolt11: 'lnbc110n1y'}}),
    [{id: 'lightning', label: 'Lightning', uri: 'lightning:lnbc110n1y', copyValue: 'lnbc110n1y'}]);
  assert.deepEqual(stickyPaymentRails({payment: null}), []);
});

test('the note menu can reveal the complete signed Nostr event as JSON', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /<details id="noteEventJsonDetails"[^>]*>[\s\S]*<summary>Show JSON<\/summary>/);
  assert.match(html, /<code id="noteEventJson"><\/code>/);
  assert.match(script, /noteEventJson\.textContent = JSON\.stringify\(record\.event, null, 2\)/,
    'the displayed JSON is the full signed relay event, formatted as inert text');
  assert.match(script, /noteEventJsonDetails\.open = false/,
    'each note menu starts with JSON collapsed');
  assert.match(css, /\.note-event-json pre \{[^}]*overflow:auto/,
    'large events scroll inside the menu');
  assert.match(script, /noteEventJsonDetails\.addEventListener\('toggle',[^\n]*keepNoteMenuOnScreen/,
    'expanding JSON keeps the note menu inside a small screen');
});

test('font dropdown previews the three note typefaces without breaking older notes', async () => {
  const [html, css, theme, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../theme.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(css, /fonts\.bunny\.net/);
  for (const name of ['Special Elite', 'Caveat', 'Comfortaa']) assert.match(html, new RegExp(name));
  assert.match(html, /<select id="noteFont"/);
  assert.doesNotMatch(html, /class="font-option/);
  assert.equal((html.match(/<option class="font-preview--/g) || []).length, 3);
  assert.match(css, /font-preview--handwritten[^}]+Caveat/s);
  assert.match(css, /font-preview--comfortaa[^}]+Comfortaa/s);
  assert.match(theme, /:not\(\.sticky-note\):not\(\.sticky-note \*\):not\(\.note-font-select\):not\(\.note-font-select \*\)/,
    'the global site font leaves the live note and every dropdown option alone');
  assert.match(script, /elements\.draft\.classList\.add\(`sticky-note--font-\$\{font\}`\)/,
    'choosing a font applies it to the note being written immediately');
  assert.match(css, /#noteCapacity\.is-almost-full/);
  assert.match(css, /#noteCapacity\.is-full/);
  assert.match(css, /sticky-note--dense/);
});

test('mobile board and note gestures support pinch zoom and two-finger rotation', async () => {
  const [script, css, html] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /gesture\.scale \* distance\(\) \/ gesture\.distance/);
  assert.match(script, /rotation: gesture\.placement\.rotation \+ difference/);
  const placementGestures = script.slice(script.indexOf('function installPlacementGestures'), script.indexOf('function isOverBin'));
  assert.match(placementGestures, /elements\.board\.addEventListener\('pointerdown'/,
    'placement gestures use the whole board, not only the paper');
  assert.match(placementGestures, /gesture\.scale \* distanceBetween\(\) \/ gesture\.distance/);
  assert.match(placementGestures, /scheduleBoardTransform\(rect\)[\s\S]{0,100}setBinArmed/,
    'one two-finger gesture zooms the board and rotates the note');
  assert.match(script, /if \(event\.target\.closest\('\.sticky-note__pin, \.sticky-note__link, \.board-plate, \.sticky-note__author'\)[\s\S]{0,180}return;/,
    'the pin, a note link, the board plate and the signature keep their own click instead of dragging the board');
  assert.match(css, /sticky-note--placing[^}]+touch-action:\s*none/);
  // The board is a pattern drawn into a canvas inside the transformed element, not a repeating
  // background on the 2048px board element. That tiled form has to be produced at device resolution
  // whenever the whole board is in view - 6144px on a 3x phone - and comes back from the browser with
  // parts of it empty, which a reader sees as blank squares the size of the board tile. What matters is
  // kept: the board still tiles every 600 board px, still moves with the board, and still sits under
  // the rail and the notes.
  assert.match(script, /image\.src = source;/, 'the pattern comes from the reader’s choice, never a literal');
  assert.match(script, /createPattern\(boardTexture\.image, 'repeat'\)/,
    'the board is still a repeating pattern, drawn into the canvas');
  assert.match(html, /<div id="stickyCanvas"[^>]*>\s*<canvas id="boardPaint"/,
    'the board canvas is inside the transformed element, so it pans and zooms with the board');
  assert.doesNotMatch(css, /\.sticky-canvas[^}]+background-image:/,
    'the board element asks for no board-sized tiled texture');
  assert.match(css, /\.sticky-canvas[^}]+background-color:\s*#b98b63/,
    'a canvas that cannot paint shows the board colour, never black');
  assert.doesNotMatch(script, /backgroundSize = `\$\{600 \* boardView\.scale\}px/);
  assert.doesNotMatch(script, /backgroundPosition = `\$\{boardView\.x\}px \$\{boardView\.y\}px`/);
});

test('payment sheet opens during invoice creation and pinned state stays complete', async () => {
  const [script, html] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /showPaymentPreparing\(quotedPrice\)/);
  assert.match(script, /const INVOICE_WAIT_MESSAGES = Object\.freeze\(\[/);
  assert.match(script, /Tiny gears are clanking/);
  assert.match(script, /one sat forgot its hat/);
  assert.match(script, /setInterval\(\(\) => \{/);
  assert.match(script, /\}, 3000\)/);
  assert.match(script, /if \(!elements\.paymentDialog\.open \|\| currentRails\.length\)/);
  const paymentRender = script.slice(script.indexOf('async function renderPayment('), script.indexOf('async function selectRail('));
  assert.ok(paymentRender.indexOf('stopInvoiceMessages()') > paymentRender.indexOf("if (!rails.length)"));
  assert.ok(paymentRender.indexOf('stopInvoiceMessages()') < paymentRender.indexOf('currentRails = rails'),
    'the waiting copy stops as soon as a usable invoice arrives');
  assert.match(script, /setTimeout\(pollPayment, 3000\)/);
  assert.match(script, /textContent = 'Pinned'/);
  assert.match(script, /elements\.pin\.disabled = published/);
  assert.match(script, /sats === 0/);
  // A note covered by a subscription is born settled, so this path now names the
  // subscription rather than a free membership.
  assert.match(script, /Included in your subscription/);
  assert.match(html, /id="openStickyPayment"/);
  assert.match(script, /elements\.openPayment\.href = rail\.uri/);
  assert.match(script, /Your wallet can choose any supported payment method/);
  assert.doesNotMatch(`${html}\n${script}`, /Bark/i);
});

test('an expired note never reaches the board, whichever path asked for it', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // Every render goes through renderNote, and it refuses an expired note before anything is
  // drawn or remembered — so a stored publish flow cannot put one back after the relay dropped it.
  assert.match(script, /function renderNote\([\s\S]{0,400}?if \(isStickyExpired\(sticky\)\) return null;/,
    'the one funnel every render passes through drops an expired note');
  assert.match(script, /if \(!sticky \|\| isStickyExpired\(sticky\) \|\| !noteBelongsToBoard\(sticky\)\) return;/,
    'and the socket path still drops one before it is parsed any further');
  // A note that crosses its moment while the page is open is taken down: the board does not
  // outlive the moment the note names.
  assert.match(script, /function dropExpiredNotes\(\)/);
  assert.match(script, /if \(dropExpiredNotes\(\)\) applyNoteFilters\(\)/);
});

test('board chrome stays compact over the board', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(html, /class="sticky-header"/);
  assert.match(html, /id="stickySettings"[\s\S]{0,180}lni-gear-1/);
  assert.doesNotMatch(html, /id="stickySettings"[^>]*disabled/, 'the gear is the settings control now');
  assert.match(html, /id="nostrAccount"[\s\S]{0,180}lni-user-4/);
  assert.match(html, /class="sticky-help-slot"[\s\S]{0,180}id="stickySettings"[\s\S]{0,180}lni-gear-1[\s\S]{0,180}id="noteSort"[\s\S]{0,180}lni-asana[\s\S]{0,180}id="openStickyBoard"[\s\S]{0,180}lni-map-marker-1[\s\S]{0,180}id="shareArea"[\s\S]{0,180}lni-cerebras[\s\S]{0,180}id="nostrAccount"[\s\S]{0,180}lni-user-4[\s\S]{0,180}id="newSticky"[\s\S]{0,180}lni-plus/,
    'top controls follow the requested question, gear, sort, map, nearby, account, plus order');
  assert.match(html, /id="newSticky"[\s\S]{0,180}lni-plus/);
  assert.doesNotMatch(html, /id="noteFilterStatus"/);
  assert.match(html, /id="noteSort"[^>]+aria-pressed="false"/);
  assert.match(css, /\.note-sort-button\.has-active-filter[^}]+border-color:#7cfc00/);
  assert.match(script, /elements\.noteSort\.classList\.toggle\('has-active-filter', filtered\)/);
  assert.doesNotMatch(html, /class="board-controls"/, 'the board draws no zoom toolbar');
  assert.doesNotMatch(html, /id="zoom(In|Out|Fit)"/);
  assert.doesNotMatch(css, /\.board-controls/);
  assert.doesNotMatch(script, /elements\.zoom(In|Out|Fit)\b/);
  assert.match(script, /addEventListener\('wheel'/, 'zooming is a gesture: the wheel and two fingers');
  assert.doesNotMatch(html, /id="zoomLevel"/);
  assert.doesNotMatch(script, /zoomLevel/);
  assert.doesNotMatch(html, /Global board/);
  assert.match(script, /'#g': \[\.\.\.activeGeohashes\]/);
  assert.match(html, /id="boardDepth"/);
  assert.match(html, /id="rememberStickyBoard"[^>]+role="switch"/);
  assert.match(html, /id="shareStickyBoard"/);
  assert.match(html, /id="exactGeohashNote"/);
  assert.match(html, /id="openGeohashMap"/);
  assert.match(script, /waitForGeohashMapLayout/);
  assert.match(html, /id="followsOnly"[^>]+role="switch"/);
  assert.match(script, /kinds: \[3\]/, 'NIP-02 contact lists are requested');
  assert.match(script, /tag\?\.\[0\] === 'p'/, 'followed public keys come from p tags');
  assert.match(script, /session\.method !== 'anonymous'/, 'temporary identities cannot use follows');
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
  // MapLibre applies maxBounds inside the constructor, before its transform has been sized, and
  // the whole world as bounds is degenerate: it builds a singular matrix, the inverse comes back
  // null and it reads that null — so the map never appears. The world is already the limit.
  // the comment explaining the reason names the option too, so check the code and not the prose
  assert.doesNotMatch(script.replace(/^\s*\/\/.*$/gm, ''), /maxBounds/);
  // A tab that is not visible never fires requestAnimationFrame, so waiting for the dialog's
  // layout has to be able to end on a timer as well.
  assert.match(script, /MAP_LAYOUT_WAIT_MS/);
  assert.match(script, /setTimeout\(resolve, MAP_LAYOUT_POLL_MS\)/);
  // and a map that failed to build is not kept for the next open
  assert.match(script, /Could not build the geohash map/);
  // A grid of specks is worse than no grid: where a cell cannot be read or tapped it is left out,
  // and the cells already chosen are still drawn so the reader keeps sight of their own area.
  assert.match(script, /if \(!geohashGridFits\(\{cellPixels, columns, rows\}\)\)/);
  assert.match(script, /source\.setData\(\{type: 'FeatureCollection', features: chosen\}\)/);
  // Geography filters events; it never changes the board's coordinate space.
  assert.match(script, /const BOARD_SIZE = 2048;/);
  assert.match(script, /const boardSize = Object\.freeze\(\{width: BOARD_SIZE, height: BOARD_SIZE\}\)/);
  assert.doesNotMatch(script, /boardExtentForCells|BOARD_CELL_WIDTH|BOARD_CELL_HEIGHT/);
  assert.match(script, /canvasWidth: boardSize\.width, canvasHeight: boardSize\.height/);
  assert.match(script, /geohashMap = null/);
  assert.match(script, /searchParams\.get\('g'\)/);
  assert.match(script, /const url = boardShareUrl\(chosen\);/,
    'a board is shared as the page that carries its picture, not as the app URL');
  assert.match(script, /BOARD_REMEMBER_KEY/);
  assert.match(script, /localStorage\.removeItem\(BOARD_KEY\)/);
});

test('the Pinstr mirror keeps Telegram visible and every top control in one aligned row', async () => {
  const [html, css, telegram] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../pinstr-telegram.mjs', import.meta.url), 'utf8'),
  ]);
  const telegramButton = html.indexOf('id="pinstrTgSignIn"');
  const nostrMethods = html.indexOf('<div class="login-methods">');
  assert.ok(telegramButton > 0 && telegramButton < nostrMethods,
    'Telegram is a visible first-class option, not buried in the collapsible Nostr methods');
  assert.match(html, /class="anonymous-login pinstr-tg-signin" id="pinstrTgSignIn" hidden/,
    'Telegram uses the same visual control as Anonymous and the Nostr summary');
  assert.match(html, /class="pinstr-tg-status" hidden/,
    'base markup never flashes Telegram controls on satoshi.si');
  assert.match(html, /id="telegramIdentityDialog"[\s\S]*Your Nostr ID is ready[\s\S]*Top-right person icon → Nostr account → Your key → Export my key/,
    'a newly generated Telegram identity explains the real export path');
  assert.match(css, /\.sticky-top-actions \{[^}]*position:absolute;[^}]*display:flex;[^}]*align-items:center;/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.sticky-top-button \{ width:40px; height:40px;/,
    'mobile toolbar buttons retain the same 40px box as help');
  assert.match(telegram, /if \(!ON_PINSTR\) \{[\s\S]*?\.pinstr-tg-status'[\s\S]*?element\.hidden = true/,
    'the static Telegram option stays specific to the pinstr.si mirror');
  assert.match(telegram, /button\.hidden = false[\s\S]*?note\.hidden = false/,
    'the Pinstr-only login enhancement reveals both controls');
  assert.match(telegram, /document\.querySelector\('#accountDialog \.account-card'\)/,
    'the private-key export remains reachable from the signed-in account dialog');
  assert.match(telegram, /if \(detail\.created\)[\s\S]*?#telegramIdentityDialog[\s\S]*?welcome\.showModal\(\)/,
    'only a newly generated identity opens the explanation prompt');
  assert.match(telegram, /globalThis\.PinstrTelegramSigner = \{/,
    'Telegram has its own signer and cannot be shadowed by a browser extension');
  assert.match(telegram, /method: 'telegram'/,
    'the board session records the signer it actually needs');
  assert.match(telegram, /const login = document\.querySelector\('#loginDialog'\);[\s\S]*?if \(login\?\.open\) login\.close\(\);/,
    'every successful Telegram login leaves the sign-in modal');
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
  const [html, script, session, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../nostrSession.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /Post anonymously · 69 sats/);
  assert.ok(html.indexOf('class="private-key-login"') < html.indexOf('data-login="anonymous"'),
    'anonymous posting belongs below private-key login');
  assert.ok(html.indexOf('class="login-status-divider"') < html.indexOf('id="loginStatus"'),
    'the divider separates login choices from their progress');
  assert.match(html, /Your private key stays only in this open page's memory\. It is not saved and is forgotten when you reload or close the page\./);
  assert.match(html, /Use Amber, a browser extension, or a bunker instead\./);
  assert.match(css, /\.private-key-login \.private-key-warning\s*\{[^}]*color:\s*#ff7b75/s);
  for (const id of ['accountPicture', 'accountNip05', 'anonymousExpiry']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(script, /anonymousCountdown/);
  assert.match(css, /\.plan-picker\[hidden\]\s*\{\s*display:\s*none/,
    'the author display rule must not override the hidden attribute');
  assert.match(script, /const plansAvailable = Boolean\(session && !anonymous && subscriptionResolved && !actionInfo\.active\)/);
  assert.match(script, /elements\.subscriptionState\.hidden = !session \|\| checkingSubscription \|\| actionInfo\.active/,
    'an active subscriber sees no plan or subscription sales copy');
  assert.match(script, /checkingSubscription \? 'Place your note' : actionInfo\.label/,
    'the composer stays a single neutral action until the service answers');
  assert.match(script, /elements\.planPicker\.inert = !plansAvailable/);
  assert.match(script, /button\.disabled = !plansAvailable/);
  assert.match(script, /kinds: \[0\]/);
  assert.match(session, /ANONYMOUS_SESSION_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(session, /generateSecretKey\(\)/);
  assert.match(session, /localStorage\.removeItem\(ANONYMOUS_KEY\)/);
  assert.match(script, /session\.method === 'anonymous' && session\.noteEventId/,
    'a used one-note key cannot open or pay for another note');
  assert.match(script, /markAnonymousNotePublished\(event\.id\)/,
    'the key is marked used only after its note is published');
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
  assert.match(html, /3 to 9 characters/);
  assert.match(html, /class="board-depth-help"[\s\S]{0,300}lni-question-mark-circle/);
  assert.match(html, /Each deeper level also includes notes from more precise geohashes inside it/);
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
    geohash: TEST_GEOHASH, liveliness: 'forever', createdAt}), /how long satoshi\.si should show the note/);
});

test('the board has a wooden rail, and it sits outside the board', async () => {
  const [html, page, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /<div id="boardFrame" class="board-frame" aria-hidden="true">/,
    'the frame is in the markup');
  assert.equal((html.match(/board-frame__rail board-frame__rail--/g) || []).length, 4,
    'a rail on each of the four edges');
  assert.ok(html.indexOf('id="boardFrame"') < html.indexOf('board-frame__rail--right'),
    'the rails are inside the frame element');

  // Decoration, never a target: it must not swallow clicks meant for the board.
  assert.match(css, /\.board-frame \{[^}]*pointer-events: none/,
    'the frame does not take pointer events');
  // The rail extends outward from the board, so no note is ever covered by it.
  assert.match(css, /\.board-frame \{ position: absolute; inset: calc\(var\(--board-frame, 26px\) \* -1\)/,
    'the frame is drawn outside the board');
  assert.match(css, /repeating-linear-gradient/, 'the wood is drawn from gradients, with no image to fetch');
  assert.match(css, /radial-gradient/, 'small irregular knots break up the synthetic grain');
  assert.match(css, /var\(--board-frame, 26px\)/, 'the thinner rail thickness comes from one variable');
  assert.match(css, /\.sticky-board \{[^}]*background:transparent/,
    'space outside the rail lets the selected site theme show through');
  assert.doesNotMatch(css, /--board-surround/, 'no hard-coded brown band covers the themed space');
  assert.doesNotMatch(page, /setProperty\('--board-surround'/);

  // One source of truth for that variable. Opening covers the viewport rather than shrinking
  // the whole board until its rail fits like a thumbnail.
  assert.match(page, /const BOARD_FRAME_WIDTH = 26;/);
  assert.match(page, /setProperty\('--board-frame', `\$\{BOARD_FRAME_WIDTH\}px`\)/,
    'the constant is published to the stylesheet');
  assert.match(page, /BOARD_OPEN_COVER \* Math\.max\(/,
    'opening fills the window with board instead of fitting the complete board');
  // The rail is also the limit: nothing may be panned into the board that lies past it.
  assert.match(page, /clampViewToBoard\(rect\)/, 'the transform holds the line');
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

test('note expiry countdown remains compact from days through the final second', () => {
  assert.equal(stickyExpiryCountdown(700000, 100000), '[6d 22h 40m 0s left]');
  assert.equal(stickyExpiryCountdown(103661, 100000), '[1h 1m 1s left]');
  assert.equal(stickyExpiryCountdown(100061, 100000), '[1m 1s left]');
  assert.equal(stickyExpiryCountdown(100001, 100000), '[1s left]');
  assert.equal(stickyExpiryCountdown(100000, 100000), '[expired]');
});

test('the composer asks how long a note lives, and the menu counts down until it goes', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="noteLiveliness"[^>]*type="range"[^>]*min="0"[^>]*max="4"[^>]*step="1"/);
  assert.match(html, /id="noteLivelinessValue"/);
  assert.match(html, /id="noteLivelinessTicks"/);
  assert.match(html, /id="noteLivelinessHint"/);
  assert.match(html, /Will be gone after/);
  assert.match(script, /Other relays, apps, archives, or screenshots may keep it/,
    'the composer does not promise global deletion of a public Nostr event');
  assert.match(html, /id="noteExpiresAt"/, 'the note menu shows when a note goes');
  assert.match(html, /id="noteExpiryCountdown"/, 'the note menu shows time remaining');
  assert.doesNotMatch(html, /id="removeSticky"/, 'natural expiration replaces early deletion');
  assert.match(script, /elements\.liveliness\.addEventListener\('input'/);
  assert.match(script, /liveliness: pending\.liveliness \|\| STICKY_DEFAULT_LIVELINESS/,
    'the published note carries the term the writer chose');
  assert.match(script, /isStickyExpired\(sticky\)/, 'an expired note is not drawn');
  assert.match(script, /renderLiveliness\(\)/, 'the slider is built from the ladder, not from markup');
  // the note menu reads the term off the event, and a note without one shows no row
  assert.match(script, /elements\.noteExpirationValue\.hidden = !expiresAt/);
  assert.match(script, /noteExpiryTimer = setInterval\(tick, 1000\)/);
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
    tags: [['t', 'pinstr'], ['sticky', 'v1', 'yellow', '0.50000', '0.50000', '0.00', 'typewriter'],
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

test('note views sort newest first and combine with the follow filter', () => {
  const now = 2_000_000;
  const notes = Array.from({length: 18}, (_, index) => ({
    id: `note-${index}`,
    createdAt: now - index * 3600,
    pubkey: index % 2 ? BOB : ALICE,
    mentions: index === 3 || index === 9 ? [BOB] : [],
  }));
  assert.deepEqual(STICKY_NOTE_VIEWS, ['all', 'last5', 'last15', 'day', 'week', 'mentions']);
  assert.deepEqual(stickyVisibleNoteIds(notes, {view: 'last5', now}), notes.slice(0, 5).map(note => note.id));
  assert.equal(stickyVisibleNoteIds(notes, {view: 'last15', now}).length, 15);
  assert.equal(stickyVisibleNoteIds(notes, {view: 'day', now}).length, 18);
  assert.deepEqual(stickyVisibleNoteIds(notes, {view: 'mentions', pubkey: BOB, now}), ['note-3', 'note-9']);
  assert.deepEqual(stickyVisibleNoteIds(notes, {
    view: 'mentions', pubkey: BOB, followsOnly: true, follows: [BOB], now,
  }), ['note-3', 'note-9']);
  assert.deepEqual(stickyVisibleNoteIds(notes, {
    view: 'last5', followsOnly: true, follows: [BOB], now,
  }), ['note-1', 'note-3', 'note-5', 'note-7', 'note-9']);
  assert.deepEqual(stickyVisibleNoteIds([
    {id: 'old', createdAt: now - 8 * 86400, pubkey: ALICE, mentions: []},
    ...notes,
  ], {view: 'week', now}).includes('old'), false);
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
  // Mentions now live with the other board views instead of occupying a top-level button.
  assert.match(html, /id="noteSort"[^>]*>[\s\S]{0,100}<i class="lni lni-asana"/);
  assert.match(html, /name="noteView" value="mentions"/);
  assert.doesNotMatch(html, /id="mentionFilter"/);
  assert.match(script, /mentionFilterAvailability\(session\)/);
  assert.match(script, /stickyVisibleNoteIds/);
  assert.match(css, /sticky-note--filtered-out:not\(\.sticky-note--filter-revealed\)/);
  assert.match(css, /sticky-note--filtered-out[^}]+opacity:\.16/);
  assert.match(css, /sticky-note--filtered-out[^}]+\.sticky-note__pin[^}]+display:none/);
  assert.match(script, /function installFilteredNoteLongPress\(note, id\)/,
    'the concealed paper, rather than its pin, owns the hold gesture');
  assert.match(script, /setTimeout\(\(\) => \{[\s\S]{0,180}revealFilteredNote\(id\)[\s\S]{0,180}, 4000\)/,
    'a hidden note needs a deliberate four-second hold');
  assert.match(script, /revealedFilteredNoteUntil = Date\.now\(\) \+ 60000/);
  assert.match(script, /clearRevealedFilteredNote\(\)/, 'only one temporary reveal remains active');
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
  assert.match(script, /const AREA_SCALES = \[8, 7, 5, 4, 3\]/);
  const offered = [...html.matchAll(/data-area-precision="(\d+)"/g)].map(match => match[1]);
  assert.deepEqual(offered, ['8', '7', '5', '4', '3'], 'the markup offers exactly the sizes the script lists');
  for (const label of ['Building', 'Neighbourhood', 'City', 'State', 'Country']) assert.match(html, new RegExp(`>${label}<`));
  // every size is a depth the board accepts: shorter than three is a region, not a place
  for (const precision of offered) {
    assert.ok(Number(precision) >= 3 && Number(precision) <= 9, `${precision} is a board depth`);
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
  assert.match(script, /Pin the current note before changing boards/);
  // a vague fix is not presented as a certain cell, and the comparison is in metres:
  // geohashCellDimensions() answers in degrees, which is what made every size read "0 m"
  assert.match(script, /coords\.accuracy <= geohashCellHeightMetres\(precision\)/);
  assert.match(script, /const DEGREE_METRES = 111320/);
  assert.match(script, /geohashCellDimensions\(precision\)\.height \* DEGREE_METRES/);
  assert.match(script, /may be the cell next door/);
  assert.match(css, /\.area-scale\b/);
});

test('the five "around me" sizes really are a building, a neighbourhood, a city, a state and a country', () => {
  // The page quotes a cell's height in metres. Measure the depths it offers through the
  // model's own bounds instead of trusting the page's arithmetic: at Ljubljana's latitude
  // the five choices must land on the scales they are named after.
  const heights = [8, 7, 5, 4, 3].map(precision => {
    const cell = encodeGeohash(46.0569, 14.5058, precision);
    const {south, north} = geohashBounds(cell);
    return (north - south) * 111320;
  });
  const [building, neighbourhood, city, state, country] = heights;
  assert.ok(building >= 15 && building <= 25, `a building-sized cell is about 19 m, got ${Math.round(building)}`);
  assert.ok(neighbourhood >= 120 && neighbourhood <= 190,
    `a neighbourhood-sized cell is about 153 m, got ${Math.round(neighbourhood)}`);
  assert.ok(city >= 4000 && city <= 6000, `a city-sized cell is about 4.9 km, got ${Math.round(city)}`);
  assert.ok(state >= 15000 && state <= 25000, `a state-sized cell is about 20 km, got ${Math.round(state)}`);
  assert.ok(country >= 140000 && country <= 170000,
    `a country-sized cell is about 156 km, got ${Math.round(country)}`);
  // and each one is a depth the board accepts
  for (const precision of [8, 7, 5, 4, 3]) assert.ok(precision >= GEOHASH_MIN_LENGTH && precision <= 9);
});

test('a signature that cannot be used says so, and the board does not talk over it', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');

  // The notice is a flag on the element rather than a class: the board announces itself
  // constantly, and its announcement arrives *after* the boot's failures.
  assert.match(script, /function notice\(message\) \{/);
  assert.match(script, /elements\.boardStatus\.dataset\.notice = '1';/);
  assert.match(script, /if \(target === elements\.boardStatus && !error\) \{\s+delete target\.dataset\.notice;\s+noticeText = '';/);
  assert.match(script, /if \(elements\.boardStatus\.dataset\.notice\) return;\s+status\(elements\.boardStatus, 'The Nostr board is temporarily unavailable\.'/);

  // A returned signature is used for its own note, and anything else is named rather
  // than dropped — the note is paid for and one tap from being pinned.
  assert.match(script, /if \(amber\?\.action === 'sign' && pending\?\.orderId === amber\.context\?\.orderId\) \{/);
  assert.match(script, /else if \(amber\?\.action === 'sign'\) \{\s+unusable = 'That signature was for a different note\./);
  assert.match(script, /unusable = error\.message;/);
  assert.match(script, /const parkedRequest = pendingAmberRequest\(\);/);
  assert.match(script, /parkedRequest\.context\?\.orderId === pending\.orderId/);
  assert.match(script, /if \(unusableReturn\) notice\(unusableReturn\);/);
  assert.match(script, /pendingAmberRequest,\n  reconnectBunker,\n  resumeAmber,/);
  assert.match(script, /signalStickyFlow\('signed', \{orderId: pending\.orderId\}\)/);
  assert.match(script, /signalStickyFlow\('published', \{orderId, event,/);
  assert.match(script, /event\.key !== FLOW_SYNC_KEY/,
    'the page that launched Amber hears when its callback finishes in another context');

  // The answer is read wherever it arrives, not only while booting: a browser that resumes
  // the running page and merely changes the URL would otherwise lose it — which is a
  // sign-in that does nothing and a note that will not pin, with no error anywhere.
  assert.match(script, /window\.addEventListener\('hashchange', \(\) => \{ resumeExternalFlow\(\)\.catch/);
  assert.match(script, /window\.addEventListener\('pageshow', \(\) => \{ resumeExternalFlow\(\)\.catch/);
  assert.match(script, /window\.addEventListener\('focus', \(\) => \{ resumeExternalFlow\(\)\.catch/);
  assert.match(script, /document\.addEventListener\('visibilitychange',[\s\S]{0,120}!document\.hidden\) resumeExternalFlow\(\)\.catch/);
  assert.match(script, /pending\?\.status === 'waiting' \|\| pending\?\.status === 'waiting_subscription'/);
  assert.match(script, /pending\?\.status === 'paid'\) syncPlacementWithSession\(\)/);
  assert.match(script, /!boardSocket \|\| boardSocket\.readyState > WebSocket\.OPEN/);

  // A sign-in that lands closes its dialog and identifies the account without assuming the
  // reader wants to write. Only an already-paid note resumes automatically.
  assert.match(script, /if \(elements\.login\.open\) elements\.login\.close\(\);/);
  assert.match(script, /event\.key === 'satoshi:nostr:session:v1'\) handleNostrSessionChange\(\)/);
  assert.match(script, /if \(!syncPlacementWithSession\(\)\) showLoginConfirmation\(amber\.session\);/);
  assert.match(script, /elements\.loginConfirmation\.textContent = `Logged in as \$\{signedInLabel\(session\)\}`/);
  assert.doesNotMatch(script, /Amber returned without an account/);
  assert.match(script, /status\(elements\.loginStatus, 'Waiting for Amber\.\.\.'\);/);
  // A sign-in parked with a callback waits for Amber to come back; one sent without a callback
  // tells the reader what to tap when they return, because nothing will arrive on its own.
  assert.match(script, /status\(elements\.loginStatus, parkedRequest\.copy/);
  assert.match(script, /'Amber is waiting for your approval\. Come back to this page when you are done\.'/);
  // The clipboard route finishes by itself where the browser allows a read, and falls back to the
  // button - both are in the resume path, not only in the button's own handler.
  assert.match(script, /await adoptAmberClipboard\(\{silent: true\}\)/);
  assert.match(script, /status\(elements\.amberCopyStatus, 'Amber has it on your clipboard\. Tap the button to hand it over\.'\)/,
    'a failed automatic read offers the button instead of leaving the reader without a way in');
  assert.match(script, /'Waiting for Amber\. Tap Amber again if no answer arrives\.'/);
});

test('the restored board and account dialog cannot trap the reader', async () => {
  const [markup, script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  assert.match(markup, /<form method="dialog" class="dialog-inner account-card">/,
    'the account X closes natively even if page JavaScript is recovering');
  assert.match(markup, /<button type="submit" class="dialog-close" aria-label="Close">/);
  const logout = script.slice(script.indexOf("elements.logout.addEventListener('click'"), script.indexOf("elements.accountPicture.addEventListener"));
  assert.ok(logout.indexOf('elements.accountDialog.close()') < logout.indexOf('logoutNostr()'),
    'logout dismisses the modal before session listeners run');
  assert.match(css, /\.board-status \{[^}]*pointer-events: none/,
    'the opening message cannot block dragging the board');
});

test('the X on the invoice discards it, and a settled payment is not thrown away', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const markup = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');

  // The X is reachable and mapped.
  assert.match(markup, /id="closeStickyPayment" data-close-dialog aria-label="Close"/);
  assert.match(script, /closePayment: document\.getElementById\('closeStickyPayment'\),/);

  // Dismissing the invoice stops the poll, drops what belonged to the order, and keeps the
  // reader's note — and an order the desk already paid for is left alone.
  assert.match(script, /async function discardInvoice\(\) \{\s+if \(!pending \|\| pending\.status === 'paid'\) return;\s+const quotedOrderId = pending\.orderId;/);
  // Money already in is not discarded with the dialog: if the desk says the order is paid, the
  // payment is finished instead.
  assert.match(script, /if \(order\.paid && order\.publishToken\) \{ await pollPayment\(\); return; \}/);
  assert.match(script, /const \{orderId, sats, status: _status, publishToken, subscribeOrderId, subscribePlan, subscribeSats, \.\.\.draft\} = pending;/);
  assert.match(script, /savePending\(draft\.action === 'pin' && draft\.content \? draft : null\);/);

  // Bound to the button and to Esc, never to the close the page performs itself when a payment
  // settles — that close is how a paid note moves on to placing.
  assert.match(script, /elements\.closePayment\.addEventListener\('click', discardInvoice\);/);
  assert.match(script, /elements\.paymentDialog\.addEventListener\('cancel', discardInvoice\);/);
  assert.doesNotMatch(script, /elements\.paymentDialog\.addEventListener\('close'/);
});

test('a saved bunker connection is offered as the way back in', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const markup = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');

  // The button exists in the markup, is mapped (an unmapped element kills the whole page),
  // and is revealed only when there is a connection to come back with.
  assert.match(markup, /data-login="bunker-saved" id="bunkerReconnect" hidden/);
  assert.match(script, /bunkerReconnect: document\.getElementById\('bunkerReconnect'\),/);
  assert.match(script, /function refreshLoginDialog\(\) \{\s+const saved = savedBunker\(\);\s+elements\.bunkerReconnect\.hidden = !saved;/);
  assert.match(script, /else if \(method === 'bunker-saved'\) await reconnectBunker\(\);/);

  // ...and it is on screen before the reader has to wonder what happened.
  assert.match(script, /refreshLoginDialog\(\);\s+showDialog\(elements\.login\);/);
});

test('an unpinned note is on the board only for the identity pinning it', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');

  // The placement refuses to exist without the note's own session...
  assert.match(script, /function pendingBelongsToSession\(\) \{\s+const session = getNostrSession\(\);\s+if \(!session\) return false;/);
  assert.match(script, /return !pending\?\.pubkey \|\| session\.pubkey === pending\.pubkey;/);
  assert.match(script, /if \(!pendingBelongsToSession\(\)\) return;\s+placingNote\?\.remove\(\);/);
  // ...and a second pass must not hand a detached node to the render's insertion anchor:
  // the placement note is what renderNote inserts before, so the reference is cleared.
  assert.match(script, /placingNote\?\.remove\(\);\s+\/\/ The render below inserts before the placement note[\s\S]{0,400}?placingNote = null;/);

  // ...a change of identity withdraws it or brings it back...
  assert.match(script, /function withdrawPlacement\(\) \{/);
  assert.match(script, /function syncPlacementWithSession\(\) \{/);
  assert.match(script, /\/\/ Signing out withdraws the unpinned note; signing in returns it\.\s+syncPlacementWithSession\(\);/);

  // ...and the board's own restore path goes through the same check.
  assert.match(script, /else if \(!resumedSigning && pending\?\.status === 'paid'\) \{\s+syncPlacementWithSession\(\);/);
});

test('a temporary identity cannot buy a plan, and a refusal is not hidden with its dialog', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');

  // The identity decides what the buttons mean, so a session change re-asks the desk and
  // re-draws: relabelling the account alone is what left a plan offered to a temporary
  // identity, at the previous identity's price.
  assert.match(script, /function handleNostrSessionChange\(\) \{\s+const session = getNostrSession\(\);[\s\S]{0,900}updateAccount\(\);[\s\S]{0,900}refreshPriceQuote\(session\)\.catch/);
  assert.match(script, /addEventListener\('satoshi-nostr-session', handleNostrSessionChange\)/);
  assert.match(script, /composingGeohashes = \[\.\.\.activeGeohashes\];\s+[\s\S]{0,300}refreshPriceQuote\(session\)\.catch/);

  // One place buys a subscription, and it refuses for an identity that can never use one.
  assert.match(script, /if \(session\.method === 'anonymous'\) \{\s+throw new Error\(`This temporary identity cannot hold a subscription/);
  assert.match(script, /function shouldBuySubscription\(error, session\) \{\s+return session\?\.method !== 'anonymous'/,
    'an anonymous identity never enters subscription checkout');
  assert.match(script, /error\?\.reason === 'subscription_required'/,
    'only the explicit subscription refusal starts plan checkout');
  assert.match(script, /if \(pending\?\.action === 'remove'\) \{\s+savePending\(null\);\s+pending = null;/,
    'a stale removal from an older frontend is not resumed');
  assert.doesNotMatch(script, /function startRemovalPayment|function publishRemoval/,
    'the note menu no longer exposes a deletion purchase path');

  // The note records the identity it was written under, and a mismatch surviving a reload
  // is named rather than signed by whoever happens to be logged in.
  assert.match(script, /pubkey: session\.pubkey, anonymous: session\.method === 'anonymous',/);
  assert.match(script, /pending\?\.action === 'pin' \? String\(pending\.pubkey \|\| ''\) : ''\)/);
  assert.match(script, /error\.code = 'identity_changed';/);

  // A refusal the reader has to act on outlives the dialog it was reported in.
  assert.match(script, /if \(closedOverMessage\) \{\s+status\(elements\.boardStatus, error\.message, true\);/);

  // A temporary key is one-use: once its note is published, neither the composer nor
  // the payment path can quietly reuse it for another note.
  assert.match(script, /if \(session\.method === 'anonymous' && session\.noteEventId\) \{\s+throw new Error\('This anonymous key already posted its one note/);
  assert.match(script, /if \(session\.method === 'anonymous' && session\.noteEventId\) \{\s+status\(elements\.boardStatus, 'This one-time key already posted its note/);
  assert.match(script, /if \(pending\.anonymous\) markAnonymousNotePublished\(event\.id\);/);
  assert.doesNotMatch(script, /describeStickyAction\(\{anonymous, subscription, plan: subscribePlan, parked:/);
});

test('a note paid for by subscription still finishes after the page reloads', async () => {
  // A wallet app is another app: the phone reclaims the tab and the page comes back
  // with nothing in memory. The note itself names the board it was written on, so the
  // resume has to put that board back rather than ask again, and the composer guard has
  // to read the note when memory is empty. Without both, a note the reader has already
  // paid for is stranded and the message dies with the dialog that closed behind it.
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /const \{subscribeOrderId, subscribePlan: plan, subscribeSats, status: _s, \.\.\.rest\} = pending;/);
  assert.match(script, /if \(rest\.action === 'pin' && Array\.isArray\(rest\.geohashes\) && rest\.geohashes\.length\)/);
  assert.match(script, /composingGeohashes = \[\.\.\.rest\.geohashes\];/);
  assert.match(script, /selectBoard\(rest\.geohashes\.join\(','\)\)/);
  assert.match(script, /const composed = composingGeohashes\.length/);
  assert.match(script, /pending\?\.action === 'pin' && Array\.isArray\(pending\.geohashes\) \? pending\.geohashes : \[\]/);
  // An unpaid draft waits for its original signer and for an explicit tap on +; merely
  // opening a board must not expose it or throw the reader into the composer.
  assert.match(script, /function isStrandedPinDraft\(value = pending\)/);
  assert.match(script, /function restoreSavedDraft\(\) \{\s+if \(!isStrandedPinDraft\(\) \|\| !pendingBelongsToSession\(\)\) return false;/);
  assert.match(script, /const restoredDraft = restoreSavedDraft\(\);/);
  assert.match(script, /Your saved note is ready\. Tap \+ when you want to continue\./);
  assert.doesNotMatch(script, /Your saved note is back — pin it again to publish it\./);
  assert.match(script, /if \(strandedNote && pending\?\.anonymous && !pendingBelongsToSession\(\)\) savePending\(null\);/);
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
  // 2690/1890 on the far side of the 2600x1800 board
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

test('board motion is clamped, frame-batched, and opens by filling the screen', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const paint = script.slice(script.indexOf('function paintBoardTransform('), script.indexOf('function applyBoardTransform('));
  const transform = script.slice(script.indexOf('function applyBoardTransform('), script.indexOf('function scheduleBoardTransform('));
  const scheduled = script.slice(script.indexOf('function scheduleBoardTransform('), script.indexOf('function applyBoardSize('));
  assert.match(transform, /clampViewToBoard\(rect\)/, 'a direct transform clamps before it draws');
  assert.ok(transform.indexOf('clampViewToBoard(rect)') < transform.indexOf('paintBoardTransform(rect)'),
    'the clamp happens before the transform is painted, not after');
  assert.match(paint, /translate3d\(/, 'the board transform is sent to the compositor');
  assert.match(scheduled, /if \(boardTransformFrame\) return;/,
    'several raw input events share one screen-frame paint');
  assert.match(scheduled, /requestAnimationFrame\(/);
  assert.match(script, /const BOARD_OPEN_COVER = 1\.02;/);
  assert.match(script, /BOARD_OPEN_COVER \* Math\.max\(/,
    'the opening view covers the screen instead of fitting the full board');
  assert.match(script, /requestAnimationFrame\(fillBoard\);/);
  assert.match(script, /Math\.exp\(-delta \* \.0016\)/,
    'wheel zoom follows the wheel distance instead of jumping by a fixed step');
  // the pan gesture re-anchors at the edge, or dragging back feels stuck
  assert.match(script, /gesture\.boardX = boardView\.x;\n      gesture\.boardY = boardView\.y;/);
  assert.match(script, /clampBoardView\(boardView, \{width: rect\.width, height: rect\.height\}, \{\n    canvasWidth: boardSize.width, canvasHeight: boardSize.height, frame: BOARD_FRAME_WIDTH,/);
  assert.doesNotMatch(paint, /elements\.board\.style\.background(Size|Position)/,
    'panning transforms the textured canvas instead of repainting the board background');
  assert.equal((paint.match(/getBoundingClientRect/g) || []).length, 0,
    'painting uses cached geometry and never forces a layout read after the write');
});

test('opening a board keeps the wooden rail, instead of deleting it with the canvas', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const html = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');

  // the rail is markup inside the canvas, not something the script builds
  const canvasStart = html.indexOf('id="stickyCanvas"');
  assert.ok(canvasStart > 0 && html.indexOf('id="boardFrame"', canvasStart) > canvasStart,
    'the frame lives inside the canvas, so it pans and zooms with the board');

  // so the place that clears the canvas must keep it
  assert.match(page,
    /elements\.canvas\.replaceChildren\(\s*\.\.\.\[elements\.boardPaint, elements\.boardFrame, elements\.boardPlate, elements\.boardPlateTop\]\.filter\(Boolean\)\)/,
    'clearing the canvas keeps the rail and both plaques');
  assert.doesNotMatch(page, /elements\.canvas\.replaceChildren\(\)/,
    'a bare clear would delete the board\u2019s own edge');
  assert.match(page, /boardFrame: document\.getElementById\('boardFrame'\)/);
  // and nothing else clears that canvas
  assert.match(page, /boardPlateLine = '';/, 'and the plate is re-engraved for the new board');
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

  // Position has the same stable-random behaviour, but never approaches a paper edge.
  assert.equal(pinLeftFor(id), pinLeftFor(id));
  const positions = new Set();
  for (let index = 0; index < 200; index += 1) {
    const left = pinLeftFor(`note-${index}`);
    assert.ok(left >= STICKY_PIN_LEFT_MIN && left <= STICKY_PIN_LEFT_MAX);
    positions.add(left);
  }
  assert.ok(positions.size > 30, 'pins spread across most of the safe horizontal range');
});

test('the note is held down by a picture, and an installed board still has its pins', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = await readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

  assert.match(page, /pinArt\.src = `\/img\/pin_\$\{pinColourFor\(/);
  assert.match(page, /setProperty\('--pin-left', `\$\{pinLeftFor\(pinSeed\)\}%`\)/);
  assert.match(page, /pinArt\.className = 'sticky-note__pin-art'/);
  assert.match(page, /pinArt\.alt = ''/);
  assert.match(page, /pin\.appendChild\(pinArt\)/);
  // the pin image must not swallow clicks: the button around it is the way into the menu
  assert.match(page, /aria-label', 'Open note details'/);
  assert.match(css, /\.sticky-note__pin-art \{[^}]*pointer-events: none/);
  assert.match(css, /\.sticky-note__pin \{[^}]*top: -36px/,
    'the pin head sits above the paper instead of covering the note text');
  assert.match(css, /\.sticky-note__pin \{[^}]*left: var\(--pin-left, 50%\)/,
    'each note can place its pin across the safe part of its top edge');
  assert.match(css, /\.sticky-note:not\(\.draft-note\):not\(\.sticky-note--placing\) \{ overflow: visible; \}/,
    'published notes reveal the raised pin without changing draft or placement clipping');
  assert.match(css, /\.sticky-note__text \{[^}]*overflow: hidden/,
    'raising the pin does not let note text escape its paper');

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

test('every geohash board uses the same 2048 by 2048 coordinate space', async () => {
  const [script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /const BOARD_SIZE = 2048;/);
  assert.match(script, /Object\.freeze\(\{width: BOARD_SIZE, height: BOARD_SIZE\}\)/);
  assert.doesNotMatch(script, /boardExtentForCells/);
  assert.match(css, /\.sticky-canvas \{[^}]*width: 2048px; height: 2048px/);
});

// At a world zoom even a three-character cell can be too small to tap. Building the whole grid
// there means many polygons and a map that stalls on every zoom, while none of the specks can be
// read or tapped anyway. Three characters is the shortest geohash a
// board takes, so there is no coarser grid to fall back on: it is simply not drawn.
test('the cell grid is only drawn where a cell can be read and tapped', () => {
  assert.equal(geohashGridFits({cellPixels: 32, columns: 40, rows: 12}), true);
  assert.equal(geohashGridFits({cellPixels: 2, columns: 999, rows: 199}), false, 'the world zoom: specks');
  assert.equal(geohashGridFits({cellPixels: 16, columns: 40, rows: 12}), false, 'too small to tap');
  assert.equal(geohashGridFits({cellPixels: 32, columns: 400, rows: 400}), false, 'too many to build');
  assert.equal(geohashGridFits({cellPixels: GRID_MIN_CELL_PX, columns: 1, rows: 1}), true, 'exactly the floor');
  assert.equal(geohashGridFits({cellPixels: 32, columns: 0, rows: 0}), false);
  assert.equal(geohashGridFits({}), false);
  assert.equal(geohashGridFits(), false);
});

test('the board bitmap stays inside what a phone will hold, at every zoom', () => {
  // The shape of the bug: the whole board at a phone's 3x ratio is 2048 * 3 = 6144 a side, 37.7M
  // pixels, past the textures a mobile GPU will allocate - and the browser answers by returning
  // parts of it empty. The bitmap is bounded instead of that.
  assert.equal(boardBitmapSize(1, 3), BOARD_BITMAP_MAX, 'a 3x phone at 1:1 is capped, not 6144');
  assert.equal(boardBitmapSize(2.5, 3), BOARD_BITMAP_MAX, 'zoomed in stays capped');
  assert.equal(boardBitmapSize(50, 4), BOARD_BITMAP_MAX, 'and no scale talks it past the cap');
  // Zoomed out on a phone - the state the blank squares appeared in - gets the floor: a small
  // texture, the opposite of what the tiled background produced there.
  assert.equal(boardBitmapSize(0.12, 3), BOARD_BITMAP_MIN);
  assert.equal(boardBitmapSize(0.12, 1), BOARD_BITMAP_MIN);
  // A step, so a continuous pinch does not resize and redraw the bitmap every frame.
  assert.equal(boardBitmapSize(0.5, 1), 1024);
  assert.equal(boardBitmapSize(0.5, 1), boardBitmapSize(0.52, 1));
  // Monotonic, and always inside the bounds.
  const ladder = [0.12, 0.25, 0.5, 0.6, 1, 1.5, 2.5].map(scale => boardBitmapSize(scale, 1));
  assert.deepEqual(ladder, [...ladder].sort((a, b) => a - b));
  assert.ok(ladder.every(side => side <= BOARD_BITMAP_MAX && side >= BOARD_BITMAP_MIN));
  // A missing or silly pixel ratio must not produce a broken bitmap.
  assert.equal(boardBitmapSize(1, 0), 2048);
  assert.equal(boardBitmapSize(1, undefined), 2048);
  assert.equal(boardBitmapSize(0, 1), BOARD_BITMAP_MIN);
});

test('the board tiles every 600 board px, whatever size the bitmap is', () => {
  // 600 board px per tile from a 400px image: the sheet's background-size: 600px, kept.
  assert.equal(BOARD_TILE_PX, 600);
  assert.equal(boardPatternScale(2048, 2048), 1.5, 'a 1:1 bitmap draws the 400px image at 600px');
  assert.equal(boardPatternScale(1024, 2048), 0.75);
  for (const side of [1024, 1280, 1536, 1792, 2048]) {
    assert.equal(BOARD_IMAGE_PX * boardPatternScale(side, 2048) * (2048 / side), 600,
      `a ${side}px bitmap still tiles every 600 board px`);
    assert.equal(BOARD_IMAGE_PX * boardPatternScale(side, 2048), 600 * (side / 2048),
      'the tile lands where the board would put it, measured in bitmap pixels');
  }
});


test('a board pattern is only painted from an address the page will really use', async () => {
  const model = await import('../stickyNotesModel.mjs');
  assert.equal(model.boardTextureUrl('https://example.com/p.png'), 'https://example.com/p.png');
  assert.equal(model.boardTextureUrl('  http://example.com/p.png  '), 'http://example.com/p.png');
  assert.equal(model.boardTextureUrl('/img/mine.png'), '/img/mine.png');
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///etc/passwd',
                     '//evil.example/p.png', 'example.com/p.png', '', '   ', 'x'.repeat(3000)]) {
    assert.equal(model.boardTextureUrl(bad), '', `${JSON.stringify(bad)} must not become a pattern`);
  }
  assert.equal(model.boardTextureUrl('java\nscript:alert(1)'), '', 'a newline must not smuggle a scheme through');
  assert.equal(model.DEFAULT_BOARD_TEXTURE_URL, '/img/board-cork.png');
  assert.equal(model.boardTextureLabel('/img/board-cork.png'), 'Cork');
  assert.equal(model.boardTextureLabel('/img/grain.png'), 'grain.png');
  assert.equal(model.boardTextureLabel('https://cdn.example.com/a/b.png'), 'b.png on cdn.example.com');
});

test('the board style dialog keeps its choice in this browser, never in the note', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /const BOARD_TEXTURE_KEY = 'satoshi:sticky:board-texture:v1'/);
  assert.match(script, /image\.src = source/);
  assert.match(script, /localStorage\.setItem\(BOARD_TEXTURE_KEY, url\)/);
  assert.match(script, /elements\.stickySettings\.addEventListener\('click', openBoardStyle\)/);
  assert.match(script, /\(!boardTextureFallback && boardTextureChoice\) \|\| DEFAULT_BOARD_TEXTURE_URL/,
    'an unset or failing choice falls back to the catalogue pattern');
  assert.match(script, /elements\.boardPaint\.dataset\.painted = '';/,
    'a new pattern clears the painted flag, or the canvas keeps the old picture');
  assert.match(script, /boardTextureFallback = true;/,
    'a pattern that will not load falls back without erasing the address the reader typed');
  assert.match(script, /button\.setAttribute\('aria-label', texture\.label\)/);
  assert.match(script, /button\.title = texture\.label/,
    'the pattern name appears as a hover tooltip');
  assert.doesNotMatch(script, /className = 'board-texture__label'/,
    'pattern names do not occupy permanent space under the swatches');
  assert.match(html, /<dialog id="boardStyleDialog"[\s\S]{0,1600}id="boardTextureUrl"/,
    'the dialog offers a pattern address');
  assert.match(html, /id="stickySettings"[^>]*aria-label="Settings"/);
  assert.doesNotMatch(html, /id="stickySettings"[^>]*disabled/, 'the gear is the settings control now');
});


test('every pattern in the quick selection is a real file, and cork stays the default', async () => {
  const model = await import('../stickyNotesModel.mjs');
  const seen = new Set();
  for (const texture of model.BOARD_TEXTURES) {
    assert.match(texture.url, /^\/img\/[\w.-]+$/, `${texture.id} must be a path on this site`);
    assert.ok(!seen.has(texture.url), `${texture.url} is listed twice`);
    seen.add(texture.url);
    await assert.doesNotReject(stat(new URL(`..${texture.url}`, import.meta.url)),
      `the catalogue lists ${texture.url}, so that file has to be in the checkout`);
    assert.ok(texture.label && texture.label.length <= 20, `${texture.id} needs a short label`);
  }
  assert.ok(model.BOARD_TEXTURES.length >= 6, 'the quick selection holds a set, not one pattern');
  assert.equal(model.BOARD_TEXTURES[0].url, model.DEFAULT_BOARD_TEXTURE_URL);
  assert.equal(model.DEFAULT_BOARD_TEXTURE_URL, '/img/board-cork.png', 'cork stays the default board');

  // a pattern is painted at the tile its entry names, whatever its file's own size is
  assert.equal(model.boardTextureTile({tile: 96}), 96);
  assert.equal(model.boardTextureTile({}), model.BOARD_TEXTURE_TILE_PX);
  assert.equal(model.boardPatternScale(2048, 2048, 400, 600), 1.5);
  assert.equal(model.boardPatternScale(2048, 2048, 24, 96), 4);
  assert.equal(model.boardPatternScale(2048, 2048, 500, 600), 1.2);
  for (const texture of model.BOARD_TEXTURES) {
    const scale = model.boardPatternScale(2048, 2048, 24, model.boardTextureTile(texture));
    assert.ok(scale > 0 && Number.isFinite(scale), `${texture.id} must produce a usable scale`);
  }
});

test('the paint follows the width of the image that loaded, and its catalogue tile', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /boardTexture\.image\.naturalWidth/,
    'the pattern is drawn at the size of the image that actually loaded');
  assert.match(script, /boardTextureTile\(texture\)/,
    'the pattern follows the tile its catalogue entry names');
  assert.match(script, /BOARD_TEXTURES\.find\(entry => entry\.url === boardTextureSource\(\)\)/);
});

test('the board lands on the device pixel grid so its texture and text stop crawling', async () => {
  const [script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  const paint = script.slice(script.indexOf('function paintBoardTransform('), script.indexOf('function applyBoardTransform('));
  // A fractional offset or scale resamples the pattern and the note text differently on every frame,
  // which a reader sees as shimmer and wobble while the board moves.
  assert.match(paint, /x: onDeviceGrid\(boardView\.x, ratio\)/,
    'the pan offset lands on whole device pixels');
  assert.match(paint, /y: onDeviceGrid\(boardView\.y, ratio\)/);
  assert.match(script, /function onDeviceGrid\(value, ratio\) \{\s*return Math\.round\(value \* ratio\) \/ ratio;/,
    'and that grid is the device pixel, not the CSS pixel');
  assert.match(paint, /boardTextureTile\(texture\)/,
    'the zoom is quantised against the pattern tile that is on the board');
  assert.match(paint, /Math\.round\(boardView\.scale \* unit\) \/ unit/,
    'the scale keeps one pattern tile on a whole number of device pixels');
  // A 3D rendering context buys nothing here and sends the layer down another rasterisation path.
  assert.doesNotMatch(css, /transform-style:\s*preserve-3d/);
  // Button and fit zooms are composited, and never while a finger is driving the board.
  assert.match(css, /\.sticky-board\.is-zooming \.sticky-canvas \{ transition: transform/);
  assert.match(script, /function animateBoardZoom\(\) \{[\s\S]{0,140}if \(!boardSettled\) return;/,
    'the first fit is not animated');
  assert.match(script, /elements\.board\.classList\.add\('is-zooming'\)/);
});

test('one Amber button, with the hand-over in a dialog and a code for desktops', async () => {
  const [markup, script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  // One Amber button, and the reader is not asked to know what a callback is.
  assert.doesNotMatch(markup, /data-login="amber-copy"/, 'the second Amber button is gone');
  assert.doesNotMatch(markup, /no callback/);
  assert.equal(markup.match(/data-login="amber"/g).length, 1);

  // The hand-over is a dialog in the middle of the screen, and that is where the button lives.
  assert.match(markup, /<dialog id="amberCopyDialog" class="sticky-dialog"[\s\S]{0,1600}id="amberPaste"/);
  assert.match(markup, /class="primary-action amber-paste"/, 'the button that always works is in that dialog');
  assert.match(markup, /<dialog id="nostrConnectDialog" class="sticky-dialog"/, 'the code has a dialog too');
  assert.match(markup, /<script src="\/qrCodeGenerator_1_4_4\.js"/, 'the QR generator is loaded on this page');
  assert.match(css, /\.nostr-connect-qr__canvas/, 'the code is styled as squares on white');
  assert.doesNotMatch(css, /\.amber-steps/, 'the step list the dialog no longer shows is unstyled too');

  // Android gets the intent, a desktop gets the code - one button, decided by what the reader has.
  assert.match(script, /if \(!\/Android\/i\.test\(navigator\.userAgent \|\| ''\)\) \{ await showNostrConnectDialog\(\); return; \}/);
  assert.match(script, /beginAmberLogin\(\{copy: true\}\)/, 'the button asks for the clipboard route');
  assert.doesNotMatch(script, /'amber-copy'/, 'the second login method is gone from the page as well');
  assert.match(script, /function showAmberCopyDialog\(\)[\s\S]{0,220}elements\.amberDialog\.showModal\(\)/);
  // A fixed character window over the source is brittle: the function grew a quiet zone and pixel sizing since
  // it was written. Slice the function's own body instead, so the assertion survives any prologue.
  const qrBody = script.slice(script.indexOf('function drawQrCode(container, text)'));
  assert.ok(qrBody.slice(0, qrBody.indexOf('\n}\n')).includes('qr.isDark(row, column)'),
    'the code is drawn module by module from the generator');
  assert.match(script, /elements\.nostrConnect\.addEventListener\('close'[\s\S]{0,180}nostrConnectRequest\?\.cancel\(\)/,
    'a code that is closed stops waiting');
  // A reload between the two apps must land on the step that can finish, not on the list of ways in.
  assert.match(script, /if \(dialog === elements\.login && amberClipboardPending\(\)\) \{\s+dialog = elements\.amberDialog;\s+status\(elements\.amberCopyStatus, 'Approve it in Amber,/);
});

test('the board plate is engraved with its own cells, cut to fit, and no deeper ones', async () => {
  const [markup, script, css, model] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotesModel.mjs', import.meta.url), 'utf8'),
  ]);

  // A small plaque: it may not grow to fit a long line of cells.
  assert.match(script, /const BOARD_PLATE_WIDTH = 620;/);
  assert.ok(620 <= 2048 / 3, 'the plate stays small against the board it is nailed to');
  assert.match(css, /\.board-plate \{[^}]*width: 620px/);
  assert.match(css, /\.board-plate \{[^}]*height: 46px/, 'the plate is a slim strip on the bottom rail');
  // The letters must have somewhere to hang: a geohash's ink reaches past its line box.
  const plateHeight = Number(/\.board-plate \{[^}]*height: (\d+)px/.exec(css)[1]);
  const typeMax = Number(/const BOARD_PLATE_TYPE_MAX = (\d+);/.exec(script)[1]);
  assert.ok(plateHeight - typeMax >= 10, `room for descenders: plate ${plateHeight}px, type ${typeMax}px`);

  // It belongs to the board: inside the transformed canvas, after the rail, before the notes.
  const canvas = markup.indexOf('id="stickyCanvas"');
  const frame = markup.indexOf('class="board-frame"');
  const plate = markup.indexOf('id="boardPlate"');
  assert.ok(canvas >= 0 && frame > canvas && plate > frame,
    'the plate is on the board itself, so it pans and zooms with it');
  // The plate names the board, so it is the control that shares it: a button with a label of its
  // own, and no longer something that has to swallow its clicks to stay out of the pan gesture.
  assert.match(markup, /<button type="button" id="boardPlate"[^>]*aria-label="Share this board"/,
    'the plate is the share control, and carries its own accessible label');
  assert.match(css, /\.board-plate \{[^}]*cursor: pointer/, 'the plate shows that it can be pressed');
  assert.doesNotMatch(css, /\.board-plate \{[^}]*pointer-events: none/,
    'and it no longer swallows the click that opens the share dialog');

  // One size for the whole string, and never bigger than the plate's own type.
  assert.match(model, /export function boardPlateFontSize\(innerWidth, measuredWidth, maximum\)/);
  assert.equal(boardPlateFontSize(400, 800, 46), 23);
  assert.equal(boardPlateFontSize(400, 100, 46), 46, 'a short line is not blown up past the plate type');
  assert.equal(boardPlateFontSize(0, 800, 46), 46, 'an unmeasurable plate leaves the type alone');
  assert.equal(boardPlateFontSize(400, 0, 46), 46);
  // The engraving follows the board's cells, with a nail head between them...
  const render = script.slice(script.indexOf('function renderBoardPlate()'), script.indexOf('function selectBoard('));
  // The line is cut down until it is inside the plate rather than measured once: the gaps and nail
  // heads are in em and do not divide out exactly, so a single pass landed a few percent over.
  assert.match(render, /for \(let pass = 0; pass < 4; pass \+= 1\)/);
  assert.match(render, /if \(!\(width > 0\) \|\| width <= target\) break;/);
  assert.match(render, /boardPlateFontSize\(target, width, size\)/);
  assert.match(render, /const target = Math\.max\(1, inner - BOARD_PLATE_INSET\)/,
    'the engraving stops just inside the plate, where layout rounding cannot push it over the edge');
  assert.match(render, /activeGeohashes\.join\(','\)/, 'the plate follows the cells the board covers');
  assert.match(render, /if \(index\) parts\.push\(nailHead\(\)\)/, 'two cells are separated by a nail head');
  assert.match(css, /\.board-plate__nail \{[^}]*width: \.34em/, 'and that nail is cut down with the letters');
  // ...and never the deeper cells a filter can reveal, which are notes from inside it, not places.
  assert.doesNotMatch(render, /\b(boardDepth|reach|deeper|child|children|layers?)\b/i,
    'the plate names the board, not the layers of notes showing on it');
  // Panning and zooming must not re-engrave the plate on every frame.
  assert.match(render, /if \(signature === boardPlateLine\) return;/);
  assert.match(script, /boardAppliedScale = next\.scale;\s*\n\s*renderBoardPlate\(\);/,
    'the plate is measured through the transform it sits in');
});

test('the board plate separator and the plate itself are styled as metal, not as text', async () => {
  const css = await readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  assert.match(css, /\.board-plate__cell \{[^}]*text-shadow: 0 1px rgba\(255, 248, 220, \.55\)/,
    'the letters are cut into the metal, with the light catching the lower edge');
  assert.match(css, /\.board-plate,\n\.board-frame__lamps \{[^}]*linear-gradient\(168deg/, 'the plate is a slab of aged brass, worn by the lamps too');
  assert.match(css, /\.board-plate\[hidden\] \{ display: none; \}/, 'a board with no cells shows no plate');
});

test('a brass plate on each side rail carries all six sockets, and the depth lights them', async () => {
  const [markup, script, css, model] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotesModel.mjs', import.meta.url), 'utf8'),
  ]);

  // Six sockets, always: a cell is three to nine characters, so six levels lie under the shallowest
  // board and the plate is cut to all of them. What the board's own depth changes is how many burn.
  assert.equal(BOARD_LAMP_SOCKETS, 6, 'six levels lie below the shallowest board');
  assert.equal(BOARD_LAMP_SOCKETS, GEOHASH_MAX_LENGTH - GEOHASH_MIN_LENGTH);

  // The gauge, worked out once: what is lit is nine minus the cell's own length, so three characters
  // lights all six, six characters lights three, and the deepest board lights none of its six.
  assert.equal(boardLampCount('u0q'), 6, 'a three-character board lights every socket it has');
  assert.equal(boardLampCount('u0qj7z'), 3, 'a six-character board lights three');
  assert.equal(boardLampCount('u0qj7z0y8'), 0, 'the deepest board lights none of them');
  assert.equal(boardLampCount('u0qj7z0y'), 1);
  assert.equal(boardLampCount(''), 0, 'no cell, no light');
  assert.equal(boardLampCount('not a place'), 0, 'and a string that is not a geohash lights nothing');
  for (const length of [GEOHASH_MIN_LENGTH, 4, 5, 6, 7, 8, 9]) {
    assert.equal(boardLampCount(TEST_GEOHASH.slice(0, length)), 9 - length,
      `${length} characters leaves ${9 - length} levels open, and so ${9 - length} lit`);
  }

  // Which end of the plate burns, read in the order the page builds the sockets: the first socket in
  // the DOM is the one at the head of the plate and the last is the one at its foot, since both
  // plates are built as a column in that order. The levels still open under the board are the ones
  // nearest to it, so they light from the foot up: a six-character cell lights the last three
  // sockets and leaves the top three dark, three characters light all six, nine light none of them.
  const socketsFor = cell => Array.from({length: BOARD_LAMP_SOCKETS},
    (unused, index) => boardLampLit(index, boardLampCount(cell)));
  assert.deepEqual(socketsFor('u0qj7z'), [false, false, false, true, true, true],
    'a six-character cell lights the bottom three sockets, not the top three');
  assert.deepEqual(socketsFor(''), Array.from({length: BOARD_LAMP_SOCKETS}, () => false),
    'and no cell at all lights nothing');
  for (const length of [GEOHASH_MIN_LENGTH, 4, 5, 6, 7, 8, 9]) {
    assert.deepEqual(socketsFor(TEST_GEOHASH.slice(0, length)),
      [...Array.from({length: length - GEOHASH_MIN_LENGTH}, () => false),
        ...Array.from({length: 9 - length}, () => true)],
      `${length} characters lights the bottom ${9 - length} sockets and leaves the top dark`);
  }

  // The plates are chrome on the side rails: one per side, inside the frame, which never takes a
  // click - so a lamp can never swallow a pan or a tap meant for the board.
  assert.equal((markup.match(/class="board-frame__lamps board-frame__lamps--/g) || []).length, 2,
    'a lamp plate on each side rail');
  const frame = markup.indexOf('id="boardFrame"');
  const rightRail = markup.indexOf('board-frame__rail--right');
  const lamps = markup.indexOf('id="boardLampsLeft"');
  assert.ok(frame < rightRail && rightRail < lamps && lamps < markup.indexOf('id="boardPlate"'),
    'the plates hang inside the frame, on its rails');
  assert.match(css, /\.board-frame \{ position: absolute;[^}]*pointer-events: none/,
    'and the frame they live in only ever reads, never takes a click');
  assert.match(css, /\.board-frame__lamps \{ position: absolute; top: 50%/);
  assert.match(css, /\.board-frame__lamps--left \{ left: calc\(var\(--board-frame, 26px\)/,
    'each plate is centred on its own rail');
  // And the right one is the left one's mirror about the board's centre: the shared -50% shifted both
  // plates leftwards, which left the right plate a whole plate-width in and hanging over the board.
  assert.match(css, /\.board-frame__lamps--right \{ right: calc\(var\(--board-frame, 26px\) \/ 2\); translate: 50% -50%; \}/,
    'the right plate is the left one mirrored, not shifted back with it');

  // The same six sockets are built on every board, and each one is lit by what the reader's depth shows there.
  assert.match(script, /const info = boardLampInfo\(index, activeGeohashes, boardDepth\);/);
  assert.match(script, /Array\.from\(\{length: BOARD_LAMP_SOCKETS\}/,
    'the plate is cut to all six sockets whatever the board');
  assert.match(script,
    /lamp\.className = info\?\.lit\s*\n?\s*\? 'board-frame__lamp board-frame__lamp--lit'\s*\n?\s*: `board-frame__lamp\$\{info\?\.hidden \? ' board-frame__lamp--hidden' : ''\}`;/
    , 'a shown level is green and a hidden one is red');
  assert.match(model, /export function boardLampLit\(index, lit\) \{/,
    'and which end of the plate burns is stated once, in the model');
  // The unlit socket is a real, drawn socket rather than a level struck off the plate.
  assert.match(css, /\.board-frame__lamp \{[^}]*radial-gradient\(circle at 38% 30%, #6b4a24/,
    'an unlit socket is dark, and still drawn');
  assert.match(css, /\.board-frame__lamp--lit \{[^}]*#62c986/, 'the lit ones burn green');
  assert.doesNotMatch(css, /board-frame__lamp--(off|dark|unlit|expired)/,
    'the dark socket is the plate\'s own socket, not a second state invented for it');
  // Nothing hides the plate for having nothing lit: only a board with no cell at all shows none.
  assert.doesNotMatch(css, /\.board-frame__lamps:empty/,
    'the plate is not hidden for being empty at the deepest level');
  assert.match(script, /strip\.hidden = !activeGeohashes\.length;/,
    'and it is only the board with no cell at all that wears no plate');
  assert.match(css, /\.board-frame__lamps\[hidden\] \{ display: none; \}/);
  assert.equal((css.match(/\.board-frame__lamps\[hidden\] \{ display: none; \}/g) || []).length, 1);

  // The lamp plate is the board's name plate: one brass, declared once and worn by both.
  assert.match(css,
    /\.board-plate,\n\.board-frame__lamps \{ box-sizing: border-box; border: 1px solid rgba\(52, 30, 10, \.82\);[^}]*linear-gradient\(168deg, #cbab6c 0%, #b6944f 30%, #9c7b3c 62%, #7d5c2b 100%\)[^}]*inset 0 0 22px rgba\(60, 34, 8, \.3\)/,
    'the lamps are mounted on the same brass the board\'s own plate is made of');
  // And it is worn at the name plate's own size rather than as a thinner variant of it: the name
  // plate measures 620px along its rail by 46px across it, so the lamp plate wears that measure
  // turned on its side - the same cross-section across the rail it hangs from, the same length down
  // it. The sizes are read off the plates themselves rather than pinned, so the six sockets and the
  // air between them still have to fit inside whatever measure the two plaques are cut to next.
  const namePlate = /\.board-plate \{[^}]*width: (\d+)px; height: (\d+)px/.exec(css);
  const lampPlate = /\.board-frame__lamps \{[^}]*align-items: center; justify-content: space-evenly; width: (\d+)px; height: (\d+)px; \}/.exec(css);
  const socket = /\.board-frame__lamp \{ flex: none; width: (\d+)px; height: (\d+)px/.exec(css);
  assert.match(css, /\.board-frame__lamps \{[^}]*justify-content: space-evenly/,
    'the six sockets are spread over the plate, not gathered in the middle of it');
  assert.ok(namePlate && lampPlate && socket, 'both plaques and the socket carry their measure in the CSS');
  const [nameWidth, nameHeight] = [Number(namePlate[1]), Number(namePlate[2])];
  const [lampWidth, lampLength] = [Number(lampPlate[1]), Number(lampPlate[2])];
  const [lampDiameter, lampAcross] = [Number(socket[1]), Number(socket[2])];
  assert.equal(lampWidth, nameHeight, 'the lamp plate is as thick across its rail as the name plate');
  assert.equal(lampLength, nameWidth, 'and as long down the rail as the name plate is wide');
  assert.equal(lampDiameter, lampAcross, 'a socket is round');
  assert.ok(lampDiameter + 2 <= lampWidth, 'a socket fits across the plate it is set in');
  // The six sockets are spread over the plate's whole length rather than gathered in the middle of it:
  // the brass the six leave is cut into seven equal parts - the two ends and the five between - so the
  // gauge stands as a row of sockets down the plate, the same brass above the first as below the last,
  // and each socket still centred across the plate's width.
  assert.doesNotMatch(css, /\.board-frame__lamps \{[^}]*\b(?:gap|padding): /,
    'no fixed air between the sockets or at the ends, which would break the even split');
  const lampSpaces = BOARD_LAMP_SOCKETS + 1;
  const freeBrass = lampLength - BOARD_LAMP_SOCKETS * lampDiameter;
  assert.ok(freeBrass > 0, 'the six sockets still fit inside the plate');
  const brassPerSpace = freeBrass / lampSpaces;
  assert.ok(brassPerSpace >= lampDiameter,
    `each of the seven spaces is at least a socket wide: ${brassPerSpace.toFixed(2)}px against ${lampDiameter}px`);
});

test('the top rail wears the bottom rail\u2019s plate, and both of them share the board', async () => {
  const [markup, script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  // The same plaque: one button wearing the plate's own class, hung off the other rail.
  assert.match(markup,
    /<button type="button" id="boardPlateTop" class="board-plate board-plate--top"[^>]*aria-label="Share this board"/,
    'the top plate is the same control, with the same label');
  assert.match(markup, /<span id="boardPlateTopLine" class="board-plate__line"><\/span>/,
    'carrying the same engraved line');
  assert.match(css, /\.board-plate--top \{ top: calc\(8px - var\(--board-frame, 26px\)\); bottom: auto; \}/,
    'the same material, hung from the other rail');
  assert.match(css, /\.board-plate,\n\.board-frame__lamps \{[^}]*linear-gradient\(168deg/, 'which is the brass the bottom one is made of');

  // Both plaques are engraved from the board's cells, in the one pass.
  const render = script.slice(script.indexOf('function renderBoardPlate()'), script.indexOf('function selectBoard('));
  assert.match(render, /\[elements\.boardPlate, elements\.boardPlateLine\]/);
  assert.match(render, /\[elements\.boardPlateTop, elements\.boardPlateTopLine\]/);
  assert.match(render, /for \(const \[plate, line\] of plates\)/,
    'one engraving, worn by both plaques');

  // And both of them do the one thing the plate does: open the board's share dialog.
  assert.match(script, /const shareThisBoard = \(\) => openShareBoard\(\);/);
  assert.match(script, /elements\.boardPlate\.addEventListener\('click', shareThisBoard\);/);
  assert.match(script, /elements\.boardPlateTop\.addEventListener\('click', shareThisBoard\);/,
    'the top plate presses exactly what the bottom one presses');
  assert.equal((script.match(/addEventListener\('click', shareThisBoard\)/g) || []).length, 2,
    'one handler, and no second one invented for the top plate');
  // It also has to survive a board switch, and the pan guard already names the plate's class.
  assert.match(script,
    /\.\.\.\[elements\.boardPaint, elements\.boardFrame, elements\.boardPlate, elements\.boardPlateTop\]\.filter\(Boolean\)\)/);
  assert.match(script, /closest\('\.sticky-note__pin, \.sticky-note__link, \.board-plate, \.sticky-note__author'\)/,
    'so a press on either plaque, or on a signature, reaches the button rather than the pan');
});

test('the lamps pulse once when the board changes, and the first strip is left still', async () => {
  const [script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  const render = script.slice(script.indexOf('function renderBoardPlate()'), script.indexOf('function selectBoard('));
  assert.match(render, /renderBoardLamps\(\);/, 'the strip is drawn from the board\u2019s own cells');
  assert.match(render, /const wasDrawn = boardLampsReady;/);
  assert.match(render, /if \(wasDrawn\) pulseLamps\(\);/, 'a new board is shown once, where the lamps are');
  assert.match(render, /boardLampsReady = true;/,
    'the strip drawn as the page opens is not a change, so nothing pulses over it');

  // The class has to come off, and the layout be read back, before it goes on again: a browser
  // restarts an animation only when the animation property really changed, so a second board
  // opened straight after the first would otherwise be silent.
  assert.match(script,
    /strip\.classList\.remove\('is-pulsing'\);\s*\n(?:\s*\/\/[^\n]*\n)*\s*void strip\.offsetWidth;\s*\n\s*strip\.classList\.add\('is-pulsing'\);/);
  assert.match(css, /\.board-frame__lamps\.is-pulsing \{ animation: board-lamps-pulse \.55s ease-out 1; \}/);
  assert.match(css, /@keyframes board-lamps-pulse \{ 0%, 100% \{ filter: brightness\(1\); \} 45% \{ filter: brightness\(1\.85\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.board-frame__lamps\.is-pulsing \{ animation: none; \} \}/,
    'a reader who asked for less motion is not flashed at');
  assert.doesNotMatch(css, /board-frame__lamps[^{]*\{[^}]*animation: [^;]*infinite/,
    'it happens once, not on a loop');
});

test('the board leaves room for fixed chrome across the foot of the page', async () => {
  const [script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  // The board's own area stops above the chrome; where there is none the inset is zero, which is how
  // the pinstr mirror keeps filling the viewport.
  assert.match(css, /\.sticky-board \{[^}]*top: 0; right: 0; bottom: var\(--board-chrome-bottom, 0px\); left: 0;/);

  const selector = script.slice(script.indexOf('const BOARD_CHROME_SELECTOR'), script.indexOf('function boardChromeBottom()'));
  const chrome = script.slice(script.indexOf('function boardChromeBottom()'), script.indexOf('function applyBoardChrome()'));
  assert.ok(selector.length > 0 && chrome.length > 0, 'the measurement is there to read');

  // Only chrome that actually floats over the board and runs across the page's foot takes room.
  assert.match(chrome, /placement !== 'fixed' && placement !== 'sticky'/, 'static markup never takes room');
  assert.match(chrome, /rect\.width < window\.innerWidth \* 0\.6/, 'a floating button is not something the board makes room for');
  assert.match(chrome, /rect\.top < viewport \* 0\.5/, 'a bar at the top of the page is not at its foot');
  assert.match(chrome, /closest\('dialog, \[role="dialog"\], \.modal, \[aria-modal="true"\]'\)/,
    "a dialog's own footer belongs to the dialog");
  // Same code on both hosts: the mirror must not need a different rule.
  assert.doesNotMatch(selector + chrome, /pinstr|satoshi\.si/i, 'nothing here names a site');
  // Measured in the boot, after the frame variable and before the first sizing, and re-measured when
  // the viewport changes.
  assert.match(script, /setProperty\('--board-frame'[^\n]*\n(?:\/\/[^\n]*\n)*applyBoardChrome\(\);\n(?:\/\/[^\n]*\n)*applyBoardSize\(\);/,
    'the first fit already knows where the bottom edge is allowed to be');
  assert.match(script, /window\.addEventListener\('resize', \(\) => \{\n(?:\s*\/\/[^\n]*\n)*\s*applyBoardChrome\(\);/,
    'a footer that changes height is not missed');
});


test('the counter counts down the characters a note has left', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /characters left/);
  assert.match(script, /STICKY_MAX_CHARACTERS - length/, 'the number shown is what remains');
  assert.doesNotMatch(script, /textContent = `\$\{length\} characters`/,
    'it must not count up to the cap and only then start counting down');
  assert.match(script, /is-almost-full/, 'the near-the-cap warning class stays');
});

test('a link chip is not drawn welded to the character before it', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const start = script.indexOf('function renderNoteContent');
  const head = script.slice(start, start + 1100);
  assert.match(head, /previous\.type === 'text'/, 'the drawing looks at the run before the chip');
  assert.match(head, /createTextNode\(' '\)/, 'and separates it with a space when it does not end in one');
  assert.match(head, /part\.type === 'link' && index/, 'only a link chip, and never a leading one');
});


test('a long link counts as the word the note shows', () => {
  const link = 'https://example.com/' + 'a'.repeat(5000);
  assert.equal(stickyNoteLength(`see ${link} now`), 'see '.length + 'link'.length + ' now'.length,
    'an address counts as the word the paper prints in its place');
  assert.ok(stickyNoteLength(`see ${link} now`) <= STICKY_MAX_CHARACTERS,
    'five thousand characters of address leave the note its room');

  // the same note is published rather than refused, and read back rather than hidden
  const template = makeStickyTemplate({content: `see ${link} now`, color: 'yellow',
    x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH});
  const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.ok(parsed, 'the board still reads its own note');
  assert.ok(String(parsed.content).includes(link), 'the address travels whole');

  // plain text is measured exactly as before, and a note that is really too long is refused
  assert.equal(stickyNoteLength('y'.repeat(STICKY_MAX_CHARACTERS)), STICKY_MAX_CHARACTERS);
  assert.throws(() => makeStickyTemplate({content: 'y'.repeat(STICKY_MAX_CHARACTERS + 1),
    color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH}), /full/i);
});


test('a place found by name lands on a four-character grid', () => {
  assert.equal(MAP_SEARCH_PRECISION, 4);
  assert.equal(geohashPrecisionForZoom(mapZoomForGeohashPrecision(MAP_SEARCH_PRECISION)), MAP_SEARCH_PRECISION,
    'the zoom a search jumps to has to draw the grid it promised');
  assert.equal(placeSearchUrl('ab'), '', 'two characters is not a search');
  assert.equal(placeSearchUrl('   '), '');
  const url = new URL(placeSearchUrl('Kranjska  Gora'));
  assert.equal(`${url.origin}${url.pathname}`, 'https://photon.komoot.io/api/');
  assert.equal(url.searchParams.get('q'), 'Kranjska Gora', 'the query is tidied, not sent as typed');
  assert.equal(url.searchParams.get('limit'), '5');
});

test('a place result reads as a name, a kind where needed, and where it is', () => {
  const payload = {features: [
    {geometry: {type: 'Point', coordinates: [14.11, 46.37]}, properties: {name: 'Bled', country: 'Slovenia', osm_value: 'town'}},
    {geometry: {type: 'Point', coordinates: [13.84, 46.45]}, properties: {name: 'Kranjska Gora', country: 'Slovenia', osm_value: 'municipality'}},
    {geometry: {type: 'Point', coordinates: [13.78, 46.48]}, properties: {name: 'Kranjska Gora', country: 'Slovenia', osm_value: 'village'}},
    {geometry: {type: 'Point', coordinates: [14.11, 46.37]}, properties: {name: 'Bled', country: 'Slovenia', osm_value: 'town'}},
    {geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}},
    {geometry: {type: 'Point', coordinates: [200, 100]}, properties: {name: 'Off the world'}},
  ]};
  const results = placeSearchResults(payload);
  assert.deepEqual(results.map(result => result.label), [
    'Bled, Slovenia',
    'Kranjska Gora, municipality, Slovenia',
    'Kranjska Gora, village, Slovenia',
  ], 'a name alone reads the same for a municipality and a village, so the kind is added');
  assert.deepEqual([results[0].lat, results[0].lng], [46.37, 14.11], 'lat and lng, as the map wants them');
  assert.equal(placeSearchResults({features: []}).length, 0);
  assert.equal(placeSearchResults(null).length, 0, 'an answer that never came is not a crash');
  assert.equal(placeSearchResults({features: new Array(20).fill({geometry: {type: 'Point', coordinates: [1, 2]},
    properties: {name: 'Same'}})}).length, 1, 'the same place twice is offered once');
});

test('the picker searches by name and marks the place it found', async () => {
  const [script, html] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="placeSearch"/, 'the picker has a field to search in');
  assert.match(html, /id="placeResults"/, 'and somewhere to show what was found');
  assert.match(script, /zoom: mapZoomForGeohashPrecision\(MAP_SEARCH_PRECISION\)/, 'a search lands on the four-character grid');
  assert.match(script, /placeSearchUrl\(query\)/, 'the request is built by the model, not in the page');
  assert.match(script, /placeSearchResults\(payload\)/);
  assert.match(script, /MAP_SEARCH_SOURCE_ID/, 'the marker has a source of its own');
  assert.match(html, /photon\.komoot\.io/, 'the geocoder is credited on the page');
  assert.match(html, /openstreetmap\.org\/copyright/, 'and so is the map data');
});


test('an address in the composer counts as the word the paper prints', async () => {
  const link = 'https://example.com/' + 'a'.repeat(5000);
  const text = `see ${link}`;
  const match = linkMatches(text)[0];
  assert.ok(match, 'the model finds the address');
  assert.equal(linkRunIsComplete(match, text.length, {force: true}), true, 'a pasted address arrives whole');
  assert.equal(linkRunIsComplete(match, text.length), false, 'typed, the same address is still being written');
  assert.equal(linkRunIsComplete(match, text.length, {caret: text.length}), false, 'a caret at its end is still writing it');
  const withMore = `${text} and more`;
  const spaced = linkMatches(withMore)[0];
  assert.equal(linkRunIsComplete(spaced, withMore.length), true, 'anything after it means it is finished');
  assert.equal(linkRunIsComplete(spaced, withMore.length, {caret: spaced.index + 2}), false,
    'a caret inside it is still editing it');
  assert.equal(linkRunIsComplete(null, 10), false);

  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /else if \(node\.dataset\?\.href\) out \+= node\.dataset\.href;/,
    'a link chip stands for its address, never for the four characters it shows');
  assert.match(script, /chip\.className = 'sticky-editor__link'/);
  assert.match(script, /drawLinkChipsInEditor\(\);\n  const text = elements\.editor\.textContent/,
    'addresses are drawn before the note is measured');
  assert.match(script, /drawLinkChipsInEditor\(\{force: true\}\)/, 'a pasted address is converted whole');
  assert.match(script, /if \(editorPasting\)/, 'and the guards wait for that conversion instead of refusing it');
});


test('the shared picture is the finished board, in a preview format', async () => {
  const [css, script] = await Promise.all([
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  const card = /body\.is-card #stickyBoard \{[^}]*\}/u.exec(css);
  assert.ok(card, 'card mode styles the board');
  // The rails sit outside the board and the engraving below it: without the inset and without letting
  // the board paint past its own box, the picture is a board with its frame cut off.
  assert.match(card[0], /top: 34px/u, 'the board leaves room for what hangs outside it');
  assert.match(card[0], /overflow: visible/u, 'and is not clipped at its own edge');
  assert.match(script, /preview\.src = `\$\{url\}\.webp`/u, 'the preview asks for WebP');
});

test('a board is shared by the link that carries its picture', async () => {
  assert.equal(boardShareUrl(['u0qj7z0y']), 'https://pinstr.si/b/u0qj7z0y');
  assert.equal(boardShareUrl(['u0qj7z0y', 'u0qj7z0z']), 'https://pinstr.si/b/u0qj7z0y,u0qj7z0z',
    'a board of several cells lists them all');
  assert.equal(boardShareUrl(['u0qj7z0y'], 'https://example.org/'), 'https://example.org/b/u0qj7z0y',
    'and it can be built for another host, which is how the board is tested elsewhere');
  assert.equal(boardShareUrl([]), '', 'no cells, no board, no link');
  assert.equal(boardShareUrl([null, '']), '');
  assert.equal(boardShareUrl(null), '');

  const [script, page, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8')
  ]);
  assert.match(script, /boardShareUrl\(chosen\)/,
    'the page shares the board\u2019s own address rather than its own host');
  assert.match(page, /<button type="button" id="boardPlate"/,
    'the plate names the board, so the plate is what opens the share dialog');
  assert.ok(!/<div id="boardPlate"/.test(page), 'and it is no longer a div that cannot be pressed');
  assert.match(script, /closest\('\.sticky-note__pin, \.sticky-note__link, \.board-plate, \.sticky-note__author'\)/,
    'a control on the board is unreachable unless the pan guard names it');
  assert.doesNotMatch(css, /\.board-plate \{[^}]*pointer-events: none/,
    'and the plate must stop swallowing its own clicks');
  assert.match(script, /dataset\.pinstrCard = 'ready'/,
    'the page tells the desk when the board is whole, so no picture is taken half-painted');
  assert.match(css, /body\.is-card #stickyBoard \{ position: fixed; top: 34px;[^}]*aspect-ratio: 1 \/ 1;/u,
    'card mode is the board alone, with the rails and plate that hang outside it in the frame');
  assert.match(css, /width: min\(calc\(100vw - 68px\), calc\(100vh - 96px\)\);/u,
    'and the box is the smaller of the two ways to fit, so nothing of the board is cut off');
  // Everything the site paints around the board has to go, or it ends up inside a shared picture:
  // the menu affordance, the live footer, and the consent overlay, which dims the board as a backdrop.
  for (const hidden of ['#toggle', '#menu', 'footer\\.footer', '\\[data-live-footer\\]', '\\.satoshi-analytics-consent',
    '\\.site-help-trigger']) {
    assert.match(css, new RegExp(`body\\.is-card ${hidden}`), `${hidden} is not part of a board picture`);
  }
  assert.doesNotMatch(css, /body\.is-card \.board-plate \{ display: none/,
    'the plate stays in the picture: it is what names the board');
  assert.match(css, /html\.is-card, html\.is-card body \{ height: 100vh; min-height: 100vh; margin: 0; overflow: hidden; \}/,
    'the picture is the window, not the page length, so no part of the board is cut out of it');
});

test('a signature that is copied, not called back, is finished or sent again through the clipboard', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');

  // The page reaches for the new signing hand-over; the sign-in hand-over it is built beside is untouched.
  assert.match(script, /  adoptAmberSignature,\n  amberSignaturePending,\n  beginAmberSigning,/);
  assert.match(script, /beginAmberLogin\(\{copy: true\}\)/, 'the login clipboard route is unchanged');

  // A resumed page that lost the callback names the hand-off and offers the retry, rather than leaving
  // the reader in silence — the boot path's wording, but now on the no-reload path too. The retry is
  // the clipboard route, which is the one return path Android cannot drop between the two apps.
  const resume = script.slice(script.indexOf('async function resumeExternalFlow'),
    script.indexOf("window.addEventListener('hashchange'"));
  assert.match(resume, /amberSignaturePending\(\)/);
  assert.match(resume, /const automatic = await adoptParkedSignature\(\);/);
  assert.match(resume, /if \(automatic\?\.action === 'sign'\) \{[\s\S]{0,300}await completeAmberSignature\(automatic\);/,
    'a resume that read the signature finishes the round trip; the hand-over stays up until it does');
  assert.match(resume, /showAmberHandOver\(AMBER_HAND_OVER_WAITING_LINE\);/,
    'a resumed page waiting on the clipboard gets the one waiting-state sentence');
  assert.match(resume, /'The signer did not come back with a signature\. Your note is still here — pin it again\.'/);
  assert.match(resume, /showAmberHandOver\('Amber did not come back with a signature\. Tap the button to send the request again\.'\)/);
  // A resume that did not finish starts the poll, because the resume event may itself be a false
  // positive: Android fires none of these on the way back from the signer.
  assert.match(resume, /startAmberClipboardPoll\(\)/);

  // The button that always works dispatches on what is parked: a copied signature is adopted and the
  // paid note pinned, a callback that never returned is re-sent through the clipboard, and anything
  // else is the sign-in hand-over it has always been.
  const paste = script.slice(script.indexOf("elements.amberPaste.addEventListener('click'"),
    script.indexOf("elements.nostrConnectCopy.addEventListener"));
  assert.match(paste, /const parked = pendingAmberRequest\(\);/);
  assert.match(paste, /const answer = await adoptAmberSignature\(\);/);
  assert.match(paste, /await completeAmberSignature\(answer\);/);
  assert.match(paste, /beginAmberSigning\(parked\.template, parked\.context, \{copy: true\}\)/);
  assert.match(paste, /showLoginConfirmation\(answer\.session\)/, 'the sign-in hand-over still finishes a login');

  // Applying a copied signature tells the launching flow and publishes the note, exactly as the
  // callback path does, and only for the note the signature is for.
  const complete = script.slice(script.indexOf('async function completeAmberSignature'),
    script.indexOf('function showAmberHandOver'));
  assert.match(complete, /pending\?\.orderId !== answer\.context\?\.orderId/);
  assert.match(complete, /signalStickyFlow\('signed', \{orderId: pending\.orderId\}\)/);
  assert.match(complete, /await publishPinnedNote\(answer\.event,/,
    'the publish reports its own outcome back to the round trip');
});


test('pinning with Amber signs through the clipboard, not a callback that never arrives', async () => {
  const assert = (await import('node:assert/strict')).default;
  const { readFileSync } = await import('node:fs');
  const board = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const signer = readFileSync(new URL('../nostrSession.mjs', import.meta.url), 'utf8');

  // Amber's return through the callback URL is dropped between the two apps on Android: the
  // signature is made, Amber closes, and the page is never told. So the signing request goes out
  // without a callback, exactly as signing in does - Amber copies the signature instead.
  assert.match(
    signer,
    /if \(session\.method === 'amber'\) \{[\s\S]*?beginAmberSigning\(template, context, \{copy: true\}\)/,
    'the Amber branch of signNostrEvent must ask for the clipboard route',
  );
  // A callback request would leave the signature parked and unnoticed, which is the bug this covers.
  assert.doesNotMatch(signer, /beginAmberSigning\(template, context\);/, 'no callback route may be left on the signing path');
});

test('a pin that is waiting on Amber says so instead of returning in silence', async () => {
  const assert = (await import('node:assert/strict')).default;
  const { readFileSync } = await import('node:fs');
  const board = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');

  // In Amber both buttons close the app, so a page that says nothing is indistinguishable from a
  // page that is broken. The reader is told what they have and what to tap: one sentence, written
  // once, because this state is reached by more than one route.
  assert.match(board, /if \(!event\) \{\s*if \(amberSignaturePending\(\)\) \{/, 'a pending Amber signature must not return silently');
  assert.match(board, /showAmberHandOver\(AMBER_HAND_OVER_WAITING_LINE\);/, 'the reader must be told where the signature is waiting');
  assert.equal(AMBER_HAND_OVER_WAITING_LINE, 'Amber has it on your clipboard. Tap the button to hand it over.',
    'the waiting-state sentence is the reader\'s own words, verbatim');
});

test('the copied signature is polled for, because Android fires no return event', async () => {
  const [script, markup] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);

  // Polling, not "read it when the reader comes back": returning from the signer app fires no
  // visibilitychange and no focus event on Android, so waiting for that event waits forever.
  assert.match(script, /const AMBER_CLIPBOARD_POLL_MS = 500;/);
  assert.match(script, /const AMBER_CLIPBOARD_POLL_TIMEOUT_MS = 120000;/, 'snort gives up at 120 s, and so does this');
  assert.match(script, /setInterval\(\(\) => \{ pollAmberClipboard\(\)\.catch\(\(\) => \{\}\); \}, AMBER_CLIPBOARD_POLL_MS\)/);

  const poll = script.slice(script.indexOf('async function pollAmberClipboard'),
    script.indexOf('function startAmberClipboardPoll'));
  // Only while a copy-route signing request is parked (the park being spent is how the poll knows
  // there is nothing left to wait for).
  assert.match(poll, /if \(!amberSignaturePending\(\)\) \{ stopAmberClipboardPoll\(\); return; \}/);
  // The read is attempted on every tick. Focus may never gate it again: an installed Android window
  // reports no focus while the reader is looking straight at it, and gating meant that on such a
  // window not one read was made and the poll ran out in silence.
  assert.doesNotMatch(poll, /if \(!document\.hasFocus\(\)\) return;/,
    'the read must never be skipped for want of focus');
  assert.match(poll, /const focused = document\.hasFocus\(\);/,
    'focus is kept, but only as a hint for which sentence the reader gets');
  assert.match(poll, /const answer = await adoptParkedSignature\(\);/);
  // A refused read is "try again next tick": it is named on the page and the poll returns to tick on.
  assert.match(poll, /sayAmberRoundTrip\(amberReadFailure\(amberLastReadCode, focused\), true\);/);
  assert.match(poll, /if \(answer\?\.action !== 'sign'\) \{/);
  assert.match(poll, /stopAmberClipboardPoll\(\)/);
  // An abandoned page stops on its own and hands the reader the button that always works.
  assert.match(poll, /if \(Date\.now\(\) > amberClipboardDeadline\) \{/);
  assert.match(poll, /`Amber never handed a signature back\. Ask for the \$\{amberActionWords\(\)\} again, or use the paste button\.`/);
  // The interval and the timeout stay what the shipped clients use.
  assert.match(script, /AMBER_CLIPBOARD_POLL_MS = 500;/);

  // One read at a time, so the poll and the resume path cannot both accept the same signature and
  // both publish: the request is spent inside the read, so the loser finds nothing left to do.
  assert.match(script, /let amberAdoptRunning = false;/);
  assert.match(script, /if \(amberAdoptRunning\) return null;/);

  // Started where a copy-route request is made and where a reloaded page finds one still parked,
  // stopped when the request is spent, when the reader closes the step, and on the timeout.
  assert.match(script, /showAmberHandOver\(AMBER_HAND_OVER_WAITING_LINE\);[\s\S]{0,220}startAmberClipboardPoll\(\);/);
  assert.match(script, /beginAmberSigning\(parked\.template, parked\.context, \{copy: true\}\);[\s\S]{0,240}startAmberClipboardPoll\(\);/);
  assert.match(script, /if \(amberSignaturePending\(\)\) startAmberClipboardPoll\(\);/);
  assert.match(script, /stopAmberClipboardPoll\(\);\s+status\(elements\.amberCopyStatus, ''\);/);
  // The completion the poll reaches is the shared one, so a note's order is checked there - after the
  // gift route above it, which is what lets a signed reaction or zap be finished at all.
  assert.match(script, /stopAmberClipboardPoll\(\);[\s\S]{0,900}if \(!pending\?\.orderId\) \{[\s\S]{0,400}if \(pending\?\.orderId !== answer\.context\?\.orderId\)/);

  // The manual step in front of the reader still exists, and it names where the signature goes.
  assert.match(script, /elements\.amberCopyTitle\.textContent = 'Finish signing with Amber';/);
  assert.match(script, /elements\.amberPaste\.addEventListener\('click'/);
});

test('the hand-over dialog is one line and one button, and every message rides that line', async () => {
  const [markup, script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  // The dialog carries exactly three things: a short title, one line, and the button. The steps the
  // reader never read, and the paragraph that repeated them, are gone from the page itself.
  const dialog = markup.slice(markup.indexOf('<dialog id="amberCopyDialog"'),
    markup.indexOf('<dialog id="nostrConnectDialog"'));
  assert.match(dialog, /<h2 id="amberCopyTitle">Finish signing in with Amber<\/h2>/);
  assert.match(dialog,
    /<div id="amberCopyStatus" class="inline-status" role="status" aria-live="polite">Amber has it on your clipboard\. Tap the button to hand it over\.<\/div>/,
    "the dialog's one line carries the reader's own sentence verbatim");
  assert.match(dialog,
    /<button type="button" id="amberPaste" class="primary-action amber-paste"><i class="lni lni-clipboard" aria-hidden="true"><\/i><span>Paste what Amber copied<\/span><\/button>/,
    'the button is named verbatim');
  assert.equal(dialog.match(/id="amberCopyStatus"/g).length, 1, 'exactly one line element is in there');
  assert.doesNotMatch(dialog, /amber-steps|amberCopyNote|amber-note/, 'the step list and the paragraph are gone');
  assert.equal(dialog.match(/<(p|ol|li)\b/g), null, 'no prose is left in the dialog');

  // Nothing styles what is no longer there, and nothing in the page reaches for the removed note:
  // the one line is the only surface the round trip speaks through inside the dialog.
  assert.doesNotMatch(css, /\.amber-steps/);
  assert.doesNotMatch(css, /\.amber-note/);
  assert.doesNotMatch(script, /amberCopyNote/, 'no code writes a note element that no longer exists');
  assert.match(script, /amberCopyStatus: document\.getElementById\('amberCopyStatus'\),/);

  // The waiting-state sentence is the reader's own words, written down once in the model and read
  // at every call site that reaches that state. Three routes arrive there - the pin that sends the
  // request, the pin that loses its callback, and the page resumed before the callback lands - and
  // one of them used to carry a sentence of its own, which is how the wording the reader asked for
  // stopped reaching them.
  assert.equal(AMBER_HAND_OVER_WAITING_LINE, 'Amber has it on your clipboard. Tap the button to hand it over.');
  assert.equal((script.match(/showAmberHandOver\(AMBER_HAND_OVER_WAITING_LINE\)/g) || []).length, 4,
    'every waiting-state call site writes the one waiting-state sentence');

  // The copy that was removed does not come back through the page: neither the steps, nor the
  // explanation that said what the one line now says, nor the two-sentence waiting copy that the
  // dialog was handed at the moment it opened and the reader therefore never read.
  for (const gone of [
    /Approve the request in Amber\./,
    /Nothing is handed between the two apps/,
    /This page fills it in by itself/,
    /Approve the note in Amber, then come back to this page/,
    /Amber copies the signature instead of returning it/,
  ]) {
    assert.doesNotMatch(markup, gone, `removed copy is still in the page: ${gone}`);
    assert.doesNotMatch(script, gone, `removed copy is still in the script: ${gone}`);
  }

  // The one message that no longer rides that line: a pin that succeeded takes the dialog down
  // rather than leaving its last line for the reader to dismiss, so the sentence is written down for
  // a later tap to repeat instead of shown. Every other progress and failure sentence replaces that
  // line's text rather than adding to it.
  assert.match(script, /noteAmberHandOverOutcome\('Your note is pinned'\)/);
  for (const message of [
    /sayAmberRoundTrip\('Amber has copied a signature - reading it'\)/,
    /sayAmberRoundTrip\('Signature verified - pinning your note'\)/,
    /The browser would not let the page read the clipboard\./,
    /That signature did not match your note\./,
    /The server refused the pin: \$\{outcome\.message\}/,
    /Amber never handed a signature back\. Ask for the \$\{amberActionWords\(\)\} again, or use the paste button\./,
  ]) assert.match(script, message);

  // A refusal is still named in that one line - the read the browser turned down, and any error the
  // paste tap itself threw - and the same failure still reaches the board's own line, so closing the
  // dialog cannot hide it.
  const paste = script.slice(script.indexOf("elements.amberPaste.addEventListener('click'"),
    script.indexOf("elements.nostrConnectCopy.addEventListener"));
  assert.match(paste, /status\(elements\.amberCopyStatus, error\.message, true\);/,
    'a refused paste tap says so in the dialog line');
  assert.match(paste, /sayAmberRoundTrip\(spent\.message, spent\.error\);/);
  assert.match(script, /status\(elements\.amberCopyStatus, 'Reading what Amber copied\.\.\.'\)/);
  const complete = script.slice(script.indexOf('async function completeAmberSignature'),
    script.indexOf('function showAmberHandOver'));
  assert.match(complete, /notice\(mismatch\);/,
    'the mismatch survives the dialog being closed, on the board line');
  const publish = script.slice(script.indexOf('async function publishPinnedNote'), script.indexOf('function closeNoteMenu'));
  assert.match(publish, /status\(elements\.boardStatus, error\.message, true\);/,
    'the desk refusing the pin is on the board line as well as the dialog line');
});

test('a phone hands its NIP-46 invitation straight to Amber, and a reload keeps it', async () => {
  const [script, markup, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);

  // The phone gets a button that opens Amber on the same device; a desktop keeps the code, and the
  // link stays in a copyable field either way.
  assert.match(markup, /id="nostrConnectOpen"[^>]*hidden>/);
  assert.match(markup, /<span>Open Amber on this phone<\/span>/);
  assert.match(script, /elements\.nostrConnectOpen\.hidden = !onAndroid;/);
  assert.match(script, /elements\.nostrConnectOpen\.addEventListener\('click', \(\) => \{[\s\S]{0,400}location\.assign\(uri\)/);
  assert.match(script, /const uri = nostrConnectRequest\?\.uri \|\| elements\.nostrConnectUri\.textContent;/);
  assert.match(script, /const onAndroid = \/Android\/i\.test\(navigator\.userAgent \|\| ''\);/);
  assert.match(script, /drawQrCode\(elements\.nostrConnectQr, request\.uri\)/, 'the code is still drawn for a desktop');
  assert.match(markup, /<code id="nostrConnectUri"><\/code>/, 'the link stays in a copyable field');
  assert.match(css, /\.nostr-connect-open \{/);

  // A reload during enrolment keeps the invitation already handed to Amber; a window that expires is
  // not reused - the next attempt mints a new client key and secret.
  assert.match(script, /!afterTimeout && pendingNostrConnect\(\) \? resumeNostrConnect\(\) : beginNostrConnect\(\)/);
  assert.match(script, /pendingNostrConnect,\n  pendingAmberRequest,/);
  assert.match(script, /resumeAmber,\n  resumeNostrConnect,/);
  assert.match(script, /if \(!afterTimeout && elements\.nostrConnect\.open && \/did not answer\/\.test\(error\.message\)\) await attempt\(true\);/);

  // The fallback Amber documents for itself sits where the NIP-46 flow lives, and the copy action
  // names it too: one paste of the invitation, not a signature paste.
  assert.match(markup, /Add a new application<\/strong>, then <strong>Paste from clipboard<\/strong> \(or <strong>Scan a QR Code<\/strong>\)/);
  assert.match(markup, /That is this invitation link, pasted once — not a signature\./);
  assert.match(script, /'Link copied\. In Amber, Add a new application, then Paste from clipboard\.'/);

  // The invitation is reachable on the phone the hand-off is for, without disturbing the two ways in.
  assert.match(markup, /data-login="amber-pair"/);
  assert.equal(markup.match(/data-login="amber"/g).length, 1, 'the existing Amber button still stands alone');
  assert.match(script, /else if \(method === 'amber-pair'\) \{ await showNostrConnectDialog\(\); return; \}/);
  assert.match(script, /elements\.amberPair\.hidden = !\/Android\/i\.test\(navigator\.userAgent \|\| ''\);/);
  assert.match(css, /\.amber-pair \{/);
});

test('the hand-over control is in front of the reader the moment a copy request is parked', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');

  // The pin path mirrors the sign-in path: the dialog is surfaced in the same tap that sends the
  // request, *before* the signer takes over. A dialog surfaced only after signNostrEvent returns is
  // never seen on a device whose return fires no focus and no visibility event — the loop that
  // prompted this change showed the reader nothing at all while Amber held the signature.
  const pin = script.slice(script.indexOf('async function publishPinnedNote'), script.indexOf('function closeNoteMenu'));
  const surface = pin.indexOf('showAmberHandOver(');
  const handOff = pin.indexOf('await signNostrEvent(');
  assert.ok(surface !== -1 && handOff !== -1, 'the pin path still has both steps');
  assert.ok(surface < handOff, 'the hand-over is on screen before the request leaves for Amber');
  assert.match(pin, /if \(!resumedEvent && getNostrSession\(\)\?\.method === 'amber'\) \{\s+showAmberHandOver\(/,
    'only the Amber route opens the hand-over, and only for a live request');

  // The wording says what the reader has and what to tap, in that order: the signature is already on
  // the clipboard, and the one button hands it over. It is the same sentence every route to this
  // state writes, read from the one place it is written down.
  assert.match(pin, /showAmberHandOver\(AMBER_HAND_OVER_WAITING_LINE\)/,
    'the reader must be told the signature is on the clipboard and which button hands it over');
  assert.equal(AMBER_HAND_OVER_WAITING_LINE, 'Amber has it on your clipboard. Tap the button to hand it over.',
    'the waiting-state sentence is the reader\'s own words, verbatim');

  // Every way the poll starts surfaces the control first, so a reloaded page or a resume gets it too
  // without waiting for an event this device never fires.
  const start = script.slice(script.indexOf('function startAmberClipboardPoll'),
    script.indexOf('const signerReturn = await applySignerReturn();'));
  assert.match(start, /if \(!isGiftAction\(pendingAmberRequest\(\)\?\.context\?\.action\) && !elements\.amberDialog\.open\) \{\s+showAmberHandOver\(/,
    'the poll puts the button in front of a reader who is not already looking at it - and never over a gift, whose own dialog already says what to do');

  // The button reads inside the reader's own tap, and a tap that did not finish leaves the wait
  // running rather than stopping the clock on a request that is still parked.
  const paste = script.slice(script.indexOf("elements.amberPaste.addEventListener('click'"),
    script.indexOf("elements.nostrConnectCopy.addEventListener"));
  assert.match(paste, /if \(amberSignaturePending\(\)\) startAmberClipboardPoll\(\);/,
    'a refused tap read restarts the watch');
});

test('the clipboard round trip says on the page where it got to', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const complete = script.slice(script.indexOf('async function completeAmberSignature'),
    script.indexOf('function showAmberHandOver'));

  // Each stage of the round trip writes one line, and the last one stays up.
  assert.match(script, /sayAmberRoundTrip\('Amber has copied a signature - reading it'\)/,
    'the stage where a value is being read');
  assert.match(complete, /sayAmberRoundTrip\('Signature verified - pinning your note'\)/);
  // The round trip's last line is written down rather than shown: a pin that succeeded closes the
  // hand-over, so this sentence is what a later tap on that button repeats instead of a sign-in.
  assert.match(complete, /noteAmberHandOverOutcome\('Your note is pinned'\)/);

  // The poll ticks twice a second, so the same sentence must be written once, not re-announced.
  const say = script.slice(script.indexOf('function sayAmberRoundTrip'), script.indexOf('function amberReadFailure'));
  assert.match(say, /if \(elements\.amberCopyStatus\.textContent === message/);

  // Each failure point gets its own sentence, so a round trip that stops says where it stopped.
  assert.match(script, /The browser would not let the page read the clipboard\. Tap the button below to read what Amber copied\./,
    'a read the browser refused');
  assert.match(script, /This page cannot read the clipboard while it is in the background\. Tap the button below to read what Amber copied\./,
    'a read refused while the page does not claim focus');
  // A clipboard that is empty, or still holding what an earlier trip left there, is the middle of a
  // round trip rather than a step that failed: the signer's write lands after this page is told it is
  // back. Saying so in red is what made a working signature look broken.
  assert.match(script, /if \(code === 'empty' \|\| code === 'invalid'\) \{[\s\S]{0,800}?return '';/);
  assert.equal(/Nothing valid on the clipboard yet/.test(script), false, 'the false alarm is gone');
  assert.match(complete, /That signature did not match your note\. Your note is still here - pin it again\./,
    'a signature that belongs to another note');
  assert.match(complete, /The server refused the pin: \$\{outcome\.message\}/,
    "the desk's own words are what the reader gets when the publish is refused");
  assert.match(complete, /The pin did not finish\. Your note is still here - try again\./);

  // The publish is the last thing that can refuse, and it reports back to the round trip that is
  // watching, including the already-pinned answer a second Android context can produce.
  const publish = script.slice(script.indexOf('async function publishPinnedNote'), script.indexOf('function closeNoteMenu'));
  assert.match(publish, /report\?\.\(true, result\.message \|\| 'Your note is pinned\.'\);/);
  assert.match(publish, /report\?\.\(true, 'Your note is pinned\.'\);/);
  assert.match(publish, /report\?\.\(false, error\.message\);/);

  // The hand-over stays up through the publish so those lines can be read: it is never closed by the
  // poll, the resume path or the publish — the reader dismisses it when they are done with it.
  assert.doesNotMatch(complete, /amberDialog\.close\(\)/,
    'the last stage line must not be cleared while the reader is looking at it');
  const poll = script.slice(script.indexOf('async function pollAmberClipboard'),
    script.indexOf('function startAmberClipboardPoll'));
  assert.doesNotMatch(poll, /amberDialog\.close\(\)/,
    'the poll leaves the hand-over up so the publish stages are visible');
  // The 120 s timeout state is unchanged.
  assert.match(script, /AMBER_CLIPBOARD_POLL_TIMEOUT_MS = 120000;/);
});

test('the hand-over button answers a spent hand-over in its own flow, never as a sign-in', async () => {
  // A verified signature spends the request that carried it, so a reader who taps the button again
  // has nothing parked to branch on. Reading that as a sign-in told them to start a sign-in for a
  // note they had already signed - the flow the hand-over belonged to is what the tap must answer.
  const [script, model] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotesModel.mjs', import.meta.url), 'utf8'),
  ]);

  // (a) A signature handed over, then the button tapped: pinning wording, and never the sign-in's.
  const handedOver = spentAmberHandOver({parked: null, handed: {action: 'sign'}});
  assert.equal(handedOver.message, AMBER_HANDED_OVER_LINE);
  assert.equal(handedOver.error, false);
  assert.notEqual(handedOver.message, 'Nothing is waiting for Amber. Start the sign-in again.');

  // (c) The last thing that happened to the note was the desk refusing the pin: that refusal is
  // repeated, rather than "nothing left to pin" or a sign-in.
  const refused = spentAmberHandOver({parked: null, handed: {action: 'sign', message: 'The server refused the pin: not found', error: true}});
  assert.equal(refused.message, 'The server refused the pin: not found');
  assert.equal(refused.error, true);

  // (b) A spent sign-in is still a sign-in, so nothing answers for it here: the tap reaches the
  // sign-in route below this branch, which is the only place its wording lives.
  assert.equal(spentAmberHandOver({parked: null, handed: {action: 'login'}}), null);
  assert.equal(spentAmberHandOver({parked: null, handed: null}), null);

  // A request that is still parked keeps deciding the tap, as it always has: the value is handed
  // over, or the request is sent again, and the sign-in read stays where it was.
  assert.equal(spentAmberHandOver({parked: {action: 'sign', copy: true}, handed: {action: 'sign'}}), null);
  assert.equal(spentAmberHandOver({parked: {action: 'sign'}, handed: {action: 'sign'}}), null);
  assert.equal(spentAmberHandOver({parked: {action: 'login', copy: true}, handed: {action: 'login'}}), null);
  assert.equal(spentAmberHandOver({parked: {action: 'login'}, handed: {action: 'sign'}}), null);

  // The button asks what was parked - kept past the spend - and answers before it reads anything,
  // so the sign-in read is never reached for a hand-over that was already made.
  const paste = script.slice(script.indexOf("elements.amberPaste.addEventListener('click'"),
    script.indexOf("elements.nostrConnectCopy.addEventListener"));
  assert.match(paste, /const spent = spentAmberHandOver\(\{parked, handed: lastAmberHandOver\(\)\}\);/);
  assert.match(paste, /if \(spent\) \{\s+sayAmberRoundTrip\(spent\.message, spent\.error\);\s+return;\s+\}/);
  assert.ok(paste.indexOf('spentAmberHandOver({parked') < paste.indexOf('await adoptAmberClipboard()'),
    'the sign-in read stays on the sign-in route, below the hand-over that was already made');
  assert.match(paste, /const answer = await adoptAmberClipboard\(\);/);

  // The pinning line is shared with the hand-over itself, so the two can never drift apart, and the
  // page puts everything the hand-over ends on through the helper that remembers it.
  assert.match(model, /export const AMBER_HANDED_OVER_LINE = 'This signature was already handed over - there is nothing left to pin\.';/);
  assert.match(script, /sayAmberOutcome\(AMBER_HANDED_OVER_LINE\);/);
  assert.match(script, /function sayAmberOutcome\(message, error = false\) \{\s+sayAmberRoundTrip\(message, error\);\s+noteAmberHandOverOutcome\(message, error\);/);
  assert.match(script, /sayAmberOutcome\(`The server refused the pin: \$\{outcome\.message\}`, true\);/);
});

// ------------------------------------------------------------ pinned pictures
// A picture is pinned as an address, not as pixels: the desk stores the print and the note
// carries one tag pointing at it. Everything below holds that seam — the guard before the
// bytes leave, the six grades and their mockups, the exact tag that is emitted, the print's
// footprint on the board, and the fact that a picture note expires like any other.
const PICTURE_URL = `https://pinstr.si/i/${'ab12cd34'.repeat(8)}.webp`;

test('a picture over seven megabytes is refused here, before a byte is sent', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.equal(STICKY_IMAGE_MAX_BYTES, 7 * 1024 * 1024);
  assert.equal(stickyImageIssue(STICKY_IMAGE_MAX_BYTES), '', 'exactly the limit is still allowed');
  assert.equal(stickyImageIssue(1024), '');
  const refusal = stickyImageIssue(STICKY_IMAGE_MAX_BYTES + 1);
  assert.match(refusal, /7 MB/, 'the refusal names the limit it broke');
  assert.match(stickyImageIssue(Math.round(8.5 * 1024 * 1024)), /8\.5 MB/, 'and what the picture actually weighs');
  assert.match(stickyImageIssue(Math.round(20.5 * 1024 * 1024)), /20\.5 MB/);
  assert.match(stickyImageIssue(0), /empty/i);
  assert.match(stickyImageIssue('nonsense'), /empty/i);
  // The guard is measured on the file's own size, at the moment it is chosen and again in
  // front of the upload, so an oversized picture never leaves the device and never costs the
  // reader any of their uplink while an order waits.
  const choose = script.slice(script.indexOf('function chooseNoteImage('), script.indexOf('async function uploadPinnedImage('));
  assert.match(choose, /const problem = stickyImageIssue\(file\.size\);/);
  assert.match(choose, /if \(problem\) \{\s+setImageStatus\(problem, true\);/);
  const upload = script.slice(script.indexOf('async function uploadPinnedImage('), script.indexOf('async function ensureReadySigner('));
  assert.match(upload, /const problem = stickyImageIssue\(file\.size\);\s+if \(problem\) throw new Error\(problem\);/,
    'the same guard runs again before the bytes go');
  // The body is the picture itself — raw bytes, not a form.
  assert.match(upload, /body: file,/);
  assert.doesNotMatch(script, /FormData/);
});

test('the composer offers the five vintage looks, each with the id the desk is told', () => {
  assert.equal(STICKY_IMAGE_GRADES.length, 5);
  assert.deepEqual(STICKY_IMAGE_GRADES.map(grade => grade.id), ['sepia', 'faded', 'grain', 'bw', 'cool']);
  // Nothing pinnable is ungraded. A print is a treated picture, so "as it was taken" is not a
  // look: it is not offered here, `stickyImageGrade` does not know the id, and the desk refuses
  // it - three separate places, because a look a reader can pick but the desk refuses would be
  // a note that cannot be placed.
  assert.equal(stickyImageGrade('original'), null);
  assert.ok(STICKY_IMAGE_GRADES.every(grade => grade.filter && grade.filter !== 'none'),
    'every look changes the picture');
  // And the default is one of them, so a picture note can never be ordered with no look at all.
  assert.equal(STICKY_IMAGE_DEFAULT_GRADE, 'sepia');
  assert.ok(STICKY_IMAGE_GRADES.some(grade => grade.id === STICKY_IMAGE_DEFAULT_GRADE));
  for (const grade of STICKY_IMAGE_GRADES) {
    assert.ok(grade.label, `${grade.id} has a name a reader can read`);
    assert.equal(stickyImageGrade(grade.id), grade);
  }
  assert.equal(stickyImageGrade('nonsense'), null);
  assert.equal(stickyImageGrade(''), null);
  // Each grade is a look of its own: five distinct filters, so the previews a reader picks
  // between visibly differ rather than being five names for one picture.
  assert.equal(new Set(STICKY_IMAGE_GRADES.map(grade => grade.filter)).size, 5,
    'no two grades share a filter');
  assert.equal(new Set(STICKY_IMAGE_GRADES.map(grade => grade.label)).size, 5);
});

test('the looks are drawn in the browser, on the reader’s own picture once they choose one', async () => {
  const [script, html] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
  ]);
  // The list the desk is told about is the list the previews are drawn from, so a look the
  // reader picked cannot be a look the desk does not know.
  assert.match(script, /elements\.noteImageGradeList\.replaceChildren\(\.\.\.STICKY_IMAGE_GRADES\.map\(/);
  assert.match(script, /paintGradePreview\(canvas, grade\)/);
  assert.match(script, /if \(grade\.filter && grade\.filter !== 'none'\) context\.filter = grade\.filter;/);
  const previews = script.slice(script.indexOf('function paintSamplePicture('), script.indexOf('async function uploadPinnedImage('));
  // The reader's own picture carries every look, drawn to fill the mat as the print is; the
  // sample painted in code is only what stands in before a picture is chosen, so the list still
  // works offline and no file is read before there is one to read.
  assert.match(previews, /if \(pickedPreview\) drawCovered\(context, pickedPreview, size\);[\s\S]*?else paintSamplePicture\(context, size\);/);
  assert.match(previews, /function drawCovered\(context, source, size\)/);
  assert.match(previews, /async function loadPickedPreview\(file\) \{/);
  assert.match(previews, /pickedPreview = image;/);
  assert.match(previews, /URL\.revokeObjectURL\(pickedPreviewUrl\)/, 'the chosen file is let go with its note');
  // Grain lands in the same place on every repaint, or the same look would shimmer between two
  // views of it, and nothing here is fetched.
  assert.match(previews, /function speckle\(index\)/);
  assert.doesNotMatch(previews, /Math\.random\(/);
  assert.doesNotMatch(previews, /fetch\(/);
  // A file just chosen takes up its preview, and a file let go puts the sample back.
  assert.match(script, /loadPickedPreview\(file\)\.then\(repaintImagePreviews\);/);
  assert.match(script, /loadPickedPreview\(null\)\.then\(repaintImagePreviews\);/);
  assert.match(script, /elements\.noteImageGradesHint\.textContent = pickedPreview/);
  // A file input is what a reader chooses the picture with, and the panel is what the kind
  // toggle reveals.
  assert.match(html, /<input id="noteImageFile" type="file" accept="image\/\*,\.gif"/);
  assert.match(html, /<div id="noteImage" class="note-image" hidden>/);
  assert.match(html, /<div class="note-kind" id="noteKind" role="group" aria-label="What to pin">/);
  assert.match(html, /data-note-kind="image"/);
});

test('a GIF is a picture here, and it is promised to keep moving', async () => {
  // A GIF is accepted by the desk's magic-byte sniffer like any other picture, and the print
  // keeps its motion: the desk stores the animation (as WebP), so what the board draws is not a
  // still of the one frame this page happened to preview. The page says so rather than leaving
  // the reader to find out.
  const html = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  assert.match(html, /Choose a picture or a GIF/);
  assert.match(html, /A GIF keeps moving, with the look you pick applied to every frame\./);
  assert.doesNotMatch(html, /Mockup/, 'nothing calls a preview a mockup of someone else’s picture');
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // A chosen GIF is decoded the same way as any picture: the browser animates it wherever it is
  // shown, and the canvas draws the frame it is on.
  assert.match(script, /image\.decode \? image\.decode\(\)/);
});

test('a picture note carries its address in exactly one image tag, and leaves every other tag alone', async () => {
  const pictured = makeStickyTemplate({content: 'A morning in the hills', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH, image: PICTURE_URL});
  assert.deepEqual(pictured.tags.find(tag => tag[0] === STICKY_IMAGE_TAG), [STICKY_IMAGE_TAG, PICTURE_URL]);
  assert.equal(pictured.tags.filter(tag => tag[0] === STICKY_IMAGE_TAG).length, 1);
  const parsed = parseStickyEvent({...pictured, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(parsed.image, PICTURE_URL);
  assert.equal(parsed.content, 'A morning in the hills', 'the words are still the note’s own text');
  // One tag added, and every tag a written note carries left exactly as it was: the picture
  // must not disturb the cells, the reach, the expiry, the mention tags or the commitment.
  const written = makeStickyTemplate({content: 'A morning in the hills', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH});
  assert.deepEqual(pictured.tags.filter(tag => !['image', 'alt'].includes(tag[0])),
    written.tags.filter(tag => tag[0] !== 'alt'));
  assert.equal(written.tags.some(tag => tag[0] === STICKY_IMAGE_TAG), false, 'a written note gains nothing');
  assert.equal(parseStickyEvent({...written, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)}).image, '');
  // The one deliberate difference is the alt line: a picture note may have no words for another
  // client to read, so that line names the picture there instead of them.
  assert.equal(pictured.tags.find(tag => tag[0] === 'alt')[1], 'A picture pinned on this board');
  assert.equal(written.tags.find(tag => tag[0] === 'alt')[1], 'A Pinstr note pinned on satoshi.si');
  // The paid commitment is text, colour and font; the picture is outside it, so a picture
  // note costs and fingerprints exactly what the same words would.
  assert.equal(await stickyContentHash('A morning in the hills', 'yellow', 'typewriter'),
    await stickyContentHash(parsed.content, parsed.color, parsed.font));
});

test('the hand-over comes down the moment a pin succeeds, in whichever context did it', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // One helper retires it, and it does both halves: the dialog that was asking for a signature
  // closes, and the clipboard poll behind it stops, so no page goes on reading the clipboard twice a
  // second to watch for a signature it already has.
  const helper = script.slice(script.indexOf('function retireAmberHandOver()'),
    script.indexOf('// How a copy-route signature gets home'));
  assert.match(helper, /stopAmberClipboardPoll\(\)/);
  assert.match(helper, /if \(elements\.amberDialog\.open\) elements\.amberDialog\.close\(\)/);

  // Six moments retire it: four ways a pin is known to be done, and both gift routes - the one a live
  // page takes and the one a reloaded page takes - because each has to take it down before opening the
  // dialog that carries the reaction or the invoice.
  const calls = script.match(/retireAmberHandOver\(\);/g) || [];
  assert.equal(calls.length, 6, 'the callers, one per way a pin is known to be done, plus both gift routes');

  // (1) the page that published it,
  const publishSignal = script.indexOf("signalStickyFlow('published', {orderId, event,");
  assert.ok(script.slice(publishSignal, publishSignal + 400).includes('retireAmberHandOver();'),
    'the page that published keeps its dialog');
  // (2) the desk answering that the note was already pinned, which is the same news,
  const alreadyPinned = script.indexOf("if (resumedEvent && ['already_pinned', 'already_published']");
  assert.ok(script.slice(alreadyPinned, alreadyPinned + 400).includes('retireAmberHandOver();'),
    'an already-pinned answer keeps its dialog');
  // (3) the resume that finished the round trip here — and it REMEMBERS what it said, so the dialog
  // repeating the sentence on a later tap is the same sentence rather than a silence,
  const resumed = script.slice(script.indexOf('async function completeAmberSignature'),
    script.indexOf('function showAmberHandOver'));
  assert.match(resumed, /if \(outcome\?\.published\) \{[\s\S]*noteAmberHandOverOutcome\('Your note is pinned'\);[\s\S]*retireAmberHandOver\(\);/,
    'a successful round trip must retire the hand-over and still remember its last line');
  // and (4) the other context's own signal arriving on this page. This is the case that leaves a
  // dialog standing over a reader whose note is already on the board: the tab Amber opened finished
  // the pin, this page never hears about it any other way.
  const storageListener = script.indexOf("window.addEventListener('storage', event => {");
  const listener = script.slice(storageListener, storageListener + 3000);
  const retired = listener.indexOf('retireAmberHandOver();');
  assert.ok(retired > -1, 'the other context\'s signal must retire this page\'s dialog');
  assert.ok(retired < listener.indexOf('const sticky = parseStickyEvent(flow.event);'),
    'and retire it before drawing the note, not after');
});

test('a picture note carries its own print as its content, and the board reads that as no words', async () => {
  // What the board writes when it publishes a picture: the print's own address as the content, so
  // any other Nostr client shows the picture instead of an empty note, and the same address in the
  // picture tag. The desk checks the two against the print it stored for that order.
  const digest = 'c'.repeat(64);
  const address = `https://pinstr.si/i/${digest}.webp`;
  const pictured = makeStickyTemplate({content: address, color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, image: address});
  const event = {...pictured, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)};
  // On this board that address is not words: a print is the picture and a signature with nothing
  // printed on it. It parses with no words, so the paper, the menu and the ledger draw none for it.
  assert.equal(parseStickyEvent(event).content, '', 'a print has no words in its content');
  assert.equal(parseStickyEvent(event).image, address, 'and it still names its picture');
  // The desk hands back the address its own base URL makes and the board rewrites it to its own
  // origin, so the same print arrives spelled two ways: either spelling is still not words.
  const otherOrigin = {...pictured, content: `https://satoshi.si/i/${digest}.webp`, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)};
  assert.equal(parseStickyEvent(otherOrigin).content, '', 'the same print under the other origin');
  assert.equal(parseStickyEvent(otherOrigin).image, address, 'and it names the picture either way');
  // Words beside a picture are still words, and a note with no picture is never silenced: the rule
  // needs a picture AND an address, so an ordinary note's words cannot be mistaken for one.
  const mixed = {...pictured, content: 'A morning in the hills'};
  assert.equal(parseStickyEvent({...mixed, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)}).content, 'A morning in the hills');
  const written = makeStickyTemplate({content: 'A morning in the hills', color: 'yellow', x: .5, y: .5,
    rotation: 0, geohash: TEST_GEOHASH});
  assert.equal(parseStickyEvent({...written, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)}).content,
    'A morning in the hills', 'a written note keeps every word it has');
  const linked = {...written, content: `https://pinstr.si/i/${digest}.webp`};
  assert.equal(parseStickyEvent({...linked, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)}).content,
    `https://pinstr.si/i/${digest}.webp`, 'an address with no picture to name stays text');
  // And the publish path is where the address is put in: pinned to the call, not to a memory of it.
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /content: pictureAddress \|\| pending\.content/,
    'a picture note publishes with its print address as its content');
});

test('a pinned picture needs no words, and blank paper is still refused', async () => {
  // The picture is the note: placed with no words at all it is still a note on the way out and
  // on the way back in, and the desk allows the same emptiness against the order that already
  // holds the stored print (see the desk's own suite).
  const wordless = makeStickyTemplate({content: '   ', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, image: PICTURE_URL});
  assert.equal(wordless.content, '', 'nothing is written on the paper');
  const readBack = parseStickyEvent({...wordless, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(readBack.image, PICTURE_URL, 'the picture is what the reader gets');
  assert.equal(readBack.content, '');
  // A wordless note commits to its colour and its font alone, and that commitment is stable —
  // it is what the board pays for and what the desk recomputes from the published event.
  const commitment = await stickyContentHash('', 'yellow', 'typewriter', globalThis.crypto, {picture: true});
  assert.match(commitment, /^[0-9a-f]{64}$/);
  assert.equal(await stickyContentHash(wordless.content, 'yellow', 'typewriter', globalThis.crypto, {picture: true}), commitment,
    'the same nothing hashes the same every time');
  assert.notEqual(await stickyContentHash('', 'blue', 'typewriter', globalThis.crypto, {picture: true}), commitment,
    'and the colour is part of what is paid for');
  await assert.rejects(() => stickyContentHash('', 'yellow', 'typewriter'), /incomplete/i,
    'a written note still has to say something');
  // Blank paper: no words and no picture is refused on the way out and dropped on the way in,
  // and an address the print host does not serve is not a picture either.
  assert.throws(() => makeStickyTemplate({content: '  ', color: 'yellow', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH}), /Write something/);
  const wordlessEvent = {...wordless, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)};
  assert.equal(parseStickyEvent({...wordlessEvent,
    tags: wordless.tags.filter(tag => tag[0] !== STICKY_IMAGE_TAG)}), null,
  'a note with neither words nor a picture is not a note');
  assert.equal(parseStickyEvent({...wordlessEvent,
    tags: wordless.tags.map(tag => (tag[0] === STICKY_IMAGE_TAG ? [STICKY_IMAGE_TAG, 'https://example.com/i/abc.webp'] : tag))}), null,
  'and a picture from somewhere else is not one this board draws');
});

test('a paid picture note can still be placed, words or none', async () => {
  // The placement was gated on the note having words, and a picture note has none: the
  // composer closed on "Place your note", no placement appeared, and the reader had nothing
  // to pin - one order paid for, one print stored, and no publish request ever made. Both
  // gates now ask for words OR the picture the desk stored, which is the whole note.
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /if \(pending\?\.action === 'pin' && pending\?\.status === 'paid' && \(pending\?\.content \|\| pending\?\.image\) && pendingBelongsToSession\(\)\)/);
  assert.match(script, /if \(pending\?\.action !== 'pin' \|\| \(!pending\?\.content && !pending\?\.image\) \|\| pending\.status !== 'paid'\) return;/);
  // No gate on a note's words is left anywhere that decides whether a note may be placed.
  const placement = script.slice(script.indexOf('function syncPlacementWithSession()'), script.indexOf('function currentPlacement()'));
  // Nothing left in there may decide on the words ALONE: an empty content is only ever
  // allowed through as the first half of "no words and no picture".
  assert.doesNotMatch(placement, /!pending\?\.content(?!\s*&&)/, 'words alone must not decide whether a note can be placed');
  // And the picture rides in the draft with everything else, so a reload between paying and
  // pinning cannot lose it.
  assert.match(script, /image: noteKind === 'image' \? String\(pending\?\.image \|\| ''\) : ''/);
});

test('the composer offers a note or a picture, and asks only a note for words', async () => {
  // The two kinds are named what they are, and the words field is offered to a written note only:
  // a picture note has no words on it, so a text box (or a placeholder asking for them) is an
  // invitation to type something the print would never show anyone.
  const html = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  assert.match(html, /data-note-kind="text"[^>]*><i[^>]*><\/i><span>Note<\/span>/);
  assert.match(html, /data-note-kind="image"[^>]*><i[^>]*><\/i><span>Picture<\/span>/);
  assert.doesNotMatch(html, /Written note|Pinned picture/, 'the kinds are called what they are');
  assert.doesNotMatch(html, /words are optional/, 'the picture is not told it may have words');
  assert.match(html, /<div class="composer-count" id="composerCount">/, 'the counter can hide with the paper it counts for');

  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /if \(elements\.draftNote\) elements\.draftNote\.hidden = noteKind === 'image'/);
  assert.match(script, /if \(elements\.composerCount\) elements\.composerCount\.hidden = noteKind === 'image'/);
  assert.doesNotMatch(script, /if you like/, 'and no placeholder asks for them either');
  assert.match(script, /composerTitle\.textContent = noteKind === 'image' \? 'Pin a picture' : 'Pin a note'/, 'the heading follows the kind');
  // Words left in the paper by a written draft are not part of a picture note, and its length
  // cannot make a picture note too full: the paper is not on screen for it at all.
  assert.match(script, /const content = pictureComing \? '' : normaliseStickyText\(editorContent\(\)\)/);
  assert.match(script, /const mentions = pictureComing \? \[\] : editorMentions\(\)/);
  assert.match(script, /if \(!pictureComing && editorOverflows\(\)\)/);
});

test('an address that is not this site’s own print is refused on the way out and dropped on the way in', () => {
  assert.equal(stickyImageUrl(PICTURE_URL), PICTURE_URL);
  assert.equal(stickyImageUrl(`https://www.satoshi.si/i/${'ab12cd34'.repeat(8)}.webp`), PICTURE_URL);
  for (const hostile of ['https://evil.example/i/x.webp', 'http://satoshi.si/i/x.webp',
    'https://satoshi.si/i/x.png', 'javascript:alert(1)', 'data:image/webp;base64,AAAA', '']) {
    assert.equal(stickyImageUrl(hostile), '', `${hostile} is not a print this board will draw`);
  }
  assert.throws(() => makeStickyTemplate({content: 'hi', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH,
    image: 'https://evil.example/i/x.webp'}), /pinstr\.si/);
  // A note arriving from a relay is read through the same door, so a hostile relay cannot make
  // this board fetch a picture from somewhere else.
  const template = makeStickyTemplate({content: 'hi', color: 'yellow', x: .5, y: .5, rotation: 0, geohash: TEST_GEOHASH, image: PICTURE_URL});
  const hostile = {...template, tags: template.tags.map(tag => (tag[0] === STICKY_IMAGE_TAG ? [STICKY_IMAGE_TAG, 'https://evil.example/i/x.webp'] : tag))};
  assert.equal(parseStickyEvent({...hostile, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)}).image, '');
});

test('a picture note is drawn as an instant print in the note’s own footprint', async () => {
  const [script, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  // Same size as a note: the print keeps the note's own width and square, because the print
  // rule adds paper and a border and no size at all.
  assert.match(css, /\.sticky-note \{[^}]*width: 220px; aspect-ratio: 1;/);
  const printRule = css.match(/\.sticky-note--print \{([^}]*)\}/)[1];
  assert.match(printRule, /--note: #fdfcf7/, 'the print is white paper, whatever colour the note is');
  assert.match(printRule, /background: var\(--note\)/);
  assert.doesNotMatch(printRule, /(?:^|[;\s])(?:width|height|aspect-ratio):/,
    'the print brings no footprint of its own, so it is the note’s');
  // The border geometry: an even side border and a deeper band at the foot, which is where the
  // note's own signature sits — nothing is printed on a print but the picture.
  const padding = /padding: (\d+)px (\d+)px (\d+)px/.exec(printRule);
  assert.ok(padding, 'the print is padded, which is the white border');
  assert.equal(padding[1], padding[2], 'the sides and the top are the same border');
  assert.ok(Number(padding[3]) > Number(padding[1]), 'the foot is the deeper band of an instant print');
  assert.match(css, /\.sticky-note__print-image \{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: cover/);
  // The picture is laid over the mat rather than laid out in it: as a percentage of a parent
  // sized by aspect-ratio the browser measured 157px where the mat leaves 148px, so the picture
  // ran into the band the signature sits in. The mat is one measure written twice — the padding
  // and the inset — and this pins the two together.
  const inset = /\.sticky-note--print \.sticky-note__print \{[^}]*inset: (\d+)px (\d+)px (\d+)px/.exec(css);
  assert.ok(inset, 'the picture is inset over the mat');
  assert.deepEqual([inset[1], inset[2], inset[3]], [padding[1], padding[2], padding[3]],
    'the same measure as the padding, or the mat is not even');
  assert.match(css, /\.sticky-note--print \.sticky-note__print \{[^}]*width: auto; height: auto;/,
    'and it brings no size of its own to the note’s box');
  assert.doesNotMatch(css, /sticky-note__print-caption/, 'a print carries no words of its own');
  assert.match(css, /\.sticky-note--print \.sticky-note__author \{[^}]*bottom: \d+px/,
    'the note’s signature sits in the print’s foot band, exactly as it does on a written note');
  // Drawn by the one funnel every note is drawn by, and appended to the note itself, so a print
  // sits in the board's own sticky layer and pans, zooms and expires with the paper beside it.
  assert.match(script, /note\.classList\.toggle\('sticky-note--print', Boolean\(picture\)\)/);
  assert.match(script, /const print = document\.createElement\('figure'\);\s+print\.className = 'sticky-note__print';/);
  assert.match(script, /photo\.className = 'sticky-note__print-image';/);
  assert.match(script, /print\.append\(photo\);\s+note\.appendChild\(print\);/,
    'the paper holds the picture and nothing else');
  assert.match(script, /\} else \{\s+note\.appendChild\(text\);/,
    'only a written note has its words attached — a print never does');
  assert.doesNotMatch(script, /print-caption/, 'and nothing prints the note’s words on it');
  assert.match(script, /labelNoteAuthor\(author, sticky\);/, 'a print is signed like every other note');
  // and it is the note that carries the picture, so the print is inside the note's own box
  assert.match(script, /elements\.canvas\.insertBefore\(note, nextNewer \|\| placingNote \|\| null\)/);
  // A print is the same note on the same board, so it must not skip the placement or the filters
  const render = script.slice(script.indexOf('function renderNote('), script.indexOf('function dropExpiredNotes('));
  assert.match(render, /noteAtPlacement\(note, sticky\);/);
  assert.match(render, /if \(!temporary\) applyNoteFilters\(\);/);
});

test('a picture note tells the desk which picture it is', async () => {
  // A wordless note commits to the paper and the font alone, so the file's own digest is the only
  // thing that tells two of them apart. It is the digest of the bytes the reader picked, nothing
  // else — the desk can never check it against the stored print, which is re-encoded on upload.
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const one = await stickyPictureDigest(new Blob([bytes]));
  assert.match(one, /^[0-9a-f]{64}$/);
  assert.equal(await stickyPictureDigest(new Blob([bytes])), one, 'the same file hashes the same');
  assert.notEqual(await stickyPictureDigest(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 1, 2, 3, 4])])), one,
    'another file does not');
  assert.equal(one, createHash('sha256').update(bytes).digest('hex'), 'and it is the file itself, digest for digest');

  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // Sent with the order, and only for a picture.
  assert.match(script, /const pictureHash = pictureComing && pickedImage \? await stickyPictureDigest\(pickedImage\) : ''/);
  assert.match(script, /\.\.\.\(pictureHash \? \{pictureHash\} : \{\}\)/);
  // The desk's own record that it stored a print is `imageHash`, and it is the one thing that lets
  // a wordless note publish at all: the board must never send that field, or a client could hand
  // itself a print it never uploaded. This is the guard against that.
  assert.doesNotMatch(script, /imageHash/, 'the board never sets the desk’s own record of a stored print');
  assert.doesNotMatch(await readFile(new URL('../stickyNotesModel.mjs', import.meta.url), 'utf8'), /imageHash/,
    'and nothing in the model names it either');
});

test('an expired picture note is not rendered, exactly like an expired written one', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const template = makeStickyTemplate({content: 'Gone by tomorrow', color: 'blue', x: .5, y: .5, rotation: 0,
    geohash: TEST_GEOHASH, image: PICTURE_URL, liveliness: '1d'});
  const parsed = parseStickyEvent({...template, id: 'c'.repeat(64), pubkey: 'd'.repeat(64)});
  assert.equal(parsed.image, PICTURE_URL, 'the picture survives the round trip');
  assert.equal(isStickyExpired(parsed, template.created_at), false);
  assert.equal(isStickyExpired(parsed, template.created_at + 86400), true, 'its own moment is the end of it');
  assert.equal(isStickyExpired(parsed, template.created_at + 2 * 86400), true);
  // The expiry check is in front of the picture: the same one funnel every render passes
  // through drops an expired note before a print is ever built.
  const render = script.slice(script.indexOf('function renderNote('), script.indexOf('function dropExpiredNotes('));
  assert.match(render, /if \(isStickyExpired\(sticky\)\) return null;/);
  assert.ok(render.indexOf('if (isStickyExpired(sticky)) return null;') < render.indexOf("note.classList.toggle('sticky-note--print'"),
    'an expired note never reaches the line that builds the print');
  // A note that crosses its moment while the page is open is taken off the board too.
  assert.match(script, /function dropExpiredNotes\(\)/);
  assert.match(script, /if \(dropExpiredNotes\(\)\) applyNoteFilters\(\)/);
  assert.match(script, /if \(!sticky \|\| isStickyExpired\(sticky\) \|\| !noteBelongsToBoard\(sticky\)\) return;/);
});


// ------------------------------------------- posting with work instead of sats
test('mining is offered to a key with a name, and never to a throwaway', () => {
  // A name on any domain, not only this board's own: the desk cannot resolve somebody
  // else's domain, and does not try — the work on the id is what it enforces, so offering
  // the route is a presentation rule while accepting it is a checked one.
  const ours = stickyPowOffer({method: 'extension', nip05: 'one@satoshi.si', bits: 25});
  assert.equal(ours.offered, true);
  assert.equal(ours.bits, 25);
  assert.equal(ours.name, 'one@satoshi.si');

  const theirs = stickyPowOffer({method: 'bunker', nip05: 'glavca@example.com', bits: 25});
  assert.equal(theirs.offered, true, 'a name on another domain is a name');

  // A NIP-05 that arrives as a URL, or as the `_@` wildcard, is still the same name.
  assert.equal(stickyPowOffer({method: 'extension', nip05: 'https://example.com', bits: 25}).offered, false);
  assert.equal(stickyPowOffer({method: 'extension', nip05: '', bits: 25}).reason, 'no_name');
  assert.equal(stickyPowOffer({method: 'extension', bits: 25}).reason, 'no_name');

  // The throwaway tier pays per note, flat, and that is the whole of it.
  const anon = stickyPowOffer({method: 'anonymous', nip05: 'one@satoshi.si', bits: 25});
  assert.equal(anon.offered, false);
  assert.equal(anon.reason, 'anonymous');
  assert.match(anon.sentence, /pays per note/);

  // Nothing is offered when the desk has published no difficulty: the board must never
  // invent one, because a board offering 20 bits to a desk checking 25 mines for ever.
  for (const bits of [null, undefined, 0, -1, 65, 25.5, '25']) {
    const offer = stickyPowOffer({method: 'extension', nip05: 'one@satoshi.si', bits});
    assert.equal(offer.offered, false, `bits ${JSON.stringify(bits)} is not a difficulty`);
    assert.equal(offer.reason, 'no_difficulty');
  }
});

test('the missing-name mining message is short and rules out one-time identities', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(page, /Mining requires a NIP-05 name\. Anonymous one-time keys cannot mine\. Add a name to your Nostr profile or pay in sats\./);
  assert.doesNotMatch(page, /Mining is free for keys with a NIP-05 name, and none was found/);
});

test('the difficulty is read from the desk, and only from the desk', () => {
  assert.equal(stickyPowDifficulty({pow: {bits: 25}}), 25);
  assert.equal(stickyPowDifficulty({pow: {bits: 1}}), 1);
  assert.equal(stickyPowDifficulty({pow: {bits: 64}}), 64);
  for (const config of [null, undefined, {}, {pow: {}}, {pow: {bits: 0}}, {pow: {bits: 65}},
    {pow: {bits: '25'}}, {pow: {bits: null}}, {bits: 25}]) {
    assert.equal(stickyPowDifficulty(config), null, JSON.stringify(config));
  }
});

test('what the reader is told about mining', () => {
  // The cost in tries, and that it is their own device's time rather than sats.
  const sentence = stickyPowSentence(25);
  assert.match(sentence, /34 million hashes/);
  assert.match(sentence, /nothing to pay/);
  assert.match(stickyPowSentence(20), /1 million/);
  assert.match(stickyPowSentence(10), /1024/);

  // While it runs: what has been tried, the best seen, and what is left — and it always
  // says to keep the page open, because a backgrounded tab is throttled to a crawl.
  const running = stickyPowProgress({hashes: 1_500_000, rate: 120000, best: 14, bits: 25,
    secondsLeft: 'about 4 minutes'});
  assert.match(running, /1500k hashes/);
  assert.match(running, /best 14 of 25 bits/);
  assert.match(running, /about 4 minutes left/);
  assert.match(running, /Keep this page open/);
  // Nothing measured yet: no invented estimate, and no "0k hashes".
  const starting = stickyPowProgress({});
  assert.match(starting, /starting/);
  assert.doesNotMatch(starting, /left/);
});

// ---- pins for the notes that other notes have covered

test('a note buried under other notes is the one whose pin needs a way in', () => {
  const box = (left, top, width = 220, height = 220) => ({left, top, width, height});
  // Side by side: nothing lies over anything.
  assert.deepEqual(coveredPinNotes([{id: 'a', box: box(0, 0)}, {id: 'b', box: box(400, 0)}]), []);
  // A later note lying right over this one.
  assert.deepEqual(coveredPinNotes([{id: 'a', box: box(0, 0)}, {id: 'b', box: box(0, 0)}]), ['a']);
  // The order is the board's draw order, so the big note underneath does not bury the small one
  // laid on top of it, whatever the small one covers.
  assert.deepEqual(coveredPinNotes([{id: 'a', box: box(0, 0, 600, 600)}, {id: 'b', box: box(0, 0)}]), []);
  // A sliver along one edge is not being buried; a corner's worth is.
  assert.deepEqual(coveredPinNotes([{id: 'a', box: box(0, 0)}, {id: 'b', box: box(0, 200)}]), []);
  assert.deepEqual(coveredPinNotes([{id: 'a', box: box(0, 0)}, {id: 'b', box: box(0, 160)}]), ['a']);
  // Two notes sharing the edge cover more between them than either does alone, which is the
  // reason the overlaps are summed: a spot under two notes is more covered, not less. Each of
  // these hides 11% of the note below, and a note counts as buried at 20%.
  assert.deepEqual(coveredPinNotes([
    {id: 'a', box: box(0, 0)},
    {id: 'b', box: box(0, 150, 110, 50)},
    {id: 'c', box: box(110, 150, 110, 50)},
  ]), ['a']);
  // The share is the caller's to move, and a note with no box of its own is not judged at all.
  assert.deepEqual(coveredPinNotes([{id: 'a', box: box(0, 0)}, {id: 'b', box: box(0, 200)}],
    {share: 0.05}), ['a']);
  assert.deepEqual(coveredPinNotes([{id: 'a'}, {id: '', box: box(0, 0)},
    {id: 'c', box: box(0, 0, 0, 0)}]), []);
  assert.deepEqual(coveredPinNotes([]), []);
  assert.deepEqual(coveredPinNotes(null), []);
});

test('a lifted note comes back down on the number everybody quotes', () => {
  // Twenty-one seconds, and it is said in three places: the markup, the help, and here.
  assert.equal(PIN_RAISE_MS, 21000);
  assert.ok(PIN_COVERED_SHARE > 0 && PIN_COVERED_SHARE < 1);
});

test('the toggle, its layer and its styles are all in the files the board serves', async () => {
  const [html, css, page] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="buriedPins"[^>]*type="checkbox"/, 'the toggle lives in the board settings');
  assert.match(html, /Show pins of covered notes/);
  assert.match(css, /\.board-pin-layer \{[^}]*pointer-events: none/);
  assert.match(css, /\.board-pin-layer__pin \{[^}]*pointer-events: auto/, 'only the pin takes the pointer');
  assert.match(css, /\.sticky-note--raised \{[^}]*box-shadow/);
  assert.match(page, /BURIED_PINS_KEY = 'satoshi:sticky:buried-pins:v1'/);
  assert.match(page, /localStorage\.getItem\(BURIED_PINS_KEY\) === '1'/, 'off until it is switched on');
});

test('the note details say how the note was paid for, and can copy its own JSON', async () => {
  const [html, css, page] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  // The row sits below the event id, and the id keeps its own copy button directly under it.
  const id = html.indexOf('id="noteEventId"');
  const copyId = html.indexOf('id="copyNoteId"');
  const badge = html.indexOf('id="notePaidBadge"');
  assert.ok(id >= 0 && copyId > id && badge > copyId, 'the mark is below the event id');
  assert.match(html, /id="notePaidBadge"[^>]*hidden/, 'a note that says nothing shows no row there');
  assert.match(html, /id="notePaidBadgeIcon"[^>]*class="lni/);
  assert.match(html, /id="notePaidBadgeLabel"/);
  // The copy button is inside the expanded JSON, under the JSON it copies.
  const details = html.match(/<details id="noteEventJsonDetails"[\s\S]*?<\/details>/)[0];
  assert.ok(details.indexOf('id="noteEventJson"') < details.indexOf('id="copyNoteJson"'), 'below the JSON');
  // It copies the record's own event, not the panel's text, and says so the way the id button does.
  assert.match(page, /elements\.notePaidBadge\.hidden = !badge/);
  assert.match(page, /elements\.notePaidBadge\.dataset\.payment = badge\?\.id \|\| ''/);
  assert.match(css, /\.note-menu__paid\[data-payment="bitcoin"\] i \{ color: #f7931a; \}/);
  assert.match(css, /\.note-menu__paid\[data-payment="pow"\] i \{ color: #e5484d; \}/);
  assert.match(css, /\.note-menu__paid\[data-payment="cash"\] i \{ color: #2fbf71; \}/);
  assert.doesNotMatch(css, /\.note-menu__paid i \{[^}]*var\(--accent/,
    'payment provenance colors never follow the selected theme');
  assert.match(page, /await navigator\.clipboard\.writeText\(json\)/, 'it copies the event it built');
  assert.match(page, /elements\.copyNoteJson\.addEventListener\('click', copySelectedNoteJson\)/);
  // And the mark has left the note's own paper: no class, no rule.
  assert.doesNotMatch(css, /sticky-note__paid/);
  assert.doesNotMatch(page, /sticky-note__paid/);
});

test('the signature opens the react-or-zap dialog, and the board stops dragging from it', async () => {
  const [html, css, page, gifts] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../noteGifts.mjs', import.meta.url), 'utf8'),
  ]);
  // The dialog is a real dialog with a row of reactions and a zap row that can show an invoice.
  const dialog = html.match(/<dialog id="noteGiftDialog"[\s\S]*?<\/dialog>/);
  assert.ok(dialog, 'the dialog exists');
  for (const id of ['noteGiftAuthor', 'noteGiftStatus', 'noteGiftReactions', 'noteGiftAmounts', 'noteGiftZap',
    'noteGiftInvoice', 'noteGiftQr', 'noteGiftInvoiceText', 'copyNoteGiftInvoice']) {
    assert.match(dialog[0], new RegExp(`id="${id}"`), `${id} is in the dialog`);
  }
  assert.match(dialog[0], /id="noteGiftInvoice"[^>]*hidden/, 'no invoice is shown until one is asked for');
  // The signature is a button that takes the pointer before the board can read the tap as a drag.
  assert.match(page, /author\.setAttribute\('role', 'button'\)/);
  assert.match(page, /author\.addEventListener\('pointerdown', press => press\.stopPropagation\(\)\)/);
  assert.match(page, /openNoteGiftDialog\(sticky\.id, author\)/);
  assert.match(page, /\.board-plate, \.sticky-note__author'\)/, 'the board ignores a drag begun on the signature');
  assert.match(page, /wireNoteGiftDialog\(\);/, 'its controls are wired');
  // A signature that comes back from a signer goes to the gift flow, not to the note flow's arm - named
  // once in the model, so the boot path and the live page cannot disagree about which actions are gifts.
  assert.match(page, /amber\.context\?\.action\)\)/, 'the boot arm asks the shared rule');
  assert.match(page, /if \(isGiftAction\(answer\.context\?\.action\)\)/, 'and so does every path home');
  // A zap waits in storage across the hand-off, because the phone comes back to a reloaded page.
  assert.match(page, /localStorage\.setItem\(GIFT_PARK_KEY/);
  assert.match(page, /Date\.now\(\) - Number\(park\.createdAt/);
  // The page builds no event itself: what it sends comes from the module the specs were tested in.
  assert.match(page, /from '\.\/noteGifts\.mjs'/);
  assert.match(gifts, /export const REACTION_SET/);
  assert.doesNotMatch(page, /kind: 9734/, 'the zap request is not spelled out in the page');
  assert.doesNotMatch(page, /kind: 7,/, 'nor is the reaction');
  assert.match(css, /\.note-gift__reactions button \{/);
  assert.match(css, /\.note-gift__qr/);
});

test('no signature is mistaken for a note\u2019s when it is a gift\u2019s', () => {
  assert.equal(isGiftAction('react'), true);
  assert.equal(isGiftAction('zap'), true);
  assert.equal(isGiftAction('pin'), false);
  assert.equal(isGiftAction('login'), false);
  assert.equal(isGiftAction(undefined), false, 'a note signature carries no action of this kind');
  assert.equal(isGiftAction(null), false);
  assert.equal(isGiftAction(''), false);
  // "zapper" and "reaction" are not the actions: the match is exact, not a prefix.
  assert.equal(isGiftAction('zapper'), false);
  assert.equal(isGiftAction('Reaction'), false);
});

test('a gift signature is finished by its own flow on every path home, not just on a reload', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // Every returning signature passes through completeAmberSignature, so the gift is routed there.
  assert.match(page, /async function completeAmberSignature\(answer\) \{[\s\S]{0,900}if \(isGiftAction\(answer\.context\?\.action\)\)/);
  // And above the note guards, which is what used to swallow it. Compared inside the function: the
  // order check also appears elsewhere in the file, in the flow that publishes a note.
  const body = page.slice(page.indexOf('async function completeAmberSignature'),
    page.indexOf('function retireAmberHandOver'));
  assert.ok(body.indexOf('isGiftAction(answer.context?.action)') < body.indexOf('if (!pending?.orderId)'),
    'the gift is routed before the checks that assume a note');
  // The hand-over is retired so the reader sees the gift's own dialog, not two stacked ones.
  assert.match(page, /retireAmberHandOver\(\);\n    await finishGiftFromSigner\(answer\);/);
  // The boot path names the same two actions through the same rule, so the two cannot drift apart.
  assert.match(page, /else if \(amber\?\.action === 'sign' && isGiftAction\(amber\.context\?\.action\)\)/);
  assert.equal(/amber\.context\?\.action === 'react' \|\|/.test(page), false,
    'the two actions are named in one place, not spelled out at each site');
  // A tab Android reloaded has to hear about the note before it can hand over an invoice.
  assert.match(page, /async function giftNoteRecord\(noteId, timeoutMs = 8000\)/);
  assert.match(page, /const record = await giftNoteRecord\(noteId\);/);
  assert.match(page, /await new Promise\(resolve => setTimeout\(resolve, 250\)\)/);
});

test('a round trip in flight is not a failure, and a tap brings the signature home', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // A refusal is still said: only the reader can act on that one.
  assert.match(script, /The browser would not let the page read the clipboard\. Tap the button below/);
  // The one moment the reader must act is the timeout, and it names what is being signed rather than
  // telling a reader who is reacting that Amber did not hand "the note" back.
  assert.match(script, /function amberActionWords\(\) \{/);
  assert.match(script, /if \(action === 'react'\) return 'reaction';/);
  assert.match(script, /if \(action === 'zap'\) return 'zap';/);
  assert.match(script, /return 'note';/);
  // A tap carries the activation a clipboard read needs, so it tries to collect the signature - and
  // never from inside the hand-over, whose own button reads the clipboard and would race for the
  // single parked request the two reads both spend.
  const tap = script.slice(script.indexOf("document.addEventListener('pointerdown'"));
  assert.match(tap, /if \(!amberSignaturePending\(\) \|\| amberAdoptRunning\) return;/);
  assert.match(tap, /if \(elements\.amberDialog\.contains\(event\.target\)\) return;/);
  assert.match(tap, /adoptParkedSignature\(\)\.then\(answer => \{/);
  assert.match(tap, /if \(answer\?\.action === 'sign'\) return completeAmberSignature\(answer\);/);
});

test('the board is laid down again in the order the tallies earn', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // The order is applied by moving the elements, because a note at rest carries no z-index.
  assert.match(page, /function applyBoardOrder\(\) \{/);
  assert.match(page, /const notes = \[\.\.\.noteEvents\.entries\(\)\]\.map\(\(\[id, record\]\) => \(\{/);
  assert.match(page, /\.\.\.giftTally\(id, giftEvents\),/, 'each note goes in with the tally it has earned');
  assert.match(page, /for \(const id of noteStackOrder\(notes\)\) \{/);
  assert.match(page, /elements\.canvas\.append\(element\);/);
  // And the burial geometry is worked out again: which notes lie under others is what changed.
  const applied = page.slice(page.indexOf('function applyBoardOrder()'), page.indexOf('* -------------------------------------------------------------------- moving pictures'));
  assert.match(applied, /scheduleBuriedPins\(\);/);
  // The burial layer is deliberately not moved: it stands above the whole board at its own z-index.
  assert.equal(/canvas\.append\(buriedPinLayerElement\)/.test(applied), false);
  // Debounced, so a relay catching up does not re-stack dozens of times.
  assert.match(page, /const BOARD_ORDER_DELAY_MS = 400;/);
  assert.match(page, /function scheduleBoardOrder\(\) \{\n  if \(boardOrderTimer\) return;/);
  assert.match(page, /boardOrderTimer = setTimeout\(\(\) => \{ boardOrderTimer = 0; applyBoardOrder\(\); \}, BOARD_ORDER_DELAY_MS\);/);
  // Every moment the pile could have changed: the board being whole, a tally arriving, a note drawn.
  assert.match(page, /scheduleBuriedPins\(\);\n  \/\/ Applied here and now rather than scheduled[\s\S]{0,300}applyBoardOrder\(\);/,
    'the pass that runs when the board is whole applies it at once, because the share picture follows');
  assert.match(page, /A tally that moved is a note that may have earned its way forward\.\n  scheduleBoardOrder\(\);/);
  assert.match(page, /if \(!temporary\) scheduleBoardOrder\(\);/);
});

test('a note shows what it collected, on the paper\u2019s free corner', async () => {
  const [page, css] = await Promise.all([
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
  ]);
  // Bottom left: the signature owns the bottom right and the pin sits where the reader put it.
  assert.match(css, /\.sticky-note__gifts \{ position: absolute; left: 10px; bottom: 7px;/);
  assert.match(css, /\.sticky-note--print \.sticky-note__gifts \{ bottom: 9px; \}/, 'the print band is deeper');
  // The element exists on every note the board draws, and says nothing until there is something.
  assert.match(page, /gifts\.className = 'sticky-note__gifts';/);
  assert.match(page, /gifts\.hidden = true;/);
  assert.match(page, /element\.hidden = tally\.reactions === 0 && tally\.sats === 0;/);
  // The words are reactions then sats, which is the order the reader asked for.
  assert.match(page, /element\.textContent = `\$\{tally\.reactions\}\/\$\{tally\.sats\}`;/);
  assert.match(page, /element\.title = `\$\{tally\.reactions\} \$\{tally\.reactions === 1 \? 'reaction' : 'reactions'\}, \$\{tally\.sats\} sats zapped`;/);
});

test('the board asks the relay what its notes collected, on the same socket', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // Set on the board's own connection and answering every socket, because more than one relay is read.
  assert.match(page, /let giftSubscription = '';/);
  assert.match(page, /giftSubscription = `\$\{subscription\}-gifts`;/);
  // Asked for when the board is whole, because the filter names the notes.
  assert.match(page, /applyNoteFilters\(\);\n        requestGiftTallies\(socket\);/);
  // The filter names the notes the board just loaded, kept so a relay that answers late is asked the
  // same question as the ones already open.
  assert.match(page, /socket\.send\(JSON\.stringify\(\['REQ', giftSubscription, \{kinds: \[7, 9735\], '#e': giftRequestIds, limit: 1000\}\]\)\);/);
  // And taken before the guard that drops anything not on the board's own subscription.
  const taken = page.indexOf("data[1] === giftSubscription");
  const guard = page.indexOf("data[1] !== subscription || !window.NostrTools.verifyEvent(data[2])");
  assert.ok(taken > -1 && guard > -1 && taken < guard, 'a reaction is not dropped as "not on this board"');
  assert.match(page, /if \(window\.NostrTools\.verifyEvent\(data\[2\]\)\) noteGiftArrived\(data\[2\]\);/,
    'every reaction and receipt is verified before it is counted');
  assert.match(page, /for \(const noteId of boardNoteIds\(\)\) \{/);
});

test('the reactions and zaps are read from the reader\u2019s own relays too', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // The board's own relay is asked on the socket it already has; the reader's relays get one each.
  assert.match(page, /const giftRelaySockets = new Map\(\);/);
  assert.match(page, /function openGiftRelay\(url\) \{/);
  assert.match(page, /function sendGiftRequest\(socket\) \{/);
  assert.match(page, /sendGiftRequest\(socket\);/);
  assert.match(page, /followUserRelays\(\);/);
  assert.match(page, /socket\.send\(JSON\.stringify\(\['REQ', giftSubscription, \{kinds: \[7, 9735\], '#e': giftRequestIds, limit: 1000\}\]\)\);/);
  // A socket already open for a relay is reused rather than opened again on every request.
  assert.match(page, /if \(existing && existing\.readyState <= WebSocket\.OPEN\) \{/);
  // A relay that will not connect is not a broken board, and one that drops is not chased.
  assert.match(page, /try \{ socket = new WebSocket\(url\); \} catch \{ return null; \}/);
  assert.equal(/addEventListener\('close', \(\) => openGiftRelay/.test(page), false, 'no reconnect loop');
  // Whatever relay it came from, the same judging and the same counting: verified, then handed to the
  // one place that dedupes by id, so the same reaction from two relays stays one reaction.
  assert.match(page, /socket\.addEventListener\('message', message => readGiftPayload\(url, message\.data\)\);/);
  assert.match(page, /if \(window\.NostrTools\.verifyEvent\(data\[2\]\)\) noteGiftArrived\(data\[2\]\);/);
  // The subscription id is set once by the board's own connection and answers every socket.
  assert.match(page, /let giftSubscription = '';/);
  assert.match(page, /giftSubscription = `\$\{subscription\}-gifts`;/);
  // Adding or removing a relay in the settings takes effect at once, not on the next reload.
  const remove = page.indexOf('userRelays = removeUserRelay(userRelays, url);');
  assert.ok(remove > -1 && page.slice(remove, remove + 800).includes('followUserRelays();'),
    'a removed relay stops being read');
  const add = page.indexOf('userRelayPings.set(added, await pingRelay(added));');
  assert.ok(add > -1 && page.slice(add, add + 400).includes('followUserRelays();'),
    'an added relay is read');
});

test('a paid zap takes its own dialog down and says so', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // The watch is armed only where a receipt can exist: an address that publishes none has none.
  assert.match(page, /pendingZapInvoice = parked\.allowsNostr\n    \? \{noteId: parked\.noteId, invoice: invoice\.invoice, sats: parked\.sats, startedAt: Date\.now\(\)\}/);
  // The invoice shown is the one the receipt must be for, and the watch does not outlive the reader's
  // attention by more than an hour.
  assert.match(page, /const ZAP_WATCH_MS = 60 \* 60 \* 1000;/);
  assert.match(page, /Date\.now\(\) - pendingZapInvoice\.startedAt < ZAP_WATCH_MS/);
  assert.match(page, /receiptMatchesInvoice\(event, pendingZapInvoice\.invoice\)/);
  assert.match(page, /settleZap\(\);/);
  // The dialog comes down and the reader is told once, in the board's own words.
  assert.match(page, /if \(elements\.noteGift\.open\) elements\.noteGift\.close\(\);/);
  // The message itself, in pieces: a nested template literal cannot be written as one pattern, and the
  // bolt is written as an escape in the page\u2019s template literal, so the pattern matches that text.
  assert.match(page, /notice\(`Zapped successfully \\u26A1/);
  assert.match(page, /\$\{paid \? ` \$\{paid\} sats` : ''\}`\);/, 'and it says how much was paid');
  // And the note it was for is drawn again, so the number on the paper moves with the payment.
  const settle = page.slice(page.indexOf('function settleZap()'), page.indexOf('* -------------------------------------------------------------------- moving pictures'));
  assert.match(settle, /if \(noteId\) renderNoteGifts\(noteId\);/);
});

test('a gift is not handed a second dialog on top of the one it is signed from', async () => {
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // The gift dialog is already open and already says what to do, so the hand-over is not raised over
  // it: a modal on top of a modal is how a finished action looks like a stuck one.
  assert.match(script, /if \(!isGiftAction\(pendingAmberRequest\(\)\?\.context\?\.action\) && !elements\.amberDialog\.open\) \{/);
  // A note still gets it, and the waiting sentence is unchanged for that case.
  assert.equal((script.match(/showAmberHandOver\(AMBER_HAND_OVER_WAITING_LINE\)/g) || []).length, 4,
    'the waiting-state call sites are all still there');
});

test('a gift is published where the reader reads, not to relays they never chose', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // The list is read at the moment of sending, so a relay added in the settings counts from then on.
  assert.match(page, /function giftRelays\(\) \{/);
  assert.match(page, /return \[RELAY, \.\.\.userRelays\];/);
  assert.equal(/const GIFT_RELAYS\b/.test(page), false,
    'no public relay is hard-wired into the gift path any more');
  assert.match(page, /function publishToRelays\(event, urls = giftRelays\(\)\)/);
  assert.match(page, /relays: giftRelays\(\)/, 'the zap request carries the same list as its hints');
  // The reader's list has to be declared before anything reads it, or a gift sends nothing extra.
  assert.ok(page.indexOf('let userRelays') < page.indexOf('function giftRelays()'),
    'the reader\u2019s relays are declared before the gift list reads them');
});

test('a reader can add up to three relays of their own, and no more', () => {
  const own = {defaultRelay: 'wss://nostr.satoshi.si'};
  const first = addUserRelay([], 'relay.example.com', own);
  assert.deepEqual(first, {ok: true, relays: ['wss://relay.example.com']});
  const second = addUserRelay(first.relays, 'wss://nos.lol/', own);
  assert.deepEqual(second.relays, ['wss://relay.example.com', 'wss://nos.lol']);
  const third = addUserRelay(second.relays, 'wss://relay.damus.io', own);
  assert.equal(third.relays.length, USER_RELAY_LIMIT);
  const fourth = addUserRelay(third.relays, 'wss://relay.primal.net', own);
  assert.equal(fourth.ok, false);
  assert.match(fourth.reason, /limit of 3/);
  // The same relay twice is one relay, however it is written.
  assert.equal(addUserRelay(first.relays, 'relay.example.com', {defaultRelay: ''}).ok, false);
  assert.match(addUserRelay(first.relays, 'wss://relay.example.com', {defaultRelay: ''}).reason, /already on the list/);
  // And the board\u2019s own relay is not something to add: every note goes there anyway.
  assert.match(addUserRelay([], 'wss://nostr.satoshi.si', own).reason, /own relay/);
});

test('a relay address is taken as typed, and refused with a reason when it cannot be one', () => {
  assert.equal(normaliseUserRelay('relay.example.com').relay, 'wss://relay.example.com');
  assert.equal(normaliseUserRelay('  wss://Relay.Example.COM/path/ ').relay, 'wss://relay.example.com/path');
  assert.equal(normaliseUserRelay('relay.example.com:443').ok, true, 'a port is allowed');
  const ws = normaliseUserRelay('ws://relay.example.com');
  assert.equal(ws.ok, false, 'a ws relay is blocked as mixed content on an https page');
  assert.match(ws.reason, /wss/);
  assert.equal(normaliseUserRelay('https://relay.example.com').ok, false);
  assert.equal(normaliseUserRelay('').ok, false);
  assert.match(normaliseUserRelay('').reason, /Type a relay/);
  assert.equal(normaliseUserRelay('not a relay').ok, false);
  assert.equal(normaliseUserRelay('localhost').ok, false);
  assert.equal(normaliseUserRelay('x'.repeat(400)).ok, false);
});

test('the lamp says how the relay answered, and says so when it did not', () => {
  assert.equal(relayLampFor(90).id, 'green');
  assert.equal(relayLampFor(399).id, 'green');
  assert.equal(relayLampFor(400).id, 'yellow');
  assert.equal(relayLampFor(899).id, 'yellow');
  assert.equal(relayLampFor(900).id, 'orange');
  assert.equal(relayLampFor(1999).id, 'orange');
  assert.equal(relayLampFor(2000).id, 'red');
  assert.equal(relayLampFor(12000).id, 'red');
  assert.equal(relayLampFor(123.6).ms, 124, 'the number shown is rounded');
  assert.deepEqual(relayLampFor(null), {id: 'red', label: 'no answer', ms: null});
  assert.deepEqual(relayLampFor(undefined), {id: 'red', label: 'no answer', ms: null});
  assert.equal(relayHostLabel('wss://relay.example.com/path'), 'relay.example.com');
  assert.deepEqual(removeUserRelay(['wss://a.com', 'wss://b.com'], 'wss://a.com'), ['wss://b.com']);
  assert.deepEqual(removeUserRelay(null, 'wss://a.com'), []);
});

test('the board stacks by time: the last note posted lies on top', () => {
  const note = (id, createdAt, reactions = 0, sats = 0) => ({id, createdAt, reactions, sats});
  const now = 2_000;

  // Nothing else matters: newest last, which is the note on top of the pile.
  assert.deepEqual(noteStackOrder([note('a', 100), note('b', 300), note('c', 200)], now), ['a', 'c', 'b']);

  // The complaint this replaced: a note that had collected likes and sats covered a newer note, so a reader who
  // had just posted would find their note underneath one from hours earlier with a few free-to-sign likes.
  assert.deepEqual(noteStackOrder([note('older-with-tally', 10, 6, 2345), note('just-posted', 20)], now),
    ['older-with-tally', 'just-posted'], 'the note posted last is on top whatever the older one collected');
  assert.deepEqual(noteStackOrder([note('older', 10, 0, 100000), note('newer', 20)], now),
    ['older', 'newer'], 'and a large zap does not hold the top either');

  // A note dated in the future is read as posted now, so a clock set forward cannot own the top for good.
  assert.deepEqual(noteStackOrder([note('sane', 1900), note('from-2030', 1_900_000_000)], now), ['sane', 'from-2030']);
  // Two notes from the future are both read as posted now, so they tie and keep the order they arrived in:
  // neither date can be trusted, so neither earns a place over the other.
  assert.deepEqual(noteStackOrder([note('a', 1_900_000_000), note('b', 1_800_000_000)], now), ['a', 'b'],
    'both are capped at now, so arrival order decides');

  // Same second: the order the notes arrived in, so the board only moves when something is posted.
  assert.deepEqual(noteStackOrder([note('a', 5), note('b', 5), note('c', 5)], now), ['a', 'b', 'c']);

  // Nothing to go on is not a crash.
  assert.deepEqual(noteStackOrder([], now), []);
  assert.deepEqual(noteStackOrder(null, now), []);
  assert.deepEqual(noteStackOrder([{id: 'x'}], now), ['x']);
  assert.deepEqual(noteStackOrder([{id: 'x', createdAt: 'nonsense', reactions: 'nonsense', sats: -5}], now), ['x']);
});

test('only a picture that moves is treated as one', () => {
  assert.equal(animatedPicture('https://satoshi.si/i/abc.gif'), true);
  assert.equal(animatedPicture('https://satoshi.si/i/abc.GIF'), true, 'the case of the address is not the reader\u2019s business');
  assert.equal(animatedPicture('/i/abc.gif?grade=sepia'), true);
  assert.equal(animatedPicture('/i/abc.gif#top'), true);
  assert.equal(animatedPicture('  /i/abc.gif  '), true);
  assert.equal(animatedPicture('/i/abc.gifx'), false, 'a name that merely contains gif is not a GIF');
  assert.equal(animatedPicture('/i/abc.png'), false);
  assert.equal(animatedPicture('/i/abc'), false);
  assert.equal(animatedPicture(''), false);
  assert.equal(animatedPicture(null), false);
  assert.equal(animatedPicture(undefined), false);
});

test('the board plays moving pictures unless the reader stops them', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  // On by default: the stored value is the off marker, so never having chosen means playing.
  assert.match(page, /localStorage\.getItem\(GIF_PLAY_KEY\) !== '0'/);
  assert.equal(/localStorage\.getItem\(GIF_PLAY_KEY\) === '1'/.test(page), false,
    'a default of on must not be stored as the default');
  // The switch shows that state when the board opens.
  assert.match(page, /elements\.gifPlay\.checked = gifPlay;/);
  assert.match(page, /gifPlay: document\.getElementById\('gifPlay'\)/);
  // A GIF cannot be paused by a style, so a stopped one is a canvas holding its frame.
  assert.match(page, /function freezePicture\(image\)/);
  assert.match(page, /document\.createElement\('canvas'\)/);
  assert.match(page, /frame\.dataset\.gifSource = image\.src/);
  assert.match(page, /getContext\('2d'\)\.drawImage\(image, 0, 0\)/);
  assert.match(page, /function releasePicture\(frame\)/);
  assert.match(page, /image\.src = frame\.dataset\.gifSource/);
  // Only moving pictures are touched, and a picture not yet loaded waits rather than freezing blank.
  assert.match(page, /frozen\.\w*|animatedPicture\(image\.src\)/);
  assert.match(page, /if \(!image\.complete \|\| !image\.naturalWidth\)/);
  // Switching it off holds the board still at once, and switching it on lets it move again.
  assert.match(page, /elements\.gifPlay\.addEventListener\('change', \(\) => \{/);
  assert.match(page, /localStorage\.setItem\(GIF_PLAY_KEY, gifPlay \? '1' : '0'\)/);
  assert.match(page, /applyGifPlay\(\);/);
  // A note drawn after the switch is held still too.
  assert.match(page, /if \(!gifPlay\) applyGifPlay\(note\);/);
});

test('a note\u2019s picture and the pin it is held by survive being frozen', async () => {
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = await readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  // The frozen picture keeps the class, so it keeps the size and the grade filter it had.
  assert.match(page, /frame\.className = image\.className;/);
  assert.match(page, /image\.className = frame\.className;/);
  // The pin, the signature and the note itself are untouched: only the image element is swapped.
  assert.match(page, /image\.replaceWith\(frame\);/);
  assert.match(page, /frame\.replaceWith\(image\);/);
  assert.match(css, /\.sticky-note__print-image\b/, 'the class the freeze relies on still exists');
});

test('the pinstr page wears a pin instead of the site\u2019s own mark', async () => {
  const html = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  // The page carries its own icons, ahead of anything the site sets, so the pin wins.
  assert.match(html, /<link rel="icon" href="\/img\/pinstr-favicon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="\/img\/pinstr-favicon-32\.png">/);
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/img\/pinstr-favicon-180\.png">/);
  assert.equal(html.includes('<link rel="icon" href="/favicon-32x32.png">'), false,
    'the site\u2019s own mark is no longer what this page offers');
  // And the files are real, not references to things nobody drew.
  const svg = readFileSync(new URL('../img/pinstr-favicon.svg', import.meta.url), 'utf8');
  assert.match(svg, /<svg[\s\S]*viewBox="0 0 100 100"/);
  for (const size of [32, 180]) {
    const file = new URL(`../img/pinstr-favicon-${size}.png`, import.meta.url);
    assert.ok(existsSync(file), `${size}px icon exists`);
    const bytes = readFileSync(file);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${size}px is a PNG`);
    assert.equal(bytes.readUInt32BE(16), size, `${size}px is actually ${size} pixels wide`);
  }
});

test('the settings let a reader add three relays, and show them as lamps with milliseconds', async () => {
  const [html, css, page] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.css', import.meta.url), 'utf8'),
    readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8'),
  ]);
  const section = html.match(/<section class="user-relays"[\s\S]*?<\/section>/);
  assert.ok(section, 'the relay section exists');
  const dialog = html.match(/<dialog id="boardStyleDialog"[\s\S]*?<\/dialog>/)[0];
  assert.ok(dialog.includes('id="userRelayInput"'), 'it is in the settings dialog');
  assert.ok(dialog.includes('id="userRelayList"'), 'with a list to show the relays in');
  // The explainer is a dropdown, names the default relay, and says more can be added here.
  assert.match(section[0], /<details/);
  assert.match(section[0], /wss:\/\/nostr\.satoshi\.si/);
  assert.match(section[0], /by default/);
  assert.match(section[0], /up to 3/);
  // Four lamp colours, a lamp per row, and the number beside it.
  for (const colour of ['green', 'yellow', 'orange', 'red']) {
    assert.match(css, new RegExp(`\\.user-relays__lamp--${colour}`), `${colour} is a lamp`);
  }
  assert.match(page, /relayLampFor\(ping\)/);
  assert.match(page, /no answer/);
  // The ping is a real socket, timed, with a timeout so "no answer" is a state that can happen.
  assert.match(page, /function pingRelay\(url\)[\s\S]{0,700}new WebSocket\(url\)/);
  assert.match(page, /RELAY_PING_TIMEOUT_MS/);
  assert.match(page, /setTimeout\(\(\) => finish\(null\), RELAY_PING_TIMEOUT_MS\)/);
  // The limit is enforced where a test can reach it, not only by a disabled button.
  assert.match(page, /addUserRelay\(userRelays, elements\.userRelayInput\.value, \{defaultRelay: RELAY\}\)/);
  // A pinned note goes to them as well, and a relay refusing it is not a failed pin.
  assert.match(page, /publishToUserRelays\(event\)/);
  assert.match(page, /publishToUserRelays\(resumedEvent\)/);
  assert.match(page, /publishToRelays\(event, userRelays\)\.catch\(\(\) => \{\}\)/);
  // The panel draws and measures itself when it opens.
  assert.match(page, /renderUserRelays\(\);\n  checkUserRelays\(\);/);
});

test('a quote request carries no content-type, so the browser never preflights it', async () => {
  // The desk answers OPTIONS for its GET routes with access-control-allow-methods but no
  // access-control-allow-headers, so announcing a JSON body on a GET that has none made every price
  // quote fail in the browser: the composer then had no amount and the note came back 402.
  assert.deepEqual(apiHeaders({}), {});
  assert.deepEqual(apiHeaders({method: 'GET'}), {});
  assert.deepEqual(apiHeaders({body: JSON.stringify({a: 1})}), {'content-type': 'application/json'});
  assert.deepEqual(apiHeaders({headers: {'x-test': '1'}}), {'x-test': '1'});
  assert.deepEqual(apiHeaders({body: 'x', headers: {'x-test': '1'}}),
                   {'x-test': '1', 'content-type': 'application/json'});

  // And the call site uses it, rather than setting the header itself.
  const page = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(page, /headers: apiHeaders\(options\)/);
  assert.doesNotMatch(page, /headers: \{'content-type': 'application\/json', \.\.\.\(options\.headers/);
});


test('a key the relays do not know is priced as a throwaway and offered no plan', () => {
  const session = {method: 'nip07', pubkey: 'a'.repeat(64)};
  assert.equal(anonymousForQuote(session, {anonymous: true}), true, 'the desk verdict counts');
  assert.equal(anonymousForQuote(session, {anonymous: false}), false);
  assert.equal(anonymousForQuote({method: 'anonymous'}, null), true, 'the board mode still counts');
  assert.equal(anonymousForQuote(null, {anonymous: true}), false, 'nobody signed in is nobody');
});

test('the stranger wording does not claim the reader is anonymous', () => {
  const quote = {anonymous: true, prices: {weekSats: 10, yearSats: 411}};
  const stranger = describeStickyAction({anonymous: true, stranger: true, subscription: quote});
  const anonymous = describeStickyAction({anonymous: true, subscription: quote});
  assert.match(stranger.label, /One note/);
  assert.doesNotMatch(stranger.label, /anonymously/);
  assert.match(stranger.state, /no satoshi\.si name/);
  assert.match(anonymous.label, /anonymously/, 'the board-minted key keeps its own wording');
  assert.equal(stranger.price, anonymous.price, 'both pay the same flat price');
});


/* ----------------------------------------------------------------- pasted board patterns ---- */

test('a pattern pasted from css-pattern.com is accepted as written', () => {
  const pasted = `background-color: #e5e5f7;
opacity: 0.8;
background-image: repeating-linear-gradient(45deg, #444cf7 25%, transparent 25%, transparent 75%, #444cf7 75%, #444cf7);
background-position: 0 0, 10px 10px;
background-size: 20px 20px;`;
  const parsed = boardPatternCss(pasted);
  assert.equal(parsed.ok, true, parsed.error);
  assert.match(parsed.css, /^background-color:#e5e5f7;opacity:0\.8;background-image:repeating-linear-gradient/);
  assert.match(parsed.css, /background-size:20px 20px;$/);
  assert.equal(parsed.properties.length, 5, 'every declaration survives the round trip');
});

test('a pattern may not fetch anything, or set anything that is not a background', () => {
  const remote = boardPatternCss('background-image: url(https://tracker.example/p.gif);');
  assert.equal(remote.ok, false);
  assert.match(remote.error, /url\(/, 'the refusal names what it refused');
  assert.equal(boardPatternCss('@import "https://elsewhere/site.css";').ok, false);
  const positional = boardPatternCss('position: fixed; background-image: linear-gradient(red, blue);');
  assert.equal(positional.ok, false);
  assert.match(positional.error, /position is not a board pattern/);
});

test('a pattern needs something to paint', () => {
  const colourOnly = boardPatternCss('background-color: #123456;');
  assert.equal(colourOnly.ok, false);
  assert.match(colourOnly.error, /background-image/);
  assert.equal(boardPatternCss('').ok, false);
  assert.equal(boardPatternCss('   ').ok, false);
});

test('a pattern may carry its own variables and comments', () => {
  const parsed = boardPatternCss('/* from css-pattern.com */ --s: 40px; background-size: var(--s); background-image: linear-gradient(var(--s), red, blue);');
  assert.equal(parsed.ok, true, parsed.error);
  assert.match(parsed.css, /^--s:40px;/);
  assert.doesNotMatch(parsed.css, /\*\//, 'comments do not survive the round trip');
  const shouty = boardPatternCss('Background-Image: linear-gradient(90deg, red, blue)');
  assert.equal(shouty.ok, true);
  assert.match(shouty.css, /^background-image:/, 'property names are stored lowercase');
});

test('every pattern in the catalogue has a picture this page can serve', async () => {
  const ids = BOARD_TEXTURES.map(texture => texture.id);
  const urls = BOARD_TEXTURES.map(texture => texture.url);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(new Set(urls).size, urls.length, 'urls are unique');
  assert.equal(BOARD_TEXTURES.length, 22, 'the seven originals and the fifteen added later');
  for (const texture of BOARD_TEXTURES) {
    assert.match(texture.url, /^\/img\/board-[a-z0-9-]+\.(png|jpg)$/u, texture.id);
    assert.ok(texture.label.length > 1, `${texture.id} has a label a reader can read`);
    if (texture.tile !== undefined) {
      assert.ok(texture.tile >= 96 && texture.tile <= 600, `${texture.id} paints inside the board's own range`);
    }
    // A catalogue entry naming a file nobody fetched passes every grep and 404s for the reader.
    const bytes = await readFile(new URL(`..${texture.url}`, import.meta.url));
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    assert.ok(png || jpeg, `${texture.id} is a real image, not a promise of one`);
  }
});

test('the pasted pattern lives in the board style dialog and is wired to the model', async () => {
  const page = await readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const start = page.indexOf('id="boardStyleDialog"');
  assert.ok(start > 0, 'the dialog exists');
  const dialog = page.slice(start, page.indexOf('</dialog>', start));
  assert.match(dialog, /id="boardPatternCss"/u, 'the field sits in the board style dialog');
  assert.match(dialog, /<button type="button" id="usePastedPattern"/u,
    'a bare button inside the form would submit it and close the panel');
  const script = await readFile(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /const BOARD_PATTERN_CSS_KEY = 'satoshi:sticky:board-pattern-css:v1';/u);
  assert.match(script, /applyPastedPattern\(elements\.boardPatternCss\.value\)/u, 'the button calls the model rule');
  assert.match(script, /if \(boardPatternIsCss\(\)\) \{\n    paintPastedPattern\(\);/u,
    'a pasted pattern must not be painted over by a file');
});


test('the kept-place controls live in the area dialog, not the gear panel', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const style = html.slice(html.indexOf('id="boardStyleDialog"'), html.indexOf('id="boardDialog"'));
  const area = html.slice(html.indexOf('id="areaDialog"'), html.indexOf('id="geohashMapDialog"'));
  assert.match(area, /id="lockToggle"/);
  assert.match(area, /id="unlockButton"/);
  assert.match(area, /Tick to keep this place and open it on every visit\./);
  assert.match(area, /Unlock this place/);
  assert.ok(!style.includes('id="lockToggle"'), 'the lock toggle belongs in Show notes around me');
  assert.ok(!style.includes('keptPlaceTitle'), 'the gear panel must not carry a kept-place section');
});

test('the switch locks the open board and says so', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.match(script, /elements\.lockToggle\.addEventListener\('change'/);
  assert.match(script, /lockThisPlace\(cells, cells\[0\]\.length\)/);
  assert.match(script, /Unlocked — the board will not open a place of its own\./);
});


test('the GIF and buried-pin switches belong to Board style, not sort and filter', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const styleStart = html.indexOf('id="boardStyleDialog"');
  const style = html.slice(styleStart, html.indexOf('</form>', styleStart));
  const sortStart = html.indexOf('id="noteSortDialog"');
  const sort = html.slice(sortStart, html.indexOf('</dialog>', sortStart));
  for (const control of ['gifPlay', 'buriedPins']) {
    assert.ok(style.includes(`id="${control}"`), `${control} must be a Board style setting`);
    assert.ok(!sort.includes(`id="${control}"`), `${control} must not sit in sort and filter`);
  }
  assert.ok(script.includes('elements.gifPlay.checked = gifPlay;'), 'the panel reads the stored switch state');
  assert.ok(script.includes('elements.buriedPins.checked = showBuriedPins;'), 'both switches are restored');
});


test('a kept place sets the remember switch aside instead of outvoting it', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('id="rememberBoardRow"'));
  assert.ok(html.includes('id="rememberBoardHint" class="board-memory-hint" hidden'));
  assert.ok(html.includes('aria-describedby="rememberBoardHint"'));
  assert.ok(script.includes("elements.rememberBoard.disabled = locked;"), 'the switch must be disabled, not just dimmed');
  assert.ok(script.includes("classList.toggle('is-inert', locked)"));
  assert.ok(script.includes('elements.rememberBoardHint.hidden = !locked;'));
  const seed = script.indexOf('  elements.rememberBoard.checked = rememberBoard;');
  assert.ok(seed !== -1, 'the chooser still seeds the switch');
  assert.ok(script.indexOf('renderLockControls();', seed) !== -1, 'the chooser refreshes the row before it shows');
});


test('a profile link is only followed when it really is http(s)', async () => {
  const { safeProfileLink, safeLightningAddress } = await import('../stickyNotesModel.mjs');
  assert.equal(safeProfileLink('https://a.si/x'), 'https://a.si/x');
  assert.equal(safeProfileLink('a.si'), 'https://a.si/');
  assert.equal(safeProfileLink('javascript:alert(1)'), '');
  assert.equal(safeProfileLink('data:text/html,x'), '');
  assert.equal(safeProfileLink('ftp://x.si'), '');
  assert.equal(safeProfileLink('a sentence'), '');
  assert.equal(safeProfileLink(''), '');
  assert.equal(safeLightningAddress('someone@getalby.com'), 'someone@getalby.com');
  assert.equal(safeLightningAddress('not an address'), '');
  assert.equal(safeLightningAddress(''), '');
});

test('the account dialog shows what a kind 0 says and hides what it does not', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const dialog = html.slice(html.indexOf('id="accountDialog"'), html.indexOf('id="composerDialog"'));
  for (const id of ['accountBanner', 'accountFields', 'accountHandleRow', 'accountHandle',
                    'accountAboutRow', 'accountAbout', 'accountWebsiteRow', 'accountWebsite',
                    'accountLightningRow', 'accountLightning']) {
    assert.ok(dialog.includes(`id="${id}"`), `${id} must be part of the account dialog`);
  }
  assert.ok(script.includes("about: String(source.about || '').trim().slice(0, 600)"), 'the bio is capped');
  assert.ok(script.includes('banner: safeProfilePicture(source.banner)'), 'the banner is sanitised like a picture');
  assert.ok(script.includes('website: safeProfileLink(source.website)'));
  assert.ok(script.includes('lud16: safeLightningAddress(source.lud16)'));
  assert.ok(script.includes('elements.accountFields.hidden = !handle && !about && !website && !lightning;'),
    'an empty profile must not leave an empty block on screen');
  assert.ok(script.includes("const anonymous = session?.method === 'anonymous';"),
    'a throwaway key has no profile to show');
});


test('the account dialog carries a subscription box that states the facts', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const dialog = html.slice(html.indexOf('id="accountDialog"'), html.indexOf('id="composerDialog"'));
  for (const id of ['accountSubscription', 'accountSubscriptionState', 'accountSubscriptionRows',
                    'accountSubscriptionPlan', 'accountSubscriptionSince', 'accountSubscriptionPaid',
                    'accountSubscriptionLeft', 'accountSubscriptionNone']) {
    assert.ok(dialog.includes(`id="${id}"`), `${id} must be in the account dialog`);
  }
  assert.ok(script.includes("(free ? free.label : (resolved ? 'Not active' : 'Checking…'))"),
    'a box that has not heard from the desk must not claim there is no subscription');
  assert.ok(script.includes("session.method === 'anonymous'"), 'a throwaway key holds no subscription');
  assert.ok(script.includes('timeLeftLabel(left)'), 'the box counts down');
  assert.ok(script.includes("!elements.accountSubscription.hidden) renderAccountSubscription(session)"),
    'the countdown only runs while the box is on screen');
});

test('the desk tells the page what was paid, when it started and when it last paid', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const desk = readFileSync(new URL('../deploy/nip05-desk/sticky.mjs', import.meta.url), 'utf8');
  assert.ok(desk.includes('paidSats: active && Number.isInteger(active.sats)'), 'the amount paid must be reported');
  assert.ok(desk.includes('startedAt: active && Number.isInteger(active.startedAt)'), 'the start must be reported');
  assert.ok(desk.includes('paidAt: active && Number.isInteger(active.extendedAt)'), 'the last payment must be reported');
});


test('a NIP-38 status is read as the person set it', async () => {
  const { pickUserStatus } = await import('../stickyNotesModel.mjs');
  const now = 1000;
  const ev = (d, text, at, extra = []) => ({ kind: 30315, content: text, created_at: at, tags: [['d', d], ...extra] });
  assert.equal(pickUserStatus([ev('music', 'Beastie Boys', 900), ev('general', 'Hiking', 800)], now).text, 'Hiking',
    'general is the status a reader means');
  assert.equal(pickUserStatus([ev('general', 'old', 500), ev('general', 'new', 900)], now).text, 'new',
    'the newest of one type wins');
  assert.equal(pickUserStatus([ev('music', 'Track', 900)], now).type, 'music');
  assert.equal(pickUserStatus([ev('general', '', 900)], now), null, 'empty content is how a status is cleared');
  assert.equal(pickUserStatus([ev('music', 'Track', 900, [['expiration', '999']])], now), null,
    'a status whose expiration has passed is over');
  const live = pickUserStatus([ev('music', 'Track', 900, [['expiration', '1200'], ['r', 'https://x.si/t']])], now);
  assert.equal(live.url, 'https://x.si/t');
  assert.equal(pickUserStatus([], now), null);
  assert.equal(pickUserStatus([{ kind: 1, content: 'hi', created_at: 900, tags: [] }], now), null, 'only kind 30315 counts');
});

test('the board shows a status and never writes one', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const dialog = html.slice(html.indexOf('id="accountDialog"'), html.indexOf('id="composerDialog"'));
  for (const id of ['accountStatus', 'accountStatusType', 'accountStatusText', 'accountStatusLink', 'accountStatusWhen']) {
    assert.ok(dialog.includes(`id="${id}"`), `${id} must be in the account dialog`);
  }
  assert.ok(!dialog.includes('accountBotRow'), 'the bot label is gone: it told the wrong story');
  assert.ok(script.includes('kinds: [30315]'), 'statuses are read from the relays');
  assert.equal(/kind:\s*30315/.test(script), false, 'the board must never build a status event');
  assert.ok(script.includes('elements.accountStatusText.textContent = status.text'), 'the text goes in as text');
});


test('a note is worn the same way every time it is drawn', async () => {
  const { noteWear } = await import('../stickyNotesModel.mjs');
  const ids = Array.from({ length: 1500 }, (_, index) => `id-${index}`);
  const worn = ids.map(id => noteWear(id)).filter(Boolean);
  const share = worn.length / ids.length;
  assert.ok(share > 0.3 && share < 0.55, `about four in ten notes wear a corner, saw ${(share * 100).toFixed(1)}%`);
  assert.deepEqual(noteWear('id-42'), noteWear('id-42'), 'the same id must wear the same way');
  const corners = new Set(worn.flatMap(wear => wear.corners));
  assert.deepEqual([...corners].sort(), ['bl', 'br', 'tl', 'tr'], 'all four corners are used');
  for (const wear of worn) {
    assert.ok(wear.alpha >= 0.10 && wear.alpha <= 0.22, 'the shade is seen, and stays light enough to read through');
    assert.ok(wear.lift >= 1 && wear.lift <= 3);
    assert.match(wear.shade, /^radial-gradient\(circle [0-9]+px at (0%|100%) (0%|100%)/);
  }
  assert.equal(noteWear(''), null);
  assert.equal(noteWear(undefined), null);
});

test('the board paints the wear on the note, and never on a print', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  assert.ok(script.includes('const wear = picture ? null : noteWear(sticky.id);'), 'prints stay flat');
  assert.ok(script.includes("note.dataset.wear = wear.corners.join(' ')"));
  assert.ok(script.includes("note.style.setProperty('--wear-shade', wear.shade)"));
  assert.ok(css.includes('.sticky-note[data-wear]::after'), 'the shade is drawn by the stylesheet');
  assert.ok(css.includes('background-image: var(--wear-shade, none)'));
  assert.ok(css.includes('pointer-events: none'), 'the shade must not eat clicks');
});

test('a note creases up as its own life runs out', async () => {
  const { noteAgeFraction, noteAgeTextureOpacity, noteTexturePlacement } =
    await import('../stickyNotesModel.mjs');
  const born = 1000000;
  const dies = born + 86400 * 4;
  const at = share => born + (dies - born) * share;
  assert.equal(noteAgeFraction(born, dies, born), 0);
  assert.equal(noteAgeFraction(born, dies, dies), 1);
  assert.equal(noteAgeFraction(born, 0, born + 10), null, 'a note with no expiration has no age');
  assert.equal(noteAgeFraction(born, born, born), null, 'a note that never lived has no age');
  assert.equal(noteAgeTextureOpacity(noteAgeFraction(born, dies, at(0.1))), 0, 'fresh paper is unmarked');
  const quarter = noteAgeTextureOpacity(noteAgeFraction(born, dies, at(0.25)));
  const half = noteAgeTextureOpacity(noteAgeFraction(born, dies, at(0.5)));
  assert.ok(quarter > 0.1 && quarter < 0.25, 'a quarter through, the creases are faint');
  assert.ok(half > 0.5 && half < 0.65, 'half through, they are half there');
  assert.equal(noteAgeTextureOpacity(noteAgeFraction(born, dies, at(0.75))), 1, 'three quarters is the whole paper');
  assert.equal(noteAgeTextureOpacity(noteAgeFraction(born, dies, at(0.99))), 1, 'and it never goes past that');
});

test('every note wears the creases differently, and always the same way for itself', async () => {
  const { noteTexturePlacement } = await import('../stickyNotesModel.mjs');
  const ids = Array.from({ length: 400 }, (_, index) => 'note-' + index);
  const seen = ids.map(id => noteTexturePlacement(id));
  assert.deepEqual(seen[0], noteTexturePlacement(ids[0]), 'the same note always sits the same way');
  const angles = seen.map(p => p.angle);
  assert.ok(new Set(angles).size > 200, 'angles are spread, not repeated');
  const tally = angles.reduce((all, angle) => ({...all, [angle]: (all[angle] || 0) + 1}), {});
  assert.ok(Math.max(...Object.values(tally)) < 15, 'no single angle is worn by a crowd');
  for (const p of seen) {
    assert.ok(p.angle >= 0 && p.angle < 360);
    assert.ok(p.scale >= 1 && p.scale < 1.3);
    assert.ok(Math.abs(p.shiftX) <= 14 && Math.abs(p.shiftY) <= 14);
  }
});

test('the crease picture is painted under the writing, never over it', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  assert.ok(script.includes('noteAgeTextureOpacity(noteAgeFraction(sticky.createdAt, sticky.expiration))'));
  assert.ok(script.includes("texture.style.setProperty('--texture-opacity'"));
  assert.ok(css.includes("url('/img/note-crumple.png')"));
  assert.ok(css.includes('mix-blend-mode: multiply'), 'multiply keeps the note its own colour');
  assert.ok(css.includes('overflow: hidden'), 'the rotated picture is clipped to the note');
  assert.ok(css.includes('.sticky-note { isolation: isolate;'), 'the note is its own blending group');
  const printAt = script.indexOf('note.appendChild(print)');
  const textureAt = script.indexOf("texture.className = 'sticky-note__texture'");
  assert.ok(printAt !== -1 && textureAt > printAt, 'the creases are built after the photograph, so they lie over it');
  assert.ok(script.includes('note.append(texture)'), 'and are the last thing on the note');
});

test('the note menu says will be gone, and how much of its life is spent', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('id="noteExpiresLabel" hidden>Will be gone<'), 'the row reads will be gone');
  assert.ok(!html.includes('Hidden here'), 'the old wording is gone');
  assert.ok(html.includes('id="noteExpiryAged"'), 'the countdown has a neighbour for the age');
  assert.ok(script.includes('noteAgeFraction(createdAt, expiresAt / 1000)'), 'the age is the same one the paper shows');
  assert.ok(script.includes('% aged'), 'the age is written as a percentage');
  assert.ok(script.includes('startNoteExpiryCountdown(expiresAt, Number(record.event.created_at))'),
    'the row needs the birth time to work out its age');
});

test('a print is told to put the creases over its photograph', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  // The photograph is a positioned box at z-index 1, so being the note's last child is not enough: a plain
  // note needs no z-index, a print needs one above the picture, and the caption needs one above the creases.
  assert.ok(css.includes('.sticky-note__print { position: relative; z-index: 1;'),
    'the picture still sits at z-index 1, which is why the print needs its own rule');
  assert.ok(css.includes('.sticky-note--print .sticky-note__texture { z-index: 2; }'),
    'the creases lie over the photograph');
  assert.ok(css.includes('.sticky-note--print .sticky-note__author { z-index: 3; }'),
    'the caption lies over the creases');
});

test('the gear panel is titled Settings, and the button says the same', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<h2 id="boardStyleTitle">Settings</h2>'), 'the panel heading reads Settings');
  assert.ok(!html.includes('>Board style<'), 'the older heading is gone');
  assert.ok(html.includes('aria-label="Settings"'), 'the gear announces the same word');
});

test('the react-or-zap card keeps its contents off the border', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  // .sticky-dialog declares padding: 0 lower down the file, so an inset written on .note-gift-dialog alone is
  // overridden on order at equal specificity - which is exactly how the contents ended up on the border.
  assert.ok(css.includes('.sticky-dialog.note-gift-dialog {'), 'the inset needs a compound selector to win');
  assert.ok(css.includes('padding: 24px 22px 22px;'), 'and the inset itself');
  assert.ok(css.includes('background: var(--surface-raised)'), 'the controls follow the reader theme');
  assert.ok(css.includes('border-top: 1px solid var(--border)'), 'the two questions are told apart by a hairline');
  assert.ok(css.includes('white-space: nowrap'), 'an amount never breaks across two lines');
  assert.ok(css.includes('.note-gift-dialog .note-menu__close { position: absolute;'), 'the close button takes a corner, not a row');
});

test('a zap code is drawn in a quiet zone, at whole pixels, and never scaled', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  // Wallets refused the code this board drew: the module grid was the whole canvas, so the dark squares touched
  // all four edges, and the stylesheet then scaled that canvas to a fixed width, resampling the modules.
  assert.ok(script.includes('const quiet = 4;'), 'four light modules on every side, as the specification asks');
  assert.ok(script.includes('(column + quiet) * cell'), 'the grid is drawn inside that margin');
  assert.ok(!script.includes('const cell = 6;'), 'the old fixed module size is gone');
  assert.ok(script.includes('canvas.style.width = `${side / ratio}px`'), 'the canvas is shown at the size it was drawn');
  assert.ok(css.includes('.nostr-connect-qr__canvas { max-width: 100%; height: auto;'), 'the stylesheet does not scale a code');
  assert.ok(!css.includes('.note-gift__qr canvas, .note-gift__qr img { width: min('), 'nor the card code');
});

test('a free-tier name is covered for life, not missing a subscription', async () => {
  const { subscriptionFreeOffer } = await import('../stickyNotesModel.mjs');

  // A three-letter name pays nothing, in the desk's own answer: prices.free comes from the reader's quote.
  const three = subscriptionFreeOffer({free: true, memberNameLength: 3, weekSats: 0, yearSats: 0});
  assert.equal(three.label, 'Free for life');
  assert.match(three.sentence, /3-letter name is free for life/);
  assert.match(three.sentence, /nothing to pay/, 'the reader is told they owe nothing');
  assert.match(three.sentence, /nothing to renew/, 'and that there is no renewal to wait for');

  // A four-letter name is a member at half price, not free, so it keeps the ordinary card.
  assert.equal(subscriptionFreeOffer({free: false, memberNameLength: 4, weekSats: 5, yearSats: 205}), null);
  // Nothing to go on is not a free tier.
  assert.equal(subscriptionFreeOffer({}), null);
  assert.equal(subscriptionFreeOffer(undefined), null);
  assert.equal(subscriptionFreeOffer({free: 'yes'}), null, 'only the desk\u2019s own true counts');
  // A free answer without a name length still says what matters.
  assert.match(subscriptionFreeOffer({free: true}).sentence, /^Free for life/);

  // And the card uses it instead of reporting an inactive subscription.
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  assert.ok(script.includes('subscriptionFreeOffer(state.prices)'), 'the card asks the model');
  assert.ok(script.includes("free ? free.label : (resolved ? 'Not active'"),
    'a free name is never called Not active');
  assert.ok(script.includes('elements.accountSubscriptionNone.textContent = free.sentence'));
});

test('a click outside a modal puts it away, and a click on the card does not', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');

  // Every modal on the page, not a hand-kept list of them: a dialog added later is wired by the same pass.
  assert.ok(script.includes("document.querySelectorAll('dialog').forEach(closeOutsideModal)"),
    'the wiring is by selector, so no modal is left out');
  assert.ok(script.includes('if (event.target !== dialog) return;'),
    'a click on a child targets the child, so it never closes the dialog');
  const box = script.slice(script.indexOf('const box = dialog.getBoundingClientRect();'));
  assert.ok(box.includes('event.clientX < box.left'), 'the rectangle keeps a padding click from closing it');
  assert.ok(script.includes('if (outside) dialog.close();'), 'and it closes through close(), so the close handlers run');
  assert.ok(script.includes("dialog.dataset.outsideClose === 'on'"), 'wiring twice would close it on the first click');

  // The page really does carry the dialogs this is for.
  const count = (html.match(/<dialog\b/g) || []).length;
  assert.ok(count >= 15, `expected the board's dialogs, found ${count}`);

  // The question-mark explainers are <details>, not dialogs, and a reader expects the same of them.
  assert.ok(script.includes('details.board-depth-help, details.user-relays__explainer'));
  assert.ok(script.includes('if (!explainer.open || explainer.contains(event.target)) return;'),
    'a click inside an open explainer leaves it open');
  assert.ok(script.includes('explainer.open = false;'), 'a click anywhere else puts it away');
});

test('an empty board shows where to press, and the chooser waits to be asked for', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const html = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');

  // A clue above the sentence, pressable, and out of the way until there is no board to look at.
  assert.ok(html.includes('id="boardEmptyHint"'), 'the clue exists');
  assert.ok(html.includes('aria-label="Choose a geohash board"'), 'and says what it opens');
  assert.ok(/id="boardEmptyHint"[^>]*hidden/.test(html), 'it starts hidden');

  // The pulse itself: from its own size to more than twice it, and back.
  const frames = css.slice(css.indexOf('@keyframes board-hint-pulse'), css.indexOf('@keyframes board-hint-pulse') + 200);
  const scales = [...frames.matchAll(/scale\(([\d.]+)\)/g)].map(match => Number(match[1]));
  assert.ok(scales.includes(1), 'it starts at its own size');
  const peak = Math.max(...scales);
  assert.ok(peak >= 2, `the peak must be at least double, found ${peak}`);
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'and it does not move for a reader who asked for less');
  assert.ok(css.includes('.board-empty-hint.is-pulsing { animation: none; }'), 'the reduced-motion answer is to hold still');

  // The press does what the clue promises, and the clue is a standing invitation rather than a one-shot: it comes
  // back when the reader closes the chooser without picking a board, because the empty board is where they land.
  const wiring = script.slice(script.indexOf("elements.boardEmptyHint.addEventListener('click'"));
  assert.ok(wiring.slice(0, 400).includes('showDialog(elements.boardDialog)'), 'the press opens the board chooser');
  assert.ok(wiring.slice(0, 400).includes('elements.boardGeohash.focus()'), 'with the board field ready to type in');
  assert.doesNotMatch(script, /BOARD_HINT_KEY|localStorage\.setItem\([^)]*hint/i,
    'nothing is remembered about the clue, so it cannot be spent');
  assert.doesNotMatch(script, /settleBoardEmptyHint/, 'and there is no state that could hide it for good');
  assert.ok(script.includes('renderBoardEmptyHint();'), 'the board control keeps it in step with the board');

  // A first visit is read, not interrupted: the empty board carries the sentence and the marker, and the chooser
  // waits to be asked for.
  const bootAt = script.lastIndexOf("status(elements.boardStatus, 'Choose a geohash to open its board.')");
  assert.ok(bootAt > 0, 'the empty board still says what to do');
  const bootElse = script.slice(bootAt, bootAt + 600);
  assert.ok(bootElse.includes('renderBoardEmptyHint();'), 'and shows where to press');
  assert.doesNotMatch(bootElse.slice(0, bootElse.indexOf('}')), /showDialog\(/,
    'no dialog is thrown at a visitor who has not asked for one');

  // Never pulsing behind the chooser, which is already asking the question the clue points at.
  assert.ok(script.includes('const show = !activeGeohashes.length && !elements.boardDialog?.open;'),
    'the clue stands down while the chooser is open');
  // Every dialog opens through showDialog, so that is where the clue is re-checked; the chooser closing is the
  // other half, or a reader who dismisses it would never see the clue again.
  const showDialog = script.slice(script.indexOf('function showDialog(dialog)'), script.indexOf('function showDialog(dialog)') + 700);
  assert.ok(showDialog.includes('renderBoardEmptyHint();'), 'opening any dialog re-checks the clue');
  assert.ok(script.includes("elements.boardDialog.addEventListener('close', renderBoardEmptyHint);"),
    'and closing the chooser lets it come back');
});

test('every socket on the rail says what it stands for, and whether its notes show', async () => {
  const { boardLampInfo, boardLampSummary, boardLampCount, boardLampExampleCell, boardDepthCeiling, BOARD_LAMP_SOCKETS } =
    await import('../stickyNotesModel.mjs');
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const rail = (cells, depth) => Array.from({ length: 6 }, (unused, index) => boardLampInfo(index, cells, depth));
  const lights = rows => rows.map(row => (row.lit ? 'green' : row.hidden ? 'red' : 'off'));

  assert.equal(BOARD_LAMP_SOCKETS, 6);

  // Only the levels UNDER the board are measured. The board's own level and every board above it stay dark, whatever
  // the depth setting says: lighting them green or red would claim something about a level this board is not showing.
  assert.deepEqual(lights(rail(['u267'], 0)), ['off', 'red', 'red', 'red', 'red', 'red']);
  assert.equal(rail(['u267'], 0)[0].title, "Level 4 · u267 is this board's own cell");
  assert.deepEqual(lights(rail(['u267'], 1)), ['off', 'green', 'red', 'red', 'red', 'red']);
  assert.deepEqual(lights(rail(['u267'], 2)), ['off', 'green', 'green', 'red', 'red', 'red']);
  assert.deepEqual(lights(rail(['u267'], 5)), ['off', 'green', 'green', 'green', 'green', 'green']);
  // A depth past what the cell has is the same plate as the deepest level it does have.
  assert.deepEqual(lights(rail(['u267'], 6)), lights(rail(['u267'], 5)));
  assert.deepEqual(rail(['u267'], 2).map(row => row.level), [4, 5, 6, 7, 8, 9]);

  // A deeper socket names a real cell down there, not an ellipsis: the reader can see which board it means.
  assert.equal(boardLampExampleCell('u267', 6), 'u26700');
  assert.equal(boardLampExampleCell('u267', 5), 'u2670');
  assert.equal(boardLampExampleCell('u267', 4), '');
  assert.equal(boardLampExampleCell('', 5), '');
  assert.equal(rail(['u267'], 0)[2].title, 'Level 6 · notes from u26700 are 2 levels deeper — hidden');
  assert.equal(rail(['u267'], 2)[2].title, 'Level 6 · notes from u26700 are 2 levels deeper — shown');

  // An eight-letter board owns one level and has one below it.
  assert.equal(boardDepthCeiling(['u267tnw1']), 1);
  const deep = rail(['u267tnw1'], 0);
  assert.deepEqual(deep.map(row => row.state), ['above', 'above', 'above', 'above', 'own', 'hidden']);
  assert.deepEqual(lights(deep), ['off', 'off', 'off', 'off', 'off', 'red']);
  assert.equal(deep[3].title, 'Level 7 · u267tnw is a board above this one');
  assert.equal(deep[4].title, 'Level 8 · u267tnw1 is this board\'s own cell');
  assert.deepEqual(lights(rail(['u267tnw1'], 1)), ['off', 'off', 'off', 'off', 'off', 'green']);

  // A nine-letter board has nothing under it: every socket is dark, and no depth can light one.
  assert.equal(boardDepthCeiling(['u2678kx9z']), 0);
  assert.deepEqual(lights(rail(['u2678kx9z'], 0)), ['off', 'off', 'off', 'off', 'off', 'off']);
  assert.equal(rail(['u2678kx9z'], 6)[5].state, 'own');

  // Nothing at all is not a crash, and says so.
  assert.equal(boardLampInfo(0, [], 0).title, 'Level 4 · no board open');
  assert.equal(boardLampInfo(6, ['u267'], 0), null);
  assert.equal(boardLampInfo(-1, ['u267'], 0), null);
  assert.equal(boardLampInfo('x', ['u267'], 0), null);
  // A board of several cells names the first and counts the rest.
  assert.match(boardLampInfo(1, ['u267', 'u268'], 0).title, /\(\+1 more\)/);

  // The sentence counts the levels below the board that are showing, and names both colours in D's own words.
  const summary = boardLampSummary(['u267'], 2);
  assert.match(summary, /^2 of 5 levels below this board show notes here\./);
  assert.ok(summary.includes('Green = notes from this level show here. Red = notes in this level are hidden.'));
  assert.match(boardLampSummary(['u267tnw1'], 1), /^1 of 1 level below this board show notes here\./);
  assert.match(boardLampSummary(['u2678kx9z'], 0), /^This board is as deep as a cell goes, so no light burns\./);
  assert.equal(boardLampSummary([], 0), 'Green = notes from this level show here. Red = notes in this level are hidden.');

  // boardLampCount still answers the arithmetic question: how many levels lie under a cell.
  assert.equal(boardLampCount('u267'), 5);
  assert.equal(boardLampCount('u267tnw1'), 1);

  // And the plate carries it: one sentence on the strip, one line per socket, red only for a level the depth hides.
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  const rails = script.slice(script.indexOf('function renderBoardLamps()'), script.indexOf('function pulseLamps()'));
  assert.ok(rails.includes('strip.title = summary;'), 'the plate explains itself once');
  assert.ok(rails.includes("strip.setAttribute('role', 'button')"), 'and is pressable, not only readable');
  assert.ok(rails.includes('lamp.title = info.title;'), 'each socket explains its own level');
  assert.ok(rails.includes("lamp.setAttribute('aria-hidden', 'true')"), 'the sockets are not repeated to a screen reader');
  assert.ok(sheet.includes('.board-frame__lamp--hidden'), 'a hidden level is red on the plate');
  assert.ok(sheet.includes('.lamp-dialog__row--hidden .lamp-dialog__dot'), 'and red in the legend');

  // The legend reads the same states, so a hover and a tap cannot disagree.
  const legend = script.slice(script.indexOf('function renderLampDialog()'), script.indexOf('function openLampLegend()'));
  assert.ok(legend.includes('const info = boardLampInfo(index, activeGeohashes, boardDepth);'));
  assert.ok(legend.includes("const states = {shown: 'shown', own: 'this board', hidden: 'hidden', above: 'above', none: 'no board'};"));
  assert.ok(legend.includes('lamp-dialog__row--hidden'));
  const page = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');
  assert.ok(page.includes('id="lampDialog"'), 'the legend has a dialog');
  assert.ok(page.includes('id="lampDialogRows"'), 'with a list to fill');
});

test('every top button wears the same resting border', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../stickyNotes.html', import.meta.url), 'utf8');

  // The row is six buttons that must look like six buttons. One of them reserves room for a green ring while a
  // filter is on, and it did that with a transparent border - so it alone had no border at rest.
  assert.doesNotMatch(css, /\\.note-sort-button \\{[^}]*solid transparent/, 'the sort button does not hide its own outline');
  const sort = css.slice(css.indexOf('.note-sort-button {'), css.indexOf('.note-sort-button {') + 120);
  assert.match(sort, /border: 1px solid rgba\(255,255,255,\.24\)/,
    'the sort button wears the same border as the five beside it');
  const active = css.slice(css.indexOf('.note-sort-button.has-active-filter'));
  assert.match(active.slice(0, 200), /border-width:2px/, 'and its green ring is still wider than the resting one');

  // The box stays put either way: the row is border-box, 40 by 40, so the wider ring cannot move the neighbours.
  assert.match(css, /box-sizing: border-box/, 'border-box is what makes the wider ring free');
  const top = css.slice(css.indexOf('.sticky-top-button {'), css.indexOf('.sticky-top-button {') + 260);
  assert.match(top, /width: 40px; height: 40px/);

  // And the button the reader is looking for is really in the row.
  assert.ok(page.includes('id="noteSort"'), 'the sort button exists');
  assert.ok(page.includes('class="sticky-top-button note-sort-button"'), 'and is one of the top buttons');
});

test('the plates are reachable, not just labelled', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');

  // The frame is decorative chrome and refuses the pointer. A title on a descendant of a pointer-events:none box is
  // a title nobody can hover, and a click handler on it never runs - which is exactly what happened: the sockets
  // were labelled and unreachable at the same time.
  const frame = css.slice(css.indexOf('.board-frame {'), css.indexOf('.board-frame {') + 200);
  assert.match(frame, /pointer-events:\s*none/, 'the frame still refuses the pointer');
  assert.match(css, /\.board-frame__lamps \{[^}]*pointer-events:\s*auto/, 'and the plates take it back');

  // A press on a plate must not start a pan on the board underneath, or the pan eats the tap.
  assert.match(script, /strip\.addEventListener\('pointerdown', event => event\.stopPropagation\(\)\)/,
    'a plate keeps its own press');
  assert.match(script, /strip\.addEventListener\('click', openLampLegend\)/);
});

test('a stand-in pin is the real thing, not a picture of one', async () => {
  const { readFileSync } = await import('node:fs');
  const { URL } = await import('node:url');
  const script = readFileSync(new URL('../stickyNotes.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../stickyNotes.css', import.meta.url), 'utf8');

  // The layer refuses the pointer so a stand-in cannot block the board, and the stand-in's own class is the only
  // thing that puts it back in front of the pointer. The pin was built with the note's class alone, so the CSS rule
  // for the layer's pin matched nothing: the stand-ins were painted above the pile but inert, and a press landed on
  // whatever note was underneath - the pin of the covered note looked present and did not work.
  assert.match(css, /\.board-pin-layer \{[^}]*pointer-events:\s*none/, 'the layer stays out of the way of the board');
  assert.match(css, /\.board-pin-layer__pin \{[^}]*pointer-events:\s*auto/, 'and its pins are put back in front of it');
  assert.ok(script.includes("pin.className = 'sticky-note__pin board-pin-layer__pin';"),
    'so the pin wears both names: the look of a note pin and the reach of a layer pin');

  // Nothing else in the layer may claim the pointer, or a stand-in would be a wall over the pile.
  assert.equal((css.match(/pointer-events:\s*auto/g) || []).filter(Boolean).length >= 1, true);
  const layerPins = script.slice(script.indexOf('function buriedPinProxy'), script.indexOf('function raiseNote'));
  assert.ok(layerPins.includes("pin.addEventListener('click'"), 'the stand-in pin opens its own note');
  assert.ok(layerPins.includes('raiseNote(record.sticky.id);'), 'and lifts it over the pile');
  assert.ok(layerPins.includes('openNoteMenu(record.sticky.id, pin);'), 'showing that note, not the one in front');
});
