import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarEvent, calendarReference, appendCalendarReference, stickyNoteLength,
  calendarEventFromEvent, eventCoordinate, STICKY_MAX_CHARACTERS,
} from '../stickyNotesModel.mjs';
import {naddrEncode, bech32Decode} from '../noteGifts.mjs';

const PUBKEY = 'a'.repeat(64);

test('an event is built in the shape NIP-52 reads back', () => {
  const timed = buildCalendarEvent({title: 'Sunset ridge walk', identifier: 'ridge-walk', pubkey: PUBKEY,
    start: 1794000000, end: 1794007200, location: 'Krvavec, SI', tzid: 'Europe/Ljubljana'});
  assert.equal(timed.kind, 31923, 'a moment is 31923');
  assert.deepEqual(timed.tags, [
    ['d', 'ridge-walk'], ['title', 'Sunset ridge walk'],
    ['start', '1794000000'], ['end', '1794007200'],
    ['start_tzid', 'Europe/Ljubljana'], ['location', 'Krvavec, SI'],
  ]);
  // the card reads back what the writer typed
  const card = calendarEventFromEvent({...timed, pubkey: PUBKEY, id: 'b'.repeat(64)}, {timeZone: 'UTC'});
  assert.equal(card.title, 'Sunset ridge walk');
  assert.equal(card.location, 'Krvavec, SI');
  assert.equal(card.allDay, false);
  assert.equal(card.coordinate, eventCoordinate(31923, PUBKEY, 'ridge-walk'));

  const wholeDays = buildCalendarEvent({title: 'Two days', identifier: 'x', pubkey: PUBKEY,
    start: '2026-12-05', end: '2026-12-07', allDay: true});
  assert.equal(wholeDays.kind, 31922, 'whole days are 31922');
  assert.deepEqual(wholeDays.tags, [['d', 'x'], ['title', 'Two days'], ['start', '2026-12-05'], ['end', '2026-12-07']]);
  // NIP-52's end is exclusive, so the two days read as the fifth and the sixth
  assert.match(calendarEventFromEvent({...wholeDays, pubkey: PUBKEY, id: 'c'.repeat(64)}).when, /5 Dec 2026 – 6 Dec 2026/);
});

test('an event refuses what would publish as a broken one', () => {
  assert.throws(() => buildCalendarEvent({title: '  ', identifier: 'x', pubkey: PUBKEY, start: 100}), /what the event is/);
  assert.throws(() => buildCalendarEvent({title: 'x'.repeat(91), identifier: 'x', pubkey: PUBKEY, start: 100}), /too long/);
  assert.throws(() => buildCalendarEvent({title: 'x', identifier: 'has space', pubkey: PUBKEY, start: 100}), /identifier/);
  assert.throws(() => buildCalendarEvent({title: 'x', identifier: 'x', pubkey: 'not-a-key', start: 100}), /key that signs/);
  assert.throws(() => buildCalendarEvent({title: 'x', identifier: 'x', pubkey: PUBKEY, start: 100, end: 50}), /ends before/);
  assert.throws(() => buildCalendarEvent({title: 'x', identifier: 'x', pubkey: PUBKEY, start: 'soon'}), /start time/);
  assert.throws(() => buildCalendarEvent({title: 'x', identifier: 'x', pubkey: PUBKEY, start: 'yesterday', allDay: true}),
    /start date/);
});

test('the reference is one card, appended once, and the desk counts it as that card', () => {
  const naddr = naddrEncode({identifier: 'ridge-walk', pubkey: PUBKEY, kind: 31923});
  assert.match(naddr, /^naddr1[02-9ac-hj-np-z]+$/, 'a bech32 naddr, no b/i/o/1 in the data part');
  assert.equal(calendarReference(naddr), `nostr:${naddr}`);
  assert.equal(calendarReference(''), '');

  const once = appendCalendarReference('Ridge walk on Saturday', naddr);
  assert.equal(once, `Ridge walk on Saturday nostr:${naddr}`);
  assert.equal(appendCalendarReference(once, naddr), once, 'pressing the button twice does not stack references');
  assert.equal(appendCalendarReference('   ', naddr), `nostr:${naddr}`, 'an event note needs no words of its own');
  assert.equal(stickyNoteLength(once), 'Ridge walk on Saturday'.length + 1 + 'calendar event'.length,
    'the reference costs the label the reader sees, not seventy characters of address — the same rule the desk applies');
});

test('the naddr decodes back to the event it names', () => {
  const naddr = naddrEncode({identifier: 'ridge-walk', pubkey: PUBKEY, kind: 31923});
  const decoded = bech32Decode(naddr);
  assert.equal(decoded.hrp, 'naddr');
  // TLV: identifier (0), author (2), kind (3) — the order NIP-19 lays out, read back from the bytes
  const fields = {};
  const bytes = decoded.bytes;
  for (let at = 0; at < bytes.length;) {
    const type = bytes[at];
    const length = bytes[at + 1];
    fields[type] = bytes.slice(at + 2, at + 2 + length);
    at += 2 + length;
  }
  assert.equal(new TextDecoder().decode(fields[0]), 'ridge-walk', 'the identifier is field 0');
  assert.equal([...fields[2]].map(b => b.toString(16).padStart(2, '0')).join(''), PUBKEY, 'the author is field 2');
  assert.equal((fields[3][0] << 24 | fields[3][1] << 16 | fields[3][2] << 8 | fields[3][3]) >>> 0, 31923,
    'the kind is field 3, big-endian');
});

test('an event note is still one ordinary note, with the same ceiling', () => {
  const naddr = naddrEncode({identifier: 'x', pubkey: PUBKEY, kind: 31923});
  const room = 'word '.repeat(Math.floor(STICKY_MAX_CHARACTERS / 5));
  // the reference is worth the card's label, so a note full of words plus an event is judged on that label
  const tooLong = appendCalendarReference(room, naddr);
  assert.ok(stickyNoteLength(tooLong) > STICKY_MAX_CHARACTERS - 'calendar event'.length,
    'a note that is already full cannot also carry an event');
});
