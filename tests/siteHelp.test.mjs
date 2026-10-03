import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { helpForPath, PAGE_HELP } from '../siteHelp.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const existingTriggerPattern = /info-modal-trigger|lofi-help-trigger|id=["']helpIcon["']|id=["']mood-info-modal-btn["']/;

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
