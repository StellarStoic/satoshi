import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

function headValue(html, pattern, label, file) {
  const value = html.match(pattern)?.[1]?.trim();
  assert.ok(value, `${file} needs a static ${label}`);
  return value;
}

test('every sitemap page has static, unique search metadata', async () => {
  const sitemap = await read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/satoshi\.si(?:\/[^<]*)?)<\/loc>/g)].map(match => match[1]);
  const titles = new Set();
  const descriptions = new Set();

  assert.ok(urls.length >= 25, 'the public sitemap should cover the site');
  assert.equal(new Set(urls).size, urls.length, 'sitemap URLs must not be duplicated');

  for (const url of urls) {
    const path = new URL(url).pathname;
    const file = path === '/' ? 'index.html' : path.slice(1);
    const html = await read(file);
    const title = headValue(html, /<title>([^<]+)<\/title>/i, 'title', file);
    const description = headValue(html, /<meta\s+name="description"\s+content="([^"]+)"/i, 'meta description', file);
    const canonical = headValue(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i, 'canonical URL', file);

    assert.equal(canonical, url, `${file} canonical must match its sitemap URL`);
    assert.ok(title.length >= 20 && title.length <= 70, `${file} title should be descriptive and concise`);
    assert.ok(description.length >= 70 && description.length <= 180, `${file} description should be useful and concise`);
    assert.ok(!titles.has(title), `${file} title must be unique`);
    assert.ok(!descriptions.has(description), `${file} description must be unique`);
    titles.add(title);
    descriptions.add(description);
  }
});

test('dynamic SEO matches public routes and supplies social and application data', async () => {
  const [seo, sitemap, index] = await Promise.all([read('seo.mjs'), read('sitemap.xml'), read('index.html')]);
  const paths = [...sitemap.matchAll(/https:\/\/satoshi\.si(\/[^<]*)</g)].map(match => match[1] || '/');

  for (const path of paths) {
    if (path === '/') assert.match(seo, /'\/':\s*\[/);
    else assert.ok(seo.includes(`'${path}': [`), `${path} needs a dynamic SEO entry`);
  }
  assert.match(seo, /twitter:image/);
  assert.match(seo, /og:image:alt/);
  assert.match(seo, /'@type': 'WebApplication'/);
  assert.match(seo, /price:\s*'0'/);
  assert.match(index, /<h1>Satoshi\.si Bitcoin tools, education and news<\/h1>/);
});

test('non-content utility pages stay out of search results and the sitemap', async () => {
  const sitemap = await read('sitemap.xml');
  for (const file of ['settings.html', 'offline.html', 'ai-callback.html', 'luckysats.html']) {
    const html = await read(file);
    assert.match(html, /<meta name="robots" content="noindex/i, `${file} should remain noindex`);
    assert.doesNotMatch(sitemap, new RegExp(file.replace('.', '\\.')));
  }
});
