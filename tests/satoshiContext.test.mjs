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
  assert.equal(parsed.pages.size, 31);
  assert.equal(parsed.pages.get('/converter.html')?.name, 'Converter');
  assert.equal(parsed.pages.get('/nip05store.html')?.name, 'NIP-05 name store');
  assert.equal(parsed.pages.get('/bitcoinTxCost.html')?.name, 'Bitcoin and Ark Transaction Cost');
  assert.equal(parsed.pages.get('/stickyNotes.html')?.name, 'Pinstr');
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
