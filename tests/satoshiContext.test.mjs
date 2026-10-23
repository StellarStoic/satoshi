import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {normalizeContextPath, parseAiContext, selectAiContext} from '../satoshiContext.mjs';

const markdown = await readFile(new URL('../AI_CONTEXT.md', import.meta.url), 'utf8');
const parsed = parseAiContext(markdown);

test('AI context has no unresolved runtime placeholder', () => {
  assert.doesNotMatch(markdown, /\{PAGE_CONTEXT\}/);
});

test('AI context maps every documented page to one URL', () => {
  assert.ok(parsed.introduction.includes('Synthetic Satoshi'));
  assert.ok(parsed.rules.includes('Protect secrets'));
  assert.equal(parsed.pages.size, 35);
  assert.equal(parsed.pages.get('/converter.html')?.name, 'Converter');
  assert.equal(parsed.pages.get('/nip05store.html')?.name, 'NIP-05 name store');
  assert.equal(parsed.pages.get('/bitcoinTxCost.html')?.name, 'Bitcoin and Ark Transaction Cost');
  assert.equal(parsed.pages.get('/stickyNotes.html')?.name, 'Pinstr');
  assert.equal(parsed.pages.get('/pinstrWorld.html')?.name, 'Pinstr 3D');
  assert.equal(parsed.pages.get('/nostrKeys.html')?.name, 'Nostr Keys');
  assert.equal(parsed.pages.get('/opreturn.html')?.name, 'OP_RETURN write');
  assert.equal(parsed.pages.get('/opreturnBoard.html')?.name, 'OP_RETURN read');
});

test('OP_RETURN context explains writing, reading, filtering, and AI privacy', () => {
  const write = selectAiContext(parsed, '/opreturn.html');
  assert.match(write, /80 UTF-8 bytes/);
  assert.match(write, /sharePattern/);
  assert.match(write, /does not receive the draft message, invoices, payment destinations/);
  const read = selectAiContext(parsed, '/opreturnBoard.html');
  assert.match(read, /readability heuristic/);
  assert.match(read, /untrusted public speech/);
  assert.match(read, /cannot edit or remove confirmed OP_RETURN data/);
});

test('Nostr Keys context explains the tool without inviting secret disclosure', () => {
  const selected = selectAiContext(parsed, '/nostrKeys.html');
  assert.match(selected, /browser-only Nostr key utility/);
  assert.match(selected, /never receives the converter input, converted values, generated keys, mined keys/);
  assert.match(selected, /Never ask the user to paste an `nsec`/);
});

test('every documented page exists in the site root', async () => {
  await Promise.all([...parsed.pages.keys()].map(async pagePath => {
    const pageUrl = new URL(`..${pagePath}`, import.meta.url);
    await assert.doesNotReject(() => readFile(pageUrl), `Missing page for ${pagePath}`);
  }));
});

test('path normalization supports root and subdirectory previews', () => {
  assert.equal(normalizeContextPath('/'), '/index.html');
  assert.equal(normalizeContextPath('/satoshi/converter.html'), '/converter.html');
});

test('only the current page details are selected', () => {
  const selected = selectAiContext(parsed, '/satoshi/isBip39.html');
  assert.match(selected, /Page: \[Is BIP39 Word\?]/);
  assert.match(selected, /## Interaction Rules/);
  assert.doesNotMatch(selected, /Page: \[Wallet]/);
  assert.doesNotMatch(selected, /Page: \[Price Scanner]/);
});
