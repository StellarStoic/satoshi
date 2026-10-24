import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  btcMapAuthTemplate,
  btcMapPlaceUrl,
  btcMapPlacesUrl,
  btcMapSearchUrl,
  BTC_MAP_AUTH_URL,
  BTC_MAP_SAVED_URL,
  haversineKm,
  nip98Authorization,
  osmPlaceUrl,
  placeCollection,
  safeHttpUrl,
  verificationLabel,
  viewportRadiusKm,
} from '../btcMapModel.mjs';

test('NIP-98 login is scoped to the exact BTC Map endpoint and method', () => {
  assert.equal(BTC_MAP_AUTH_URL, 'https://api.btcmap.org/v4/auth/nostr');
  assert.equal(BTC_MAP_SAVED_URL, 'https://api.btcmap.org/v4/places/saved');
  assert.deepEqual(btcMapAuthTemplate(1_700_000_000_999), {
    kind:27235,
    created_at:1_700_000_000,
    tags:[['u', BTC_MAP_AUTH_URL], ['method', 'POST']],
    content:'',
  });
  const proof = {kind:27235, content:'', tags:[], created_at:1, pubkey:'a', id:'b', sig:'c'};
  assert.deepEqual(JSON.parse(Buffer.from(nip98Authorization(proof).slice(6), 'base64').toString()), proof);
});

test('BTC Map API URLs use v4 and bounded inputs', () => {
  assert.equal(btcMapPlacesUrl({lat:46.05,lon:14.5,radiusKm:999}),
    'https://api.btcmap.org/v4/places/search/?lat=46.05&lon=14.5&radius_km=300');
  assert.match(btcMapSearchUrl('bitcoin cafe', {lat:46,lon:14}, 999),
    /^https:\/\/api\.btcmap\.org\/v4\/search\/\?q=bitcoin\+cafe&limit=100&lat=46&lon=14$/);
  assert.match(btcMapPlaceUrl('node:123'), /\/v4\/places\/node%3A123\?fields=/);
});

test('viewport radius is geographic and capped', () => {
  assert.ok(haversineKm({lat:0,lon:0},{lat:0,lon:1}) > 110);
  assert.ok(haversineKm({lat:0,lon:0},{lat:0,lon:1}) < 112);
  assert.equal(viewportRadiusKm({lat:0,lon:0},{lat:50,lon:50}), 300);
});

test('place collections discard invalid coordinates and keep safe marker data', () => {
  const collection = placeCollection([
    {id:7,lat:46,lon:14,name:'Sats Cafe',verified_at:'2026-01-01',boosted_until:'2999-01-01'},
    {id:8,lat:'nope',lon:14,name:'Broken'},
  ]);
  assert.equal(collection.features.length, 1);
  assert.deepEqual(collection.features[0].geometry.coordinates, [14,46]);
  assert.equal(collection.features[0].properties.name, 'Sats Cafe');
  assert.equal(collection.features[0].properties.boosted, true);
});

test('labels and outbound URLs fail safely', () => {
  assert.equal(verificationLabel('', Date.UTC(2026,0,1)), 'Not recently verified');
  assert.equal(verificationLabel('2026-01-01', Date.UTC(2026,0,1)), 'Verified today');
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(osmPlaceUrl({lat:46,lon:14}), 'https://www.openstreetmap.org/?mlat=46&mlon=14#map=19/46/14');
});

test('BTC Map page is integrated with navigation, help, PWA and page context', async () => {
  const [html, css, page, pwa, help, context, seo, worker, sitemap] = await Promise.all([
    readFile(new URL('../btcMap.html', import.meta.url), 'utf8'),
    readFile(new URL('../btcMap.css', import.meta.url), 'utf8'),
    readFile(new URL('../btcMap.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../pwa.js', import.meta.url), 'utf8'),
    readFile(new URL('../siteHelp.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../AI_CONTEXT.md', import.meta.url), 'utf8'),
    readFile(new URL('../seo.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../sitemap.xml', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="toggle"/);
  assert.match(html, /<nav id="menu"[^>]*><ul><\/ul><\/nav>/);
  assert.match(html, /id="btcMapLocate"/);
  assert.match(html, /id="btcMapAccount"/);
  assert.match(html, /id="btcMapAccountDialog"/);
  assert.match(html, /class="footer" data-live-footer/);
  assert.match(html, /vendor\/maplibre\/maplibre-gl\.js/);
  assert.match(css, /\.btc-map-shell \{ position:fixed; inset:0 0 29px/);
  assert.match(page, /tiles\.openfreemap\.org\/styles\/liberty/);
  assert.match(page, /OpenStreetMap contributors/);
  assert.match(page, /Places <a href="https:\/\/btcmap\.org\/"/);
  assert.match(page, /AttributionControl/);
  assert.match(page, /'bottom-left'/);
  assert.doesNotMatch(html, /btc-map-credit/);
  assert.match(page, /cluster:true/);
  assert.match(page, /getClusterExpansionZoom/);
  assert.match(page, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(page, /btcMapAuthTemplate/);
  assert.match(page, /BTC_MAP_SAVED_URL/);
  assert.match(page, /sessionStorage\.setItem\(TOKEN_KEY/);
  assert.match(pwa, /\{label: 'BTC map', href: '\/btcMap\.html'\}/);
  assert.match(help, /'\/btcMap\.html'/);
  assert.match(help, /selector: '#btcMapLocate'/);
  assert.match(context, /### Page: \[BTC Map\]/);
  assert.match(seo, /'\/btcMap\.html'/);
  assert.match(worker, /'\/btcMap\.html', '\/btcMap\.css', '\/btcMap\.mjs', '\/btcMapModel\.mjs'/);
  assert.match(sitemap, /https:\/\/satoshi\.si\/btcMap\.html/);
});
