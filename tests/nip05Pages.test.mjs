import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('NIP-05 price cards keep their price and action in one caption', async () => {
  const html = await read('nip05.html');

  assert.equal((html.match(/class="image-box price-card"/g) || []).length, 3);
  assert.equal((html.match(/class="price-panel"/g) || []).length, 3);
  assert.equal((html.match(/class="price-action">Pick your name/g) || []).length, 3);
  assert.doesNotMatch(html, /<p class="price"><a/);
});

test('NIP-05 store loads the shared site menu', async () => {
  const html = await read('nip05store.html');
  const pwa = await read('pwa.js');

  assert.match(html, /<a href="#menu" id="toggle">/);
  assert.match(html, /<div id="menu">\s*<ul>/);
  assert.match(html, /<script src="pwa\.js" defer><\/script>/);
  assert.match(pwa, /label: 'NIP-05 name store', href: '\/nip05store\.html'/);
});
