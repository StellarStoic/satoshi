import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('settings exposes every site theme before the install action', async () => {
  const html = await read('settings.html');
  const values = [...html.matchAll(/<option value="([^"]+)">/g)].map(match => match[1]);
  const expected = ['legacy', 'coffee', 'forest', 'ocean', 'space', 'electric', 'ice', 'marshmellow', 'amsterdam'];

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
  const themes = ['coffee', 'forest', 'ocean', 'space', 'electric', 'ice', 'marshmellow', 'amsterdam'];

  for (const theme of themes) assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\]`));
  assert.match(css, /html\[data-theme="ice"\][\s\S]*color-scheme: light/);
  assert.match(css, /--page-bg: #f4f8fb/);
  assert.match(css, /--text: #111820/);
  assert.match(css, /html\[data-theme="marshmellow"\][\s\S]*--page-bg: #ffffff/);
  assert.match(css, /html\[data-theme="amsterdam"\][\s\S]*--accent: #ff4fd8/);
});

test('theme text, muted text, and accent pairs meet WCAG AA contrast', async () => {
  const css = await read('theme.css');
  const expand = hex => hex.length === 4 ? `#${[...hex.slice(1)].map(value => value.repeat(2)).join('')}` : hex;
  const luminance = input => {
    const hex = expand(input);
    const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (first, second) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  const palettes = [...css.matchAll(/(?:^|\n)(?::root|html\[data-theme="([^"]+)"\])\s*\{([\s\S]*?)\n\}/g)];
  for (const [, name = 'legacy', block] of palettes) {
    const value = variable => block.match(new RegExp(`--${variable}:\\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)`, 'i'))?.[1];
    const [background, text, muted, accent, accentContrast] = ['page-bg', 'text', 'text-muted', 'accent', 'accent-contrast'].map(value);
    if (![background, text, muted, accent, accentContrast].every(Boolean)) continue;
    assert.ok(contrast(background, text) >= 4.5, `${name} text contrast`);
    assert.ok(contrast(background, muted) >= 4.5, `${name} muted contrast`);
    assert.ok(contrast(background, accent) >= 4.5, `${name} accent text contrast`);
    assert.ok(contrast(accent, accentContrast) >= 4.5, `${name} accent control contrast`);
  }
});

test('root stylesheets do not use text sizes below 12 pixels', async () => {
  const directory = new URL('../', import.meta.url);
  const files = (await readdir(directory)).filter(file => file.endsWith('.css'));
  for (const file of files) {
    const css = await readFile(new URL(file, directory), 'utf8');
    assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px\b/, `${file} has sub-12px text`);
    assert.doesNotMatch(css, /font-size:\s*\.(?:[0-6][0-9]?|7[0-4])rem\b/, `${file} has sub-.75rem text`);
  }
});

test('special pages apply the saved theme without enabling the full PWA controller', async () => {
  const [bootstrap, offline, callback, standaloneStego] = await Promise.all([
    read('themeBootstrap.js'), read('offline.html'), read('ai-callback.html'), read('stego/stego.html'),
  ]);
  assert.match(bootstrap, /localStorage\.getItem\('satoshiSiteTheme'\)/);
  assert.match(bootstrap, /marshmellow/);
  assert.match(bootstrap, /amsterdam/);
  for (const html of [offline, callback, standaloneStego]) assert.match(html, /themeBootstrap\.js/);
});

test('Moscow Time sync state and fetched value retain the original display face', async () => {
  const css = await read('MoscowTime.css');
  const theme = await read('theme.css');

  assert.match(css, /#satoshisValue\s*\{[^}]*font-family:\s*'East Sea Dokdo', cursive !important;/s);
  assert.match(theme, /:not\(#satoshisValue\)/);
});
