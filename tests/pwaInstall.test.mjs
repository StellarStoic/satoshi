import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('every regular page that loads the PWA controller also links the manifest', async () => {
  const files = (await readdir(root)).filter(file => file.endsWith('.html'));
  for (const file of files) {
    const html = await read(file);
    if (!html.includes('pwa.js')) continue;
    assert.match(html, /rel="manifest" href="\/site\.webmanifest"/, `${file} is missing the shared manifest`);
  }
});

test('the manifest covers every page and Settings exposes installation', async () => {
  const manifest = JSON.parse(await read('site.webmanifest'));
  const controller = await read('pwa.js');
  const settings = await read('settings.html');
  const settingsScript = await read('settings.js');

  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.match(controller, /beforeinstallprompt/);
  assert.doesNotMatch(controller, /label: 'Install Satoshi\.si'/);
  assert.match(controller, /await prompt\.prompt\(\)/);
  assert.match(controller, /window\.satoshiPwa = Object\.freeze/);
  assert.match(settings, /id="installSatoshiApp"/);
  assert.match(settingsScript, /window\.satoshiPwa\?\.install\(\)/);
});
