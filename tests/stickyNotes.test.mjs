import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {STICKY_MAX_CHARACTERS, STICKY_MEMBER_PRICE_SATS, STICKY_PRICE_SATS, makeDeletionTemplate, makeStickyTemplate, parseStickyEvent, stickyContentHash, stickyOrderPrice} from '../stickyNotesModel.mjs';

test('sticky notes accept up to 501 characters', () => {
  assert.equal(STICKY_MAX_CHARACTERS, 501);
});

test('uses the authoritative whole-satoshi order price', () => {
  assert.equal(STICKY_PRICE_SATS, 21);
  assert.equal(STICKY_MEMBER_PRICE_SATS, 11);
  assert.equal(stickyOrderPrice({sats: 11}), 11);
  assert.equal(stickyOrderPrice({sats: 21}), 21);
  assert.equal(stickyOrderPrice({sats: 10.5}), 21);
  assert.equal(stickyOrderPrice({sats: 0}), 21);
});

test('sticky event round-trips its visual placement', () => {
  const template = makeStickyTemplate({content: '  hello cardboard  ', color: 'pink', font: 'handwritten', x: .25, y: .75, rotation: -4});
  const parsed = parseStickyEvent({...template, id: 'a'.repeat(64), pubkey: 'b'.repeat(64)});
  assert.equal(parsed.content, 'hello cardboard');
  assert.equal(parsed.color, 'pink');
  assert.equal(parsed.font, 'handwritten');
  assert.equal(parsed.x, .25);
  assert.equal(parsed.y, .75);
  assert.equal(parsed.rotation, -4);
});

test('content fingerprint binds the paid text and color', async () => {
  const first = await stickyContentHash('hello', 'yellow', 'typewriter', webcrypto);
  const same = await stickyContentHash(' hello ', 'yellow', 'typewriter', webcrypto);
  const changed = await stickyContentHash('hello', 'blue', 'typewriter', webcrypto);
  assert.equal(first, same);
  assert.notEqual(first, changed);
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
