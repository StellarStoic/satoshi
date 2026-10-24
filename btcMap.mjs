import {
  btcMapCommentsUrl,
  btcMapAuthTemplate,
  btcMapHeatFeatures,
  btcMapPlaceUrl,
  btcMapPlacesUrl,
  btcMapSearchUrl,
  BTC_MAP_AUTH_URL,
  BTC_MAP_HEAT_PLACES_URL,
  BTC_MAP_SAVED_URL,
  nip98Authorization,
  osmPlaceUrl,
  placeCollection,
  safeHttpUrl,
  verificationLabel,
  viewportRadiusKm,
} from './btcMapModel.mjs';
import {
  adoptAmberClipboard,
  adoptAmberSignature,
  amberClipboardPending,
  amberSignaturePending,
  beginAmberLogin,
  getNostrSession,
  loginWithExtension,
  reconnectBunker,
  shortNpub,
  signNostrEvent,
  signerReady,
} from './nostrSession.mjs';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const VIEW_KEY = 'satoshi:btc-map:view:v1';
const TOKEN_KEY = 'satoshi:btc-map:token:v1';
const EMPTY_COLLECTION = {type:'FeatureCollection', features:[]};
const HEAT_MIN_ZOOM = 4;
const MARKER_ZOOM = 9;
const SVG_NS = 'http://www.w3.org/2000/svg';
const elements = {
  form:document.getElementById('btcMapSearch'), query:document.getElementById('btcMapQuery'),
  searchToggle:document.getElementById('btcMapSearchToggle'),
  clear:document.getElementById('clearBtcMapSearch'), locate:document.getElementById('btcMapLocate'),
  results:document.getElementById('btcMapResults'), resultList:document.getElementById('btcMapResultList'),
  resultCount:document.getElementById('btcMapResultCount'), details:document.getElementById('btcMapDetails'),
  detailsBody:document.getElementById('btcMapDetailsBody'), closeDetails:document.getElementById('closeBtcMapDetails'),
  status:document.getElementById('btcMapStatus'),
  account:document.getElementById('btcMapAccount'), accountDialog:document.getElementById('btcMapAccountDialog'),
  closeAccount:document.getElementById('closeBtcMapAccount'), identity:document.getElementById('btcMapIdentity'),
  connect:document.getElementById('connectBtcMap'), connectAmber:document.getElementById('connectBtcMapAmber'),
  disconnect:document.getElementById('disconnectBtcMap'), accountStatus:document.getElementById('btcMapAccountStatus'),
  favorites:document.getElementById('btcMapFavorites'), favoritesList:document.getElementById('btcMapFavoritesList'),
};

let requestController = null;
let detailController = null;
let moveTimer = 0;
let lastViewportRequest = '';
let savedPlaceIds = new Set();
let savedPlaces = [];
let currentPlace = null;
let heatMode = false;
let heatPlaces = null;
let heatCells = [];
let heatVisibleCount = 0;
let heatController = null;
let heatOverlay = null;
let heatHoverCell = '';

function readBtcMapAuth() {
  try {
    const value = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    return value?.token ? value : null;
  } catch { return null; }
}

function accountName(session = getNostrSession()) {
  return session?.profile?.display_name || session?.profile?.name || session?.profile?.nip05
    || (session?.npub ? shortNpub(session.npub) : 'Nostr user');
}

function setAccountStatus(message = '', error = false) {
  elements.accountStatus.textContent = message;
  elements.accountStatus.classList.toggle('is-error', error);
}

function refreshAccountUi() {
  const session = getNostrSession();
  let auth = readBtcMapAuth();
  if (auth && (!session || (auth.npub && auth.npub !== session.npub))) {
    sessionStorage.removeItem(TOKEN_KEY);
    savedPlaceIds = new Set();
    savedPlaces = [];
    auth = null;
  }
  elements.account.classList.toggle('is-connected', Boolean(auth));
  elements.identity.textContent = auth
    ? `Connected as ${accountName(session)}.`
    : session
      ? `Signed in as ${accountName(session)}. Connect this identity to BTC Map.`
      : 'Connect your Nostr identity to keep favorite places across devices.';
  elements.connect.querySelector('span').textContent = auth ? 'Refresh connection' : session ? 'Connect to BTC Map' : 'Browser extension';
  elements.disconnect.hidden = !auth;
  elements.connectAmber.hidden = !/Android/i.test(navigator.userAgent || '') || Boolean(auth);
  elements.favorites.hidden = !auth;
}

async function btcMapRequest(url, options = {}) {
  const auth = readBtcMapAuth();
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (auth?.token) headers.set('Authorization', `Bearer ${auth.token}`);
  const response = await fetch(url, {...options, headers});
  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    refreshAccountUi();
    throw new Error('Your BTC Map connection expired. Connect again.');
  }
  if (!response.ok) throw new Error(`BTC Map returned HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function favoriteButton(place) {
  const button = document.createElement('button');
  const saved = savedPlaceIds.has(Number(place.id));
  button.type = 'button';
  button.className = `btc-map-save${saved ? ' is-saved' : ''}`;
  button.innerHTML = `<i class="lni lni-heart" aria-hidden="true"></i><span>${saved ? 'Saved place' : 'Save place'}</span>`;
  button.addEventListener('click', () => toggleFavorite(place, button));
  return button;
}

function renderFavorites() {
  if (!savedPlaces.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No favorite places yet.';
    elements.favoritesList.replaceChildren(empty);
    return;
  }
  elements.favoritesList.replaceChildren(...savedPlaces.map(place => {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = '<i class="lni lni-heart" aria-hidden="true"></i>';
    const label = document.createElement('span');
    label.textContent = place.name || 'Bitcoin place';
    button.append(label);
    button.addEventListener('click', () => {
      elements.accountDialog.close();
      const coordinates = [Number(place.lon), Number(place.lat)];
      if (coordinates.every(Number.isFinite)) map.flyTo({center:coordinates, zoom:16, essential:true});
      showPlace(place.id, coordinates);
    });
    return button;
  }));
}

async function loadFavorites() {
  if (!readBtcMapAuth()) return;
  const places = await btcMapRequest(BTC_MAP_SAVED_URL);
  savedPlaces = Array.isArray(places) ? places : [];
  savedPlaceIds = new Set(savedPlaces.map(place => Number(place.id)).filter(Number.isFinite));
  renderFavorites();
  if (currentPlace) renderPlace(currentPlace.place, currentPlace.comments);
}

async function exchangeNip98(signed) {
  const response = await fetch(BTC_MAP_AUTH_URL, {
    method:'POST',
    headers:{Accept:'application/json', Authorization:nip98Authorization(signed)},
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'BTC Map rejected the signature. Check your device time and try again.' : `BTC Map returned HTTP ${response.status}`);
  const auth = await response.json();
  if (!auth?.token) throw new Error('BTC Map did not return a login token.');
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
  refreshAccountUi();
  await loadFavorites();
  setAccountStatus('Connected. Your favorites are ready.');
}

async function connectBtcMap() {
  setAccountStatus('');
  try {
    if (amberSignaturePending()) {
      setAccountStatus('Reading the signature Amber copied…');
      const answer = await adoptAmberSignature();
      if (answer?.event) await exchangeNip98(answer.event);
      return;
    }
    let session = getNostrSession();
    if (!session) session = await loginWithExtension();
    if (session.method === 'anonymous') throw new Error('Use your own Nostr identity to save favorites.');
    if (session.method === 'bunker' && !await signerReady()) await reconnectBunker();
    if (!await signerReady()) throw new Error('Open the signer for this Nostr identity, then try again.');
    setAccountStatus('Approve one login signature in your signer…');
    const signed = await signNostrEvent(btcMapAuthTemplate(), {action:'btc-map-auth'});
    if (!signed) {
      setAccountStatus('Approve in Amber, return here, then tap Connect again.');
      return;
    }
    await exchangeNip98(signed);
  } catch (error) {
    setAccountStatus(error?.message || 'Nostr connection failed.', true);
  }
}

async function connectAmber() {
  setAccountStatus('');
  try {
    if (amberClipboardPending()) {
      const answer = await adoptAmberClipboard();
      if (answer?.session) {
        refreshAccountUi();
        setAccountStatus('Amber is connected. Tap Connect to approve BTC Map.');
      }
      return;
    }
    beginAmberLogin({copy:true});
  } catch (error) {
    setAccountStatus(error?.message || 'Amber could not connect.', true);
  }
}

async function toggleFavorite(place, button) {
  if (!readBtcMapAuth()) {
    elements.accountDialog.showModal();
    refreshAccountUi();
    setAccountStatus('Connect Nostr before saving a place.');
    return;
  }
  const id = Number(place.id);
  if (!Number.isFinite(id)) return;
  button.disabled = true;
  try {
    if (savedPlaceIds.has(id)) {
      await btcMapRequest(`${BTC_MAP_SAVED_URL}/${id}`, {method:'DELETE'});
    } else {
      await btcMapRequest(BTC_MAP_SAVED_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(id)});
    }
    await loadFavorites();
    setStatus(savedPlaceIds.has(id) ? 'Place saved to your BTC Map favorites.' : 'Place removed from favorites.', 3200);
  } catch (error) {
    setStatus(error?.message || 'Favorite could not be changed.', 4200);
  } finally { button.disabled = false; }
}

function storedView() {
  try {
    const value = JSON.parse(localStorage.getItem(VIEW_KEY));
    if (Array.isArray(value?.center) && value.center.every(Number.isFinite) && Number.isFinite(value.zoom)) return value;
  } catch {}
  return {center:[8, 28], zoom:2.2};
}

function rememberView() {
  try {
    const center = map.getCenter();
    localStorage.setItem(VIEW_KEY, JSON.stringify({center:[center.lng, center.lat], zoom:map.getZoom()}));
  } catch {}
}

function setStatus(message, timeout = 0) {
  clearTimeout(setStatus.timer);
  elements.status.textContent = message;
  elements.status.hidden = !message;
  if (timeout) setStatus.timer = setTimeout(() => { elements.status.hidden = true; }, timeout);
}

async function getJson(url, controller) {
  const response = await fetch(url, {headers:{accept:'application/json'}, signal:controller.signal});
  if (!response.ok) throw new Error(`BTC Map returned HTTP ${response.status}`);
  return response.json();
}

const initial = storedView();
const map = new window.maplibregl.Map({
  container:'btcMap', style:MAP_STYLE, center:initial.center, zoom:initial.zoom,
  attributionControl:false,
});

map.addControl(
  new window.maplibregl.AttributionControl({
    compact:true,
    customAttribution:'Map <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>'
      + ' · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
      + ' · Places <a href="https://btcmap.org/" target="_blank" rel="noopener">BTC Map</a>',
  }),
  'bottom-left',
);

function sourceReady() {
  return Boolean(map.getSource('btc-places'));
}

function setPlaceLayersVisible(visible) {
  const visibility = visible ? 'visible' : 'none';
  ['place-clusters', 'place-cluster-count', 'place-points'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
  });
}

function heatColor(count) {
  if (count >= 120) return '#d8443f';
  if (count >= 35) return '#f07800';
  if (count >= 8) return '#f2a900';
  return '#f6c54d';
}

function ensureHeatOverlay() {
  if (heatOverlay) return heatOverlay;
  heatOverlay = document.createElementNS(SVG_NS, 'svg');
  heatOverlay.classList.add('btc-map-heat-overlay');
  heatOverlay.setAttribute('aria-label', 'Bitcoin place density');
  map.getContainer().append(heatOverlay);
  return heatOverlay;
}

function hideHeatOverlay(hidden) {
  if (!heatOverlay) return;
  heatOverlay.classList.toggle('is-hidden', hidden);
  heatOverlay.setAttribute('aria-hidden', String(hidden));
}

function positionHeatOverlay() {
  if (!heatOverlay || heatOverlay.classList.contains('is-hidden')) return;
  for (const group of heatOverlay.children) {
    const feature = group.heatFeature;
    if (!feature) continue;
    const points = feature.geometry.coordinates[0].map(coordinate => map.project(coordinate));
    if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
    group.querySelector('polygon')?.setAttribute('points', points.map(point => `${point.x},${point.y}`).join(' '));
    const center = map.project([Number(feature.properties.centerLon), Number(feature.properties.centerLat)]);
    const label = group.querySelector('text');
    label?.setAttribute('x', center.x);
    label?.setAttribute('y', center.y);
  }
}

function renderHeatOverlay() {
  if (!heatMode || !heatCells.length) return;
  const overlay = ensureHeatOverlay();
  hideHeatOverlay(false);
  overlay.replaceChildren();
  for (const feature of heatCells) {
    const count = Number(feature.properties.count || 0);
    const group = document.createElementNS(SVG_NS, 'g');
    group.classList.add('btc-map-heat-cell');
    group.heatFeature = feature;
    const polygon = document.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('fill', heatColor(count));
    const label = document.createElementNS(SVG_NS, 'text');
    label.textContent = count.toLocaleString();
    group.append(polygon, label);
    overlay.append(group);
  }
  positionHeatOverlay();
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const left = polygon[index];
    const right = polygon[previous];
    if ((left.y > point.y) === (right.y > point.y)) continue;
    const boundary = ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x;
    if (point.x < boundary) inside = !inside;
  }
  return inside;
}

function heatFeatureAtPoint(point) {
  if (!heatMode || map.getZoom() < HEAT_MIN_ZOOM || map.getZoom() >= MARKER_ZOOM) return null;
  return heatCells.find(feature => pointInPolygon(
    point,
    feature.geometry.coordinates[0].map(coordinate => map.project(coordinate)),
  )) || null;
}

function setHeatLayersVisible(visible) {
  if (!visible) {
    hideHeatOverlay(true);
    heatHoverCell = '';
    map.getCanvas().style.cursor = '';
    return;
  }
  renderHeatOverlay();
}

function heatSummary() {
  if (!heatPlaces) return;
  setStatus(`${heatVisibleCount.toLocaleString()} mapped Bitcoin places across ${heatCells.length.toLocaleString()} regions on screen. Select a hexagon to zoom in.`);
}

function drawHeatMap() {
  if (!heatPlaces) return;
  const places = heatPlaces.filter(place => {
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) && map.getBounds().contains([lon, lat]);
  });
  heatVisibleCount = places.length;
  heatCells = btcMapHeatFeatures(places, map.getZoom());
  renderHeatOverlay();
  if (heatMode) heatSummary();
}

async function enterHeatMode() {
  heatMode = true;
  setPlaceLayersVisible(false);
  if (!heatPlaces) setStatus('Building the global place-density map…');
  try {
    if (!heatPlaces) {
      heatController?.abort();
      heatController = new AbortController();
      const places = await getJson(BTC_MAP_HEAT_PLACES_URL, heatController);
      heatPlaces = Array.isArray(places) ? places : [];
    }
    if (!heatMode) return;
    drawHeatMap();
    setHeatLayersVisible(true);
  } catch (error) {
    if (error.name !== 'AbortError') {
      heatMode = false;
      setHeatLayersVisible(false);
      setPlaceLayersVisible(true);
      setStatus('The place-density map could not be loaded. Try again shortly.', 4200);
      if (map.getZoom() >= 5) await loadViewportPlaces();
    }
  }
}

async function syncMapMode() {
  if (!sourceReady()) return;
  if (map.getZoom() < HEAT_MIN_ZOOM) {
    heatMode = false;
    heatController?.abort();
    setHeatLayersVisible(false);
    setPlaceLayersVisible(false);
    setStatus('Zoom in to see Bitcoin place density.');
    return;
  }
  if (map.getZoom() < MARKER_ZOOM) {
    await enterHeatMode();
    return;
  }
  heatMode = false;
  setHeatLayersVisible(false);
  setPlaceLayersVisible(true);
  await loadViewportPlaces();
}

function installPlaceLayers() {
  map.addSource('btc-places', {type:'geojson', data:EMPTY_COLLECTION, cluster:true, clusterRadius:48, clusterMaxZoom:15});
  map.addLayer({
    id:'place-clusters', type:'circle', source:'btc-places', filter:['has','point_count'],
    paint:{
      'circle-color':'#f2a900', 'circle-radius':['step',['get','point_count'],17,20,21,100,27],
      'circle-stroke-color':'#17140d', 'circle-stroke-width':2,
    },
  });
  map.addLayer({
    id:'place-cluster-count', type:'symbol', source:'btc-places', filter:['has','point_count'],
    layout:{'text-field':['get','point_count_abbreviated'],'text-size':11},
    paint:{'text-color':'#17140d'},
  });
  map.addLayer({
    id:'place-points', type:'circle', source:'btc-places', filter:['!',['has','point_count']],
    paint:{
      'circle-color':['case',['==',['get','boosted'],true],'#f2a900','#171919'],
      'circle-radius':['case',['==',['get','boosted'],true],8,7],
      'circle-stroke-color':['case',['!=',['get','verifiedAt'],''],'#75d699','#f2a900'],
      'circle-stroke-width':2,
    },
  });
  map.on('mouseenter', 'place-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseenter', 'place-points', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'place-clusters', () => { map.getCanvas().style.cursor = ''; });
  map.on('mouseleave', 'place-points', () => { map.getCanvas().style.cursor = ''; });
  map.on('click', 'place-clusters', event => {
    const feature = map.queryRenderedFeatures(event.point, {layers:['place-clusters']})[0];
    if (!feature) return;
    map.getSource('btc-places').getClusterExpansionZoom(feature.properties.cluster_id)
      .then(zoom => map.easeTo({center:feature.geometry.coordinates, zoom}))
      .catch(() => {});
  });
  map.on('click', 'place-points', event => {
    const feature = event.features?.[0];
    if (feature?.properties?.id) showPlace(feature.properties.id, feature.geometry.coordinates);
  });
}

async function loadViewportPlaces() {
  if (!sourceReady()) return;
  if (heatMode) return;
  const zoom = map.getZoom();
  if (zoom < 5) {
    map.getSource('btc-places').setData(EMPTY_COLLECTION);
    lastViewportRequest = '';
    setStatus('Zoom closer, search a city, or use your location to load places.');
    return;
  }
  const center = map.getCenter();
  const bounds = map.getBounds();
  const radiusKm = viewportRadiusKm({lat:center.lat,lon:center.lng}, {lat:bounds.getNorth(),lon:bounds.getEast()});
  const requestKey = `${center.lat.toFixed(3)}:${center.lng.toFixed(3)}:${Math.ceil(radiusKm / 5)}`;
  if (requestKey === lastViewportRequest) return;
  lastViewportRequest = requestKey;
  requestController?.abort();
  requestController = new AbortController();
  setStatus('Looking for Bitcoin places…');
  try {
    const places = await getJson(btcMapPlacesUrl({lat:center.lat,lon:center.lng,radiusKm}), requestController);
    map.getSource('btc-places').setData(placeCollection(Array.isArray(places) ? places : []));
    const count = Array.isArray(places) ? places.length : 0;
    setStatus(count ? `${count.toLocaleString()} Bitcoin place${count === 1 ? '' : 's'} in this area.` : 'No mapped Bitcoin places in this area.', 4200);
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('BTC Map could not be reached. Move the map or try again shortly.');
  }
}

function iconClass(icon = '') {
  const value = String(icon).toLowerCase();
  if (/cafe|coffee|restaurant|food|dining|bar|pub|bakery/.test(value)) return 'lni lni-coffee-cup-2';
  if (/hotel|bed|lodging|camp/.test(value)) return 'lni lni-home-2';
  if (/event|calendar/.test(value)) return 'lni lni-calendar-days';
  if (/area|community|group/.test(value)) return 'lni lni-user-multiple-4';
  if (/atm|bank|money/.test(value)) return 'lni lni-bitcoin';
  return 'lni lni-map-marker-1';
}

function resultButton(result) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btc-map-result';
  const icon = document.createElement('i');
  icon.className = iconClass(result.type === 'event' ? 'event' : result.type === 'area' ? 'community' : result.icon);
  icon.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = result.name || (result.type === 'area' ? 'Bitcoin community' : 'Bitcoin place');
  const detail = document.createElement('span');
  detail.textContent = result.type === 'area' ? 'Community or region'
    : result.type === 'event' ? formatEventTime(result.starts_at)
      : result.address || verificationLabel(result.verified_at);
  copy.append(name, detail);
  button.append(icon, copy);
  button.addEventListener('click', () => selectSearchResult(result));
  return button;
}

function formatEventTime(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : 'Upcoming Bitcoin event';
}

function setSearchOpen(open) {
  elements.form.classList.toggle('is-open', open);
  elements.form.toggleAttribute('inert', !open);
  elements.form.setAttribute('aria-hidden', String(!open));
  elements.searchToggle.setAttribute('aria-expanded', String(open));
  if (open) requestAnimationFrame(() => elements.query.focus());
}

function focusSearchResults(results) {
  const target = results.find(result => (Array.isArray(result?.bbox) && result.bbox.length === 4
      && result.bbox.every(value => Number.isFinite(Number(value))))
    || (Number.isFinite(Number(result?.lat)) && Number.isFinite(Number(result?.lon))));
  if (!target) return;
  if (Array.isArray(target.bbox) && target.bbox.length === 4) {
    const [west, south, east, north] = target.bbox.map(Number);
    map.fitBounds([[west, south], [east, north]], {padding:70, maxZoom:14, essential:true});
    return;
  }
  map.flyTo({center:[Number(target.lon), Number(target.lat)], zoom:15, essential:true});
}

async function search(query) {
  const value = String(query).trim();
  if (value.length < 3) { setStatus('Type at least three characters.'); return; }
  requestController?.abort();
  requestController = new AbortController();
  elements.clear.hidden = false;
  setStatus('Searching BTC Map…');
  try {
    const center = map.getCenter();
    const payload = await getJson(btcMapSearchUrl(value, {lat:center.lat,lon:center.lng}), requestController);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    elements.resultList.replaceChildren(...results.map(resultButton));
    elements.resultCount.textContent = `${payload?.total_count ?? results.length} found`;
    elements.results.hidden = false;
    focusSearchResults(results);
    setStatus(results.length ? `Showing the best ${results.length} matches.` : 'No BTC Map matches found.', 3500);
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('Search is unavailable right now.');
  }
}

function selectSearchResult(result) {
  elements.results.hidden = true;
  if (result.type === 'area') {
    if (Array.isArray(result.bbox) && result.bbox.length === 4) map.fitBounds([[result.bbox[0],result.bbox[1]],[result.bbox[2],result.bbox[3]]], {padding:70,maxZoom:13});
    else setStatus('This community does not publish a map boundary.');
    return;
  }
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) map.flyTo({center:[lon,lat],zoom:16,essential:true});
  if (result.type === 'place') showPlace(result.id, [lon,lat]);
  else showEvent(result);
}

function factRow(label, value) {
  if (!value) return null;
  const row = document.createElement('div');
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  term.textContent = label;
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

function externalLink(label, href, iconName = 'lni-arrow-angular-top-right') {
  const safe = safeHttpUrl(href);
  if (!safe) return null;
  const link = document.createElement('a');
  link.href = safe;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const icon = document.createElement('i');
  icon.className = `lni ${iconName}`;
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = label;
  link.append(icon, text);
  return link;
}

function renderPlace(place, comments = []) {
  currentPlace = {place, comments};
  const fragment = document.createDocumentFragment();
  const icon = document.createElement('div');
  icon.className = 'btc-map-place-icon';
  icon.innerHTML = `<i class="${iconClass(place.icon)}" aria-hidden="true"></i>`;
  const title = document.createElement('h2');
  title.id = 'btcMapPlaceName';
  title.textContent = place.name || 'Bitcoin place';
  fragment.append(icon, title);
  if (place.address) {
    const address = document.createElement('address');
    address.textContent = place.address;
    fragment.append(address);
  }
  const verified = document.createElement('div');
  verified.className = `btc-map-verified${place.verified_at ? '' : ' is-stale'}`;
  verified.innerHTML = '<i class="lni lni-shield-2-check" aria-hidden="true"></i>';
  verified.append(document.createTextNode(verificationLabel(place.verified_at)));
  fragment.append(verified);
  fragment.append(favoriteButton(place));
  if (place.description) {
    const description = document.createElement('p');
    description.textContent = place.description;
    fragment.append(description);
  }
  const facts = document.createElement('dl');
  facts.className = 'btc-map-facts';
  [
    factRow('Hours', place.opening_hours),
    factRow('Payment', place.payment_provider),
    factRow('Phone', place.phone),
    factRow('Email', place.email),
  ].filter(Boolean).forEach(row => facts.append(row));
  if (facts.children.length) fragment.append(facts);
  const links = document.createElement('div');
  links.className = 'btc-map-links';
  [
    externalLink('Website', place.website, 'lni-globe-1'),
    externalLink('OpenStreetMap', osmPlaceUrl(place), 'lni-map-marker-1'),
    externalLink('Instagram', place.instagram, 'lni-instagram'),
    externalLink('Telegram', place.telegram, 'lni-telegram'),
    externalLink('Required app', place.required_app_url, 'lni-app-store'),
  ].filter(Boolean).forEach(link => links.append(link));
  if (links.children.length) fragment.append(links);
  if (comments.length) {
    const section = document.createElement('section');
    section.className = 'btc-map-comments';
    const heading = document.createElement('h3');
    heading.textContent = 'Recent visitor notes';
    section.append(heading);
    comments.slice(-3).reverse().forEach(comment => {
      const quote = document.createElement('blockquote');
      quote.textContent = comment.text || '';
      section.append(quote);
    });
    fragment.append(section);
  }
  elements.detailsBody.replaceChildren(fragment);
  elements.details.hidden = false;
}

async function showPlace(id, coordinates = null) {
  detailController?.abort();
  detailController = new AbortController();
  elements.details.hidden = false;
  elements.detailsBody.textContent = 'Loading place…';
  if (Array.isArray(coordinates) && coordinates.every(Number.isFinite)) map.easeTo({center:coordinates});
  try {
    const [place, comments] = await Promise.all([
      getJson(btcMapPlaceUrl(id), detailController),
      getJson(btcMapCommentsUrl(id), detailController).catch(() => []),
    ]);
    renderPlace(place, Array.isArray(comments) ? comments : []);
  } catch (error) {
    if (error.name !== 'AbortError') elements.detailsBody.textContent = 'Place details are unavailable right now.';
  }
}

function showEvent(event) {
  const title = document.createElement('h2');
  title.id = 'btcMapPlaceName';
  title.textContent = event.name || 'Bitcoin event';
  const time = document.createElement('p');
  time.textContent = formatEventTime(event.starts_at);
  const links = document.createElement('div');
  links.className = 'btc-map-links';
  const eventLink = externalLink('Event website', event.website, 'lni-calendar-days');
  if (eventLink) links.append(eventLink);
  elements.detailsBody.replaceChildren(title, time, links);
  elements.details.hidden = false;
}

elements.form.addEventListener('submit', event => { event.preventDefault(); search(elements.query.value); });
elements.searchToggle.addEventListener('click', () => {
  setSearchOpen(!elements.form.classList.contains('is-open'));
});
elements.clear.addEventListener('click', () => {
  elements.query.value = '';
  elements.clear.hidden = true;
  elements.results.hidden = true;
  elements.query.focus();
});
elements.closeDetails.addEventListener('click', () => { elements.details.hidden = true; });
elements.account.addEventListener('click', () => {
  refreshAccountUi();
  elements.accountDialog.showModal();
  if (readBtcMapAuth()) loadFavorites().catch(error => setAccountStatus(error.message, true));
});
elements.closeAccount.addEventListener('click', () => elements.accountDialog.close());
elements.accountDialog.addEventListener('click', event => {
  if (event.target === elements.accountDialog) elements.accountDialog.close();
});
elements.connect.addEventListener('click', connectBtcMap);
elements.connectAmber.addEventListener('click', connectAmber);
elements.disconnect.addEventListener('click', () => {
  sessionStorage.removeItem(TOKEN_KEY);
  savedPlaceIds = new Set();
  savedPlaces = [];
  renderFavorites();
  if (currentPlace) renderPlace(currentPlace.place, currentPlace.comments);
  refreshAccountUi();
  setAccountStatus('Disconnected from BTC Map. Your Nostr sign-in is unchanged.');
});
window.addEventListener('satoshi-nostr-session', refreshAccountUi);
document.addEventListener('pointerdown', event => {
  const path = event.composedPath();
  if (elements.form.classList.contains('is-open')
      && !path.includes(elements.form) && !path.includes(elements.searchToggle)) {
    setSearchOpen(false);
  }
  if (!elements.results.hidden && !path.includes(elements.results)) elements.results.hidden = true;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  setSearchOpen(false);
  elements.results.hidden = true;
});
elements.locate.addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('Location is not available in this browser.'); return; }
  setStatus('Waiting for your location…');
  navigator.geolocation.getCurrentPosition(position => {
    map.flyTo({center:[position.coords.longitude,position.coords.latitude],zoom:15,essential:true});
    setStatus('Showing Bitcoin places near you.', 3200);
  }, () => setStatus('Location was not shared. Search a city instead.'), {enableHighAccuracy:false,timeout:10000,maximumAge:300000});
});

map.on('load', () => {
  installPlaceLayers();
  setPlaceLayersVisible(map.getZoom() >= MARKER_ZOOM);
  syncMapMode();
});
map.on('moveend', () => {
  rememberView();
  clearTimeout(moveTimer);
  moveTimer = setTimeout(syncMapMode, 180);
});
map.on('move', () => {
  if (heatMode && map.getZoom() >= HEAT_MIN_ZOOM && map.getZoom() < MARKER_ZOOM) positionHeatOverlay();
  else hideHeatOverlay(true);
});
map.on('click', event => {
  const feature = heatFeatureAtPoint(event.point);
  if (!feature) return;
  map.easeTo({
    center:[Number(feature.properties.centerLon), Number(feature.properties.centerLat)],
    zoom:Math.min(MARKER_ZOOM, map.getZoom() + 2.5),
    duration:650,
  });
});
map.on('mousemove', event => {
  if (!heatMode) return;
  const feature = heatFeatureAtPoint(event.point);
  const key = feature ? `${feature.properties.centerLon}:${feature.properties.centerLat}` : '';
  if (key === heatHoverCell) return;
  heatHoverCell = key;
  map.getCanvas().style.cursor = feature ? 'pointer' : '';
  if (feature) {
    const count = Number(feature.properties.count || 0);
    setStatus(`${count.toLocaleString()} mapped place${count === 1 ? '' : 's'} in this region. Select to zoom in.`);
  } else if (heatMode) heatSummary();
});
map.on('error', event => {
  if (event?.error) setStatus('Part of the map could not load. Check your content blocker or connection.');
});

refreshAccountUi();
if (readBtcMapAuth()) loadFavorites().catch(() => {
  sessionStorage.removeItem(TOKEN_KEY);
  refreshAccountUi();
});
