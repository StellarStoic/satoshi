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
  assert.match(script, /function closeSubmenus\(\)/);
  assert.match(script, /removeClass\(theMenu, 'submenu-view'\)/);
});

test('opening a submenu hides the main choices and its heading acts as back', async () => {
  const [script, styles] = await Promise.all([
    readFile(new URL('../burgerMenu.js', import.meta.url), 'utf8'),
    readFile(new URL('../styles.css', import.meta.url), 'utf8'),
  ]);

  assert.match(script, /var wasActive = hasClass\(parentLi, 'active'\)/);
  assert.match(script, /addClass\(theMenu, 'submenu-view'\)/);
  assert.match(script, /if \(wasActive\)[\s\S]*removeClass\(theMenu, 'submenu-view'\)/);
  assert.match(styles, /#menu\.submenu-view > ul > li\s*\{[\s\S]*?max-height:\s*0;[\s\S]*?opacity:\s*0/);
  assert.match(styles, /#menu\.submenu-view > ul > li\.has-submenu\.active\s*\{[\s\S]*?opacity:\s*1/);
  assert.doesNotMatch(styles, /#menu\.submenu-view > ul > li\s*\{\s*display:\s*none/);
  assert.match(styles, /\.submenu\s*\{[\s\S]*?transition:\s*max-height 360ms[\s\S]*?opacity 220ms/);
  assert.match(styles, /#menu\s*\{[\s\S]*?transition:\s*opacity 260ms[\s\S]*?transform 320ms/);
});

test('shared menu follows theme contrast and fills mobile screens', async () => {
  const styles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const theme = await readFile(new URL('../theme.css', import.meta.url), 'utf8');

  assert.match(styles, /#menu li a\s*\{[^}]*color:\s*#fff/s);
  assert.match(theme, /html\[data-theme="ice"\][\s\S]*?#menu a[\s\S]*?color:\s*var\(--text\)/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?#menu\s*\{[^}]*width:\s*calc\(100vw - 24px\)/s);
  assert.match(styles, /#menu > ul > li > a,[\s\S]*?min-height:\s*52px/s);
});
