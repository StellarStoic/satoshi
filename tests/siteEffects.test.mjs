import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('internal page fades use one reusable surface without TV/static leftovers', async () => {
  const [css, script] = await Promise.all([
    readFile(new URL('../siteEffects.css', import.meta.url), 'utf8'),
    readFile(new URL('../siteEffects.js', import.meta.url), 'utf8'),
  ]);

  assert.match(css, /\.site-page-fade--enter\.is-active\s*\{\s*opacity:\s*\.001/);
  assert.match(css, /\.site-page-fade--leave\.is-active\s*\{\s*opacity:\s*1/);
  assert.match(css, /transition:\s*opacity 620ms/);
  assert.doesNotMatch(css, /site-tv-|site-center-fade|site-tv-static|site-tv-roll/);
  assert.match(script, /overlay\.className = `site-page-fade site-page-fade--\$\{kind\}`/);
  assert.match(script, /overlay\?\.classList\.contains\('site-page-fade'\)/);
  assert.match(script, /requestAnimationFrame\(\(\) => overlay\?\.classList\.add\('is-active'\)/);
  assert.doesNotMatch(script, /site-tv-|site-tv-static|site-tv-roll|animationend/);
});
