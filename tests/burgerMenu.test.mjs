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

test('shared menu follows theme contrast and fills mobile screens', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const theme = await readFile(new URL('../theme.css', import.meta.url), 'utf8');

  assert.match(styles, /#menu li a\s*\{[^}]*color:\s*#fff/s);
  assert.match(theme, /html\[data-theme="ice"\] #menu a[\s\S]*?color:\s*#111820/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?#menu\s*\{[^}]*width:\s*calc\(100vw - 24px\)/s);
  assert.match(styles, /#menu > ul > li > a,[\s\S]*?min-height:\s*52px/s);
});
