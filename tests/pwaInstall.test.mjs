import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
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

test('one bad file cannot cost the install, and the panel still finds a time', async () => {
  const worker = await read('sw.js');
  const settingsScript = await read('settings.js');
  const workflow = await read('.github/workflows/history.yml');

  // the install no longer rejects as a unit, so the metadata below it is always written
  assert.doesNotMatch(worker, /await cache\.addAll\(/, 'cache.addAll is all-or-nothing');
  const install = worker.slice(worker.indexOf("addEventListener('install'"), worker.indexOf("addEventListener('activate'"));
  assert.match(install, /CORE\.map\(async path =>/, 'each file is cached on its own');
  assert.ok(install.indexOf('CACHE_METADATA_URL') > install.indexOf('CORE.map'),
    'the metadata must be written after the files, not instead of them');
  assert.match(install, /if \(response\.ok\) await cache\.put\(path, response\)/);

  // Every device must describe the same release. The Pages artifact records the commit that
  // last changed the worker, while daily data-only commits leave that timestamp alone.
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /git log -1 --format=%cI -- sw\.js/);
  assert.match(workflow, /> \/tmp\/satoshi-pages\/pwa-release\.json/);
  assert.match(worker, /fetch\('\/pwa-release\.json', \{cache: 'no-store'\}\)/);
  assert.match(worker, /release\?\.version === version/);
  assert.match(worker, /updatedAt: releasedAt \|\| new Date\(\)\.toISOString\(\)/);

  // the picker's library is precached; Leaflet has not been used by any page since the port
  assert.match(worker, /'\/vendor\/maplibre\/maplibre-gl\.js'/);
  assert.doesNotMatch(worker, /vendor\/leaflet/);

  // and the panel reads a fallback rather than giving up on a missing metadata entry
  assert.match(settingsScript, /async function oldestCachedDate\(cache\)/);
  assert.match(settingsScript, /const usable = value => \(Number\.isFinite\(Date\.parse\(String\(value \|\| ''\)\)\) \? String\(value\) : ''\)/);
  assert.match(settingsScript, /const updatedAt = usable\(details\.updatedAt\)\s*\n?\s*\|\| usable\(metadata && metadata\.headers\.get\('date'\)\)\s*\n?\s*\|\| await oldestCachedDate\(cache\)/);
  assert.match(settingsScript, /visibilitychange/);
  assert.match(settingsScript, /Date\.parse\(\(response && response\.headers\.get\('date'\)\) \|\| ''\)/);
});

test('every precached path resolves in the checkout, and the icon font is precached', async () => {
  // A batch of new CORE entries typed in one go loses a shared prefix or a directory more
  // easily than it looks, and the failure is a 404 that aborts that file's cache write with
  // nothing in the UI to say why. Holding the list against the checkout is what makes the
  // next addition safe (the icon font and its stylesheet moved in-house with Lineicons 5.1).
  const worker = await read('sw.js');
  const start = worker.indexOf('const CORE = [');
  assert.ok(start !== -1, 'CORE list not found in sw.js');
  const core = worker.slice(start, worker.indexOf('\n];', start));
  const paths = [...core.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(paths.length > 100, `expected the whole site in CORE, found ${paths.length} paths`);

  const missing = [];
  for (const path of paths) {
    if (path === '/') continue;
    try {
      await stat(new URL('.' + path, root));
    } catch {
      missing.push(path);
    }
  }
  assert.deepEqual(missing, [], 'CORE lists paths that do not exist in the repo');

  assert.match(worker, /'\/vendor\/lineicons\/lineicons\.css'/, 'the icon stylesheet must be precached');
  assert.match(worker, /'\/vendor\/lineicons\/lineicons-free\.woff2'/, 'the icon font must be precached');
});
