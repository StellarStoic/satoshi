import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('settings exposes every site theme before the install action', async () => {
  const html = await read('settings.html');
  const values = [...html.matchAll(/<option value="([^"]+)">/g)].map(match => match[1]);
  const expected = ['legacy', 'coffee', 'forest', 'ocean', 'space', 'electric', 'ice'];

  for (const theme of expected) assert.ok(values.includes(theme), `missing ${theme} theme`);
  assert.ok(html.indexOf('id="themeSetting"') < html.indexOf('id="installAppSetting"'));
});

test('shared PWA controller persists a validated theme with Legacy as fallback', async () => {
  const script = await read('pwa.js');

  assert.match(script, /const SATOSHI_THEME_SETTING = 'satoshiSiteTheme'/);
  assert.match(script, /SATOSHI_THEMES\.includes\(theme\) \? theme : 'legacy'/);
  assert.match(script, /localStorage\.setItem\(SATOSHI_THEME_SETTING, selectedTheme\)/);
  assert.match(script, /document\.documentElement\.dataset\.theme = selectedTheme/);
  assert.match(script, /event\.key === SATOSHI_THEME_SETTING/);
});

test('theme stylesheet defines all palettes and an accessible Ice mode', async () => {
  const css = await read('theme.css');
  const themes = ['coffee', 'forest', 'ocean', 'space', 'electric', 'ice'];

  for (const theme of themes) assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\]`));
  assert.match(css, /html\[data-theme="ice"\][\s\S]*color-scheme: light/);
  assert.match(css, /--page-bg: #f4f8fb/);
  assert.match(css, /--text: #111820/);
});

test('Moscow Time sync state and fetched value retain the original display face', async () => {
  const css = await read('MoscowTime.css');
  const theme = await read('theme.css');

  assert.match(css, /#satoshisValue\s*\{[^}]*font-family:\s*'East Sea Dokdo', cursive !important;/s);
  assert.match(theme, /:not\(#satoshisValue\)/);
});
