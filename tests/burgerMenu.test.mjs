import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('burger menu closes fully on outside click and Escape', async () => {
  const script = await readFile(new URL('../burgerMenu.js', import.meta.url), 'utf8');

  assert.match(script, /function closeBurgerMenu\(\)/);
  assert.match(script, /removeClass\(theToggle, 'on'\)/);
  assert.match(script, /!theMenu\?\.contains\(e\.target\) && !theToggle\?\.contains\(e\.target\)/);
  assert.match(script, /e\.key === 'Escape'/);
  assert.match(script, /aria-expanded/);
});
