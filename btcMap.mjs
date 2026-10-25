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
  isIgnorableMapError,
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
const MARKER_ZOOM = 5;
const PLACE_CACHE_LIMIT = 6000;
const PLACE_FETCH_BUFFER = 1.4;
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
let viewportController = null;
let detailController = null;
let moveTimer = 0;
let viewportCoverage = null;
let pendingViewportCoverage = null;
const placeCache = new Map();
let savedPlaceIds = new Set();
let savedPlaces = [];
let currentPlace = null;
let heatMode = false;
let heatPlaces = null;
let heatCells = [];
let heatVisibleCount = 0;
let heatController = null;
let heatOverlay = null;
let heatFrame = 0;

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
  heatOverlay = document.createElement('canvas');
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

function paintHeatOverlay() {
  heatFrame = 0;
  if (!heatOverlay || heatOverlay.classList.contains('is-hidden') || !heatMode) return;
  const width = map.getContainer().clientWidth;
  const height = map.getContainer().clientHeight;
  const density = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const pixelWidth = Math.round(width * density);
  const pixelHeight = Math.round(height * density);
  if (heatOverlay.width !== pixelWidth || heatOverlay.height !== pixelHeight) {
    heatOverlay.width = pixelWidth;
    heatOverlay.height = pixelHeight;
  }
  const context = heatOverlay.getContext('2d');
  context.setTransform(density, 0, 0, density, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineJoin = 'round';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 12px "Roboto Mono", monospace';
  for (const feature of heatCells) {
    const points = feature.geometry.coordinates[0].map(coordinate => map.project(coordinate));
    if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.globalAlpha = .46;
    context.fillStyle = heatColor(Number(feature.properties.count || 0));
    context.fill();
    context.globalAlpha = .7;
    context.strokeStyle = '#fff1c5';
    context.lineWidth = 1.1;
    context.stroke();
    const center = map.project([Number(feature.properties.centerLon), Number(feature.properties.centerLat)]);
    context.globalAlpha = 1;
    context.lineWidth = 2.4;
    context.strokeStyle = 'rgba(255,255,255,.72)';
    context.fillStyle = '#18130b';
    const label = Number(feature.properties.count || 0).toLocaleString();
    context.strokeText(label, center.x, center.y);
    context.fillText(label, center.x, center.y);
  }
  context.globalAlpha = 1;
}

function scheduleHeatOverlay() {
  if (heatFrame || !heatOverlay || heatOverlay.classList.contains('is-hidden')) return;
  heatFrame = requestAnimationFrame(paintHeatOverlay);
}

function renderHeatOverlay() {
  if (!heatMode || !heatCells.length) return;
  ensureHeatOverlay();
  hideHeatOverlay(false);
  scheduleHeatOverlay();
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
    setPlaceLayersVisible(false);
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
  setPlaceLayersVisible(true);
  if (visibleCachedPlaceCount()) {
    heatMode = false;
    setHeatLayersVisible(false);
  }
  await loadViewportPlaces({allowDuringHeat:true});
  if (visibleCachedPlaceCount()) {
    heatMode = false;
    setHeatLayersVisible(false);
  }
}

async function installPlaceLayers() {
  map.addSource('btc-places', {type:'geojson', data:EMPTY_COLLECTION, cluster:true, clusterRadius:48, clusterMaxZoom:11});
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
  let customMarker = false;
  try {
    const markerImage = await map.loadImage('/img/btc-map-pin.png');
    if (!map.hasImage('bitcoin-place-pin')) map.addImage('bitcoin-place-pin', markerImage.data, {pixelRatio:8});
    customMarker = true;
  } catch (error) {
    console.warn('BTC Map marker image could not load; using the fallback marker.', error);
  }
  map.addLayer(customMarker ? {
    id:'place-points', type:'symbol', source:'btc-places', filter:['!',['has','point_count']],
    layout:{
      'icon-image':'bitcoin-place-pin',
      'icon-size':['interpolate',['linear'],['zoom'],MARKER_ZOOM,.48,14,.68],
      'icon-rotate':['get','tilt'],
      'icon-rotation-alignment':'viewport',
      'icon-allow-overlap':true,
      'icon-ignore-placement':true,
      'icon-padding':2,
    },
  } : {
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

function cachePlaces(places) {
  places.forEach(place => {
    const key = String(place?.id ?? `${place?.lat}:${place?.lon}:${place?.name || ''}`);
    placeCache.delete(key);
    placeCache.set(key, place);
  });
  while (placeCache.size > PLACE_CACHE_LIMIT) placeCache.delete(placeCache.keys().next().value);
  map.getSource('btc-places').setData(placeCollection([...placeCache.values()]));
}

function visibleCachedPlaceCount() {
  const bounds = map.getBounds();
  let count = 0;
  for (const place of placeCache.values()) {
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && bounds.contains([lon, lat])) count += 1;
  }
  return count;
}

async function loadViewportPlaces({allowDuringHeat = false} = {}) {
  if (!sourceReady()) return;
  if (heatMode && !allowDuringHeat) return;
  const zoom = map.getZoom();
  if (zoom < 5) {
    setStatus('Zoom closer, search a city, or use your location to load places.');
    return;
  }
  const center = map.getCenter();
  const bounds = map.getBounds();
  const radiusKm = viewportRadiusKm({lat:center.lat,lon:center.lng}, {lat:bounds.getNorth(),lon:bounds.getEast()});
  const requestCenter = {lat:center.lat, lon:center.lng};
  if (viewportCoverageContains(viewportCoverage, requestCenter, radiusKm)
      || viewportCoverageContains(pendingViewportCoverage, requestCenter, radiusKm)) return;
  const fetchRadiusKm = Math.min(300, Math.max(radiusKm + 2, radiusKm * PLACE_FETCH_BUFFER));
  viewportController?.abort();
  const controller = new AbortController();
  viewportController = controller;
  pendingViewportCoverage = {center:requestCenter, radiusKm:fetchRadiusKm};
  setStatus('Looking for Bitcoin places…');
  try {
    const places = await getJson(btcMapPlacesUrl({lat:center.lat,lon:center.lng,radiusKm:fetchRadiusKm}), controller);
    if (controller.signal.aborted) return;
    const loadedPlaces = Array.isArray(places) ? places : [];
    cachePlaces(loadedPlaces);
    viewportCoverage = pendingViewportCoverage;
    const visibleBounds = map.getBounds();
    const visibleCount = loadedPlaces.filter(place => {
      const lat = Number(place?.lat);
      const lon = Number(place?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) && visibleBounds.contains([lon, lat]);
    }).length;
    const count = loadedPlaces.length;
    if (visibleCount) {
      setStatus(`${visibleCount.toLocaleString()} Bitcoin place${visibleCount === 1 ? '' : 's'} visible in this view.`, 4200);
    } else if (count) {
      setStatus(`${count.toLocaleString()} Bitcoin place${count === 1 ? '' : 's'} loaded nearby. Zoom out slightly to see them.`, 4200);
    } else setStatus('No mapped Bitcoin places in this area.', 4200);
    if (map.getZoom() >= MARKER_ZOOM && visibleCachedPlaceCount()) {
      setPlaceLayersVisible(true);
      heatMode = false;
      setHeatLayersVisible(false);
    }
  } catch (error) {
    if (error.name !== 'AbortError') setStatus('BTC Map could not be reached. Move the map or try again shortly.');
  } finally {
    if (viewportController === controller) {
      viewportController = null;
      pendingViewportCoverage = null;
    }
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

function offeringSection(place) {
  const facts = placeOfferingFacts(place);
  const descriptionText = placeDescription(place);
  if (!facts.length && !descriptionText) return null;
  const section = document.createElement('section');
  section.className = 'btc-map-offering';
  const heading = document.createElement('h3');
  heading.textContent = 'What you can get';
  section.append(heading);
  if (facts.length) {
    const list = document.createElement('dl');
    facts.forEach(fact => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = fact.label;
      detail.textContent = fact.value;
      list.append(term, detail);
    });
    section.append(list);
  }
  if (descriptionText) {
    const description = document.createElement('p');
    description.textContent = descriptionText;
    section.append(description);
  }
  return section;
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
  const imageUrl = safeHttpUrl(place.image);
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'btc-map-place-image';
    image.src = imageUrl;
    image.alt = place.name ? `${place.name} photo` : 'Bitcoin place photo';
    image.loading = 'lazy';
    fragment.append(image);
  }
  const offering = offeringSection(place);
  if (offering) fragment.append(offering);
  const facts = document.createElement('dl');
  facts.className = 'btc-map-facts';
  [
    factRow('Hours', place.opening_hours),
    factRow('Bitcoin payment', placePaymentMethods(place)),
    factRow('Payment provider', place.payment_provider),
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
    externalLink('Facebook', place.facebook, 'lni-facebook'),
    externalLink('X / Twitter', place.twitter, 'lni-twitter-old'),
    externalLink('Telegram', place.telegram, 'lni-telegram'),
    externalLink('LINE', place.line, 'lni-link-2-angular-right'),
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

map.on('load', async () => {
  await installPlaceLayers();
  setPlaceLayersVisible(map.getZoom() >= MARKER_ZOOM);
  console.log(`BTC Map zoom level: ${map.getZoom().toFixed(2)}`);
  syncMapMode();
});
map.on('zoomend', () => {
  console.log(`BTC Map zoom level: ${map.getZoom().toFixed(2)}`);
});
map.on('moveend', () => {
  rememberView();
  clearTimeout(moveTimer);
  moveTimer = setTimeout(syncMapMode, 180);
});
map.on('move', () => {
  const zoom = map.getZoom();
  const visiblePins = zoom >= MARKER_ZOOM && visibleCachedPlaceCount() > 0;
  if (heatMode && zoom >= HEAT_MIN_ZOOM && !visiblePins) scheduleHeatOverlay();
  if (zoom >= MARKER_ZOOM) {
    setPlaceLayersVisible(true);
    if (visiblePins) hideHeatOverlay(true);
  }
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
map.on('error', event => {
  if (!event?.error) return;
  if (isIgnorableMapError(event.error)) {
    console.debug('Ignoring a nonfatal map tile-data warning.', event.error);
    return;
  }
  console.warn('BTC Map resource error.', event.error);
  setStatus('Part of the map could not load. Check your content blocker or connection.');
});

refreshAccountUi();
if (readBtcMapAuth()) loadFavorites().catch(() => {
  sessionStorage.removeItem(TOKEN_KEY);
  refreshAccountUi();
});
