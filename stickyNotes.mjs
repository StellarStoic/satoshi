import {
  STICKY_COLORS,
  STICKY_FONTS,
  STICKY_ANONYMOUS_PRICE_SATS,
  STICKY_MAX_CHARACTERS,
  STICKY_SUB_PLANS,
  STICKY_SUB_WEEK_SATS,
  describeStickyAction,
  stickySubscriptionPrice,
  STICKY_TOPIC,
  clampPlacement,
  clampRotation,
  encodeGeohash,
  geohashBounds,
  geohashNeighbours,
  clampBoardView,
  pinColourFor,
  geohashSetIssue,
  geohashTouches,
  GEOHASH_MAX_CELLS,
  normaliseGeohashes,
  makeDeletionTemplate,
  makeStickyTemplate, mentionFilterAvailability, mentionLabel, noteMentions, stickyTextParts,
  geohashMatchesBoard,
  geohashPrecisionForZoom,
  mapZoomForGeohashPrecision,
  normaliseGeohash,
  normaliseStickyText,
  parseStickyEvent,
  stickyContentHash,
  stickyOrderPrice,
  stickyPaymentRails,
  STICKY_LIVELINESS,
  STICKY_DEFAULT_LIVELINESS,
  stickyLiveliness,
  stickyExpiration,
  isStickyExpired,
  boardExtentForCells,
  geohashGridFits,
  GRID_MIN_CELL_PX,} from './stickyNotesModel.mjs';
import {
  beginAmberLogin,
  getNostrSession,
  loginAnonymously,
  loginWithBunker,
  loginWithExtension,
  loginWithPrivateKey,
  logoutNostr,
  resumeAmber,
  shortNpub,
  signNostrEvent,
  signerReady,
  updateNostrProfile,
} from './nostrSession.mjs';
import {payServiceUrl} from './paymentService.mjs';

const API = document.querySelector('meta[name="sticky-api"]')?.content || payServiceUrl('sticky');
const RELAY = 'wss://nostr.satoshi.si';
const PENDING_KEY = 'satoshi:sticky:pending:v1';
const BOARD_KEY = 'satoshi:sticky:geohash:v1';
// A board can cover several cells that touch, so what is remembered is the whole
// clump; BOARD_KEY keeps the first cell for links and older visitors.
const BOARD_CELLS_KEY = 'satoshi:sticky:geohash-cells:v1';
const BOARD_DEPTH_KEY = 'satoshi:sticky:geohash-depth:v1';
const BOARD_REMEMBER_KEY = 'satoshi:sticky:remember-geohash:v1';
// A place the reader keeps: one cell, opened on every visit, until they unlock it.
const LOCKED_PLACE_KEY = 'satoshi:sticky:locked-place:v1';
// Places the reader named themselves: a name and the cells it stands for, in this browser.
const SAVED_PLACES_KEY = 'satoshi:sticky:saved-places:v1';
const SAVED_PLACES_MAX = 24;
const SAVED_PLACE_NAME_MAX = 40;
const elements = {
  board: document.getElementById('stickyBoard'), canvas: document.getElementById('stickyCanvas'), boardStatus: document.getElementById('boardStatus'),
  corkFrame: document.getElementById('corkFrame'),
  account: document.getElementById('nostrAccount'), newSticky: document.getElementById('newSticky'),
  mentionFilter: document.getElementById('mentionFilter'), mentionFilterStatus: document.getElementById('mentionFilterStatus'),
  mentionMenu: document.getElementById('mentionMenu'), mentionOptions: document.getElementById('mentionOptions'),
  mentionMenuStatus: document.getElementById('mentionMenuStatus'),
  openBoard: document.getElementById('openStickyBoard'), boardDialog: document.getElementById('boardDialog'),
  boardChooser: document.getElementById('boardChooser'), boardGeohash: document.getElementById('boardGeohash'),
  boardDepth: document.getElementById('boardDepth'), shareBoard: document.getElementById('shareStickyBoard'),
  rememberBoard: document.getElementById('rememberStickyBoard'),
  openGeohashMap: document.getElementById('openGeohashMap'), geohashMapDialog: document.getElementById('geohashMapDialog'),
  closeGeohashMap: document.getElementById('closeGeohashMap'), geohashMap: document.getElementById('geohashMap'),
  geohashMapPrecision: document.getElementById('geohashMapPrecision'), geohashMapSelection: document.getElementById('geohashMapSelection'),
  geohashMapStatus: document.getElementById('geohashMapStatus'), clearGeohashSelection: document.getElementById('clearGeohashSelection'),
  useGeohashSelection: document.getElementById('useGeohashSelection'),
  boardChooserStatus: document.getElementById('boardChooserStatus'),
  shareArea: document.getElementById('shareArea'), areaDialog: document.getElementById('areaDialog'),
  areaStatus: document.getElementById('areaStatus'),
  lockToggle: document.getElementById('lockToggle'), unlockButton: document.getElementById('unlockButton'),
  lockCaption: document.getElementById('lockCaption'),
  savedPlacesList: document.getElementById('savedPlacesList'),
  savedPlacesSummary: document.getElementById('savedPlacesSummary'),
  savedPlaceName: document.getElementById('savedPlaceName'), savePlaceButton: document.getElementById('savePlaceButton'),
  savedPlaceStatus: document.getElementById('savedPlaceStatus'),
  areaScaleList: document.getElementById('areaScaleList'),
  login: document.getElementById('loginDialog'), loginStatus: document.getElementById('loginStatus'),
  accountDialog: document.getElementById('accountDialog'), accountName: document.getElementById('accountName'),
  accountNpub: document.getElementById('accountNpub'), accountMethod: document.getElementById('accountMethod'),
  accountPicture: document.getElementById('accountPicture'), accountNip05: document.getElementById('accountNip05'),
  anonymousExpiry: document.getElementById('anonymousExpiry'), logout: document.getElementById('logoutNostr'),
  composer: document.getElementById('composerDialog'), editor: document.getElementById('stickyEditor'),
  draft: document.getElementById('draftNote'), colors: document.getElementById('colorSwatches'),
  capacity: document.getElementById('noteCapacity'), pay: document.getElementById('payForSticky'),
  subscriptionState: document.getElementById('subscriptionState'), planPicker: document.getElementById('planPicker'),
  paymentStatus: document.getElementById('paymentStatus'), placementControls: document.getElementById('placementControls'),
  discardBin: document.getElementById('discardBin'), discardDialog: document.getElementById('discardDialog'),
  discardWarning: document.getElementById('discardWarning'), discardConfirm: document.getElementById('discardNoteConfirm'),
  discardCancel: document.getElementById('discardNoteCancel'),
  paymentDialog: document.getElementById('paymentDialog'), payment: document.getElementById('stickyPayment'), paymentAmount: document.getElementById('stickyPaymentAmount'),
  paymentQr: document.getElementById('stickyPaymentQr'), paymentValue: document.getElementById('stickyPaymentValue'),
  paymentRails: document.getElementById('stickyPaymentRails'), paymentHint: document.getElementById('stickyPaymentHint'),
  copyPayment: document.getElementById('copyStickyPayment'),
  pin: document.getElementById('pinSticky'), bunker: document.getElementById('bunkerInput'),
  privateKey: document.getElementById('privateKeyInput'), font: document.getElementById('noteFont'),
  exactGeohash: document.getElementById('exactGeohashNote'),
  liveliness: document.getElementById('noteLiveliness'), livelinessValue: document.getElementById('noteLivelinessValue'),
  livelinessTicks: document.getElementById('noteLivelinessTicks'), livelinessHint: document.getElementById('noteLivelinessHint'),
  noteExpiresLabel: document.getElementById('noteExpiresLabel'), noteExpiresAt: document.getElementById('noteExpiresAt'),
  zoomOut: document.getElementById('zoomOut'), zoomIn: document.getElementById('zoomIn'),
  zoomFit: document.getElementById('zoomFit'),
  noteMenu: document.getElementById('noteMenu'), noteEventId: document.getElementById('noteEventId'),
  notePostedAt: document.getElementById('notePostedAt'), copyNoteId: document.getElementById('copyNoteId'),
  removeSticky: document.getElementById('removeSticky'), noteMenuStatus: document.getElementById('noteMenuStatus'),
};

let selectedColor = 'yellow';
let selectedFont = 'typewriter';
let selectedLiveliness = STICKY_DEFAULT_LIVELINESS;
let lastValidEditor = '';
let pending = readPending();
let placingNote = null;
let discardRestore = null;
let paymentTimer = null;
let boardSocket = null;
let boardConnectionVersion = 0;
const rendered = new Set();
const noteEvents = new Map();
const pendingDeletions = new Map();
const authorLabels = new Map();
const authorProfileQueue = new Set();
const authorProfilesLoading = new Set();
let authorProfileTimer = null;
let selectedNoteId = '';
let quotedPrice = STICKY_SUB_WEEK_SATS;
let quotedPubkey = '';
// The desk's answer to GET /sticky/v1/subscription for the signed-in key, and the
// plan the picker is on. `actionInfo` is the pure description of what the buttons
// say, rebuilt whenever any of those change.
let subscription = null;
let subscribePlan = 'week';
let actionInfo = describeStickyAction({});
let currentPaymentValue = '';
let currentRails = [];
let currentRailId = '';
let profileFetchPubkey = '';
let composingPubkey = '';
let composingGeohashes = [];
// The picker is the one part of this page that needs an outside library and an
// outside network. Both are fetched the first time somebody opens it, so the
// board itself never pays for the map, and if either fails the footer says so
// and the geohash can still be typed by hand.
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAP_FONT = ['Noto Sans Regular'];
const MAP_LIBRARY = {css: '/vendor/maplibre/maplibre-gl.css', js: '/vendor/maplibre/maplibre-gl.js'};
const MAP_SOURCE_ID = 'geohash-cells';
const MAP_FILL_LAYER = 'geohash-cells-fill';
const MAP_LINE_LAYER = 'geohash-cells-line';
const MAP_DASH_LAYER = 'geohash-cells-dashed';
const MAP_LABEL_LAYER = 'geohash-cells-label';
const MAP_TROUBLE_TEXT = 'The map tiles could not be loaded — you can still enter a geohash by hand.';
const MAP_LAYOUT_WAIT_MS = 400;
const MAP_LAYOUT_POLL_MS = 50;
const MAP_MISSING_TEXT = 'The map could not load. You can still enter a geohash manually.';
let mapLibraryPromise = null;
let mapTroubleSaid = false;

let geohashMap = null;
let geohashMapCells = [];
let geohashGridFrame = 0;
const linkedCells = geohashCellsFrom(new URL(location.href).searchParams.get('g'));
let lockedCells = geohashCellsFrom(localStorage.getItem(LOCKED_PLACE_KEY));
let rememberBoard = localStorage.getItem(BOARD_REMEMBER_KEY) !== 'false';
// A link somebody was sent wins, then the place they locked, then the board they last
// had open: the lock is their own habit and a link is somebody else pointing.
let activeGeohashes = linkedCells.length
  ? linkedCells
  : (lockedCells.length
    ? lockedCells
    : (rememberBoard ? geohashCellsFrom(localStorage.getItem(BOARD_CELLS_KEY) || localStorage.getItem(BOARD_KEY)) : []));
let activeGeohash = activeGeohashes[0] || '';
let boardDepth = Math.max(0, Math.min(11, Number.parseInt(localStorage.getItem(BOARD_DEPTH_KEY), 10) || 0));
if (activeGeohashes.length && rememberBoard) rememberActiveBoard();
if (pending?.action === 'pin' && (Object.hasOwn(pending, 'geohash') || Object.hasOwn(pending, 'geohashes'))) {
  const cells = geohashCellsFrom(pending.geohashes ?? pending.geohash);
  if (cells.length) {
    activeGeohashes = cells;
    activeGeohash = cells[0];
  }
  if (rememberBoard && activeGeohash) rememberActiveBoard();
  else if (!rememberBoard) forgetActiveBoard();
}
if (rememberBoard && activeGeohash && activeGeohashes.join(',') !== linkedCells.join(',')) updateBoardUrl();
const boardView = {scale: .6, x: 0, y: 0};
// One cell of the selected area is one square block of cork this many board pixels across, so
// the corkboard is exactly as big as the area it stands on: a single cell is the smallest board
// there is, two touching cells make it twice as wide (twice as tall if they stand on each
// other), a full clump of nine is the largest. Notes keep their size, so a note covers the same
// share of a cell on every board and its place on the cork keeps its meaning.
const BOARD_CELL_PX = 1200;
// The board's own size, worked out from the selected cells every time a board is opened.
let boardSize = boardExtentForCells([], BOARD_CELL_PX);
// The wooden rail around the cork, in board pixels. The rail sits outside the board,
// so it never covers a note; the board is fitted with the rail included, otherwise
// the frame would be cropped off at Fit board.
const BOARD_FRAME_WIDTH = 90;
// Fitting leaves a little daylight so the rail reads as a border rather than sitting
// flush on the window edge, which is how it went missing on a phone.
const BOARD_FIT_MARGIN = 0.94;
// Zoom limits. A board of nine cells fitted to a laptop screen lands near a sixth of its own
// height, so the floor has to sit below that or the first pinch would jump the view inwards.
const BOARD_ZOOM_MIN = 0.12;
const BOARD_ZOOM_MAX = 2.5;

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
}

function savePending(value) {
  pending = value;
  if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
  else localStorage.removeItem(PENDING_KEY);
}

/**
 * The cells a board covers, from whatever the reader or a link gave us: one code,
 * a comma-separated clump, or an array. Invalid sets come back empty, and
 * geohashIssueFrom() says why in words.
 */
function geohashCellsFrom(value) {
  const parts = (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(part => String(part ?? '').trim().toLowerCase())
    .filter(Boolean);
  return geohashSetIssue(parts) ? [] : normaliseGeohashes(parts);
}

function geohashIssueFrom(value) {
  const parts = (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(part => String(part ?? '').trim().toLowerCase())
    .filter(Boolean);
  return geohashSetIssue(parts.length ? parts : value);
}

/** What the board is called in messages: the cell, plus how many it covers. */
function boardCellsLabel(cells = activeGeohashes) {
  if (!cells.length) return '';
  return cells.length === 1 ? cells[0] : `${cells[0]} +${cells.length - 1} cell${cells.length === 2 ? '' : 's'}`;
}

function rememberActiveBoard() {
  if (!activeGeohashes.length) return;
  localStorage.setItem(BOARD_CELLS_KEY, activeGeohashes.join(','));
  localStorage.setItem(BOARD_KEY, activeGeohash);
}

function forgetActiveBoard() {
  localStorage.removeItem(BOARD_CELLS_KEY);
  localStorage.removeItem(BOARD_KEY);
}

function updateBoardUrl() {
  const boardUrl = new URL(location.href);
  // While a place is locked the URL carries no board at all: that is what lets the lock
  // survive a reload. Writing it back would make the next visit open whatever the reader
  // happened to browse today instead of the place they kept.
  if (lockedCells.length) boardUrl.searchParams.delete('g');
  else if (rememberBoard && activeGeohashes.length) boardUrl.searchParams.set('g', activeGeohashes.join(','));
  else boardUrl.searchParams.delete('g');
  history.replaceState(null, '', boardUrl);
}

function status(target, message, error = false) {
  target.textContent = message;
  target.classList.toggle('is-error', error);
}

function showDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function geohashCellDimensions(precision) {
  const bits = precision * 5;
  return {
    height: 180 / (2 ** Math.floor(bits / 2)),
    width: 360 / (2 ** Math.ceil(bits / 2)),
  };
}

function setMapCells(cells, message = '') {
  geohashMapCells = cells;
  elements.geohashMapSelection.textContent = cells.length ? cells.join(' + ') : 'None';
  elements.useGeohashSelection.disabled = !cells.length;
  status(elements.geohashMapStatus, message);
}

/**
 * A tap adds a cell to the area, or takes it out again. The rule that cells have
 * to touch is enforced here, and the reason is said out loud rather than the tap
 * being swallowed: "does not touch" is the usual one, and the dashed cells on the
 * map show which ones would be accepted.
 */
function toggleMapCell(cell) {
  const next = geohashMapCells.includes(cell)
    ? geohashMapCells.filter(existing => existing !== cell)
    : [...geohashMapCells, cell];
  if (!next.length) {
    setMapCells([]);
    return;
  }
  const issue = geohashSetIssue(next);
  if (issue) {
    // Say why rather than swallowing the tap, and say how to get where they meant:
    // a cell across the map is not part of this area, and Clear starts a new one.
    setMapCells(geohashMapCells, geohashMapCells.length && issue.startsWith('Cells have to stick together')
      ? 'Cells have to stick together — pick one that touches, or Clear to start somewhere else'
      : issue);
    return;
  }
  setMapCells(next, next.length === 1
    ? 'One cell — tap a cell touching it to cover two or three'
    : `${next.length} cells, one note. Tap a dashed cell to widen, or a chosen one to drop it.`);
}

function loadMapLibrary() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mapLibraryPromise) return mapLibraryPromise;
  mapLibraryPromise = new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = MAP_LIBRARY.css;
    document.head.append(link);
    const script = document.createElement('script');
    script.src = MAP_LIBRARY.js;
    script.async = true;
    script.addEventListener('load', () => resolve(window.maplibregl || null));
    script.addEventListener('error', () => {
      mapLibraryPromise = null;
      resolve(null);
    });
    document.head.append(script);
  });
  return mapLibraryPromise;
}

function sayMapTrouble(message) {
  if (mapTroubleSaid) return;
  mapTroubleSaid = true;
  status(elements.geohashMapStatus, message);
}

// The grid is one GeoJSON source with four layers on top of it: a wash, a solid
// outline, a dashed outline for the cells this area may still grow into, and the
// geohash written in the middle. Leaflet drew a rectangle per cell; a single
// source is both cheaper and the only way to keep the touching-cell dashes.
function addGeohashLayers(map) {
  map.addSource(MAP_SOURCE_ID, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
  map.addLayer({
    id: MAP_FILL_LAYER, type: 'fill', source: MAP_SOURCE_ID,
    paint: {
      'fill-color': '#f2a900',
      'fill-opacity': ['case', ['==', ['get', 'selected'], 1], .3, ['==', ['get', 'touchable'], 1], .09, .035],
    },
  });
  map.addLayer({
    id: MAP_LINE_LAYER, type: 'line', source: MAP_SOURCE_ID,
    paint: {
      'line-color': ['case', ['==', ['get', 'selected'], 1], '#ffbd25', ['==', ['get', 'touchable'], 1], '#e8a200', '#f2a900'],
      'line-width': ['case', ['==', ['get', 'selected'], 1], 3, ['==', ['get', 'touchable'], 1], 2, 1],
      'line-opacity': ['case', ['==', ['get', 'selected'], 1], 1, ['==', ['get', 'touchable'], 1], .85, .72],
    },
  });
  map.addLayer({
    id: MAP_DASH_LAYER, type: 'line', source: MAP_SOURCE_ID,
    filter: ['==', ['get', 'touchable'], 1],
    paint: {'line-color': '#e8a200', 'line-width': 2, 'line-opacity': .85, 'line-dasharray': [5, 3]},
  });
  map.addLayer({
    id: MAP_LABEL_LAYER, type: 'symbol', source: MAP_SOURCE_ID,
    layout: {
      'text-field': ['get', 'geohash'], 'text-font': MAP_FONT, 'text-size': 10,
      'text-allow-overlap': true, 'text-ignore-placement': true, 'visibility': 'none',
    },
    paint: {'text-color': '#17130d', 'text-halo-color': '#fff4d5', 'text-halo-width': 1.5},
  });
}

function drawGeohashGrid() {
  geohashGridFrame = 0;
  if (!geohashMap || !elements.geohashMapDialog.open) return;
  const source = geohashMap.getSource(MAP_SOURCE_ID);
  if (!source) return; // the style is still on its way in
  const precision = geohashPrecisionForZoom(geohashMap.getZoom());
  const {height, width} = geohashCellDimensions(precision);
  const bounds = geohashMap.getBounds();
  const south = Math.max(-85.0511, bounds.getSouth());
  const north = Math.min(85.0511, bounds.getNorth());
  const west = Math.max(-180, bounds.getWest());
  const east = Math.min(180, bounds.getEast());
  const latStart = Math.max(0, Math.floor((south + 90) / height));
  const latEnd = Math.min(Math.ceil(180 / height) - 1, Math.floor((north + 90) / height));
  const lonStart = Math.max(0, Math.floor((west + 180) / width));
  const lonEnd = Math.min(Math.ceil(360 / width) - 1, Math.floor((east + 180) / width));
  const columns = lonEnd - lonStart + 1;
  const rows = latEnd - latStart + 1;
  const center = geohashMap.getCenter();
  const firstCorner = geohashMap.project([center.lng, center.lat]);
  const secondCorner = geohashMap.project([center.lng + width, center.lat + height]);
  const cellPixels = Math.min(
    Math.abs(secondCorner.x - firstCorner.x),
    Math.abs(secondCorner.y - firstCorner.y),
  );
  const showLabels = Math.abs(secondCorner.x - firstCorner.x) >= 42 && Math.abs(secondCorner.y - firstCorner.y) >= 22;

  // A grid of specks is worse than no grid. At a world zoom a four-character cell is a couple of
  // pixels across, so every cell of it would be built and none of them could be read or tapped,
  // and there are a sixth of a million of them - which stalls the map for seconds on every zoom.
  // Four characters is the shortest geohash a board takes, so there is no coarser grid to fall
  // back on: the grid is left out and the reader is told to come closer. What is drawn even then
  // is the cells they have already chosen, so their own area stays visible however far out they are.
  if (!geohashGridFits({cellPixels, columns, rows})) {
    const chosen = [];
    for (const cell of geohashMapCells) {
      const box = geohashBounds(cell);
      if (!box) continue;
      chosen.push({
        type: 'Feature',
        properties: {geohash: cell, selected: 1, touchable: 0},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [box.west, box.south], [box.east, box.south],
            [box.east, box.north], [box.west, box.north], [box.west, box.south],
          ]],
        },
      });
    }
    source.setData({type: 'FeatureCollection', features: chosen});
    geohashMap.setLayoutProperty(MAP_LABEL_LAYER, 'visibility', chosen.length ? 'visible' : 'none');
    elements.geohashMapPrecision.textContent = chosen.length
      ? `${chosen.length} cell${chosen.length === 1 ? '' : 's'} chosen`
      : 'Grid hidden';
    status(elements.geohashMapStatus, cellPixels < GRID_MIN_CELL_PX
      ? 'Zoom in to pick a cell - at this distance one is smaller than the map can draw, and four characters is the shortest geohash a board takes.'
      : 'Zoom in a little to pick cells - this view covers more of them than the grid can draw at once.', true);
    return;
  }

  elements.geohashMapPrecision.textContent = `${precision} character${precision === 1 ? '' : 's'}`;
  const features = [];
  for (let latIndex = latStart; latIndex <= latEnd; latIndex += 1) {
    const cellSouth = -90 + latIndex * height;
    const cellNorth = Math.min(90, cellSouth + height);
    for (let lonIndex = lonStart; lonIndex <= lonEnd; lonIndex += 1) {
      const cellWest = -180 + lonIndex * width;
      const cellEast = Math.min(180, cellWest + width);
      const geohash = encodeGeohash((cellSouth + cellNorth) / 2, (cellWest + cellEast) / 2, precision);
      const selected = geohashMapCells.includes(geohash);
      // Dashed cells are the ones this area may grow into: a board is only ever
      // cells that touch, so showing the candidates beats refusing taps.
      const touchable = !selected && geohashMapCells.some(chosen => geohashTouches(chosen, geohash));
      features.push({
        type: 'Feature',
        properties: {geohash, selected: selected ? 1 : 0, touchable: touchable ? 1 : 0},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [cellWest, cellSouth], [cellEast, cellSouth],
            [cellEast, cellNorth], [cellWest, cellNorth], [cellWest, cellSouth],
          ]],
        },
      });
    }
  }
  source.setData({type: 'FeatureCollection', features});
  geohashMap.setLayoutProperty(MAP_LABEL_LAYER, 'visibility', showLabels ? 'visible' : 'none');
  // the grid is back, so the instruction to zoom in is no longer true
  status(elements.geohashMapStatus, '');
}

function scheduleGeohashGrid() {
  if (geohashGridFrame) cancelAnimationFrame(geohashGridFrame);
  geohashGridFrame = requestAnimationFrame(drawGeohashGrid);
}

function nextPaint() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function waitForGeohashMapLayout() {
  // A modal becomes `open` before the browser has necessarily laid it out.
  // MapLibre cannot calculate its camera matrices from a zero-sized container.
  // requestAnimationFrame is the cheapest way to wait for a paint, but a tab that is not
  // visible never fires one, and the picker then waited for ever and said nothing at all.
  // A timer keeps ticking while the page is hidden, so take whichever comes first, and stop
  // after a fixed budget instead of waiting without end.
  const deadline = Date.now() + MAP_LAYOUT_WAIT_MS;
  do {
    const bounds = elements.geohashMap.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0) return true;
    await Promise.race([nextPaint(), new Promise(resolve => setTimeout(resolve, MAP_LAYOUT_POLL_MS))]);
  } while (Date.now() < deadline);
  const bounds = elements.geohashMap.getBoundingClientRect();
  return bounds.width > 0 && bounds.height > 0;
}

async function initialiseGeohashMap() {
  if (geohashMap) return geohashMap;
  const library = await loadMapLibrary();
  if (!library) return null;
  geohashMap = new library.Map({
    container: elements.geohashMap,
    style: MAP_STYLE_URL,
    center: [0, 20], zoom: 2, minZoom: 2, maxZoom: 21,
    // No `maxBounds`. MapLibre applies bounds inside this constructor, before its transform has
    // been sized, and the whole world as bounds is degenerate: it builds a singular matrix, the
    // inverse comes back null, and MapLibre then reads that null — so the map never appears at
    // all, on any screen. The world is already the limit (`renderWorldCopies: false` plus the
    // mercator clamp), so the bounds bought nothing in the first place.
    renderWorldCopies: false,
    // A geohash picker that can be tilted or turned is a picker you can get lost
    // in: north stays up.
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
    // The OpenFreeMap styles carry no attribution of their own, and the data is
    // OpenStreetMap's: the credit is ours to give.
    attributionControl: {
      compact: true,
      customAttribution: 'Map <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>'
        + ' · &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>'
        + ' · &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    },
  });
  geohashMap.addControl(new library.NavigationControl({showCompass: false}), 'top-right');
  geohashMap.on('load', () => {
    addGeohashLayers(geohashMap);
    scheduleGeohashGrid();
  });
  geohashMap.on('moveend', scheduleGeohashGrid);
  geohashMap.on('zoomend', () => {
    const precision = geohashPrecisionForZoom(geohashMap.getZoom());
    // Opening the map sets the view to the board's own zoom, which fires here too.
    // That is not the reader zooming, and the cells they picked are still theirs —
    // only a real change of depth makes them meaningless, and then it is said.
    if (geohashMapCells.length && geohashMapCells[0].length === precision) {
      scheduleGeohashGrid();
      return;
    }
    const center = geohashMap.getCenter();
    setMapCells([encodeGeohash(center.lat, center.lng, precision)],
      'Zoomed to a new grid — pick the cells for this area again');
    scheduleGeohashGrid();
  });
  // One click handler, not two: asking what was under the pointer is the only way
  // to tell a tap on a cell from a tap on the map, and it cannot fire twice for
  // the same tap the way a bubbling rectangle could.
  geohashMap.on('click', event => {
    const under = geohashMap.queryRenderedFeatures(event.point, {layers: [MAP_FILL_LAYER]});
    if (under.length) {
      toggleMapCell(under[0].properties.geohash);
      scheduleGeohashGrid();
      return;
    }
    const cell = encodeGeohash(event.lngLat.lat, event.lngLat.lng, geohashPrecisionForZoom(geohashMap.getZoom()));
    const touching = geohashMapCells.some(chosen => geohashTouches(chosen, cell));
    if (geohashMapCells.length && !touching && !geohashMapCells.includes(cell)) {
      // Tapping somewhere else entirely starts a new area rather than being
      // refused: the reader is plainly pointing at another place.
      setMapCells([cell], 'Started a new area here — cells have to touch to be one board');
      scheduleGeohashGrid();
      return;
    }
    toggleMapCell(cell);
    scheduleGeohashGrid();
  });
  geohashMap.on('mouseenter', MAP_FILL_LAYER, () => { geohashMap.getCanvas().style.cursor = 'pointer'; });
  geohashMap.on('mouseleave', MAP_FILL_LAYER, () => { geohashMap.getCanvas().style.cursor = ''; });
  // A blocked style, a tile that will not come, a machine without WebGL: each of
  // those ends up here, and the footer says what can still be done instead of the
  // reader staring at an empty grey box.
  geohashMap.on('error', event => {
    if (event && event.error) sayMapTrouble(MAP_TROUBLE_TEXT);
  });
  return geohashMap;
}

async function openGeohashMap() {
  const typed = geohashCellsFrom(elements.boardGeohash.value);
  const current = typed.length ? typed : activeGeohashes;
  elements.boardDialog.close();
  showDialog(elements.geohashMapDialog);
  const hasLayout = await waitForGeohashMapLayout();
  if (!hasLayout || !elements.geohashMapDialog.open) {
    sayMapTrouble('The map could not fit this screen — the geohash can still be typed by hand.');
    return;
  }
  const existingMap = Boolean(geohashMap);
  let map = geohashMap;
  if (!map) {
    try {
      map = await initialiseGeohashMap();
    } catch (error) {
      // A map that threw while being built must not be kept: the picker would hand the same broken
      // object to every later open. Clearing it lets the next attempt start from nothing.
      console.error('Could not build the geohash map:', error);
      geohashMap = null;
      map = null;
    }
  }
  if (!map) {
    elements.geohashMap.replaceChildren(document.createTextNode(MAP_MISSING_TEXT));
    sayMapTrouble('The map could not load — the geohash can still be typed by hand.');
    return;
  }
  if (!elements.geohashMapDialog.open) return;
  try {
    if (current.length) {
      const bounds = geohashBounds(current[0]);
      setMapCells(current, current.length === 1
        ? 'Tap a cell touching this one to cover two or three'
        : `${current.length} cells on this board`);
      map.jumpTo({center: [bounds.center.lng, bounds.center.lat], zoom: mapZoomForGeohashPrecision(current[0].length)});
    } else {
      setMapCells([]);
      map.jumpTo({center: [0, 20], zoom: 2});
    }
    // A new map measured the visible dialog in its constructor. Only a reused
    // map needs resizing after the dialog was closed and opened again.
    if (existingMap) map.resize();
    scheduleGeohashGrid();
  } catch (error) {
    // Same reasoning: whatever failed here left a map that cannot be driven, so let the next open
    // build a fresh one rather than reusing this one.
    console.error('Could not open the geohash map:', error);
    geohashMap = null;
    sayMapTrouble('The map could not open — the geohash can still be typed by hand.');
  }
}

function sessionLabel(session) {
  if (session?.method === 'anonymous') return 'Anonymous';
  return session?.profile?.display_name || session?.profile?.name || (session ? shortNpub(session.npub) : 'Log in');
}

function safeProfilePicture(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function readProfileFromRelay(url, pubkey) {
  return new Promise(resolve => {
    const socket = new WebSocket(url);
    const subscription = `sticky-profile-${crypto.randomUUID?.() || Date.now()}`;
    let newest = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { socket.close(); } catch {}
      resolve(newest);
    };
    const timer = setTimeout(finish, 3500);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, {authors: [pubkey], kinds: [0], limit: 5}])));
    socket.addEventListener('message', message => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EOSE') { clearTimeout(timer); finish(); return; }
      if (data[0] !== 'EVENT' || !window.NostrTools.verifyEvent(data[2]) || data[2].pubkey !== pubkey) return;
      if (!newest || data[2].created_at > newest.created_at) newest = data[2];
    });
    socket.addEventListener('error', finish);
  });
}

function readAuthorProfilesFromRelay(url, pubkeys) {
  return new Promise(resolve => {
    const profiles = new Map();
    const socket = new WebSocket(url);
    const subscription = `sticky-authors-${crypto.randomUUID?.() || Date.now()}`;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve(profiles);
    };
    const timer = setTimeout(finish, 3500);
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, {authors: pubkeys, kinds: [0], limit: Math.min(1000, pubkeys.length * 2)}])));
    socket.addEventListener('message', message => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EOSE' && data[1] === subscription) { finish(); return; }
      const event = data[2];
      if (data[0] !== 'EVENT' || data[1] !== subscription || !window.NostrTools.verifyEvent(event) || !pubkeys.includes(event.pubkey)) return;
      const current = profiles.get(event.pubkey);
      if (!current || event.created_at > current.created_at) profiles.set(event.pubkey, event);
    });
    socket.addEventListener('error', finish);
    socket.addEventListener('close', finish);
  });
}

function profileAuthorLabel(event, pubkey) {
  if (event) {
    try {
      const profile = JSON.parse(event.content || '{}');
      const identity = String(profile.name || profile.display_name || profile.displayName || profile.nip05 || '').trim().replace(/\s+/g, ' ');
      if (identity) return `~${identity.slice(0, 80)}`;
    } catch {}
  }
  return `~${shortAuthor(pubkey)}`;
}

function updateAuthorElements(pubkey, label) {
  elements.canvas.querySelectorAll('.sticky-note__author').forEach(author => {
    if (author.dataset.authorPubkey === pubkey) {
      author.textContent = label;
      author.title = label;
    }
  });
}

async function flushAuthorProfiles() {
  authorProfileTimer = null;
  const pubkeys = [...authorProfileQueue].filter(pubkey => !authorProfilesLoading.has(pubkey));
  authorProfileQueue.clear();
  if (!pubkeys.length) return;
  pubkeys.forEach(pubkey => authorProfilesLoading.add(pubkey));
  try {
    const results = await Promise.allSettled([
      readAuthorProfilesFromRelay(RELAY, pubkeys),
      readAuthorProfilesFromRelay('wss://relay.damus.io', pubkeys),
      readAuthorProfilesFromRelay('wss://nos.lol', pubkeys),
      readAuthorProfilesFromRelay('wss://relay.ditto.pub', pubkeys),
    ]);
    const newest = new Map();
    results.filter(result => result.status === 'fulfilled').forEach(result => {
      result.value.forEach((event, pubkey) => {
        if (!newest.has(pubkey) || event.created_at > newest.get(pubkey).created_at) newest.set(pubkey, event);
      });
    });
    pubkeys.forEach(pubkey => {
      const label = profileAuthorLabel(newest.get(pubkey), pubkey);
      authorLabels.set(pubkey, label);
      updateAuthorElements(pubkey, label);
    });
  } finally {
    pubkeys.forEach(pubkey => authorProfilesLoading.delete(pubkey));
  }
}

function labelNoteAuthor(author, sticky) {
  if (sticky.anonymous) {
    author.textContent = '~anonymous';
    author.title = '~anonymous';
    return;
  }
  author.dataset.authorPubkey = sticky.pubkey;
  const known = authorLabels.get(sticky.pubkey);
  author.textContent = known || `~${shortAuthor(sticky.pubkey)}`;
  author.title = author.textContent;
  if (known || authorProfilesLoading.has(sticky.pubkey)) return;
  authorProfileQueue.add(sticky.pubkey);
  clearTimeout(authorProfileTimer);
  authorProfileTimer = setTimeout(flushAuthorProfiles, 90);
}

async function loadAccountProfile(session) {
  if (!session || session.method === 'anonymous' || profileFetchPubkey === session.pubkey) return;
  profileFetchPubkey = session.pubkey;
  const results = await Promise.allSettled([
    readProfileFromRelay(RELAY, session.pubkey),
    readProfileFromRelay('wss://relay.damus.io', session.pubkey),
    readProfileFromRelay('wss://nos.lol', session.pubkey),
    readProfileFromRelay('wss://relay.ditto.pub', session.pubkey),
  ]);
  const events = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const event = events.filter(Boolean).sort((left, right) => right.created_at - left.created_at)[0];
  if (!event || getNostrSession()?.pubkey !== session.pubkey) return;
  try {
    const source = JSON.parse(event.content || '{}');
    const profile = {
      name: String(source.name || '').trim().slice(0, 80),
      display_name: String(source.display_name || source.displayName || '').trim().slice(0, 80),
      nip05: String(source.nip05 || '').trim().slice(0, 180),
      picture: safeProfilePicture(source.picture),
    };
    updateNostrProfile(session.pubkey, profile);
  } catch {}
}

function anonymousCountdown(expiresAt) {
  const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function updateAnonymousCountdown() {
  const session = getNostrSession();
  if (session?.method !== 'anonymous') {
    elements.anonymousExpiry.hidden = true;
    return;
  }
  elements.anonymousExpiry.hidden = false;
  elements.anonymousExpiry.innerHTML = `Local access expires in <strong>${anonymousCountdown(session.expiresAt)}</strong>`;
}

function updateAccount() {
  const session = getNostrSession();
  const accountLabel = session ? `Nostr account: ${sessionLabel(session)}` : 'Log in to Nostr';
  elements.account.setAttribute('aria-label', accountLabel);
  elements.account.title = accountLabel;
  if (session) {
    elements.accountName.textContent = sessionLabel(session);
    elements.accountNpub.textContent = session.npub;
    elements.accountMethod.textContent = session.method === 'anonymous' ? 'Temporary local Nostr identity' : `Signer: ${session.method === 'private' ? 'private key (not saved)' : session.method}`;
    const nip05 = session.profile?.nip05 || '';
    elements.accountNip05.textContent = nip05;
    elements.accountNip05.hidden = !nip05 || session.method === 'anonymous';
    const picture = session.method === 'anonymous' ? '' : safeProfilePicture(session.profile?.picture);
    elements.accountPicture.hidden = !picture;
    if (picture) {
      elements.accountPicture.src = picture;
      elements.accountPicture.alt = `${sessionLabel(session)} profile image`;
    }
    else elements.accountPicture.removeAttribute('src');
    elements.logout.querySelector('span').textContent = session.method === 'anonymous' ? 'Leave anonymous mode' : 'Log out';
    loadAccountProfile(session);
  } else {
    elements.accountName.textContent = '';
    elements.accountNpub.textContent = '';
    elements.accountMethod.textContent = '';
    elements.accountNip05.hidden = true;
    elements.accountPicture.hidden = true;
  }
  updateAnonymousCountdown();
  refreshPriceQuote(session);
  refreshMentionFilter();
}

function renderQuotedPrice() {
  const session = getNostrSession();
  const anonymous = session?.method === 'anonymous';
  actionInfo = describeStickyAction({anonymous, subscription, plan: subscribePlan});
  const removeInfo = describeStickyAction({action: 'remove', anonymous, subscription, plan: subscribePlan});
  // A person who is not signed in sees no price at all: the buttons only mean
  // something once we know which key — and which identity mode — is posting.
  quotedPrice = session ? actionInfo.price : STICKY_SUB_WEEK_SATS;
  elements.pay.querySelector('span').textContent = session ? actionInfo.label : 'Sign in to post';
  elements.removeSticky.querySelector('span').textContent = session ? removeInfo.label : 'Remove note';
  if (elements.subscriptionState) {
    elements.subscriptionState.textContent = session ? actionInfo.state : '';
    elements.subscriptionState.hidden = !session;
  }
  if (elements.planPicker) {
    // The picker is only useful when there is a subscription to choose: an active
    // one already covers everything, and an anonymous identity can never take one.
    elements.planPicker.hidden = !session || anonymous || actionInfo.active;
    for (const button of elements.planPicker.querySelectorAll('[data-plan]')) {
      const plan = button.dataset.plan === 'year' ? 'year' : 'week';
      const amount = button.querySelector('b');
      const price = stickySubscriptionPrice(plan, {member: actionInfo.member});
      if (amount && Number.isInteger(price)) amount.textContent = String(price);
      button.classList.toggle('is-active', plan === subscribePlan);
      button.setAttribute('aria-pressed', plan === subscribePlan ? 'true' : 'false');
    }
  }
}

async function refreshPriceQuote(session) {
  if (!session) {
    quotedPubkey = '';
    subscription = null;
    renderQuotedPrice();
    return;
  }
  if (session.method === 'anonymous') {
    quotedPubkey = session.pubkey;
    subscription = null;
    renderQuotedPrice();
    return;
  }
  if (quotedPubkey === session.pubkey && subscription) return;
  quotedPubkey = session.pubkey;
  renderQuotedPrice();
  try {
    // One call answers both halves: whether this key may post, and what the plans
    // cost it. The created order is still authoritative — this only draws buttons.
    const state = await api(`/subscription?pubkey=${encodeURIComponent(session.pubkey)}`);
    if (getNostrSession()?.pubkey !== session.pubkey) return;
    if (state && state.ok !== false) subscription = state;
    renderQuotedPrice();
  } catch {
    // The created order remains authoritative; a missing preview never blocks checkout.
  }
}

/** Read the subscription again after a payment, rather than waiting on a cache. */
async function refreshSubscription() {
  const session = getNostrSession();
  if (!session || session.method === 'anonymous') return;
  quotedPubkey = '';
  await refreshPriceQuote(session);
}

async function api(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {'content-type': 'application/json', ...(options.headers || {})},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status}).`);
    // The caller needs to tell "you must subscribe first" apart from a real
    // failure, so the status and the reason code travel with the error.
    error.status = response.status;
    error.reason = body.reason || '';
    throw error;
  }
  return body;
}

let qrPromise = null;
function loadQr() {
  if (!qrPromise) {
    qrPromise = new Promise(resolve => {
      if (typeof window.qrcode === 'function') return resolve(true);
      const script = document.createElement('script');
      script.src = '/qrCodeGenerator_1_4_4.js';
      script.onload = () => resolve(typeof window.qrcode === 'function');
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }
  return qrPromise;
}

async function renderPayment(order) {
  const rails = stickyPaymentRails(order);
  if (!rails.length) {
    elements.paymentQr.hidden = true;
    elements.paymentValue.textContent = '';
    elements.paymentHint.textContent = 'Preparing invoice...';
    return false;
  }
  const sats = stickyOrderPrice(order, pending?.sats ?? STICKY_SUB_WEEK_SATS);
  currentRails = rails;
  elements.paymentAmount.textContent = rails.length > 1 ? `Pay ${sats} sats` : `Pay ${sats} sats with ${rails[0].label}`;
  elements.paymentRails.hidden = rails.length < 2;
  elements.paymentRails.replaceChildren(...rails.map(rail => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rail-tab';
    button.dataset.rail = rail.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    const icon = document.createElement('i');
    icon.className = `lni lni-${rail.id === 'lightning' ? 'bolt' : 'map-marker-1'}`;
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, Object.assign(document.createElement('span'), {textContent: rail.label}));
    button.addEventListener('click', () => selectRail(rail.id));
    return button;
  }));
  elements.paymentQr.hidden = false;
  elements.paymentValue.hidden = false;
  elements.copyPayment.hidden = false;
  elements.paymentHint.textContent = `Waiting for the ${sats}-sat payment...`;
  showDialog(elements.paymentDialog);
  const wanted = rails.some(rail => rail.id === currentRailId) ? currentRailId : rails[0].id;
  await selectRail(wanted);
  return true;
}

async function selectRail(id) {
  const rail = currentRails.find(item => item.id === id) || currentRails[0];
  if (!rail) return;
  currentRailId = rail.id;
  currentPaymentValue = rail.copyValue || rail.uri;
  for (const button of elements.paymentRails.querySelectorAll('.rail-tab')) {
    const active = button.dataset.rail === rail.id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  }
  elements.paymentValue.textContent = rail.uri;
  elements.paymentQr.alt = `${rail.label} payment QR code`;
  if (await loadQr()) {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(rail.uri);
      qr.make();
      elements.paymentQr.src = qr.createDataURL(6, 8);
      elements.paymentQr.hidden = false;
    } catch { elements.paymentQr.removeAttribute('src'); }
  }
}

function showPaymentPreparing(sats = quotedPrice) {
  currentRails = [];
  currentRailId = '';
  currentPaymentValue = '';
  elements.paymentAmount.textContent = `Pay ${sats} sats`;
  elements.paymentRails.hidden = true;
  elements.paymentRails.replaceChildren();
  elements.paymentQr.hidden = true;
  elements.paymentQr.removeAttribute('src');
  elements.paymentValue.hidden = true;
  elements.copyPayment.hidden = true;
  elements.paymentHint.textContent = 'Preparing invoice...';
  showDialog(elements.paymentDialog);
}

async function copyPayment() {
  if (!currentPaymentValue) return;
  try {
    await navigator.clipboard.writeText(currentPaymentValue);
    elements.copyPayment.querySelector('span').textContent = 'Payment copied';
    setTimeout(() => { elements.copyPayment.querySelector('span').textContent = 'Copy payment'; }, 1800);
  } catch { status(elements.paymentStatus, 'Could not copy the payment.', true); }
}

function noteAtPlacement(note, placement) {
  note.style.left = `${placement.x * 100}%`;
  note.style.top = `${placement.y * 100}%`;
  note.style.setProperty('--rotation', `${placement.rotation}deg`);
}

function noteBelongsToBoard(sticky) {
  // Either side may be a clump: a note belongs to a board when any of the note's
  // cells is one of the board's cells, or deeper inside one of them.
  return geohashMatchesBoard(sticky.geohashes ?? sticky.geohash, activeGeohashes, boardDepth, sticky.exactGeohash);
}

function updateBoardControl() {
  const reach = boardDepth === 0 ? 'exact only' : boardDepth === 11 ? 'all child boards' : `${boardDepth} level${boardDepth === 1 ? '' : 's'} deeper`;
  const label = activeGeohash ? `Corkboard: ${boardCellsLabel()} (${reach})` : 'Choose a geohash corkboard';
  elements.openBoard.setAttribute('aria-label', label);
  elements.openBoard.title = label;
}

function selectBoard(geohash, closeDialog = true) {
  if (placingNote) {
    status(elements.boardChooserStatus, 'Pin the current note before changing corkboards.', true);
    return;
  }
  const cells = geohashCellsFrom(geohash);
  if (!cells.length) {
    const issue = geohashIssueFrom(geohash);
    status(elements.boardChooserStatus,
      issue === 'Choose at least one cell.' ? 'Enter a valid geohash first.' : issue, true);
    return;
  }
  activeGeohashes = cells;
  activeGeohash = cells[0];
  boardSize = boardExtentForCells(cells, BOARD_CELL_PX);
  applyBoardSize();
  if (rememberBoard) rememberActiveBoard();
  else forgetActiveBoard();
  updateBoardUrl();
  updateBoardControl();
  closeNoteMenu();
  boardConnectionVersion += 1;
  try { boardSocket?.close(); } catch {}
  boardSocket = null;
  rendered.clear();
  noteEvents.clear();
  pendingDeletions.clear();
  // The wooden rail is markup inside this canvas, so a bare replaceChildren() deleted the
  // board's own edge every time a board was opened - which is why the border was missing on
  // a phone, where a board almost always gets chosen before the board is looked at. Keep it.
  elements.canvas.replaceChildren(elements.corkFrame);
  elements.boardStatus.hidden = false;
  status(elements.boardStatus, `Opening corkboard ${boardCellsLabel()}...`);
  if (closeDialog) elements.boardDialog.close();
  connectBoard(boardConnectionVersion);
}

function clampViewToBoard() {
  const rect = elements.board.getBoundingClientRect();
  const clamped = clampBoardView(boardView, {width: rect.width, height: rect.height}, {
    canvasWidth: boardSize.width, canvasHeight: boardSize.height, frame: BOARD_FRAME_WIDTH,
  });
  boardView.x = clamped.x;
  boardView.y = clamped.y;
}

function applyBoardTransform() {
  // Every pan, zoom and fit passes through here, so this is the one place that has to hold
  // the line: the rail is the board's edge, and the board does not continue past it.
  clampViewToBoard();
  elements.canvas.style.transform = `translate(${boardView.x}px, ${boardView.y}px) scale(${boardView.scale})`;
  // How far the frame has to reach outside the board to cover the window: a fixed
  // band would leave bare cork showing past it at a zoomed-out view, so it is
  // worked out here, in board pixels, every time the board moves.
  const rect = elements.board.getBoundingClientRect();
  const room = Math.max(
    (rect.width - boardSize.width * boardView.scale) / 2,
    (rect.height - boardSize.height * boardView.scale) / 2,
    240 * boardView.scale,
  ) / boardView.scale;
  elements.canvas.style.setProperty('--cork-surround', `${Math.ceil(room)}px`);
  elements.board.style.backgroundSize = `${600 * boardView.scale}px ${600 * boardView.scale}px`;
  elements.board.style.backgroundPosition = `${boardView.x}px ${boardView.y}px`;
}

function applyBoardSize() {
  // The stylesheet carries a one-cell default so the sheet is never zero-sized, but the board's
  // real size is the area's, so it is written on the element every time a board is opened.
  elements.canvas.style.width = `${boardSize.width}px`;
  elements.canvas.style.height = `${boardSize.height}px`;
}

function fitBoard() {
  const rect = elements.board.getBoundingClientRect();
  // Fit the rail, not just the cork, with margin left over so the border is actually
  // visible: the framed sheet is what a reader sees, so it is what has to fit. The clamp in
  // applyBoardTransform then centres the framed sheet rather than the bare cork.
  const frame = BOARD_FRAME_WIDTH * 2;
  boardView.scale = BOARD_FIT_MARGIN * Math.min(
    rect.width / (boardSize.width + frame),
    rect.height / (boardSize.height + frame),
  );
  boardView.x = (rect.width - boardSize.width * boardView.scale) / 2;
  boardView.y = (rect.height - boardSize.height * boardView.scale) / 2;
  applyBoardTransform();
}

function setZoom(nextScale, clientX = innerWidth / 2, clientY = innerHeight / 2) {
  const rect = elements.board.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const worldX = (pointX - boardView.x) / boardView.scale;
  const worldY = (pointY - boardView.y) / boardView.scale;
  boardView.scale = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, nextScale));
  boardView.x = pointX - worldX * boardView.scale;
  boardView.y = pointY - worldY * boardView.scale;
  applyBoardTransform();
}

function renderNote(sticky, event = null, temporary = false) {
  if (!temporary && rendered.has(sticky.id)) return null;
  if (!temporary) rendered.add(sticky.id);
  const note = document.createElement('article');
  note.className = `sticky-note sticky-note--${sticky.color} sticky-note--font-${sticky.font || 'typewriter'}${temporary ? ' sticky-note--placing' : ''}`;
  note.classList.toggle('sticky-note--dense', sticky.content.length > 280);
  if (sticky.id) note.dataset.eventId = sticky.id;
  note.dataset.createdAt = String(sticky.createdAt || 0);
  note.tabIndex = temporary ? 0 : -1;
  const text = document.createElement('div');
  text.className = 'sticky-note__text';
  const textContent = document.createElement('span');
  renderNoteContent(textContent, sticky.content);
  text.appendChild(textContent);
  note.appendChild(text);
  if (!temporary) {
    const pin = document.createElement('span');
    pin.className = 'sticky-note__pin';
    pin.setAttribute('role', 'button');
    pin.tabIndex = 0;
    pin.setAttribute('aria-label', 'Open note details');
    // A picture holds the note down. The colour comes from the note's own event id, so it is
    // random between notes and identical every time this note is drawn; the button keeps the
    // note menu reachable, exactly as the painted dot did.
    const pinArt = document.createElement('img');
    pinArt.className = 'sticky-note__pin-art';
    pinArt.alt = '';
    pinArt.decoding = 'async';
    pinArt.src = `/img/pin_${pinColourFor(sticky.id || `${sticky.pubkey}:${sticky.createdAt}`)}.png`;
    pin.appendChild(pinArt);
    pin.addEventListener('click', click => { click.stopPropagation(); openNoteMenu(sticky.id, pin); });
    pin.addEventListener('keydown', key => {
      if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); openNoteMenu(sticky.id, pin); }
    });
    note.appendChild(pin);
    const author = document.createElement('span');
    author.className = 'sticky-note__author';
    labelNoteAuthor(author, sticky);
    note.appendChild(author);
  }
  noteAtPlacement(note, sticky);
  const nextNewer = [...elements.canvas.querySelectorAll('.sticky-note:not(.sticky-note--placing)')]
    .find(existing => Number(existing.dataset.createdAt || 0) > Number(sticky.createdAt || 0));
  elements.canvas.insertBefore(note, nextNewer || placingNote || null);
  fitPublishedTypography(note, text, textContent, sticky.font || 'typewriter');
  document.fonts?.ready?.then(() => {
    if (note.isConnected) fitPublishedTypography(note, text, textContent, sticky.font || 'typewriter');
  });
  if (!temporary && event) noteEvents.set(sticky.id, {event, sticky, element: note});
  // A note that arrives while the filter is on obeys it too.
  if (!temporary && mentionFilterOn && !noteMentions(sticky, getNostrSession()?.pubkey)) {
    note.classList.add('sticky-note--filtered-out');
  }
  return note;
}

function shortAuthor(pubkey) {
  try { return shortNpub(window.NostrTools.nip19.npubEncode(pubkey)); } catch { return 'Nostr user'; }
}

function connectBoard(version = boardConnectionVersion) {
  if (!activeGeohash) {
    status(elements.boardStatus, 'Choose a geohash to open its corkboard.');
    elements.boardStatus.hidden = false;
    return;
  }
  const subscription = `sticky-${Date.now()}`;
  const socket = new WebSocket(RELAY);
  boardSocket = socket;
  const timeout = setTimeout(() => status(elements.boardStatus, 'The board is taking longer than usual to open.'), 6000);
  socket.addEventListener('open', () => {
    // A board of several cells asks the relay for all of them at once: "any of
    // these" is what the filter means, and the notes decide the rest.
    const noteFilter = {kinds: [1], '#t': [STICKY_TOPIC], '#g': [...activeGeohashes], limit: 500};
    socket.send(JSON.stringify(['REQ', subscription,
      noteFilter,
      {kinds: [5], '#t': ['satoshi-sticky-delete'], limit: 500},
    ]));
  });
  socket.addEventListener('message', message => {
    try {
      const data = JSON.parse(message.data);
      if (data[0] === 'EOSE' && data[1] === subscription) {
        clearTimeout(timeout);
        elements.boardStatus.hidden = true;
        return;
      }
      if (data[0] !== 'EVENT' || data[1] !== subscription || !window.NostrTools.verifyEvent(data[2])) return;
      const event = data[2];
      if (event.kind === 5) {
        processDeletion(event);
        return;
      }
      const sticky = parseStickyEvent(event);
      // NIP-40: an expired note is gone. The relay should not be sending one at
      // all, and a note that expires between the send and this line is dropped here.
      if (!sticky || isStickyExpired(sticky) || !noteBelongsToBoard(sticky)) return;
      const deletion = pendingDeletions.get(sticky.id);
      if (deletion?.pubkey === sticky.pubkey) return;
      renderNote(sticky, event);
    } catch {}
  });
  socket.addEventListener('error', () => {
    clearTimeout(timeout);
    status(elements.boardStatus, 'The Nostr board is temporarily unavailable.', true);
  });
  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    if (!document.hidden && version === boardConnectionVersion) setTimeout(() => connectBoard(version), 5000);
  }, {once: true});
}

function processDeletion(event) {
  const target = event.tags?.find(tag => tag?.[0] === 'e')?.[1];
  if (!/^[0-9a-f]{64}$/.test(target || '')) return;
  const existing = noteEvents.get(target);
  if (existing && existing.event.pubkey === event.pubkey) {
    existing.element.remove();
    noteEvents.delete(target);
    rendered.delete(target);
    if (selectedNoteId === target) closeNoteMenu();
  } else {
    pendingDeletions.set(target, event);
  }
}

function selectColor(color) {
  if (!STICKY_COLORS.includes(color)) return;
  elements.draft.classList.remove(...STICKY_COLORS.map(item => `sticky-note--${item}`));
  elements.draft.classList.add(`sticky-note--${color}`);
  elements.colors.querySelectorAll('[data-color]').forEach(button => button.classList.toggle('is-selected', button.dataset.color === color));
  selectedColor = color;
}

function selectFont(font) {
  if (!STICKY_FONTS.includes(font)) return;
  elements.draft.classList.remove(...STICKY_FONTS.map(item => `sticky-note--font-${item}`));
  elements.draft.classList.add(`sticky-note--font-${font}`);
  elements.font.classList.remove(...STICKY_FONTS.map(item => `note-font-select--${item}`));
  elements.font.classList.add(`note-font-select--${font}`);
  elements.font.value = font;
  selectedFont = font;
  requestAnimationFrame(() => {
    fitDraftTypography();
    updateCapacity();
  });
  document.fonts?.ready?.then(() => {
    if (elements.draft.isConnected && selectedFont === font) fitDraftTypography();
  });
}

/** The rungs come from the model, so the slider cannot offer what the desk refuses. */
function renderLiveliness() {
  if (elements.livelinessTicks && !elements.livelinessTicks.childElementCount) {
    elements.livelinessTicks.append(...STICKY_LIVELINESS.map(rung => {
      const tick = document.createElement('span');
      tick.textContent = rung.short;
      tick.dataset.key = rung.key;
      return tick;
    }));
  }
  if (elements.liveliness) elements.liveliness.max = String(STICKY_LIVELINESS.length - 1);
  selectLiveliness(selectedLiveliness);
}

function livelinessRung(key = selectedLiveliness) {
  return stickyLiveliness(key) || stickyLiveliness(STICKY_DEFAULT_LIVELINESS);
}

function livelinessHintText(rung) {
  const when = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'})
    .format(stickyExpiration(Math.floor(Date.now() / 1000), rung.key) * 1000);
  return `The relay deletes it around ${when}. Nothing keeps a copy.`;
}

function selectLiveliness(key) {
  const rung = livelinessRung(key);
  selectedLiveliness = rung.key;
  const index = STICKY_LIVELINESS.indexOf(rung);
  if (elements.liveliness) {
    elements.liveliness.value = String(index);
    elements.liveliness.setAttribute('aria-valuetext', rung.label);
  }
  if (elements.livelinessValue) elements.livelinessValue.textContent = rung.label;
  if (elements.livelinessTicks) {
    [...elements.livelinessTicks.children].forEach((tick, position) => tick.classList.toggle('is-selected', position === index));
  }
  if (elements.livelinessHint) elements.livelinessHint.textContent = livelinessHintText(rung);
}

function baseFontSize(font, draft = false) {
  const sizes = {
    typewriter: draft ? 18 : 17,
    mono: draft ? 17 : 16,
    handwritten: draft ? 24 : 22,
    'patrick-hand': draft ? 22 : 20,
    kalam: draft ? 21 : 19,
    serif: draft ? 18 : 17,
  };
  return sizes[font] || sizes.typewriter;
}

function fitDraftTypography() {
  let size = baseFontSize(selectedFont, true);
  elements.draft.style.setProperty('--note-font-size', `${size}px`);
  const fits = () => {
    const verticalInset = elements.draft.classList.contains('sticky-note--dense') ? size * 2.84 : 44;
    const availableHeight = elements.draft.clientHeight - verticalInset;
    return elements.editor.scrollHeight <= availableHeight + 1 && elements.editor.scrollWidth <= elements.editor.clientWidth + 1;
  };
  while (size > 10 && !fits()) {
    size -= 1;
    elements.draft.style.setProperty('--note-font-size', `${size}px`);
  }
  return fits();
}

function fitPublishedTypography(note, textBox, textContent, font) {
  let size = baseFontSize(font);
  note.style.setProperty('--note-font-size', `${size}px`);
  while (size > 10 && (textContent.getBoundingClientRect().height > textBox.clientHeight + 1 || textContent.scrollWidth > textBox.clientWidth + 1)) {
    size -= 1;
    note.style.setProperty('--note-font-size', `${size}px`);
  }
}

function editorOverflows() {
  return !fitDraftTypography();
}

function updateCapacity() {
  // Counted in the text that will be published: a mention is drawn as a name in
  // the editor but travels as its whole npub, so what the counter shows is what
  // the relay will hold.
  const length = normaliseStickyText(editorContent()).length;
  const full = length >= STICKY_MAX_CHARACTERS;
  const almostFull = !full && length >= Math.floor(STICKY_MAX_CHARACTERS * .9);
  elements.draft.classList.toggle('sticky-note--dense', length > 280);
  elements.capacity.classList.toggle('is-almost-full', almostFull);
  elements.capacity.classList.toggle('is-full', full);
  if (!length) elements.capacity.textContent = 'The paper is empty';
  else if (full) elements.capacity.textContent = 'The note is full';
  else if (almostFull) elements.capacity.textContent = `${STICKY_MAX_CHARACTERS - length} characters left`;
  else elements.capacity.textContent = `${length} characters`;
}

function handleEditorInput() {
  const text = elements.editor.textContent;
  const published = normaliseStickyText(editorContent());
  elements.draft.classList.toggle('sticky-note--dense', published.length > 280);
  if (published.length > STICKY_MAX_CHARACTERS) {
    elements.editor.textContent = lastValidEditor;
    updateCapacity();
    fitDraftTypography();
    const selection = window.getSelection();
    selection.selectAllChildren(elements.editor);
    selection.collapseToEnd();
    return;
  }
  if (editorOverflows()) {
    elements.editor.textContent = lastValidEditor;
    updateCapacity();
    fitDraftTypography();
    const selection = window.getSelection();
    selection.selectAllChildren(elements.editor);
    selection.collapseToEnd();
    return;
  }
  lastValidEditor = text;
  updateCapacity();
}

async function ensureReadySigner() {
  if (await signerReady().catch(() => false)) return true;
  showDialog(elements.login);
  throw new Error('Reconnect your signer before continuing.');
}

/**
 * No subscription: buy one and then finish what was being done, so paying and
 * posting are one flow. `notePending` is the action's own state and waits in
 * localStorage while the subscription is paid for, which is also what makes the
 * flow survive a reload mid-payment.
 */
async function buySubscriptionThen(session, notePending, statusElement) {
  const member = Boolean(actionInfo.member);
  const order = await api('/orders', {
    method: 'POST',
    body: JSON.stringify({pubkey: session.pubkey, action: 'subscribe', plan: subscribePlan}),
  });
  const sats = stickyOrderPrice(order, stickySubscriptionPrice(subscribePlan, {member}));
  savePending({...notePending, subscribeOrderId: order.id, subscribePlan, subscribeSats: sats, status: 'waiting_subscription'});
  showPaymentPreparing(sats);
  const railReady = await renderPayment(order);
  if (!railReady && order.checkoutLink) location.assign(order.checkoutLink);
  if (statusElement) status(statusElement, `Subscribe for ${sats} sats — the rest continues by itself.`);
  status(elements.paymentStatus, `Waiting for the ${sats}-sat subscription payment...`);
  pollPayment();
}

async function startPayment() {
  try {
    status(elements.paymentStatus, '');
    const session = getNostrSession();
    if (!session) { showDialog(elements.login); return; }
    if (composingPubkey && composingPubkey !== session.pubkey) throw new Error('Your active Nostr identity changed. Reopen the note and try again.');
    // The cells the note was written on: in memory while the composer is open, or
    // read back from the saved note when the page has reloaded since — a
    // subscription paid from a wallet app reloads the page under the reader's feet,
    // and refusing then would strand a note they have already paid for.
    const composed = composingGeohashes.length
      ? composingGeohashes
      : (pending?.action === 'pin' && Array.isArray(pending.geohashes) ? pending.geohashes : []);
    if (!activeGeohash || composed.join(',') !== activeGeohashes.join(',')) {
      throw new Error('Choose the geohash corkboard again, then reopen the note.');
    }
    await ensureReadySigner();
    const mentions = editorMentions();
    const content = normaliseStickyText(editorContent());
    if (!content) throw new Error('Write something on the note first.');
    if (editorOverflows()) throw new Error('The note is too full.');
    elements.pay.disabled = true;
    status(elements.paymentStatus, quotedPrice === 0 ? 'Checking your subscription...' : 'Preparing invoice...');
    if (quotedPrice > 0) showPaymentPreparing(quotedPrice);
    const contentHash = await stickyContentHash(content, selectedColor, selectedFont);
    const exactGeohash = elements.exactGeohash.checked;
    const liveliness = livelinessRung().key;
    const notePending = {action: 'pin', content, color: selectedColor, font: selectedFont, liveliness, mentions,
      geohash: activeGeohash, geohashes: [...activeGeohashes], exactGeohash, contentHash,
      anonymous: session.method === 'anonymous'};
    let order;
    try {
      order = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({pubkey: session.pubkey, action: 'pin', contentHash,
          geohash: activeGeohash, geohashes: [...activeGeohashes],
          geohashMode: exactGeohash ? 'exact' : 'prefix', ...(session.method === 'anonymous' ? {anonymous: true} : {})}),
      });
    } catch (error) {
      // 402 is the desk saying "this key is registered but has no subscription".
      // Buy one now and come back to this note; anything else is a real failure.
      if (error.status !== 402) throw error;
      await buySubscriptionThen(session, notePending, elements.paymentStatus);
      return;
    }
    const sats = stickyOrderPrice(order, session.method === 'anonymous' ? STICKY_ANONYMOUS_PRICE_SATS : STICKY_SUB_WEEK_SATS);
    if (session.method === 'anonymous' && sats !== STICKY_ANONYMOUS_PRICE_SATS) throw new Error('Anonymous posting is not ready on the payment service yet. No note was published.');
    if (sats === 0) {
      // Covered by the subscription the desk just confirmed: nothing to pay, and
      // the publish token is already there, so the note goes straight to placing.
      if (!order.paid || !order.publishToken) throw new Error('The subscription on the payment service did not cover this note. No note was published.');
      if (elements.paymentDialog.open) elements.paymentDialog.close();
      savePending({...notePending, orderId: order.id, sats, status: 'paid', publishToken: order.publishToken});
      if (elements.composer.open) elements.composer.close();
      status(elements.boardStatus, 'Included in your subscription. Place the note on the board.');
      elements.boardStatus.hidden = false;
      beginPlacement();
      return;
    }
    savePending({...notePending, orderId: order.id, sats, status: 'waiting'});
    if (!elements.paymentDialog.open) showPaymentPreparing(sats);
    const railReady = await renderPayment(order);
    if (!railReady && order.checkoutLink) location.assign(order.checkoutLink);
    else if (!railReady) status(elements.paymentStatus, 'Preparing invoice...');
    status(elements.paymentStatus, `Waiting for the ${sats}-sat payment...`);
    pollPayment();
  } catch (error) {
    if (elements.paymentDialog.open && !pending?.orderId) elements.paymentDialog.close();
    status(elements.paymentStatus, error.message, true);
    elements.pay.disabled = false;
  }
}

async function pollPayment() {
  clearTimeout(paymentTimer);
  // A subscription bought on the way to a note or a removal: when it lands, run
  // the original action again — it is covered now, so it settles on creation.
  if (pending?.subscribeOrderId) {
    try {
      const order = await api(`/orders/${encodeURIComponent(pending.subscribeOrderId)}`);
      await renderPayment(order);
      if (!order.paid) {
        paymentTimer = setTimeout(pollPayment, 2500);
        return;
      }
      await refreshSubscription();
      if (elements.paymentDialog.open) elements.paymentDialog.close();
      const {subscribeOrderId, subscribePlan: plan, subscribeSats, status: _s, ...rest} = pending;
      savePending(rest);
      // The page may have reloaded while the subscription was being paid: a wallet
      // app is another app and a phone reclaims the tab while the reader is in it.
      // The note remembers the board it was written on, so put that board back
      // before finishing. Without this a fresh page has composingGeohashes empty,
      // startPayment() refuses a note the reader has already paid for, and the
      // message is lost with the dialog that closed behind it.
      if (rest.action === 'pin' && Array.isArray(rest.geohashes) && rest.geohashes.length) {
        composingGeohashes = [...rest.geohashes];
        if (rest.geohashes.join(',') !== activeGeohashes.join(',')) selectBoard(rest.geohashes.join(','));
      }
      const sats = stickyOrderPrice(rest, 0);
      status(elements.boardStatus, `Subscription active${plan ? ` (${plan})` : ''}. Finishing what you started...`);
      elements.boardStatus.hidden = false;
      if (rest.action === 'remove') await startRemovalPayment();
      else await startPayment();
      return;
    } catch (error) {
      status(elements.paymentStatus, error.message, true);
      paymentTimer = setTimeout(pollPayment, 2500);
      return;
    }
  }
  if (!pending?.orderId) return;
  try {
    const order = await api(`/orders/${encodeURIComponent(pending.orderId)}`);
    if (pending.action === 'pin' && pending.sats > 0) await renderPayment(order);
    if (order.paid && order.publishToken) {
      if (elements.paymentDialog.open) elements.paymentDialog.close();
      savePending({...pending, status: 'paid', publishToken: order.publishToken});
      if (pending.action === 'remove') await publishRemoval();
      else {
        if (elements.composer.open) elements.composer.close();
        beginPlacement();
      }
      return;
    }
    if (['expired', 'invalid', 'cancelled'].includes(String(order.status || '').toLowerCase())) throw new Error('The invoice expired. Start again when you are ready.');
    const invoicePending = String(order.status || '').toLowerCase() === 'awaiting_invoice' || !order.payment;
    status(pending.action === 'remove' ? elements.noteMenuStatus : elements.paymentStatus,
      invoicePending ? 'Preparing invoice...' : 'Waiting for payment...');
    if (invoicePending) elements.paymentHint.textContent = 'Preparing invoice...';
    paymentTimer = setTimeout(pollPayment, 3000);
  } catch (error) {
    status(pending?.action === 'remove' ? elements.noteMenuStatus : elements.paymentStatus, error.message, true);
    elements.pay.disabled = false;
  }
}

function beginPlacement() {
  if (pending?.action !== 'pin' || !pending?.content || pending.status !== 'paid') return;
  placingNote?.remove();
  const board = elements.board.getBoundingClientRect();
  const placement = pending.placement || {
    x: clampPlacement(((board.width / 2) - boardView.x) / (boardSize.width * boardView.scale)),
    y: clampPlacement(((board.height / 2) - boardView.y) / (boardSize.height * boardView.scale)),
    rotation: 0,
  };
  savePending({...pending, placement});
  placingNote = renderNote({...pending, ...placement}, null, true);
  elements.placementControls.hidden = false;
  elements.discardBin.hidden = false;
  setBinArmed(false);
  elements.pin.disabled = false;
  elements.pin.querySelector('span').textContent = 'Pin note';
  installPlacementGestures(placingNote);
  placingNote.focus();
}

function currentPlacement() {
  return pending?.placement || {x: .5, y: .5, rotation: 0};
}

function setPlacement(next) {
  const placement = {
    x: clampPlacement(next.x), y: clampPlacement(next.y), rotation: clampRotation(next.rotation),
  };
  savePending({...pending, placement});
  noteAtPlacement(placingNote, placement);
}

function installPlacementGestures(note) {
  const pointers = new Map();
  let gesture = null;
  // Where the note sat before this drag, so a declined discard can put it back.
  let dragOrigin = null;

  const point = event => ({x: event.clientX, y: event.clientY});
  const angleBetween = () => {
    const [first, second] = [...pointers.values()];
    return Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;
  };
  const resetSinglePointer = () => {
    const [remaining] = pointers.entries();
    if (!remaining) { gesture = null; return; }
    gesture = {id: remaining[0], startX: remaining[1].x, startY: remaining[1].y, placement: {...currentPlacement()}, rotate: false};
  };

  note.addEventListener('pointerdown', event => {
    event.preventDefault();
    note.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 1) {
      gesture = {id: event.pointerId, startX: event.clientX, startY: event.clientY, placement: {...currentPlacement()}, rotate: event.shiftKey};
      dragOrigin = {...gesture.placement};
    } else if (pointers.size === 2) {
      gesture = {angle: angleBetween(), placement: {...currentPlacement()}, twoFinger: true};
      dragOrigin = null;
    }
  });
  note.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2 && gesture.twoFinger) {
      let difference = angleBetween() - gesture.angle;
      if (difference > 180) difference -= 360;
      if (difference < -180) difference += 360;
      setPlacement({...gesture.placement, rotation: gesture.placement.rotation + difference});
      setBinArmed(false);
      return;
    }
    if (gesture.id !== event.pointerId) return;
    if (gesture.rotate || event.shiftKey) {
      setPlacement({...gesture.placement, rotation: gesture.placement.rotation + (event.clientX - gesture.startX) / 10});
      setBinArmed(false);
    } else {
      setPlacement({...gesture.placement,
        x: gesture.placement.x + (event.clientX - gesture.startX) / (boardSize.width * boardView.scale),
        y: gesture.placement.y + (event.clientY - gesture.startY) / (boardSize.height * boardView.scale)});
      setBinArmed(isOverBin(event.clientX, event.clientY));
    }
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) resetSinglePointer();
    else if (!pointers.size) gesture = null;
  };
  note.addEventListener('pointerup', event => {
    const dropped = Boolean(dragOrigin) && Boolean(gesture) && !gesture.twoFinger && !gesture.rotate
      && gesture.id === event.pointerId && isOverBin(event.clientX, event.clientY);
    const origin = dragOrigin;
    dragOrigin = null;
    release(event);
    setBinArmed(false);
    if (dropped) openDiscardDialog(origin);
  });
  note.addEventListener('pointercancel', event => { dragOrigin = null; setBinArmed(false); release(event); });
  note.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const placement = currentPlacement();
    if (event.shiftKey) {
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      setPlacement({...placement, rotation: placement.rotation + direction});
    } else {
      setPlacement({...placement,
        x: placement.x + (event.key === 'ArrowLeft' ? -.01 : event.key === 'ArrowRight' ? .01 : 0),
        y: placement.y + (event.key === 'ArrowUp' ? -.01 : event.key === 'ArrowDown' ? .01 : 0)});
    }
  });
}

function isOverBin(clientX, clientY) {
  if (elements.discardBin.hidden) return false;
  const rect = elements.discardBin.getBoundingClientRect();
  const slack = 10;
  return clientX >= rect.left - slack && clientX <= rect.right + slack
    && clientY >= rect.top - slack && clientY <= rect.bottom + slack;
}

function setBinArmed(armed) {
  const on = Boolean(armed);
  elements.discardBin.classList.toggle('is-armed', on);
  placingNote?.classList.toggle('sticky-note--doomed', on);
}

function openDiscardDialog(restore = null) {
  discardRestore = restore ? {...restore} : {...currentPlacement()};
  elements.discardWarning.hidden = pending?.status !== 'paid';
  if (!elements.discardDialog.open) elements.discardDialog.showModal();
  requestAnimationFrame(() => elements.discardCancel.focus());
}

function keepDiscardedNote() {
  const restore = discardRestore;
  discardRestore = null;
  if (elements.discardDialog.open) elements.discardDialog.close();
  setBinArmed(false);
  if (restore) setPlacement(restore);
  status(elements.boardStatus, 'Note kept. Pin it when you are ready.');
  elements.boardStatus.hidden = false;
  setTimeout(() => { elements.boardStatus.hidden = true; }, 3000);
}

function discardPendingNote() {
  const wasPaid = pending?.status === 'paid';
  discardRestore = null;
  setBinArmed(false);
  placingNote?.remove();
  placingNote = null;
  elements.placementControls.hidden = true;
  elements.discardBin.hidden = true;
  elements.pin.disabled = false;
  elements.pin.querySelector('span').textContent = 'Pin note';
  // The note was never published, so there is nothing to sign or to undo on the relay;
  // the order and any payment stay as they are on the payment service.
  savePending(null);
  if (elements.discardDialog.open) elements.discardDialog.close();
  elements.editor.textContent = '';
  lastValidEditor = '';
  elements.pay.disabled = false;
  updateCapacity();
  status(elements.boardStatus, wasPaid
    ? 'Note discarded. It was never pinned, and the sats you paid are not refunded.'
    : 'Note discarded.');
  elements.boardStatus.hidden = false;
  setTimeout(() => { elements.boardStatus.hidden = true; }, 4500);
}

async function publishPinnedNote(resumedEvent = null) {
  let published = false;
  try {
    elements.pin.disabled = true;
    if (!resumedEvent) await ensureReadySigner();
    const placement = currentPlacement();
    const template = makeStickyTemplate({...pending, ...placement, liveliness: pending.liveliness || STICKY_DEFAULT_LIVELINESS, anonymous: Boolean(pending.anonymous)});
    const event = resumedEvent || await signNostrEvent(template, {orderId: pending.orderId, action: 'pin'});
    if (!event) return;
    if (!window.NostrTools.verifyEvent(event)) throw new Error('Your signer returned an invalid event.');
    const result = await api(`/orders/${encodeURIComponent(pending.orderId)}/publish`, {
      method: 'POST', headers: {authorization: `Bearer ${pending.publishToken}`}, body: JSON.stringify({event}),
    });
    const sticky = parseStickyEvent(event);
    placingNote?.remove(); placingNote = null;
    if (sticky) renderNote(sticky, event);
    elements.placementControls.hidden = true;
    setBinArmed(false);
    elements.discardBin.hidden = true;
    savePending(null);
    elements.editor.textContent = '';
    lastValidEditor = '';
    elements.pay.disabled = false;
    published = true;
    elements.pin.querySelector('span').textContent = 'Pinned';
    status(elements.boardStatus, result.message || 'Your note is pinned.');
    elements.boardStatus.hidden = false;
    setTimeout(() => { elements.boardStatus.hidden = true; }, 3500);
  } catch (error) {
    status(elements.boardStatus, error.message, true);
    elements.boardStatus.hidden = false;
  } finally {
    elements.pin.disabled = published;
  }
}

function closeNoteMenu() {
  elements.noteMenu.hidden = true;
  selectedNoteId = '';
  status(elements.noteMenuStatus, '');
}

function openNoteMenu(eventId, pin) {
  const record = noteEvents.get(eventId);
  if (!record) return;
  selectedNoteId = eventId;
  elements.noteEventId.textContent = eventId;
  elements.notePostedAt.dateTime = new Date(record.event.created_at * 1000).toISOString();
  elements.notePostedAt.textContent = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(record.event.created_at * 1000);
  // The note's own NIP-40 moment: older notes carry none and show no row.
  const expiresTag = Number(record.event.tags?.find(tag => tag?.[0] === 'expiration')?.[1]);
  const expiresAt = Number.isFinite(expiresTag) && expiresTag > 0 ? expiresTag * 1000 : 0;
  elements.noteExpiresLabel.hidden = !expiresAt;
  elements.noteExpiresAt.hidden = !expiresAt;
  if (expiresAt) {
    elements.noteExpiresAt.dateTime = new Date(expiresAt).toISOString();
    elements.noteExpiresAt.textContent = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(expiresAt);
  }
  elements.removeSticky.hidden = getNostrSession()?.pubkey !== record.event.pubkey;
  elements.noteMenu.hidden = false;
  const pinRect = pin.getBoundingClientRect();
  const menuRect = elements.noteMenu.getBoundingClientRect();
  elements.noteMenu.style.left = `${Math.min(innerWidth - menuRect.width - 12, Math.max(12, pinRect.left - menuRect.width / 2))}px`;
  elements.noteMenu.style.top = `${Math.min(innerHeight - menuRect.height - 12, Math.max(12, pinRect.bottom + 8))}px`;
}

async function copySelectedNoteId() {
  if (!selectedNoteId) return;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(selectedNoteId);
    else {
      const field = document.createElement('textarea');
      field.value = selectedNoteId;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed');
      field.remove();
    }
    elements.copyNoteId.querySelector('span').textContent = 'ID copied';
    setTimeout(() => { elements.copyNoteId.querySelector('span').textContent = 'Copy ID'; }, 1800);
  } catch {
    status(elements.noteMenuStatus, 'Could not copy the event ID.', true);
  }
}

async function startRemovalPayment() {
  try {
    const record = noteEvents.get(selectedNoteId);
    const session = getNostrSession();
    if (!record || !session || record.event.pubkey !== session.pubkey) throw new Error('Only the note author can remove it.');
    await ensureReadySigner();
    elements.removeSticky.disabled = true;
    status(elements.noteMenuStatus, actionInfo.active ? 'Removing the note...' : 'Preparing invoice...');
    if (quotedPrice > 0) showPaymentPreparing(quotedPrice);
    const notePending = {action: 'remove', targetEventId: selectedNoteId};
    let order;
    try {
      order = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({pubkey: session.pubkey, action: 'remove', targetEventId: selectedNoteId}),
      });
    } catch (error) {
      if (error.status !== 402) throw error;
      await buySubscriptionThen(session, notePending, elements.noteMenuStatus);
      return;
    }
    const sats = stickyOrderPrice(order);
    if (sats === 0) {
      if (!order.paid || !order.publishToken) throw new Error('The subscription on the payment service did not cover this removal. The note was not removed.');
      if (elements.paymentDialog.open) elements.paymentDialog.close();
      savePending({orderId: order.id, action: 'remove', targetEventId: selectedNoteId, sats, status: 'paid', publishToken: order.publishToken});
      await publishRemoval();
      return;
    }
    savePending({orderId: order.id, action: 'remove', targetEventId: selectedNoteId, sats, status: 'waiting'});
    if (!elements.paymentDialog.open) showPaymentPreparing(sats);
    const railReady = await renderPayment(order);
    if (!railReady && order.checkoutLink) location.assign(order.checkoutLink);
    status(elements.noteMenuStatus, `Waiting for the ${sats}-sat payment...`);
    pollPayment();
  } catch (error) {
    if (elements.paymentDialog.open && !pending?.orderId) elements.paymentDialog.close();
    status(elements.noteMenuStatus, error.message, true);
    elements.removeSticky.disabled = false;
  }
}

async function publishRemoval(resumedEvent = null) {
  try {
    if (!resumedEvent) await ensureReadySigner();
    const template = makeDeletionTemplate({eventId: pending.targetEventId});
    const event = resumedEvent || await signNostrEvent(template, {orderId: pending.orderId, action: 'remove'});
    if (!event) return;
    if (!window.NostrTools.verifyEvent(event)) throw new Error('Your signer returned an invalid deletion event.');
    const result = await api(`/orders/${encodeURIComponent(pending.orderId)}/publish`, {
      method: 'POST', headers: {authorization: `Bearer ${pending.publishToken}`}, body: JSON.stringify({event}),
    });
    processDeletion(event);
    savePending(null);
    closeNoteMenu();
    status(elements.boardStatus, result.message || 'Your note was removed.');
    elements.boardStatus.hidden = false;
    setTimeout(() => { elements.boardStatus.hidden = true; }, 3500);
  } catch (error) {
    const target = elements.noteMenu.hidden ? elements.boardStatus : elements.noteMenuStatus;
    status(target, error.message, true);
    if (target === elements.boardStatus) elements.boardStatus.hidden = false;
  } finally {
    elements.removeSticky.disabled = false;
  }
}

function installBoardNavigation() {
  const pointers = new Map();
  let gesture = null;

  const point = event => ({x: event.clientX, y: event.clientY});
  const distance = () => {
    const [first, second] = [...pointers.values()];
    return Math.hypot(second.x - first.x, second.y - first.y);
  };
  const midpoint = () => {
    const [first, second] = [...pointers.values()];
    return {x: (first.x + second.x) / 2, y: (first.y + second.y) / 2};
  };
  const beginPinch = () => {
    const center = midpoint();
    const rect = elements.board.getBoundingClientRect();
    const localX = center.x - rect.left;
    const localY = center.y - rect.top;
    gesture = {
      pinch: true,
      distance: Math.max(1, distance()),
      scale: boardView.scale,
      worldX: (localX - boardView.x) / boardView.scale,
      worldY: (localY - boardView.y) / boardView.scale,
    };
  };
  const resetPan = () => {
    const [remaining] = pointers.entries();
    if (!remaining) { gesture = null; return; }
    gesture = {id: remaining[0], x: remaining[1].x, y: remaining[1].y, boardX: boardView.x, boardY: boardView.y};
  };

  elements.board.addEventListener('pointerdown', event => {
    if (event.target.closest('.sticky-note')) return;
    closeNoteMenu();
    elements.board.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    elements.board.classList.add('is-panning');
    if (pointers.size === 1) resetPan();
    else if (pointers.size === 2) beginPinch();
  });
  elements.board.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2 && gesture.pinch) {
      const center = midpoint();
      const rect = elements.board.getBoundingClientRect();
      boardView.scale = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, gesture.scale * distance() / gesture.distance));
      boardView.x = center.x - rect.left - gesture.worldX * boardView.scale;
      boardView.y = center.y - rect.top - gesture.worldY * boardView.scale;
    } else if (gesture.id === event.pointerId) {
      boardView.x = gesture.boardX + event.clientX - gesture.x;
      boardView.y = gesture.boardY + event.clientY - gesture.y;
    }
    applyBoardTransform();
    // At an edge the board stops while the finger keeps going. Re-anchor every frame so
    // dragging back responds at once, instead of first retracing travel that was refused.
    if (!gesture.pinch && gesture.id === event.pointerId) {
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      gesture.boardX = boardView.x;
      gesture.boardY = boardView.y;
    }
  });
  const stop = event => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) resetPan();
    else if (!pointers.size) {
      gesture = null;
      elements.board.classList.remove('is-panning');
    }
  };
  elements.board.addEventListener('pointerup', stop);
  elements.board.addEventListener('pointercancel', stop);
  elements.board.addEventListener('wheel', event => {
    event.preventDefault();
    setZoom(boardView.scale * (event.deltaY < 0 ? 1.12 : .89), event.clientX, event.clientY);
  }, {passive: false});
}

async function handleLogin(method) {
  try {
    status(elements.loginStatus, 'Connecting...');
    if (method === 'extension') await loginWithExtension();
    else if (method === 'amber') { beginAmberLogin(); return; }
    else if (method === 'bunker') await loginWithBunker(elements.bunker.value);
    else if (method === 'anonymous') loginAnonymously();
    else if (method === 'private') {
      loginWithPrivateKey(elements.privateKey.value);
      elements.privateKey.value = '';
    }
    updateAccount();
    elements.login.close();
    if (pending?.status === 'paid') {
      if (pending.action === 'remove') await publishRemoval();
      else beginPlacement();
    } else {
      openComposer();
    }
  } catch (error) { status(elements.loginStatus, error.message, true); }
}

function openComposer() {
  if (!activeGeohash) {
    status(elements.boardChooserStatus, 'Choose a geohash before writing a note.');
    showDialog(elements.boardDialog);
    requestAnimationFrame(() => elements.boardGeohash.focus());
    return;
  }
  const session = getNostrSession();
  if (!session) { showDialog(elements.login); return; }
  composingPubkey = session.pubkey;
  composingGeohashes = [...activeGeohashes];
  if (!pending?.orderId) elements.exactGeohash.checked = false;
  selectLiveliness(pending?.liveliness || selectedLiveliness);
  elements.pay.disabled = false;
  closeMentionMenu();
  loadMentionDirectory();
  showDialog(elements.composer);
  requestAnimationFrame(() => elements.editor.focus());
}

// ---------------------------------------------------------------- mentions
// Tagging is open to anyone with a NIP-05 identity, on any domain, so the board
// cannot hold the list of names. It looks them up instead: the satoshi.si names
// it is served from, the profile of a key that is pasted, and the NIP-05 endpoint
// of whatever domain a name belongs to. Only a key that answers with a name can
// be tagged — that is why an anonymous throwaway identity has nothing to offer
// here, and why the person button is dead for one.
let mentionFilterOn = false;
let mentionMenuOptions = [];
let mentionMenuIndex = -1;
let mentionDirectoryLoaded = false;
let mentionProfilesTimer = null;
const mentionDirectory = new Map();   // "name@domain", lowercase -> hex
const mentionLabels = new Map();      // hex -> the name to draw
const mentionProfiles = new Map();    // hex -> {name, displayName, nip05}
const mentionProfileQueue = new Set();

function ownDomain() {
  try { return window.location.hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function rememberMention(identifier, pubkey) {
  const key = String(pubkey || '').toLowerCase();
  const name = String(identifier || '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key) || !name) return;
  mentionDirectory.set(name, key);
  mentionDirectory.set(name.replace(/@[^@]*$/, ''), key);   // "alice" as well as "alice@domain"
  if (!mentionLabels.has(key)) mentionLabels.set(key, name);
}

/** The names the board is served from: satoshi.si's own NIP-05 store. */
async function loadMentionDirectory() {
  if (mentionDirectoryLoaded) return;
  mentionDirectoryLoaded = true;
  try {
    const response = await fetch('/.well-known/nostr.json', {headers: {accept: 'application/json'}});
    if (!response.ok) return;
    const body = await response.json();
    Object.entries(body?.names || {}).forEach(([name, pubkey]) => rememberMention(`${name}@${ownDomain()}`, pubkey));
  } catch {}
}

/** "name" or "name@domain" -> pubkey, by asking that domain, as NIP-05 says. */
async function resolveMentionName(value) {
  const identifier = String(value || '').trim().replace(/^@/, '').toLowerCase();
  if (!identifier) return null;
  const at = identifier.lastIndexOf('@');
  const name = at === -1 ? identifier : identifier.slice(0, at);
  const domain = at === -1 ? ownDomain() : identifier.slice(at + 1);
  if (!name || !domain) return null;
  const cached = mentionDirectory.get(`${name}@${domain}`);
  if (cached) return cached;
  try {
    const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
      {headers: {accept: 'application/json'}});
    if (!response.ok) return null;
    const body = await response.json();
    const pubkey = String(body?.names?.[name] || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(pubkey)) return null;
    rememberMention(`${name}@${domain}`, pubkey);
    return pubkey;
  } catch { return null; }
}

function profileFields(event) {
  try {
    const source = JSON.parse(event?.content || '{}');
    const identity = String(source.nip05 || '').trim().replace(/^https?:\/\//, '').replace(/^_@/, '');
    return {
      name: String(source.name || '').trim().slice(0, 80),
      displayName: String(source.display_name || source.displayName || '').trim().slice(0, 80),
      nip05: identity.includes('@') ? identity.slice(0, 180) : '',
    };
  } catch { return {name: '', displayName: '', nip05: ''}; }
}

/** One profile, now, because a pasted key cannot be tagged on trust. */
async function fetchMentionProfile(pubkey) {
  const key = String(pubkey || '').toLowerCase();
  if (mentionProfiles.has(key)) return mentionProfiles.get(key);
  try {
    const profiles = await readAuthorProfilesFromRelay(RELAY, [key]);
    const profile = profileFields(profiles.get(key));
    mentionProfiles.set(key, profile);
    if (profile.nip05) rememberMention(profile.nip05, key);
    return profile;
  } catch { return null; }
}

function requestMentionProfile(pubkey) {
  const key = String(pubkey || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key) || mentionProfiles.has(key)) return;
  mentionProfileQueue.add(key);
  if (mentionProfilesTimer) return;
  mentionProfilesTimer = setTimeout(flushMentionProfiles, 150);
}

async function flushMentionProfiles() {
  mentionProfilesTimer = null;
  const pubkeys = [...mentionProfileQueue];
  mentionProfileQueue.clear();
  if (!pubkeys.length) return;
  try {
    const results = await Promise.allSettled([
      readAuthorProfilesFromRelay(RELAY, pubkeys),
      readAuthorProfilesFromRelay('wss://relay.damus.io', pubkeys),
      readAuthorProfilesFromRelay('wss://nos.lol', pubkeys),
    ]);
    const newest = new Map();
    results.filter(result => result.status === 'fulfilled').forEach(result => {
      result.value.forEach((event, pubkey) => {
        if (!newest.has(pubkey) || event.created_at > newest.get(pubkey).created_at) newest.set(pubkey, event);
      });
    });
    pubkeys.forEach(pubkey => {
      const profile = profileFields(newest.get(pubkey));
      mentionProfiles.set(pubkey, profile);
      if (profile.nip05) rememberMention(profile.nip05, pubkey);
      updateMentionElements(pubkey, mentionLabelFor(pubkey, npubOf(pubkey)));
    });
  } catch {}
}

function npubOf(pubkey) {
  try { return window.NostrTools.nip19.npubEncode(String(pubkey || '').toLowerCase()); } catch { return ''; }
}

function pubkeyOfNpub(npub) {
  try {
    const decoded = window.NostrTools.nip19.decode(String(npub || ''));
    return decoded?.type === 'npub' ? String(decoded.data).toLowerCase() : '';
  } catch { return ''; }
}

/** The name to draw for a tagged person: their profile, then their NIP-05, then the npub. */
function mentionLabelFor(pubkey, npub) {
  const key = String(pubkey || '').toLowerCase();
  const profile = mentionProfiles.get(key);
  const stored = mentionLabels.get(key) || '';
  const label = mentionLabel([profile?.name, profile?.displayName, profile?.nip05, stored], npub);
  return label.startsWith('@') ? label : `@${label}`;
}

function updateMentionElements(pubkey, label) {
  const key = String(pubkey || '').toLowerCase();
  elements.canvas.querySelectorAll('.sticky-note__mention').forEach(chip => {
    if (chip.dataset.mentionPubkey !== key) return;
    chip.textContent = label;
    chip.title = label;
  });
}

function renderNoteContent(container, content) {
  stickyTextParts(content).forEach(part => {
    if (part.type !== 'mention') { container.appendChild(document.createTextNode(part.text)); return; }
    const pubkey = pubkeyOfNpub(part.npub);
    const chip = document.createElement('span');
    chip.className = 'sticky-note__mention';
    chip.dataset.mentionNpub = part.npub;
    if (pubkey) chip.dataset.mentionPubkey = pubkey;
    chip.textContent = mentionLabelFor(pubkey, part.npub);
    chip.title = part.npub;
    container.appendChild(chip);
    if (pubkey && !mentionProfiles.has(pubkey)) requestMentionProfile(pubkey);
  });
}

// ---- the composer: "@" offers the people this writer may tag
function caretMentionQuery() {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed || !elements.editor.contains(range.startContainer)) return null;
  const node = range.startContainer;
  if (!node || node.nodeType !== 3) return null;
  const before = node.textContent.slice(0, range.startOffset);
  const match = before.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  return {query: match[1], length: match[1].length + 1};
}

function setMentionStatus(message) {
  elements.mentionMenuStatus.textContent = message || '';
}

function closeMentionMenu() {
  mentionMenuOptions = [];
  mentionMenuIndex = -1;
  elements.mentionMenu.hidden = true;
  elements.mentionOptions.replaceChildren();
  setMentionStatus('');
}

function mentionEntry(pubkey, label) {
  const key = String(pubkey || '').toLowerCase();
  return {kind: 'entry', pubkey: key, npub: npubOf(key), label: mentionLabelFor(key, npubOf(key)),
    name: mentionLabels.get(key) || mentionProfiles.get(key)?.nip05 || ''};
}

function suggestionsFor(query) {
  const needle = String(query || '').toLowerCase();
  const entries = [...mentionDirectory.entries()]
    .filter(([identifier]) => !needle || identifier.startsWith(needle) || identifier.includes(`@${needle}`))
    .map(([, pubkey]) => mentionEntry(pubkey));
  const seen = new Set();
  return entries.filter(entry => entry.pubkey && !seen.has(entry.pubkey) && seen.add(entry.pubkey)).slice(0, 8);
}

function renderMentionMenu(query, entries, {pending = false} = {}) {
  elements.mentionOptions.replaceChildren();
  mentionMenuOptions = entries.map(entry => ({kind: 'entry', entry}));
  const identifier = String(query || '').trim();
  if (identifier && !entries.length) {
    mentionMenuOptions.push({kind: 'lookup', value: identifier});
  }
  mentionMenuIndex = mentionMenuOptions.length ? 0 : -1;
  mentionMenuOptions.forEach((option, index) => {
    const item = document.createElement('li');
    item.className = 'mention-menu__option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(index === mentionMenuIndex));
    const name = document.createElement('span');
    name.className = 'mention-menu__name';
    const short = document.createElement('span');
    short.className = 'mention-menu__npub';
    if (option.kind === 'lookup') {
      name.textContent = `Tag @${identifier}`;
      short.textContent = 'look this name up';
    } else {
      name.textContent = option.entry.label;
      short.textContent = option.entry.name || `${option.entry.npub.slice(0, 12)}…`;
    }
    item.append(name, short);
    item.addEventListener('mousedown', event => event.preventDefault());
    item.addEventListener('click', () => { mentionMenuIndex = index; pickMention(); });
    elements.mentionOptions.appendChild(item);
  });
  elements.mentionMenu.hidden = !mentionMenuOptions.length;
  if (pending) setMentionStatus('Looking this name up…');
}

function updateMentionMenu() {
  const session = getNostrSession();
  const caret = caretMentionQuery();
  if (!caret || !mentionFilterAvailability(session).available) { closeMentionMenu(); return; }
  if (!mentionDirectoryLoaded) loadMentionDirectory().then(() => {
    if (caretMentionQuery()) updateMentionMenu();
  });
  renderMentionMenu(caret.query, suggestionsFor(caret.query));
}

function editorContent(editor = elements.editor) {
  let out = '';
  editor.childNodes.forEach(node => {
    if (node.nodeType === 3) { out += node.textContent; return; }
    if (node.nodeType !== 1) return;
    // A mention becomes the thing it stands for: the npub, as NIP-27 writes it.
    if (node.dataset?.pubkey && node.dataset?.npub) out += `nostr:${node.dataset.npub}`;
    else out += node.textContent;
  });
  return out;
}

function editorMentions(editor = elements.editor) {
  const keys = [];
  editor.querySelectorAll('.sticky-editor__mention').forEach(chip => {
    const pubkey = String(chip.dataset.pubkey || '').toLowerCase();
    if (/^[0-9a-f]{64}$/.test(pubkey) && !keys.includes(pubkey)) keys.push(pubkey);
  });
  return keys;
}

function insertMention(entry, query) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (!node || node.nodeType !== 3) return;
  const text = node.textContent;
  const cut = Math.max(0, range.startOffset - (query.length + 1));
  node.textContent = `${text.slice(0, cut)}${text.slice(range.startOffset)}`;
  const chip = document.createElement('span');
  chip.className = 'sticky-editor__mention';
  chip.contentEditable = 'false';
  chip.dataset.pubkey = entry.pubkey;
  chip.dataset.npub = entry.npub;
  chip.textContent = entry.label;
  const space = document.createTextNode(' ');
  const parent = node.parentNode;
  parent.insertBefore(chip, node.nextSibling);
  parent.insertBefore(space, chip.nextSibling);
  const after = document.createRange();
  after.setStart(space, 1);
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
  closeMentionMenu();
  handleEditorInput();
  fitDraftTypography();
}

async function resolveMentionQuery(query) {
  const value = String(query || '').trim().replace(/^@/, '');
  if (!value) return null;
  if (/^npub1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/i.test(value)) {
    // A pasted key is taggable only when it answers with a NIP-05 name.
    const pubkey = pubkeyOfNpub(value);
    if (!pubkey) return null;
    const profile = await fetchMentionProfile(pubkey);
    const identifier = profile?.nip05 || mentionLabels.get(pubkey) || '';
    if (!identifier) return null;
    rememberMention(identifier, pubkey);
    return pubkey;
  }
  return resolveMentionName(value);
}

async function pickMention() {
  const caret = caretMentionQuery();
  if (!caret) { closeMentionMenu(); return; }
  const option = mentionMenuOptions[mentionMenuIndex];
  if (option?.kind === 'entry') { insertMention(option.entry, caret.query); return; }
  const value = option?.value ?? caret.query;
  if (!value) { closeMentionMenu(); return; }
  const index = mentionMenuIndex;
  setMentionStatus('Looking this name up…');
  const pubkey = await resolveMentionQuery(value);
  if (!pubkey) {
    mentionMenuIndex = index;
    setMentionStatus(`No NIP-05 name like “${value}” answered, so nothing was tagged.`);
    return;
  }
  insertMention(mentionEntry(pubkey), caret.query);
}

function handleMentionKeys(event) {
  if (elements.mentionMenu.hidden) return false;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!mentionMenuOptions.length) return true;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    mentionMenuIndex = (mentionMenuIndex + step + mentionMenuOptions.length) % mentionMenuOptions.length;
    [...elements.mentionOptions.children].forEach((item, index) => {
      item.setAttribute('aria-selected', String(index === mentionMenuIndex));
    });
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    pickMention();
    return true;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMentionMenu();
    return true;
  }
  return false;
}

// ---- the person button: only the notes that tag me
function applyMentionFilter() {
  const key = getNostrSession()?.pubkey || '';
  elements.canvas.querySelectorAll('.sticky-note:not(.sticky-note--placing)').forEach(note => {
    const sticky = noteEvents.get(note.dataset.eventId)?.sticky;
    const mine = mentionFilterOn && key ? noteMentions(sticky, key) : false;
    note.classList.toggle('sticky-note--filtered-out', Boolean(mentionFilterOn) && !mine);
  });
  elements.mentionFilterStatus.hidden = !mentionFilterOn;
  elements.mentionFilterStatus.textContent = mentionFilterOn ? 'Showing only the notes that tag you.' : '';
}

function refreshMentionFilter() {
  const {available, reason} = mentionFilterAvailability(getNostrSession());
  if (!available) mentionFilterOn = false;
  elements.mentionFilter.disabled = !available;
  elements.mentionFilter.setAttribute('aria-pressed', String(mentionFilterOn));
  elements.mentionFilter.title = reason;
  elements.mentionFilter.setAttribute('aria-label', reason);
  applyMentionFilter();
}

function toggleMentionFilter() {
  const {available, reason} = mentionFilterAvailability(getNostrSession());
  if (!available) { elements.mentionFilterStatus.hidden = false; elements.mentionFilterStatus.textContent = reason; return; }
  mentionFilterOn = !mentionFilterOn;
  elements.mentionFilter.setAttribute('aria-pressed', String(mentionFilterOn));
  applyMentionFilter();
}

elements.mentionFilter.addEventListener('click', toggleMentionFilter);
elements.editor.addEventListener('keydown', handleMentionKeys);
elements.editor.addEventListener('input', updateMentionMenu);
elements.editor.addEventListener('click', updateMentionMenu);
elements.account.addEventListener('click', () => getNostrSession() ? showDialog(elements.accountDialog) : showDialog(elements.login));
elements.newSticky.addEventListener('click', openComposer);
elements.openGeohashMap.addEventListener('click', () => {
  openGeohashMap().catch(error => {
    console.error('Could not open the geohash map:', error);
    sayMapTrouble('The map could not open — the geohash can still be typed by hand.');
  });
});
elements.closeGeohashMap.addEventListener('click', () => elements.geohashMapDialog.close());
elements.geohashMapDialog.addEventListener('close', () => {
  showDialog(elements.boardDialog);
  requestAnimationFrame(() => elements.boardGeohash.focus());
});
elements.useGeohashSelection.addEventListener('click', () => {
  if (!geohashMapCells.length) return;
  elements.boardGeohash.value = geohashMapCells.join(',');
  elements.geohashMapDialog.close();
});
elements.clearGeohashSelection.addEventListener('click', () => setMapCells([]));
elements.openBoard.addEventListener('click', () => {
  elements.boardGeohash.value = activeGeohashes.join(',');
  elements.boardDepth.value = String(boardDepth);
  elements.rememberBoard.checked = rememberBoard;
  status(elements.boardChooserStatus, '');
  showDialog(elements.boardDialog);
  requestAnimationFrame(() => elements.boardGeohash.focus());
});
elements.boardChooser.addEventListener('submit', event => {
  event.preventDefault();
  const value = elements.boardGeohash.value.trim().toLowerCase();
  const cells = geohashCellsFrom(value);
  if (!cells.length) {
    const issue = geohashIssueFrom(value);
    status(elements.boardChooserStatus,
      issue === 'Choose at least one cell.'
        ? 'Enter a geohash of 4 to 9 characters using 0-9 and b-h, j, k, m, n, p-z.'
        : issue, true);
    return;
  }
  selectBoard(cells);
});
elements.boardDepth.addEventListener('change', () => {
  boardDepth = Math.max(0, Math.min(11, Number.parseInt(elements.boardDepth.value, 10) || 0));
  localStorage.setItem(BOARD_DEPTH_KEY, String(boardDepth));
  updateBoardControl();
  if (activeGeohash) selectBoard([...activeGeohashes], false);
});
elements.rememberBoard.addEventListener('change', () => {
  rememberBoard = elements.rememberBoard.checked;
  localStorage.setItem(BOARD_REMEMBER_KEY, String(rememberBoard));
  if (rememberBoard) rememberActiveBoard();
  else forgetActiveBoard();
  updateBoardUrl();
  status(elements.boardChooserStatus, rememberBoard ? 'This board will open on your next visit.' : 'This board will not be remembered.');
});

// "Show notes around me": the browser's own position, turned into a geohash in the
// page. A geohash board is only as useful as the depth it is read at, so the reader
// picks how much ground to cover instead of being handed one guess. The coordinate
// is never sent anywhere: what the board asks the relay for is the geohash it became.
const AREA_SCALES = [8, 7, 5, 4, 3];
// geohashCellDimensions() answers in degrees; a reader thinks in metres. A degree of
// latitude is within half a percent of this everywhere, which is what makes a cell's
// height the honest size to quote (its width narrows towards the poles).
const DEGREE_METRES = 111320;

function geohashCellHeightMetres(precision) {
  return geohashCellDimensions(precision).height * DEGREE_METRES;
}

function areaSizeLabel(precision) {
  const metres = geohashCellHeightMetres(precision);
  return metres >= 1000 ? `about ${Math.round(metres / 1000)} km` : `about ${Math.round(metres)} m`;
}

function areaScaleButtons() {
  return [...elements.areaScaleList.querySelectorAll('[data-area-precision]')];
}

function renderAreaScales() {
  // The sizes come from AREA_SCALES, and a test pins the markup's five buttons to the
  // same list, so the two cannot drift into offering a size that is not listed.
  const sizes = new Map(AREA_SCALES.map(precision => [String(precision), areaSizeLabel(precision)]));
  for (const button of areaScaleButtons()) {
    const size = button.querySelector('[data-area-size]');
    if (size) size.textContent = sizes.get(button.dataset.areaPrecision) || '';
  }
}

function geolocationTrouble(error) {
  const code = error && error.code;
  if (code === 1) return 'Your browser refused the location. You can still pick the cell on the map, or type the geohash.';
  if (code === 2) return 'Your device could not work out where it is just now. Try again, or pick the cell on the map.';
  if (code === 3) return 'Finding your location took too long. Try again, or pick the cell on the map.';
  return 'Could not get a location from this browser. You can still pick the cell on the map.';
}

function readPosition(precision) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      // A building or a street needs the device's best effort; a city or a state does
      // not, and the coarser answer is quicker and kinder to the battery.
      enableHighAccuracy: precision >= 7,
      timeout: 12000,
      maximumAge: 30000,
    });
  });
}

async function showNotesAroundMe(precision) {
  if (placingNote) {
    status(elements.areaStatus, 'Pin the current note before changing corkboards.', true);
    return;
  }
  if (!navigator.geolocation) {
    status(elements.areaStatus, 'This browser has no location support. You can still pick the cell on the map.', true);
    return;
  }
  const controls = [elements.shareArea, ...areaScaleButtons()];
  for (const control of controls) control.disabled = true;
  status(elements.areaStatus, 'Finding where you are...');
  try {
    const {coords} = await readPosition(precision);
    const cell = encodeGeohash(coords.latitude, coords.longitude, precision);
    const keep = elements.lockToggle.checked;
    elements.areaDialog.close();
    if (keep) lockThisPlace([cell], precision);
    selectBoard(cell);
    // Say it in the reader's own terms, and say when the device was too vague for the
    // size they chose: a ±40 m fix cannot tell one building-sized cell from its neighbour.
    const certain = !coords.accuracy || coords.accuracy <= geohashCellHeightMetres(precision);
    // The board's own status line is transient — the relay's answer replaces it within a
    // second — so the caveat goes where it will still be readable later, too.
    if (!certain) {
      status(elements.boardChooserStatus,
        `Your device was only accurate to ±${Math.round(coords.accuracy)} m, so ${cell} may be the cell next door.`);
    }
    status(elements.boardStatus, certain
      ? `Notes around you: ${cell}, ${areaSizeLabel(precision)} across.`
      : `Notes around you: ${cell}, ${areaSizeLabel(precision)} across — your device was only accurate to `
        + `±${Math.round(coords.accuracy)} m, so this may be the cell next door.`,
      !certain);
  } catch (error) {
    status(elements.areaStatus, geolocationTrouble(error), true);
  } finally {
    for (const control of controls) control.disabled = false;
  }
}

function readSavedPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_PLACES_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(place => ({
        name: String((place && place.name) || '').trim().slice(0, SAVED_PLACE_NAME_MAX),
        cells: geohashCellsFrom(place && place.cells),
      }))
      .filter(place => place.name && place.cells.length)
      .slice(0, SAVED_PLACES_MAX);
  } catch (error) {
    return [];
  }
}

let savedPlaces = readSavedPlaces();

function writeSavedPlaces() {
  localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(savedPlaces));
}

function renderSavedPlaces() {
  elements.savedPlacesSummary.textContent = savedPlaces.length
    ? `Saved places (${savedPlaces.length})`
    : 'Saved places';
  const rows = savedPlaces.map((place, index) => {
    const row = document.createElement('li');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'saved-places__open';
    const name = document.createElement('span');
    name.className = 'saved-places__name';
    name.textContent = place.name;
    const cells = document.createElement('code');
    cells.textContent = place.cells.join(',');
    open.append(name, cells);
    open.addEventListener('click', () => { openSavedPlace(index); });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'saved-places__remove';
    remove.setAttribute('aria-label', `Remove ${place.name}`);
    const icon = document.createElement('i');
    icon.className = 'lni lni-trash-3';
    icon.setAttribute('aria-hidden', 'true');
    remove.append(icon);
    remove.addEventListener('click', () => { removeSavedPlace(index); });
    row.append(open, remove);
    return row;
  });
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'saved-places__empty';
    empty.textContent = 'Nothing saved yet. Pick cells on the map, name them here, and they will be waiting next time.';
    rows.push(empty);
  }
  elements.savedPlacesList.replaceChildren(...rows);
}

function saveCurrentPlace() {
  const name = (elements.savedPlaceName.value || '').trim().slice(0, SAVED_PLACE_NAME_MAX);
  if (!name) {
    status(elements.savedPlaceStatus, 'Give the place a name first.', true);
    return;
  }
  // The cells on the map, or the geohash typed in the board chooser: a reader who types
  // their street deserves to keep it just as much as one who taps it out.
  const cells = geohashMapCells.length
    ? [...geohashMapCells]
    : geohashCellsFrom(elements.boardGeohash.value);
  if (!cells.length) {
    status(elements.savedPlaceStatus, 'Tap cells on the map, or type a geohash, then save.', true);
    return;
  }
  const existing = savedPlaces.findIndex(place => place.name.toLowerCase() === name.toLowerCase());
  if (existing < 0 && savedPlaces.length >= SAVED_PLACES_MAX) {
    status(elements.savedPlaceStatus, `Only ${SAVED_PLACES_MAX} places fit. Remove one first.`, true);
    return;
  }
  if (existing >= 0) savedPlaces[existing] = { name, cells };
  else savedPlaces.push({ name, cells });
  writeSavedPlaces();
  renderSavedPlaces();
  elements.savedPlaceName.value = '';
  status(elements.savedPlaceStatus, existing >= 0
    ? `Updated ${name} — ${cells.join(',')}.`
    : `Saved ${name} — ${cells.join(',')}. It stays in this browser.`);
}

function openSavedPlace(index) {
  const place = savedPlaces[index];
  if (!place) return;
  const cells = place.cells.join(',');
  elements.geohashMapDialog.close();
  selectBoard(cells);
}

function removeSavedPlace(index) {
  const place = savedPlaces[index];
  if (!place) return;
  savedPlaces.splice(index, 1);
  writeSavedPlaces();
  renderSavedPlaces();
  status(elements.savedPlaceStatus, `Removed ${place.name}.`);
}

function renderLockControls() {
  const locked = lockedCells.length > 0;
  elements.lockToggle.checked = locked;
  elements.unlockButton.hidden = !locked;
  elements.lockCaption.textContent = locked
    ? `Kept: ${boardCellsLabel(lockedCells)} — ${areaSizeLabel(lockedCells[0].length)} across. `
      + 'The board opens here on every visit.'
    : 'Tick to keep this place and open it on every visit.';
}

function lockThisPlace(cells, precision) {
  lockedCells = [...cells];
  localStorage.setItem(LOCKED_PLACE_KEY, lockedCells.join(','));
  // The remembered board is not a second opinion while a place is kept, and a stale ?g=
  // in the address bar would outrank the lock on the next visit.
  forgetActiveBoard();
  updateBoardUrl();
  renderLockControls();
  const label = `${boardCellsLabel(lockedCells)} (${areaSizeLabel(precision)} across)`;
  status(elements.areaStatus, `Kept ${label} — the board opens here on every visit.`);
  status(elements.boardChooserStatus, `Kept ${label}. Unlock it from "Show notes around me".`);
}

function unlockThisPlace() {
  lockedCells = [];
  localStorage.removeItem(LOCKED_PLACE_KEY);
  renderLockControls();
  status(elements.areaStatus, 'Unlocked — the board will not open a place of its own.');
  status(elements.boardChooserStatus, 'No place is kept any more. The board opens the one you choose.');
}

function openAreaDialog() {
  renderLockControls();
  status(elements.areaStatus, '');
  showDialog(elements.areaDialog);
}

elements.shareArea.addEventListener('click', openAreaDialog);
elements.unlockButton.addEventListener('click', () => { unlockThisPlace(); });
elements.savePlaceButton.addEventListener('click', () => { saveCurrentPlace(); });
elements.savedPlaceName.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  saveCurrentPlace();
});
renderSavedPlaces();
renderLockControls();
for (const button of areaScaleButtons()) {
  button.addEventListener('click', () => { showNotesAroundMe(Number.parseInt(button.dataset.areaPrecision, 10)); });
}
renderAreaScales();

elements.shareBoard.addEventListener('click', async () => {
  const typed = geohashCellsFrom(elements.boardGeohash.value);
  const cells = typed.length ? typed : activeGeohashes;
  if (!cells.length) {
    status(elements.boardChooserStatus, 'Enter or open a geohash before sharing it.', true);
    return;
  }
  const geohash = boardCellsLabel(cells);
  const url = new URL('/stickyNotes.html', location.origin);
  url.searchParams.set('g', cells.join(','));
  try {
    if (navigator.share) {
      try {
        await navigator.share({title: `Corkboard ${geohash}`, text: `Open the ${geohash} Nostr corkboard on satoshi.si.`, url: url.href});
        status(elements.boardChooserStatus, 'Board link shared.');
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(url.href);
    status(elements.boardChooserStatus, 'Board link copied.');
  } catch (error) {
    status(elements.boardChooserStatus, 'Could not share the board link.', true);
  }
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => handleLogin(button.dataset.login)));
elements.logout.addEventListener('click', () => { logoutNostr(); elements.accountDialog.close(); updateAccount(); });
elements.accountPicture.addEventListener('error', () => { elements.accountPicture.hidden = true; });
elements.colors.addEventListener('click', event => selectColor(event.target.closest('[data-color]')?.dataset.color));
elements.font.addEventListener('change', () => selectFont(elements.font.value));
elements.liveliness.addEventListener('input', () => selectLiveliness(STICKY_LIVELINESS[Number(elements.liveliness.value)]?.key));
renderLiveliness();
elements.editor.addEventListener('beforeinput', () => { lastValidEditor = elements.editor.textContent; });
elements.editor.addEventListener('input', handleEditorInput);
elements.editor.addEventListener('paste', event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); });
elements.pay.addEventListener('click', startPayment);
elements.planPicker?.addEventListener('click', event => {
  const button = event.target.closest('[data-plan]');
  if (!button) return;
  subscribePlan = button.dataset.plan === 'year' ? 'year' : 'week';
  renderQuotedPrice();
});
elements.copyPayment.addEventListener('click', copyPayment);
elements.placementControls.addEventListener('click', event => {
  const rotate = event.target.closest('[data-rotate]');
  if (rotate) setPlacement({...currentPlacement(), rotation: currentPlacement().rotation + Number(rotate.dataset.rotate)});
});
elements.pin.addEventListener('click', () => publishPinnedNote());
elements.discardBin.addEventListener('click', () => openDiscardDialog());
elements.discardConfirm.addEventListener('click', () => discardPendingNote());
elements.discardCancel.addEventListener('click', () => keepDiscardedNote());
// Closing with the X or Escape is a no: put the note back where the drag started.
elements.discardDialog.addEventListener('close', () => { if (discardRestore) keepDiscardedNote(); });
elements.zoomOut.addEventListener('click', () => setZoom(boardView.scale - .15));
elements.zoomIn.addEventListener('click', () => setZoom(boardView.scale + .15));
elements.zoomFit.addEventListener('click', fitBoard);
elements.copyNoteId.addEventListener('click', copySelectedNoteId);
elements.removeSticky.addEventListener('click', startRemovalPayment);
document.getElementById('closeNoteMenu').addEventListener('click', closeNoteMenu);
document.addEventListener('pointerdown', event => {
  if (!elements.noteMenu.hidden && !event.target.closest('#noteMenu') && !event.target.closest('.sticky-note__pin')) closeNoteMenu();
});
window.addEventListener('satoshi-nostr-session', updateAccount);
window.addEventListener('beforeunload', () => { try { boardSocket?.close(); } catch {} });
window.addEventListener('resize', () => { if (boardView.scale < .5) fitBoard(); });
setInterval(() => {
  const before = elements.account.getAttribute('aria-label');
  updateAnonymousCountdown();
  const session = getNostrSession();
  const after = session ? `Nostr account: ${sessionLabel(session)}` : 'Log in to Nostr';
  if (before !== after) updateAccount();
}, 1000);

updateAccount();
// One source for the rail's thickness: the stylesheet reads this variable, the
// fitting maths reads the constant, so the frame and the fit cannot disagree.
elements.canvas.style.setProperty('--cork-frame', `${BOARD_FRAME_WIDTH}px`);
// The canvas wears its board's size from the first paint. The board the reader arrives on comes
// from the link, the kept place or the remembered board, and that resolution does not pass
// through selectBoard, so the size is worked out from what it settled on here as well.
boardSize = boardExtentForCells(activeGeohashes, BOARD_CELL_PX);
applyBoardSize();
elements.boardDepth.value = String(boardDepth);
elements.rememberBoard.checked = rememberBoard;
updateBoardControl();
installBoardNavigation();
requestAnimationFrame(fitBoard);
if (activeGeohash) connectBoard();
else {
  status(elements.boardStatus, 'Choose a geohash to open its corkboard.');
  showDialog(elements.boardDialog);
  requestAnimationFrame(() => elements.boardGeohash.focus());
}
let resumedSigning = false;
try {
  const amber = resumeAmber();
  if (amber?.action === 'login') { updateAccount(); openComposer(); }
  if (amber?.action === 'sign' && pending?.orderId === amber.context?.orderId) {
    resumedSigning = true;
    if (amber.context.action === 'remove') await publishRemoval(amber.event);
    else await publishPinnedNote(amber.event);
  }
} catch (error) {
  status(elements.boardStatus, error.message, true);
}
if (!resumedSigning && pending?.status === 'waiting') {
  if (pending.action === 'remove') {
    status(elements.boardStatus, 'Checking your note-removal payment...');
    elements.boardStatus.hidden = false;
  } else {
    selectColor(pending.color);
    selectFont(pending.font || 'typewriter');
    elements.exactGeohash.checked = Boolean(pending.exactGeohash);
    selectLiveliness(pending.liveliness || STICKY_DEFAULT_LIVELINESS);
    elements.editor.textContent = pending.content;
    lastValidEditor = pending.content;
    showDialog(elements.composer);
    status(elements.paymentStatus, 'Checking your payment...');
  }
  pollPayment();
} else if (!resumedSigning && pending?.status === 'paid') {
  if (pending.action === 'remove') publishRemoval();
  else beginPlacement();
}
