import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  btcMapAuthTemplate,
  btcMapHeatFeatures,
  btcMapPlaceUrl,
  btcMapPlacesUrl,
  btcMapSearchUrl,
  isIgnorableMapError,
  BTC_MAP_AUTH_URL,
  BTC_MAP_HEAT_PLACES_URL,
  BTC_MAP_SAVED_URL,
  haversineKm,
  nip98Authorization,
  osmPlaceUrl,
  placeDescription,
  placeOfferingFacts,
  placeCollection,
  placePaymentMethods,
  safeHttpUrl,
  verificationLabel,
  viewportCoverageContains,
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

test('buffered viewport coverage avoids refetching after small pans', () => {
  const coverage = {center:{lat:46.05, lon:14.5}, radiusKm:50};
  assert.equal(viewportCoverageContains(coverage, {lat:46.08, lon:14.55}, 35), true);
  assert.equal(viewportCoverageContains(coverage, {lat:46.5, lon:15.2}, 35), false);
  assert.equal(viewportCoverageContains(null, {lat:46.05, lon:14.5}, 1), false);
});

test('place heat map groups coordinates into closed hexagons', () => {
  assert.equal(BTC_MAP_HEAT_PLACES_URL, 'https://api.btcmap.org/v4/places?fields=id%2Clat%2Clon');
  const features = btcMapHeatFeatures([
    {lat:46.05, lon:14.5},
    {lat:46.05, lon:14.5},
    {lat:40.7, lon:-74},
    {lat:'bad', lon:14},
  ], 5);
  assert.equal(features.reduce((sum, feature) => sum + feature.properties.count, 0), 3);
  assert.ok(features.some(feature => feature.properties.count === 2));
  assert.ok(features.every(feature => feature.geometry.coordinates[0].length === 7));
  assert.ok(features.every(feature => JSON.stringify(feature.geometry.coordinates[0][0])
    === JSON.stringify(feature.geometry.coordinates[0][6])));
});

test('place heat map clips date-line cells to valid GeoJSON longitudes', () => {
  const features = btcMapHeatFeatures([{id:'nz', lat:-42.8, lon:178.4}], 2.2);
  assert.equal(features.length, 1);
  for (const [longitude, latitude] of features[0].geometry.coordinates[0]) {
    assert.ok(longitude >= -180 && longitude <= 180);
    assert.ok(latitude >= -90 && latitude <= 90);
  }
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
  assert.ok(collection.features[0].properties.tilt >= -20 && collection.features[0].properties.tilt <= 20);
  assert.equal(collection.features[0].properties.tilt,
    placeCollection([{id:7,lat:46,lon:14}]).features[0].properties.tilt,
    'the same place keeps the same marker tilt');
});

test('nonfatal map tile warnings do not masquerade as connection failures', () => {
  assert.equal(isIgnorableMapError(new Error('Expected value to be of type number, but found null instead.')), true);
  assert.equal(isIgnorableMapError(new DOMException('The operation was aborted', 'AbortError')), true);
  assert.equal(isIgnorableMapError(new Error('Failed to fetch')), false);
});

test('labels and outbound URLs fail safely', () => {
  assert.equal(verificationLabel('', Date.UTC(2026,0,1)), 'Not recently verified');
  assert.equal(verificationLabel('2026-01-01', Date.UTC(2026,0,1)), 'Verified today');
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(osmPlaceUrl({lat:46,lon:14}), 'https://www.openstreetmap.org/?mlat=46&mlon=14#map=19/46/14');
});

test('place details explain what a visitor can buy and how bitcoin is accepted', () => {
  assert.deepEqual(placeOfferingFacts({
    icon:'lunch_dining', 'osm:shop':'kiosk', 'osm:amenity':'fast_food',
    'osm:cuisine':'burger;pizza', 'osm:takeaway':'only',
  }), [
    {label:'Shop', value:'Kiosk'},
    {label:'Type', value:'Fast Food'},
    {label:'Cuisine', value:'Burger, Pizza'},
    {label:'Option', value:'Takeaway'},
  ]);
  assert.deepEqual(placeOfferingFacts({icon:'menu_book'}), [{label:'Type', value:'Menu Book'}]);
  assert.equal(placeDescription({'osm:description':'Independent books and coffee'}), 'Independent books and coffee');
  assert.equal(placePaymentMethods({
    'osm:payment:onchain':'no', 'osm:payment:lightning':'yes',
    'osm:payment:lightning_contactless':'yes',
  }), 'Lightning, Contactless Lightning');
});

test('BTC Map page is integrated with navigation, help, PWA and page context', async () => {
  const [html, css, page, pwa, help, context, seo, worker, sitemap, marker] = await Promise.all([
    readFile(new URL('../btcMap.html', import.meta.url), 'utf8'),
    readFile(new URL('../btcMap.css', import.meta.url), 'utf8'),
    readFile(new URL('../btcMap.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../pwa.js', import.meta.url), 'utf8'),
    readFile(new URL('../siteHelp.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../AI_CONTEXT.md', import.meta.url), 'utf8'),
    readFile(new URL('../seo.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../sitemap.xml', import.meta.url), 'utf8'),
    readFile(new URL('../img/btc-map-pin.png', import.meta.url)),
  ]);
  assert.match(html, /id="toggle"/);
  assert.match(html, /<nav id="menu"[^>]*><ul><\/ul><\/nav>/);
  assert.match(html, /id="btcMapLocate"/);
  assert.match(html, /id="btcMapSearchToggle"/);
  assert.doesNotMatch(html, /id="btcMapHeatToggle"/);
  assert.match(html, /id="btcMapSearch"[^>]*aria-hidden="true"[^>]*inert/);
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
  assert.match(page, /function focusSearchResults\(results\)/);
  assert.match(page, /What you can get/);
  assert.match(page, /Bitcoin payment/);
  assert.match(page, /btc-map-place-image/);
  assert.match(page, /btcMapHeatFeatures\(places, map\.getZoom\(\)\)/);
  assert.match(page, /function placesInCurrentView\(places = \[\]\)/);
  assert.match(page, /bounds\.contains\(\[lon, lat\]\)/);
  assert.match(page, /document\.createElement\('canvas'\)/);
  assert.match(page, /classList\.add\('btc-map-heat-overlay'\)/);
  assert.match(page, /map\.project\(coordinate\)/);
  assert.match(page, /function paintHeatOverlay\(\)/);
  assert.match(page, /requestAnimationFrame\(paintHeatOverlay\)/);
  assert.match(page, /function heatFeatureAtPoint\(point\)/);
  assert.match(page, /classList\.toggle\('is-hidden', hidden\)/);
  assert.match(page, /map\.on\('move',/);
  assert.match(page, /map\.on\('zoomend',[\s\S]*BTC Map zoom level:/);
  assert.match(page, /isIgnorableMapError\(event\.error\)/);
  assert.doesNotMatch(page, /map\.on\('mousemove'/);
  assert.match(page, /const HEAT_MIN_ZOOM = 4/);
  assert.match(page, /const MARKER_PREFETCH_ZOOM = 7/);
  assert.match(page, /const MARKER_ZOOM = 7\.5/);
  assert.match(page, /map\.getZoom\(\) < HEAT_MIN_ZOOM/);
  assert.match(page, /Zoom in to see Bitcoin place density/);
  assert.match(page, /map\.getZoom\(\) < MARKER_ZOOM/);
  assert.match(page, /setTimeout\(syncMapMode, 80\)/);
  assert.match(page, /PLACE_FETCH_BUFFER = 1\.4/);
  assert.match(page, /viewportCoverageContains\(viewportCoverage/);
  assert.match(page, /cachePlaces\(loadedPlaces\)/);
  assert.match(page, /loadImage\('\/img\/btc-map-pin\.png'\)/);
  assert.match(page, /'icon-rotate':\['get','tilt'\]/);
  assert.match(page, /'icon-allow-overlap':true/);
  assert.match(page, /'icon-ignore-placement':true/);
  assert.match(page, /loadViewportPlaces\(\{allowDuringHeat:true\}\)/);
  assert.match(page, /function seedVisibleHeatPlaces\(\)/);
  assert.match(page, /seedVisibleHeatPlaces\(\);/);
  assert.match(page, /function visibleCachedPlaceCount\(\)/);
  assert.match(page, /if \(visibleCachedPlaceCount\(\)\) \{/);
  assert.match(page, /map\.getZoom\(\) >= MARKER_ZOOM && visibleCachedPlaceCount\(\)/);
  assert.doesNotMatch(page, /placeCache\.size \|\| !pendingViewportCoverage/);
  assert.match(page, /Bitcoin place\$\{visibleCount === 1 \? '' : 's'\} visible in this view/);
  assert.match(page, /loaded nearby\. Zoom out slightly to see them/);
  assert.match(page, /focusSearchResults\(results\)/);
  assert.match(page, /document\.addEventListener\('pointerdown'/);
  assert.match(page, /!path\.includes\(elements\.results\)/);
  assert.match(css, /\.btc-map-search\.is-open/);
  assert.match(css, /\.btc-map-search-toggle/);
  assert.doesNotMatch(css, /\.btc-map-heat-toggle/);
  assert.match(page, /context\.globalAlpha = \.46/);
  assert.match(css, /pointer-events:none !important/);
  assert.match(css, /\.btc-map-heat-overlay\.is-hidden \{ display:none; \}/);
  assert.match(page, /btcMapAuthTemplate/);
  assert.match(page, /BTC_MAP_SAVED_URL/);
  assert.match(page, /sessionStorage\.setItem\(TOKEN_KEY/);
  assert.match(pwa, /\{label: 'BTC map', href: '\/btcMap\.html'\}/);
  assert.match(help, /'\/btcMap\.html'/);
  assert.match(help, /selector: '#btcMapLocate'/);
  assert.match(context, /### Page: \[BTC Map\]/);
  assert.match(seo, /'\/btcMap\.html'/);
  assert.match(worker, /'\/btcMap\.html', '\/btcMap\.css', '\/btcMap\.mjs', '\/btcMapModel\.mjs'/);
  assert.match(worker, /'\/img\/btc-map-pin\.png'/);
  assert.equal(marker.subarray(1, 4).toString(), 'PNG');
  assert.match(sitemap, /https:\/\/satoshi\.si\/btcMap\.html/);
});
