import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { helpForPath, PAGE_HELP } from '../siteHelp.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const existingTriggerPattern = /info-modal-trigger|lofi-help-trigger|id=["']helpIcon["']|id=["']mood-info-modal-btn["']/;
const siteHelpSource = await readFile(new URL('../siteHelp.mjs', import.meta.url), 'utf8');
const siteHelpCss = await readFile(new URL('../siteHelp.css', import.meta.url), 'utf8');
const sharedStyles = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

test('every public PWA page has an existing explainer or concise shared help copy', async () => {
    const htmlFiles = (await readdir(projectRoot)).filter(file => file.endsWith('.html'));

    for (const page of htmlFiles) {
        const source = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
        if (!source.includes('pwa.js') || existingTriggerPattern.test(source)) continue;

        const help = helpForPath(`/${page}`);
        assert.ok(help, `${page} is missing help`);
        assert.ok(help.title.length > 4, `${page} needs a useful title`);
        assert.ok(help.description.length > 20, `${page} needs a useful description`);
        assert.ok(help.description.length < 260, `${page} help should stay concise`);
    }
});

test('nested deployment paths resolve by their HTML filename', () => {
    assert.deepEqual(helpForPath('/satoshi/converter.html'), PAGE_HELP['/converter.html']);
});

test('home resolves with and without an explicit filename', () => {
    assert.deepEqual(helpForPath('/'), PAGE_HELP['/']);
    assert.deepEqual(helpForPath('/index.html'), PAGE_HELP['/index.html']);
});

test('top controls are document-positioned and share one horizontal center line', () => {
    assert.match(siteHelpSource, /document\.body\.append\(trigger, companion\)/);
    assert.match(siteHelpSource, /trigger\.parentElement !== document\.body/);
    assert.doesNotMatch(siteHelpSource, /document\.documentElement\.append/);
    assert.doesNotMatch(siteHelpSource, /setProperty\('position', 'fixed'/);
    assert.doesNotMatch(siteHelpCss, /position:\s*fixed\s*!important/);
    assert.match(siteHelpCss, /\.site-help-trigger\s*\{[\s\S]*?position:\s*absolute\s*!important;[\s\S]*?top:\s*calc\(19px \+ env\(safe-area-inset-top\)\)[\s\S]*?height:\s*40px/);
    assert.match(siteHelpCss, /\.site-help-companion\s*\{[\s\S]*?position:\s*absolute\s*!important;[\s\S]*?top:\s*calc\(19px \+ env\(safe-area-inset-top\)\)/);
    assert.match(sharedStyles, /#toggle\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*calc\(24px \+ env\(safe-area-inset-top\)\)[\s\S]*?height:\s*30px/);
    assert.match(sharedStyles, /#toggle span\s*\{[\s\S]*?top:\s*12px/);
});

test('page-specific top controls do not restore viewport-fixed positioning', async () => {
    const checks = [
        ['quotes.css', /#next-quote\s*\{[^}]*position:\s*fixed/s],
        ['converter.css', /(?:body\s*>\s*#toggle|\.add-currency-icon)[^{]*\{[^}]*position:\s*fixed/s],
        ['isBip39.css', /(?:\.info-modal-trigger|\.wordlist-settings-trigger)\s*\{[^}]*position:\s*fixed/s],
        ['lofi.css', /\.lofi-help-trigger\s*\{[^}]*position:\s*fixed/s],
        ['stego.css', /#helpIcon\s*\{[^}]*position:\s*fixed/s],
        ['lottery.css', /\.info-modal-trigger\s*\{[^}]*position:\s*fixed/s],
        ['lotteryStats.css', /\.info-modal-trigger\s*\{[^}]*position:\s*fixed/s],
        ['lottery.html', /id="lotteryInfoTrigger"[^>]*position:\s*fixed/],
        ['lotteryStats.html', /id="lotteryInfoTrigger"[^>]*position:\s*fixed/],
        ['memedBitcoinMood.html', /id="mood-info-modal-btn"[^>]*position:\s*fixed/],
    ];
    for (const [file, pattern] of checks) {
        const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, pattern, `${file} fixes a top control to the viewport`);
    }
});
