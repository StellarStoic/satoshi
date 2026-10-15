import {
  STICKY_COLORS,
  STICKY_FONTS,
  STICKY_ANONYMOUS_PRICE_SATS,
  STICKY_MAX_CHARACTERS,
  stickyNoteLength,
  MAP_SEARCH_PRECISION,
  placeSearchResults,
  linkMatches,
  linkRunIsComplete,
  placeSearchUrl,
  STICKY_SUB_PLANS,
  STICKY_SUB_WEEK_SATS,
  describeStickyAction,
  stickySubscriptionPrice,
  STICKY_TOPIC,
  normaliseStickyHashtags,
  stickyHashtagIssue,
  clampPlacement,
  clampRotation,
  encodeGeohash,
  geohashBounds,
  geohashNeighbours,
  clampBoardView,
  pinColourFor,
  pinLeftFor,
  geohashSetIssue,
  geohashTouches,
  GEOHASH_MAX_CELLS,
  GEOHASH_MAX_BOARD_DEPTH,
  normaliseGeohashes,
  makeStickyTemplate, mentionFilterAvailability, mentionLabel, stickyTextParts, STICKY_NOTE_VIEWS, stickyVisibleNoteIds,
  geohashMatchesBoard,
  geohashPrecisionForZoom,
  mapZoomForGeohashPrecision,
  normaliseGeohash,
  normaliseStickyText,
  parseStickyEvent,
  stickyContentHash,
  stickyPictureDigest,
  stickyImageUrl,
  stickyOrderPrice,
  stickyPaymentRails,
  STICKY_LIVELINESS,
  STICKY_DEFAULT_LIVELINESS,
  stickyLiveliness,
  stickyExpiration,
  stickyExpiryCountdown,
  isStickyExpired,
  geohashGridFits,
  geohashCellsForPrecision,
  boardBitmapSize,
  boardPatternScale,
  GRID_MIN_CELL_PX,
  linkDisplay,
  boardShareUrl,
  linkHref,
  BOARD_TEXTURES,
  DEFAULT_BOARD_TEXTURE_URL,
  boardTextureUrl,
  boardTextureLabel,
  boardTextureTile,
  boardPlateFontSize,
  boardLampCount,
  boardLampLit,
  BOARD_LAMP_SOCKETS,
  AMBER_HAND_OVER_WAITING_LINE,
  AMBER_HANDED_OVER_LINE,
  spentAmberHandOver,
  STICKY_IMAGE_GRADES,
  STICKY_IMAGE_DEFAULT_GRADE,
  STICKY_IMAGE_MAX_BYTES,
  stickyImageGrade,
  stickyImageIssue,
  stickyPowOffer,
  stickyPowSentence,
  stickyPowProgress,
  stickyPowDifficulty,} from './stickyNotesModel.mjs';
import {mineNote, describeSeconds} from './powMining.mjs';
// The badge a note's foot carries is drawn from the model's own vocabulary, so the words the
// desk sells under live in one place rather than being spelled again in the page.
import {stickyPaymentBadge, coveredPinNotes, PIN_RAISE_MS} from './stickyNotesModel.mjs';
import {
  beginAmberLogin,
  adoptAmberClipboard,
  amberClipboardPending,
  adoptAmberSignature,
  amberSignaturePending,
  beginAmberSigning,
  beginNostrConnect,
  getNostrSession,
  loginAnonymously,
  loginWithBunker,
  loginWithExtension,
  loginWithPrivateKey,
  logoutNostr,
  markAnonymousNotePublished,
  pendingNostrConnect,
  pendingAmberRequest,
  reconnectBunker,
  resumeAmber,
  resumeNostrConnect,
  savedBunker,
  shortNpub,
  signNostrEvent,
  signerReady,
  updateNostrProfile,
  lastAmberHandOver,
  noteAmberHandOverOutcome,} from './nostrSession.mjs';
import {payServiceUrl} from './paymentService.mjs';

const API = document.querySelector('meta[name="pinstr-api"]')?.content || payServiceUrl('pinstr');
const RELAY = 'wss://nostr.satoshi.si';
const PENDING_KEY = 'satoshi:sticky:pending:v1';
const FLOW_SYNC_KEY = 'satoshi:sticky:flow-sync:v1';
const NOTE_VIEW_KEY = 'satoshi:sticky:note-view:v1';
const FOLLOWS_FILTER_KEY = 'satoshi:sticky:follows-only:v1';
const BOARD_KEY = 'satoshi:sticky:geohash:v1';
// A board can cover several cells that touch, so what is remembered is the whole
// clump; BOARD_KEY keeps the first cell for links and older visitors.
const BOARD_CELLS_KEY = 'satoshi:sticky:geohash-cells:v1';
const BOARD_DEPTH_KEY = 'satoshi:sticky:geohash-depth:v1';
const BOARD_REMEMBER_KEY = 'satoshi:sticky:remember-geohash:v1';
// Off by default: the board looks as it always has until the reader asks for the pins of notes
// that other notes have covered.
const BURIED_PINS_KEY = 'satoshi:sticky:buried-pins:v1';
// A place the reader keeps: one cell, opened on every visit, until they unlock it.
const LOCKED_PLACE_KEY = 'satoshi:sticky:locked-place:v1';
// Places the reader named themselves: a name and the cells it stands for, in this browser.
const SAVED_PLACES_KEY = 'satoshi:sticky:saved-places:v1';
const SAVED_PLACES_MAX = 24;
const SAVED_PLACE_NAME_MAX = 40;
// The pattern the reader picked for their board: this browser only, like the board itself.
const BOARD_TEXTURE_KEY = 'satoshi:sticky:board-texture:v1';
const elements = {
  board: document.getElementById('stickyBoard'), canvas: document.getElementById('stickyCanvas'), boardStatus: document.getElementById('boardStatus'),
  loginConfirmation: document.getElementById('loginConfirmation'),
  boardFrame: document.getElementById('boardFrame'),
  boardPaint: document.getElementById('boardPaint'),
  stickySettings: document.getElementById('stickySettings'),
  boardStyleDialog: document.getElementById('boardStyleDialog'),
  boardStyleForm: document.getElementById('boardStyleForm'),
  boardTextureOptions: document.getElementById('boardTextureOptions'),
  boardTextureUrl: document.getElementById('boardTextureUrl'),
  resetBoardTexture: document.getElementById('resetBoardTexture'),
  boardStyleStatus: document.getElementById('boardStyleStatus'),
  account: document.getElementById('nostrAccount'), newSticky: document.getElementById('newSticky'),
  noteSort: document.getElementById('noteSort'), noteSortDialog: document.getElementById('noteSortDialog'),
  noteViewOptions: document.getElementById('noteViewOptions'), followsOnly: document.getElementById('followsOnly'),
  followsOnlyRow: document.getElementById('followsOnlyRow'), noteSortStatus: document.getElementById('noteSortStatus'),
  mentionMenu: document.getElementById('mentionMenu'), mentionOptions: document.getElementById('mentionOptions'),
  mentionMenuStatus: document.getElementById('mentionMenuStatus'),
  openBoard: document.getElementById('openStickyBoard'), boardDialog: document.getElementById('boardDialog'),
  boardChooser: document.getElementById('boardChooser'), boardGeohash: document.getElementById('boardGeohash'),
  boardDepth: document.getElementById('boardDepth'), shareBoard: document.getElementById('shareStickyBoard'),
  rememberBoard: document.getElementById('rememberStickyBoard'),
  buriedPins: document.getElementById('buriedPins'),
  openGeohashMap: document.getElementById('openGeohashMap'), geohashMapDialog: document.getElementById('geohashMapDialog'),
  closeGeohashMap: document.getElementById('closeGeohashMap'), geohashMap: document.getElementById('geohashMap'),
  geohashMapPrecision: document.getElementById('geohashMapPrecision'), geohashMapSelection: document.getElementById('geohashMapSelection'),
  geohashMapStatus: document.getElementById('geohashMapStatus'), clearGeohashSelection: document.getElementById('clearGeohashSelection'),
  useGeohashSelection: document.getElementById('useGeohashSelection'),
  placeSearch: document.getElementById('placeSearch'), placeResults: document.getElementById('placeResults'),
  clearPlaceSearch: document.getElementById('clearPlaceSearch'),
  placeStatus: document.getElementById('placeSearchStatus'),
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
  amberPair: document.getElementById('amberPair'),
  accountDialog: document.getElementById('accountDialog'), accountName: document.getElementById('accountName'),
  accountNpub: document.getElementById('accountNpub'), accountMethod: document.getElementById('accountMethod'),
  accountPicture: document.getElementById('accountPicture'), accountNip05: document.getElementById('accountNip05'),
  anonymousExpiry: document.getElementById('anonymousExpiry'), logout: document.getElementById('logoutNostr'),
  composer: document.getElementById('composerDialog'), editor: document.getElementById('stickyEditor'),
  draft: document.getElementById('draftNote'), colors: document.getElementById('colorSwatches'),
  hashtags: document.getElementById('noteHashtags'), hashtagStatus: document.getElementById('hashtagStatus'),
  capacity: document.getElementById('noteCapacity'), pay: document.getElementById('payForSticky'),
  mine: document.getElementById('mineForSticky'), powOffer: document.getElementById('powOffer'),
  subscriptionState: document.getElementById('subscriptionState'), planPicker: document.getElementById('planPicker'),
  noteKind: document.getElementById('noteKind'), noteImage: document.getElementById('noteImage'),
  draftNote: document.getElementById('draftNote'), composerCount: document.getElementById('composerCount'),
  noteImageGradesHint: document.getElementById('noteImageGradesHint'),
  composerTitle: document.getElementById('composerTitle'),
  noteImageFile: document.getElementById('noteImageFile'), noteImageStatus: document.getElementById('noteImageStatus'),
  noteImageLimit: document.getElementById('noteImageLimit'), noteImageGradeList: document.getElementById('noteImageGradeList'),
  noteImagePreview: document.getElementById('noteImagePreview'), noteImagePreviewLabel: document.getElementById('noteImagePreviewLabel'),
  paymentStatus: document.getElementById('paymentStatus'), placementControls: document.getElementById('placementControls'),
  discardBin: document.getElementById('discardBin'), discardDialog: document.getElementById('discardDialog'),
  discardWarning: document.getElementById('discardWarning'), discardConfirm: document.getElementById('discardNoteConfirm'),
  linkDialog: document.getElementById('linkDialog'), linkDialogUrl: document.getElementById('linkDialogUrl'),
  linkDialogRest: document.getElementById('linkDialogRest'), linkExpand: document.getElementById('linkExpand'),
  linkOpen: document.getElementById('linkOpen'), linkCancel: document.getElementById('linkCancel'),
  discardCancel: document.getElementById('discardNoteCancel'),
  paymentDialog: document.getElementById('paymentDialog'), payment: document.getElementById('stickyPayment'), paymentAmount: document.getElementById('stickyPaymentAmount'),
  paymentQr: document.getElementById('stickyPaymentQr'), paymentValue: document.getElementById('stickyPaymentValue'),
  paymentRails: document.getElementById('stickyPaymentRails'), paymentHint: document.getElementById('stickyPaymentHint'),
  copyPayment: document.getElementById('copyStickyPayment'),
  closePayment: document.getElementById('closeStickyPayment'),
  pin: document.getElementById('pinSticky'), bunker: document.getElementById('bunkerInput'),
  bunkerReconnect: document.getElementById('bunkerReconnect'),
  amberPaste: document.getElementById('amberPaste'),
  amberDialog: document.getElementById('amberCopyDialog'),
  amberCopyTitle: document.getElementById('amberCopyTitle'),
  amberCopyStatus: document.getElementById('amberCopyStatus'),
  nostrConnect: document.getElementById('nostrConnectDialog'),
  nostrConnectQr: document.getElementById('nostrConnectQr'),
  nostrConnectUri: document.getElementById('nostrConnectUri'),
  nostrConnectCopy: document.getElementById('nostrConnectCopy'),
  nostrConnectOpen: document.getElementById('nostrConnectOpen'),
  nostrConnectStatus: document.getElementById('nostrConnectStatus'),
  boardPlate: document.getElementById('boardPlate'),
  boardPlateTop: document.getElementById('boardPlateTop'),
  boardLampsLeft: document.getElementById('boardLampsLeft'),
  boardLampsRight: document.getElementById('boardLampsRight'),
  shareBoardDialog: document.getElementById('shareBoardDialog'),
  shareBoardLink: document.getElementById('shareBoardLink'),
  shareBoardPreview: document.getElementById('shareBoardPreview'),
  shareBoardStatus: document.getElementById('shareBoardStatus'),
  shareBoardNative: document.getElementById('nativeShareBoard'),
  copyBoardLink: document.getElementById('copyBoardLink'),
  boardPlateLine: document.getElementById('boardPlateLine'),
  boardPlateTopLine: document.getElementById('boardPlateTopLine'),
  privateKey: document.getElementById('privateKeyInput'), font: document.getElementById('noteFont'),
  exactGeohash: document.getElementById('exactGeohashNote'),
  liveliness: document.getElementById('noteLiveliness'), livelinessValue: document.getElementById('noteLivelinessValue'),
  livelinessTicks: document.getElementById('noteLivelinessTicks'), livelinessHint: document.getElementById('noteLivelinessHint'),
  noteExpiresLabel: document.getElementById('noteExpiresLabel'), noteExpirationValue: document.getElementById('noteExpirationValue'),
  noteExpiresAt: document.getElementById('noteExpiresAt'), noteExpiryCountdown: document.getElementById('noteExpiryCountdown'),
  noteMenu: document.getElementById('noteMenu'), noteEventId: document.getElementById('noteEventId'),
  notePostedAt: document.getElementById('notePostedAt'), copyNoteId: document.getElementById('copyNoteId'),
  noteEventJsonDetails: document.getElementById('noteEventJsonDetails'), noteEventJson: document.getElementById('noteEventJson'),
  noteMenuStatus: document.getElementById('noteMenuStatus'),
};

// The NIP-46 hand-off needs an Amber on this same device to hand the invitation to, so the pairing
// route is offered only where a signer app can be opened at all: on a phone. A desktop keeps the code.
elements.amberPair.hidden = !/Android/i.test(navigator.userAgent || '');

let selectedColor = 'yellow';
let selectedFont = 'typewriter';
let selectedLiveliness = STICKY_DEFAULT_LIVELINESS;
let lastValidEditor = '';
// The composer's other half: whether this note is written or carries a picture, the file the
// reader chose (kept in memory only — it is never read, only sent), and the grade they picked
// for it. All three are per-note state and none of them is part of what a written note is.
let noteKind = 'text';
let pickedImage = null;
let selectedImageGrade = STICKY_IMAGE_DEFAULT_GRADE;
let pending = readPending();
// Early note deletion is no longer a Pinstr action. Do not resume a stale removal
// left by an older frontend; published deletion events are still read from the relay.
if (pending?.action === 'remove') {
  savePending(null);
  pending = null;
}
let placingNote = null;
let noteExpiryTimer = null;
let discardRestore = null;
let paymentTimer = null;
let invoiceMessageTimer = null;
let boardSocket = null;
let boardConnectionVersion = 0;
const rendered = new Set();
const noteEvents = new Map();
const authorLabels = new Map();
const authorProfileQueue = new Set();
const authorProfilesLoading = new Set();
let authorProfileTimer = null;
let selectedNoteId = '';
let noteView = STICKY_NOTE_VIEWS.includes(localStorage.getItem(NOTE_VIEW_KEY)) ? localStorage.getItem(NOTE_VIEW_KEY) : 'all';
let followsOnlyPreference = localStorage.getItem(FOLLOWS_FILTER_KEY) === '1';
let followedPubkeys = new Set();
let followsLoadedFor = '';
let followsLoadingFor = '';
let revealedFilteredNoteId = '';
let revealedFilteredNoteUntil = 0;
let revealedFilteredNoteTimer = null;
let placementGestureController = null;
let quotedPrice = STICKY_SUB_WEEK_SATS;

// The mining difficulty, from the desk's own /config. `undefined` is "not asked yet" and
// null is "this desk publishes none", which are different answers: the first is worth a
// request, the second means mining is simply not offered.
let powBits;
async function miningDifficulty() {
  if (powBits !== undefined) return powBits;
  try { powBits = stickyPowDifficulty(await api('/config')); } catch { powBits = null; }
  return powBits;
}

// A tap on "Free with POW" is a request to pay for the next order with work instead of
// sats. It only ever turns a route on for one attempt: the order the desk creates is what
// carries it, and the note that gets published has to carry the work itself.
let miningRequested = false;

/** What the reader is told while a note is mined, and how to stop. */
let mining = null;
let quotedPubkey = '';
// The desk's answer to GET /pinstr/v1/subscription for the signed-in key, and the
// plan the picker is on. `actionInfo` is the pure description of what the buttons
// say, rebuilt whenever any of those change.
let subscription = null;
let subscriptionResolved = false;
let subscribePlan = 'week';
let actionInfo = describeStickyAction({});
let currentPaymentValue = '';
let currentRails = [];
let currentRailId = '';
let profileFetchPubkey = '';
let composingPubkey = '';
let composingGeohashes = [];
const INVOICE_WAIT_MESSAGES = Object.freeze([
  'Creating your invoice...',
  'Waking up the invoice machine...',
  'Tiny gears are clanking...',
  'The sats are forming an orderly queue...',
  'Almost there; one sat forgot its hat...',
  'Still working. Apparently invoices enjoy suspense...',
]);
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
// The searched place draws its own source over the grid: a ring wide enough to see under the
// cells, and a dot inside it. Three characters and a pause are the politeness the geocoder's
// operators ask for, and a request still in flight is dropped the moment the reader types again.
const MAP_SEARCH_SOURCE_ID = 'geohash-place';
const MAP_SEARCH_RING_LAYER = 'geohash-place-ring';
const MAP_SEARCH_MARKER_LAYER = 'geohash-place-marker';
const MAP_SEARCH_DEBOUNCE_MS = 300;
const MAP_SEARCH_TIMEOUT_MS = 8000;
const MAP_MISSING_TEXT = 'The map could not load. You can still enter a geohash manually.';
let mapLibraryPromise = null;
let mapTroubleSaid = false;

let geohashMap = null;
let geohashMapCells = [];
// Set while the picker applies its opening view: that jump fires `zoomend` as well, and it is
// not the reader zooming, so it must never be read as a grid change.
let geohashMapOpening = false;
let geohashPlaceResults = [];
let geohashPlaceRequest = null;
let geohashPlaceTimer = 0;
let geohashPlaceMarker = null;
let geohashGridFrame = 0;
const linkedCells = geohashCellsFrom(new URL(location.href).searchParams.get('g'));
// Card mode: the same page, wearing nothing but the board, so the desk can screenshot it into the
// picture a shared board link unfurls with.
const cardMode = new URL(location.href).searchParams.has('card');
if (cardMode) {
  // The class goes on the document element as well as the body: the page has to be exactly the
  // window, or a capture of it loses the bottom of the board.
  document.documentElement.classList.add('is-card');
  document.body.classList.add('is-card');
  document.title = 'Pinstr board';
}
let lockedCells = geohashCellsFrom(localStorage.getItem(LOCKED_PLACE_KEY));
let rememberBoard = localStorage.getItem(BOARD_REMEMBER_KEY) !== 'false';
let showBuriedPins = localStorage.getItem(BURIED_PINS_KEY) === '1';
// A link somebody was sent wins, then the place they locked, then the board they last
// had open: the lock is their own habit and a link is somebody else pointing.
let activeGeohashes = linkedCells.length
  ? linkedCells
  : (lockedCells.length
    ? lockedCells
    : (rememberBoard ? geohashCellsFrom(localStorage.getItem(BOARD_CELLS_KEY) || localStorage.getItem(BOARD_KEY)) : []));
let activeGeohash = activeGeohashes[0] || '';
let boardDepth = Math.max(0, Math.min(GEOHASH_MAX_BOARD_DEPTH, Number.parseInt(localStorage.getItem(BOARD_DEPTH_KEY), 10) || 0));
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
// Every geohash uses the same coordinate space. Geography decides which events are fetched,
// never how much board the reader gets or where a normalized note position lands.
const BOARD_SIZE = 2048;
const boardSize = Object.freeze({width: BOARD_SIZE, height: BOARD_SIZE});
let boardTransformFrame = 0;
let pendingTransformRect = null;
let boardViewport = null;
// The wooden rail around the board, in board pixels. The rail sits outside the board,
// so it never covers a note.
const BOARD_FRAME_WIDTH = 26;
// The plate on the bottom rail: a fixed, small plaque. Its width is what the engraved line has to fit
// inside, so it is stated once here and the type is cut to it.
const BOARD_PLATE_WIDTH = 620;
// Capped well under the plate's height (46 board px): the ink of a geohash reaches past its line box
// - j, g, p, q and y carry descenders - and the plate clips at its edge, so the letters keep room to
// hang below the line instead of being shaved off.
const BOARD_PLATE_TYPE_MAX = 34;
// A hair of brass left at each end of the engraving. The line is measured once and then the board is
// free to be zoomed, and the browser rounds a row of letters and nail heads to device pixels slightly
// differently at each scale - so the type is cut a little inside the plate rather than exactly to it.
const BOARD_PLATE_INSET = 10;
// Opening a board should feel like standing in front of it, not looking at a thumbnail.
// Covering the viewport leaves board beneath every edge while keeping the selected area centred.
const BOARD_OPEN_COVER = 1.02;
// Zoom limits leave room to inspect the whole square when requested without making the first
// pinch jump inward from the screen-filling opening view.
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

function signalStickyFlow(type, detail = {}) {
  try {
    localStorage.setItem(FLOW_SYNC_KEY, JSON.stringify({
      type, ...detail, at: Date.now(), nonce: crypto.randomUUID?.() || Math.random(),
    }));
  } catch {}
}

function isStrandedPinDraft(value = pending) {
  return value?.action === 'pin' && !value?.status && !value?.orderId && Boolean(value?.content);
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

// The notice on screen, so a return that resolves it can take it down without also hiding
// a message that is not that notice (a publish failure is one of those).
let noticeText = '';
let loginConfirmationTimer = 0;

function status(target, message, error = false) {
  target.textContent = message;
  target.classList.toggle('is-error', error);
  // An ordinary message replaces a notice; the board's own announcements go through
  // this same door, which is why the mark is a flag and not a class.
  if (target === elements.boardStatus && !error) {
    delete target.dataset.notice;
    noticeText = '';
  }
}

/**
 * A message the reader has to act on. The board keeps talking on its own — "Opening the
 * board...", then "The Nostr board is temporarily unavailable." a second later — and those
 * arrive *after* the boot's failures, so a plain status line about a note that would not
 * pin is on screen for under a second and reads as nothing having happened.
 */
function notice(message) {
  status(elements.boardStatus, message, true);
  elements.boardStatus.hidden = false;
  elements.boardStatus.dataset.notice = '1';
  noticeText = message;
}

function signedInLabel(session) {
  const name = String(session?.profile?.display_name || session?.profile?.name || '').trim();
  const nip05 = String(session?.profile?.nip05 || '').trim();
  if (name && nip05) return `${name} · ${nip05}`;
  return name || nip05 || (session?.npub ? shortNpub(session.npub) : 'your Nostr account');
}

function showLoginConfirmation(session) {
  if (!session || !elements.loginConfirmation) return;
  clearTimeout(loginConfirmationTimer);
  elements.loginConfirmation.textContent = `Logged in as ${signedInLabel(session)}`;
  elements.loginConfirmation.hidden = false;
  loginConfirmationTimer = window.setTimeout(() => { elements.loginConfirmation.hidden = true; }, 5000);
}

let nostrConnectRequest = null;

/**
 * The step between tapping Amber and being signed in. With nothing handed between the two apps the
 * signer answers by copying the identity to the clipboard, and the browser gives that up on its own
 * terms - which is exactly what a reader cannot guess. So the dialog says what to do on its one line,
 * and carries the one button that always works.
 */
function showAmberCopyDialog() {
  if (elements.login.open) elements.login.close();
  if (!elements.amberDialog.open) elements.amberDialog.showModal();
  // One dialog carries both hand-overs, so its heading names which one this is: a sign-in here, a
  // signature in showAmberHandOver(). The wording belongs to the signing step alone.
  elements.amberCopyTitle.textContent = 'Finish signing in with Amber';
  status(elements.amberCopyStatus, amberClipboardPending() ? 'Approve it in Amber, then come back to this page.' : '');
}

/** A QR code for a string, as whole squares on the white field a scanner needs. */
function drawQrCode(container, text) {
  const qr = window.qrcode?.(0, 'M');
  if (!qr || !container) return false;
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const cell = 6;
  const canvas = document.createElement('canvas');
  canvas.width = size * cell;
  canvas.height = size * cell;
  canvas.className = 'nostr-connect-qr__canvas';
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (qr.isDark(row, column)) context.fillRect(column * cell, row * cell, cell, cell);
    }
  }
  container.replaceChildren(canvas);
  return true;
}

/**
 * The route for a browser that has no signer app to hand a request to. A desktop shows a code; the
 * phone's Amber reads it and the two talk over the relay from there, with nothing to copy and no key
 * touching this page. A phone can skip the code entirely by handing the invitation straight to Amber.
 */
async function showNostrConnectDialog() {
  if (typeof window.qrcode !== 'function') {
    status(elements.loginStatus, 'The code tools did not load. Reload the page and try again.', true);
    return;
  }
  nostrConnectRequest?.cancel();
  const onAndroid = /Android/i.test(navigator.userAgent || '');
  if (elements.login.open) elements.login.close();
  if (!elements.nostrConnect.open) elements.nostrConnect.showModal();
  // Each attempt hands the reader one invitation and waits for it. When it expires the spent one is
  // not shown again - a fresh one, with a new secret, is put up once while the reader is still here.
  // Closing the dialog ends the offers. A reload during enrolment instead finds the invitation that is
  // already in flight and keeps waiting on it.
  const attempt = async (afterTimeout = false) => {
    let request = null;
    try {
      // The invitation already handed to Amber is the one to wait on; only a first attempt, or one
      // whose predecessor expired, mints a new client key and secret.
      request = !afterTimeout && pendingNostrConnect() ? resumeNostrConnect() : beginNostrConnect();
    } catch (error) {
      status(elements.loginStatus, error.message, true);
      return;
    }
    nostrConnectRequest = request;
    elements.nostrConnectUri.textContent = request.uri;
    drawQrCode(elements.nostrConnectQr, request.uri);
    // On the phone the invitation goes straight to Amber and needs no code; a desktop can only show
    // one. The link stays in the field below either way, to paste on Amber's Connect screen.
    elements.nostrConnectOpen.hidden = !onAndroid;
    status(elements.nostrConnectStatus, onAndroid
      ? 'Tap the button to hand the invitation to Amber.'
      : 'Waiting for Amber to connect...');
    try {
      const session = await request.promise;
      // The page closes this dialog itself in a moment, so the pending-request handle is dropped first:
      // the close handler cancels whatever is still waiting, and this one is not.
      if (nostrConnectRequest === request) nostrConnectRequest = null;
      if (elements.nostrConnect.open) elements.nostrConnect.close();
      updateAccount();
      if (!syncPlacementWithSession()) showLoginConfirmation(session);
    } catch (error) {
      if (nostrConnectRequest !== request) return;      // the reader closed the step while it waited
      nostrConnectRequest = null;
      status(elements.nostrConnectStatus, error.message, true);
      // The window that expired left a spent invitation on screen. The reader is still here, so one
      // fresh offer replaces it; a second expiry just says so, and the dialog can be reopened.
      if (!afterTimeout && elements.nostrConnect.open && /did not answer/.test(error.message)) await attempt(true);
    }
  };
  await attempt();
}

function showDialog(dialog) {
  // A clipboard request already in flight is the one thing the plain list of ways in cannot finish
  // on its own: the answer is sitting on the clipboard, so that step is what the reader is shown.
  if (dialog === elements.login && amberClipboardPending()) {
    dialog = elements.amberDialog;
    status(elements.amberCopyStatus, 'Approve it in Amber, then come back to this page.');
  }
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
    // A tap on a cell that touches nothing is a reader pointing somewhere else, not a mistake:
    // it starts a new area there rather than being refused. Every other issue — too many cells,
    // a different depth, a set that would come apart — keeps the old area and the old wording.
    if (geohashMapCells.length && !geohashMapCells.includes(cell) && issue.startsWith('Cells have to stick together')) {
      setMapCells([cell], 'Started a new area here — cells have to touch to be one board');
      return;
    }
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
  map.addSource(MAP_SEARCH_SOURCE_ID, {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
  map.addLayer({
    id: MAP_SEARCH_RING_LAYER, type: 'circle', source: MAP_SEARCH_SOURCE_ID,
    paint: {
      'circle-radius': 14, 'circle-color': '#f2a900', 'circle-opacity': .16,
      'circle-stroke-color': '#f2a900', 'circle-stroke-width': 2, 'circle-stroke-opacity': .9,
    },
  });
  map.addLayer({
    id: MAP_SEARCH_MARKER_LAYER, type: 'circle', source: MAP_SEARCH_SOURCE_ID,
    paint: {
      'circle-radius': 5, 'circle-color': '#17130d',
      'circle-stroke-color': '#fff4d5', 'circle-stroke-width': 2,
    },
  });
}

/**
 * Searching a place by name, so a board is not something a reader has to know the geohash of.
 * The geocoder is komoot's open-source Photon over OpenStreetMap; it allows any origin and asks
 * for no key, so the page asks it directly and sends nothing but the place name.
 */
function setPlaceResults(results) {
  geohashPlaceResults = results;
  const list = elements.placeResults;
  list.replaceChildren();
  results.forEach((result, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'geohash-map-search__result';
    button.dataset.index = String(index);
    button.textContent = result.label;
    item.append(button);
    list.append(item);
  });
  list.hidden = !results.length;
}

function clearPlaceSearch({keepInput = false} = {}) {
  if (geohashPlaceRequest) {
    geohashPlaceRequest.abort();
    geohashPlaceRequest = null;
  }
  if (geohashPlaceTimer) {
    clearTimeout(geohashPlaceTimer);
    geohashPlaceTimer = 0;
  }
  if (!keepInput) elements.placeSearch.value = '';
  elements.clearPlaceSearch.hidden = true;
  status(elements.placeStatus, '');
  setPlaceResults([]);
  geohashPlaceMarker = null;
  drawPlaceMarker();
}

function drawPlaceMarker() {
  if (!geohashMap) return;
  const source = geohashMap.getSource(MAP_SEARCH_SOURCE_ID);
  if (!source) return; // the style is still on its way in
  const marker = geohashPlaceMarker;
  source.setData({
    type: 'FeatureCollection',
    features: marker ? [{
      type: 'Feature',
      properties: {label: marker.label},
      geometry: {type: 'Point', coordinates: [marker.lng, marker.lat]},
    }] : [],
  });
}

/** Land on the place: centred, and on the four-character grid the model names. */
function choosePlace(index) {
  const result = geohashPlaceResults[Number(index)];
  if (!result || !geohashMap) return;
  geohashPlaceMarker = result;
  geohashMap.jumpTo({
    center: [result.lng, result.lat],
    zoom: mapZoomForGeohashPrecision(MAP_SEARCH_PRECISION),
  });
  setPlaceResults([]);
  drawPlaceMarker();
  scheduleGeohashGrid();
  status(elements.placeStatus, `${result.label} — the grid is ${MAP_SEARCH_PRECISION} characters here. Tap a cell to take it.`);
}

async function searchPlaces() {
  const query = String(elements.placeSearch.value || '').trim();
  elements.clearPlaceSearch.hidden = !query;
  const url = placeSearchUrl(query);
  if (!url) {
    setPlaceResults([]);
    return;
  }
  if (geohashPlaceRequest) geohashPlaceRequest.abort();
  const controller = new AbortController();
  geohashPlaceRequest = controller;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MAP_SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {Accept: 'application/json'}});
    if (!response.ok) throw new Error(`The place search answered ${response.status}`);
    const payload = await response.json();
    if (geohashPlaceRequest !== controller) return; // a newer search has taken over
    setPlaceResults(placeSearchResults(payload));
    if (!geohashPlaceResults.length) {
      status(elements.placeStatus, 'No place by that name — try another spelling, or tap a cell.');
    }
  } catch (error) {
    if (error?.name === 'AbortError' && !timedOut) return;
    console.error('Could not search for a place:', error);
    if (geohashPlaceRequest === controller) {
      setPlaceResults([]);
      status(elements.placeStatus, timedOut
        ? 'The place search took too long — tap a cell on the grid instead.'
        : 'The place search is unavailable — tap a cell on the grid instead.', true);
    }
  } finally {
    clearTimeout(timeout);
    if (geohashPlaceRequest === controller) geohashPlaceRequest = null;
  }
}

function schedulePlaceSearch() {
  if (geohashPlaceTimer) clearTimeout(geohashPlaceTimer);
  geohashPlaceTimer = setTimeout(() => {
    geohashPlaceTimer = 0;
    searchPlaces();
  }, MAP_SEARCH_DEBOUNCE_MS);
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

  // A grid of specks is worse than no grid. At a world zoom a three-character cell is still too
  // pixels across, so every cell of it would be built and none of them could be read or tapped,
  // and there are a sixth of a million of them - which stalls the map for seconds on every zoom.
  // Three characters is the shortest geohash a board takes, so there is no coarser grid to fall
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
      ? 'Zoom in to pick a cell - at this distance one is smaller than the map can draw, and three characters is the shortest geohash a board takes.'
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
    // A place searched before the style arrived still gets its marker.
    drawPlaceMarker();
    scheduleGeohashGrid();
  });
  geohashMap.on('moveend', scheduleGeohashGrid);
  geohashMap.on('zoomend', () => {
    const precision = geohashPrecisionForZoom(geohashMap.getZoom());
    // Opening the map sets the view to the board's own zoom, which fires here too.
    // That is not the reader zooming, and the cells they picked are still theirs —
    // only a real change of depth makes them meaningless, and then it is said.
    if (geohashMapOpening) {
      scheduleGeohashGrid();
      return;
    }
    if (geohashMapCells.length && geohashMapCells[0].length === precision) {
      scheduleGeohashGrid();
      return;
    }
    // A changed grid is not a choice. Zooming out carries the reader's area over by cutting a
    // character off each cell; zooming in cannot be carried at all, and choosing a cell for them
    // would put one on the map nobody tapped. So it is carried where it can be, and otherwise
    // dropped with the reason said out loud.
    const carried = geohashCellsForPrecision(geohashMapCells, precision);
    setMapCells(carried.cells, carried.lost
      ? 'Zooming changed the grid — pick the cells for this area again'
      : '');
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
    geohashMapOpening = true;
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
    } finally {
      geohashMapOpening = false;
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
    if (!elements.loginConfirmation.hidden) showLoginConfirmation(getNostrSession());
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
  elements.anonymousExpiry.innerHTML = `One-note key expires in <strong>${anonymousCountdown(session.expiresAt)}</strong>`;
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
  refreshNoteSortControls();
}

function renderQuotedPrice() {
  const session = getNostrSession();
  const anonymous = session?.method === 'anonymous';
  const checkingSubscription = Boolean(session && !anonymous && !subscriptionResolved);
  actionInfo = describeStickyAction({anonymous, subscription, plan: subscribePlan});
  // A person who is not signed in sees no price at all: the buttons only mean
  // something once we know which key — and which identity mode — is posting.
  quotedPrice = session && !checkingSubscription ? actionInfo.price : 0;
  elements.pay.querySelector('span').textContent = session
    ? (checkingSubscription ? 'Place your note' : actionInfo.label)
    : 'Sign in to post';
  if (elements.subscriptionState) {
    elements.subscriptionState.textContent = session ? actionInfo.state : '';
    // An active subscription needs no sales copy. The composer becomes one clear action.
    elements.subscriptionState.hidden = !session || checkingSubscription || actionInfo.active;
  }
  if (elements.planPicker) {
    // The picker is only useful when there is a subscription to choose: an active
    // one already covers everything, and an anonymous identity can never take one.
    const plansAvailable = Boolean(session && !anonymous && subscriptionResolved && !actionInfo.active);
    elements.planPicker.hidden = !plansAvailable;
    elements.planPicker.inert = !plansAvailable;
    for (const button of elements.planPicker.querySelectorAll('[data-plan]')) {
      const plan = button.dataset.plan === 'year' ? 'year' : 'week';
      const amount = button.querySelector('b');
      const price = stickySubscriptionPrice(plan, {offPercent: actionInfo.offPercent});
      // A free plan shows its zero honestly here ("Week · 0 sats"); the button
      // above says "free", which is the sentence a reader acts on.
      if (amount && Number.isInteger(price)) amount.textContent = String(price);
      button.disabled = !plansAvailable;
      button.classList.toggle('is-active', plan === subscribePlan);
      button.setAttribute('aria-pressed', plan === subscribePlan ? 'true' : 'false');
    }
  }
}

async function refreshPriceQuote(session) {
  if (!session) {
    quotedPubkey = '';
    subscription = null;
    subscriptionResolved = false;
    renderQuotedPrice();
    return;
  }
  if (session.method === 'anonymous') {
    quotedPubkey = session.pubkey;
    subscription = null;
    subscriptionResolved = true;
    renderQuotedPrice();
    return;
  }
  if (quotedPubkey === session.pubkey && subscriptionResolved) return;
  if (quotedPubkey !== session.pubkey) subscription = null;
  quotedPubkey = session.pubkey;
  subscriptionResolved = false;
  renderQuotedPrice();
  try {
    // One call answers both halves: whether this key may post, and what the plans
    // cost it. The created order is still authoritative — this only draws buttons.
    const state = await api(`/subscription?pubkey=${encodeURIComponent(session.pubkey)}`);
    if (getNostrSession()?.pubkey !== session.pubkey) return;
    if (state && state.ok !== false) {
      subscription = state;
      subscriptionResolved = true;
    }
    renderQuotedPrice();
  } catch {
    // The created order remains authoritative; a missing preview never blocks checkout.
    if (getNostrSession()?.pubkey === session.pubkey) renderQuotedPrice();
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
    error.body = body;
    throw error;
  }
  return body;
}

let qrPromise = null;

function stopInvoiceMessages() {
  clearInterval(invoiceMessageTimer);
  invoiceMessageTimer = null;
}

function startInvoiceMessages() {
  if (invoiceMessageTimer) return;
  let index = 0;
  elements.paymentHint.textContent = INVOICE_WAIT_MESSAGES[index];
  invoiceMessageTimer = setInterval(() => {
    if (!elements.paymentDialog.open || currentRails.length) {
      stopInvoiceMessages();
      return;
    }
    index = (index + 1) % INVOICE_WAIT_MESSAGES.length;
    elements.paymentHint.textContent = INVOICE_WAIT_MESSAGES[index];
  }, 3000);
}

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
    startInvoiceMessages();
    return false;
  }
  stopInvoiceMessages();
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

/**
 * Show or hide the mining offer. `null` clears it: once a mined order exists the offer has
 * done its job, and a button that starts nothing is worse than no button.
 */
function showPowOffer(offer) {
  const shown = Boolean(offer && offer.offered);
  elements.mine.hidden = !shown;
  elements.mine.querySelector('span').textContent = shown ? `Free with POW · ${offer.bits} bits` : 'Free with POW';
  elements.powOffer.hidden = !offer || !offer.sentence;
  elements.powOffer.textContent = offer && offer.sentence ? offer.sentence : '';
  if (shown) miningRequested = false;
}

elements.mine.addEventListener('click', () => {
  // One attempt, in work instead of sats. The desk prices the order that comes back, and
  // everything after this point is the ordinary path to placing the note.
  miningRequested = true;
  elements.mine.disabled = true;
  status(elements.paymentStatus, 'Ordering a note you can pay for with work...');
  Promise.resolve(startPayment()).finally(() => { elements.mine.disabled = false; });
});

/**
 * Mine the finished note, in front of the reader, and put the winning nonce tag into the
 * template so the signature covers it. Returns null when the reader stops it, so the caller
 * leaves the note placed and unpublished rather than signing work the desk would refuse.
 *
 * The note has to be finished before this runs: the placement, the words and the moment it
 * was written all feed the id, so mining an unfinished note would be work on a different id.
 */
async function mineThisNote(template, bits) {
  mining = new AbortController();
  elements.pin.querySelector('span').textContent = 'Stop mining';
  try {
    const outcome = await mineNote({
      template, bits, signal: mining.signal,
      onProgress: progress => {
        status(elements.boardStatus, stickyPowProgress({
          hashes: progress.hashes, rate: progress.rate, best: progress.best, bits,
          secondsLeft: progress.secondsLeft ? describeSeconds(progress.secondsLeft) : null,
        }));
        elements.boardStatus.hidden = false;
      },
    });
    if (outcome.cancelled) {
      status(elements.boardStatus, 'Mining stopped. The note is still here: pin it again when you are ready, and keep this page open while it mines.');
      return null;
    }
    if (!outcome.ok) throw new Error('Mining did not finish. The note was not published.');
    // Appended last, which is the order the miner hashed: the tag array is part of the id.
    template.tags = [...template.tags, ['nonce', String(outcome.nonce), String(bits)]];
    status(elements.boardStatus, `Mined at ${outcome.bits} bits. Signing the note...`);
    return outcome;
  } finally {
    mining = null;
    elements.pin.querySelector('span').textContent = 'Pin note';
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
  showDialog(elements.paymentDialog);
  startInvoiceMessages();
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
  const reach = boardDepth === 0 ? 'exact only' : boardDepth === GEOHASH_MAX_BOARD_DEPTH ? 'all child boards' : `${boardDepth} level${boardDepth === 1 ? '' : 's'} deeper`;
  const label = activeGeohash ? `Board: ${boardCellsLabel()} (${reach})` : 'Choose a geohash board';
  elements.openBoard.setAttribute('aria-label', label);
  elements.openBoard.title = label;
}

let boardAppliedScale = 1;
let boardPlateLine = '';
// Whether a strip of lamps has been drawn already. The first one is drawn as the board opens, which
// is not a change, so it is not shown as one; a board opened from another one is.
let boardLampsReady = false;

/** The head of a nail, holding two cells apart on the plate. */
function nailHead() {
  const nail = document.createElement('span');
  nail.className = 'board-plate__nail';
  return nail;
}

/**
 * The two strips of lamps, one on each side rail. They are read together because they always carry
 * the same reading: they are this board's levels, seen from either side of it.
 */
function lampStrips() {
  return [elements.boardLampsLeft, elements.boardLampsRight].filter(Boolean);
}

/**
 * Light the two lamp plates on the side rails. Every plate carries all six sockets a cell has levels
 * under it, always, and boardLampCount says how many of them burn - six at three characters, three at
 * six, none at nine. boardLampLit then says which of the six: the levels left under the board are the
 * ones nearest to it, so the plate fills from its foot up. Both rails are built in that same order, so
 * the two plates read alike rather than mirrored: a gauge for the levels still open below the board,
 * and nothing more - no per-note or selection state.
 */
function renderBoardLamps() {
  const lit = boardLampCount(activeGeohash);
  for (const strip of lampStrips()) {
    // No cell at all is no board, so there is no depth to read and no plate to show. A board cut to
    // the deepest cell is not that case: it keeps its plate, all six sockets dark.
    strip.hidden = !activeGeohash;
    strip.replaceChildren(...Array.from({length: BOARD_LAMP_SOCKETS}, (unused, index) => {
      const lamp = document.createElement('span');
      lamp.className = boardLampLit(index, lit) ? 'board-frame__lamp board-frame__lamp--lit' : 'board-frame__lamp';
      return lamp;
    }));
  }
}

/** One flash of the lamps, in the place the reader's eye is already resting when the board changes. */
function pulseLamps() {
  for (const strip of lampStrips()) {
    strip.classList.remove('is-pulsing');
    // The layout is read back between the two: a browser restarts an animation only when the
    // animation property really changed, so putting the class on over itself would leave the next
    // board unpulsed. One of these per board change, not per frame. A board whose gauge reads empty
    // still gets its pulse - its plate is on the rail with every socket dark.
    void strip.offsetWidth;
    strip.classList.add('is-pulsing');
  }
}

/**
 * Engrave the board's own cells on the plate.
 *
 * Only the cells this board was opened for. A filter that reveals cells further inside it is showing
 * notes that are pinned within the place, not other places this board is, so nothing about that
 * belongs on the plate: it names the board and stops there.
 * is measured once at full size and then cut down so that the whole string fits the plaque at one
 * size; panning and zooming never change what is engraved, only how large it is on screen.
 *
 * Both plaques carry this engraving, the top rail's and the bottom rail's, because both of them
 * name the board.
 */
function renderBoardPlate() {
  const plates = [
    [elements.boardPlate, elements.boardPlateLine],
    [elements.boardPlateTop, elements.boardPlateTopLine],
  ].filter(([plate, line]) => plate && line);
  if (!plates.length) return;
  const signature = activeGeohashes.join(',');
  if (signature === boardPlateLine) return;
  const wasDrawn = boardLampsReady;
  boardPlateLine = signature;
  renderBoardLamps();
  // A board opened from another one is a change of cells, so the lamps show it once. The strip drawn
  // as the page opens is the first thing there, and it stays still.
  if (wasDrawn) pulseLamps();
  boardLampsReady = true;
  for (const [plate, line] of plates) {
    plate.hidden = !activeGeohashes.length;
    if (!activeGeohashes.length) {
      line.replaceChildren();
      continue;
    }
    line.replaceChildren(...activeGeohashes.flatMap((cell, index) => {
      const parts = [];
      if (index) parts.push(nailHead());
      const engraved = document.createElement('span');
      engraved.className = 'board-plate__cell';
      engraved.textContent = cell;
      parts.push(engraved);
      return parts;
    }));
    const style = getComputedStyle(plate);
    const inner = plate.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const target = Math.max(1, inner - BOARD_PLATE_INSET);
    // Set as large as the plate will ever carry, then cut down until the whole line is inside it. One
    // pass gets close; the line's own gaps and nail heads are in em and do not divide out perfectly, so
    // the measurement is repeated until it fits rather than trusted once. This runs when the plate is
    // re-engraved - not while the board is panned or zoomed, where the size in board pixels stands.
    // Readings come through the board's transform, so each is divided back into board pixels, which is
    // what the font size is in.
    let size = BOARD_PLATE_TYPE_MAX;
    for (let pass = 0; pass < 4; pass += 1) {
      line.style.fontSize = `${size}px`;
      const width = line.getBoundingClientRect().width / (boardAppliedScale || 1);
      if (!(width > 0) || width <= target) break;
      const next = boardPlateFontSize(target, width, size);
      if (!(next < size)) break;
      size = next;
    }
  }
}

function selectBoard(geohash, closeDialog = true) {
  if (placingNote) {
    status(elements.boardChooserStatus, 'Pin the current note before changing boards.', true);
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
  clearRevealedFilteredNote();
  noteEvents.clear();
  // The painted canvas, the wooden rail and the plate are all markup inside this canvas. A bare
  // replaceChildren() deleted the board's own edge, and keeping only the rail deleted the other
  // two: opening a board left a blank sheet with no pattern and no plate on it. Keep all three, in
  // the order the markup has them, and let the notes go - they belong to the board being left and
  // are re-fetched for the one being opened.
  elements.canvas.replaceChildren(
    ...[elements.boardPaint, elements.boardFrame, elements.boardPlate, elements.boardPlateTop].filter(Boolean));
  // Both of them cache what they last drew: the plate its engraving, the canvas its bitmap. A board
  // change invalidates both, so clear them before the new board is fitted and painted.
  boardPlateLine = '';
  if (elements.boardPaint) elements.boardPaint.dataset.painted = '';
  paintBoard();
  elements.boardStatus.hidden = false;
  status(elements.boardStatus, `Opening board ${boardCellsLabel()}...`);
  if (closeDialog) elements.boardDialog.close();
  requestAnimationFrame(fillBoard);
  connectBoard(boardConnectionVersion);
}

function clampViewToBoard(rect) {
  const clamped = clampBoardView(boardView, {width: rect.width, height: rect.height}, {
    canvasWidth: boardSize.width, canvasHeight: boardSize.height, frame: BOARD_FRAME_WIDTH,
  });
  boardView.x = clamped.x;
  boardView.y = clamped.y;
}

let boardSettled = false;
let boardZoomTimer = 0;

/** A value on a grid of whole device pixels (at dpr 3, a third of a CSS pixel). */
function onDeviceGrid(value, ratio) {
  return Math.round(value * ratio) / ratio;
}

/**
 * Programmatic zooms - the buttons and the fit action - move the whole layer in one jump. Handing
 * that to the compositor as a short transition scales what is already rasterised instead of making
 * the browser build the layer at the new scale inside a single frame, which on a phone is the flash
 * a reader notices. Scoped to this class so it never applies while a gesture drives the board, and
 * skipped for the first fit: at boot there is nothing on screen yet, and sliding the board into
 * place would be the very jolt this avoids.
 */
function animateBoardZoom() {
  if (!boardSettled) return;
  elements.board.classList.add('is-zooming');
  clearTimeout(boardZoomTimer);
  boardZoomTimer = setTimeout(() => elements.board.classList.remove('is-zooming'), 260);
}

function paintBoardTransform(rect) {
  // What a reader actually sees is this layer's sampling grid, so both halves of the transform are
  // snapped: the offset to whole device pixels, and the scale so one pattern tile covers a whole
  // number of them. Otherwise every frame samples the pattern and the note text a little
  // differently, and the board shimmers, crawls and wobbles as it moves - the glitch that survives
  // on a phone after the layer is already optimised.
  const ratio = Math.max(1, devicePixelRatio || 1);
  const texture = BOARD_TEXTURES.find(entry => entry.url === boardTextureSource());
  const unit = ratio * (boardTextureTile(texture) || 600);
  const next = {
    x: onDeviceGrid(boardView.x, ratio),
    y: onDeviceGrid(boardView.y, ratio),
    scale: Math.round(boardView.scale * unit) / unit,
  };
  elements.canvas.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
  // What the plate was measured through. Its font size is in board pixels, so this is only needed
  // while a new line is being engraved; renderBoardPlate returns at once for everything else.
  boardAppliedScale = next.scale;
  renderBoardPlate();
  boardViewport = {width: rect.width, height: rect.height};
  scheduleBoardPaint();
}

function applyBoardTransform(rect = elements.board.getBoundingClientRect()) {
  // Every pan, zoom and fit passes through here, so this is the one place that has to hold
  // the line: the rail is the board's edge, and the board does not continue past it.
  if (boardTransformFrame) cancelAnimationFrame(boardTransformFrame);
  boardTransformFrame = 0;
  pendingTransformRect = null;
  clampViewToBoard(rect);
  paintBoardTransform(rect);
}

function scheduleBoardTransform(rect) {
  // Pointer and wheel events can arrive several times between screen refreshes. Keep their
  // latest geometry, but paint only once per frame so panning does not queue stale transforms.
  clampViewToBoard(rect);
  pendingTransformRect = rect;
  if (boardTransformFrame) return;
  boardTransformFrame = requestAnimationFrame(() => {
    boardTransformFrame = 0;
    const nextRect = pendingTransformRect || elements.board.getBoundingClientRect();
    pendingTransformRect = null;
    paintBoardTransform(nextRect);
  });
}

/**
 * The board is a pattern drawn into a canvas of its own, not a tiled background on the board. A 2048px
 * element with a repeating texture has to be produced at device resolution whenever the whole board is
 * in view, which on a phone means a 6144px texture - past what the GPU will hold - so the browser hands
 * parts of it back empty, and a reader sees blank squares the size of the board tile. A canvas has a
 * bitmap whose size we choose (boardBitmapSize), so the texture stays inside every limit and the pattern
 * is drawn into it once per size. The canvas sits inside the transformed element, so the board still
 * scales, pans and stays aligned with the notes.
 */
/**
 * The pattern the reader picked for their board, kept in this browser and falling back to the
 * catalogue's own when they have not picked one.
 */
let boardTextureChoice = boardTextureUrl(localStorage.getItem(BOARD_TEXTURE_KEY) || '');
// Set while the reader's own pattern is failing to load, so the catalogue's pattern is painted
// without forgetting the address they typed.
let boardTextureFallback = false;

/** The address the canvas is painted from. */
function boardTextureSource() {
  return (!boardTextureFallback && boardTextureChoice) || DEFAULT_BOARD_TEXTURE_URL;
}

function sayBoardStyle(message, error = false) {
  status(elements.boardStyleStatus, message, error);
}

/** Draw the pattern choices, marking the one the board is using now. */
function renderBoardTextures() {
  const group = elements.boardTextureOptions;
  if (!group) return;
  group.replaceChildren();
  const current = boardTextureSource();
  for (const texture of BOARD_TEXTURES) {
    const selected = texture.url === current;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'board-texture';
    button.dataset.textureUrl = texture.url;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    const swatch = document.createElement('span');
    swatch.className = 'board-texture__swatch';
    swatch.style.backgroundImage = `url("${texture.url}")`;
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'board-texture__label';
    label.textContent = texture.label;
    button.append(swatch, label);
    button.addEventListener('click', () => applyBoardTexture(texture.url));
    group.append(button);
  }
}

function openBoardStyle() {
  renderBoardTextures();
  elements.boardTextureUrl.value = boardTextureChoice;
  sayBoardStyle('');
  showDialog(elements.boardStyleDialog);
  requestAnimationFrame(() => elements.boardTextureUrl.focus());
}

/** Paint the board with `url` ('' means the catalogue's own) and remember the choice here. */
function applyBoardTexture(url) {
  boardTextureChoice = url;
  if (url) localStorage.setItem(BOARD_TEXTURE_KEY, url);
  else localStorage.removeItem(BOARD_TEXTURE_KEY);
  // The canvas repaints when its size changes or its flag is cleared, and a new pattern does not
  // change the size: clearing the flag is what tells it the picture is new.
  boardTexture.ready = false;
  boardTextureFallback = false;
  elements.boardPaint.dataset.painted = '';
  loadBoardImage();
  renderBoardTextures();
  elements.boardStyleDialog.close();
  status(elements.boardStatus, url ? `Board pattern: ${boardTextureLabel(url)}.` : 'Board pattern: the default.');
  elements.boardStatus.hidden = false;
  setTimeout(() => { elements.boardStatus.hidden = true; }, 3000);
}

const boardTexture = {image: null, ready: false, timer: 0};

function loadBoardImage() {
  const source = boardTextureSource();
  const image = new Image();
  image.decoding = 'async';
  image.addEventListener('load', () => { boardTexture.image = image; boardTexture.ready = true; paintBoard(); }, {once: true});
  // A pattern that will not load leaves the canvas unpainted, and the colour under it is what
  // the reader sees. Going back to the catalogue's own pattern is the one repair that always has
  // a chance of working, and the choice is cleared first so a second failure cannot loop.
  image.addEventListener('error', () => {
    if (boardTextureChoice && !boardTextureFallback) {
      // The address stays where the reader put it: a pattern that is down today may be up
      // tomorrow, and forgetting what they typed is a worse failure than painting the
      // catalogue's own pattern for now.
      boardTextureFallback = true;
      elements.boardPaint.dataset.painted = '';
      status(elements.boardStatus, 'That pattern could not be loaded. The board keeps its own.');
      elements.boardStatus.hidden = false;
      loadBoardImage();
      return;
    }
    status(elements.boardStatus, 'That board pattern could not be loaded.', true);
    elements.boardStatus.hidden = false;
  }, {once: true});
  image.src = source;
}

function paintBoard() {
  const canvas = elements.boardPaint;
  if (!canvas || !boardTexture.ready) return;
  const side = boardBitmapSize(boardView.scale, devicePixelRatio || 1, boardSize.width);
  if (canvas.width === side && canvas.dataset.painted === '1') return;
  canvas.width = side;              // setting the size also clears the bitmap
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (!context) return;
  const pattern = context.createPattern(boardTexture.image, 'repeat');
  if (!pattern) return;
  // A pattern is painted at the tile its catalogue entry asks for, whatever its file's own
  // dimensions are: a 24px weave would otherwise repeat far finer than the board's own tile,
  // and a pattern a reader linked would tile by whatever size its file arrived at.
  const texture = BOARD_TEXTURES.find(entry => entry.url === boardTextureSource());
  const scale = boardPatternScale(side, boardSize.width,
    boardTexture.image.naturalWidth || BOARD_IMAGE_PX, boardTextureTile(texture));
  context.imageSmoothingQuality = 'high';
  context.scale(scale, scale);
  context.fillStyle = pattern;
  // filled in the pattern's own coordinates: the whole board, once scaled
  context.fillRect(0, 0, Math.ceil(side / scale), Math.ceil(side / scale));
  canvas.dataset.painted = '1';
}

function scheduleBoardPaint() {
  // A pinch changes the scale every frame and only the settled value matters, so the bitmap is
  // resized once the view stops rather than during the gesture.
  if (boardTexture.timer) clearTimeout(boardTexture.timer);
  boardTexture.timer = setTimeout(() => { boardTexture.timer = 0; paintBoard(); }, 150);
}

/**
 * Chrome the board has to leave room for: fixed (or sticky) bars that run across the page's foot and
 * therefore paint over the board's own bottom edge. Only such chrome counts - a floating button over
 * the board is not something the board should shrink for, and a footer inside a dialog belongs to that
 * dialog, not to the page.
 */
const BOARD_CHROME_SELECTOR = '[data-live-footer], footer.footer, .site-footer, #footer';

function boardChromeBottom() {
  const viewport = window.innerHeight || 0;
  if (!viewport) return 0;
  let covered = 0;
  for (const node of document.querySelectorAll(BOARD_CHROME_SELECTOR)) {
    if (node.closest('dialog, [role="dialog"], .modal, [aria-modal="true"]')) continue;
    const placement = getComputedStyle(node).position;
    if (placement !== 'fixed' && placement !== 'sticky') continue;
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) continue;
    if (rect.width < window.innerWidth * 0.6) continue;
    if (rect.top < viewport * 0.5) continue;
    covered = Math.max(covered, Math.min(viewport, viewport - rect.top));
  }
  return Math.round(covered);
}

/**
 * Hand the measurement to the stylesheet as the board's bottom inset. Where a page has no such chrome
 * the variable is removed, so nothing is left behind to affect a board that never needed it.
 */
function applyBoardChrome() {
  const covered = boardChromeBottom();
  if (covered > 0) document.documentElement.style.setProperty('--board-chrome-bottom', `${covered}px`);
  else document.documentElement.style.removeProperty('--board-chrome-bottom');
  return covered;
}

function applyBoardSize() {
  // Keep the runtime dimensions tied to the same fixed coordinate space as the first CSS paint.
  elements.canvas.style.width = `${boardSize.width}px`;
  elements.canvas.style.height = `${boardSize.height}px`;
  if (elements.boardPaint) {
    elements.boardPaint.style.width = `${boardSize.width}px`;
    elements.boardPaint.style.height = `${boardSize.height}px`;
  }
}

function fillBoard() {
  const rect = elements.board.getBoundingClientRect();
  boardView.scale = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, BOARD_OPEN_COVER * Math.max(
    rect.width / boardSize.width,
    rect.height / boardSize.height,
  )));
  boardView.x = (rect.width - boardSize.width * boardView.scale) / 2;
  boardView.y = (rect.height - boardSize.height * boardView.scale) / 2;
  // Before the transform this fit is about to apply, so the transition is in place for it; the
  // first fit runs with boardSettled still false and is therefore not animated.
  animateBoardZoom();
  boardSettled = true;
  applyBoardTransform(rect);
}

function setZoom(nextScale, clientX = innerWidth / 2, clientY = innerHeight / 2, rect = null, deferred = false) {
  rect ||= elements.board.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const worldX = (pointX - boardView.x) / boardView.scale;
  const worldY = (pointY - boardView.y) / boardView.scale;
  boardView.scale = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, nextScale));
  boardView.x = pointX - worldX * boardView.scale;
  boardView.y = pointY - worldY * boardView.scale;
  if (deferred) scheduleBoardTransform(rect);
  else {
    animateBoardZoom();
    applyBoardTransform(rect);
  }
}

function clearRevealedFilteredNote() {
  clearInterval(revealedFilteredNoteTimer);
  revealedFilteredNoteTimer = null;
  if (revealedFilteredNoteId) {
    const note = noteEvents.get(revealedFilteredNoteId)?.element;
    note?.classList.remove('sticky-note--filter-revealed');
    note?.querySelector('.sticky-note__reveal-countdown')?.remove();
  }
  revealedFilteredNoteId = '';
  revealedFilteredNoteUntil = 0;
}

function revealFilteredNote(id) {
  const note = noteEvents.get(id)?.element;
  if (!note?.classList.contains('sticky-note--filtered-out')) return;
  if (revealedFilteredNoteId !== id) clearRevealedFilteredNote();
  revealedFilteredNoteId = id;
  revealedFilteredNoteUntil = Date.now() + 60000;
  note.classList.add('sticky-note--filter-revealed');
  let countdown = note.querySelector('.sticky-note__reveal-countdown');
  if (!countdown) {
    countdown = document.createElement('span');
    countdown.className = 'sticky-note__reveal-countdown';
    note.appendChild(countdown);
  }
  const tick = () => {
    if (revealedFilteredNoteId !== id) return;
    const seconds = Math.max(0, Math.ceil((revealedFilteredNoteUntil - Date.now()) / 1000));
    countdown.textContent = `${seconds}s`;
    countdown.setAttribute('aria-label', `Temporarily revealed for ${seconds} more seconds`);
    if (!seconds) clearRevealedFilteredNote();
  };
  clearInterval(revealedFilteredNoteTimer);
  tick();
  revealedFilteredNoteTimer = setInterval(tick, 1000);
}

function installFilteredNoteLongPress(note, id) {
  let timer = null;
  let origin = null;
  const cancel = () => { clearTimeout(timer); timer = null; origin = null; };
  note.addEventListener('pointerdown', event => {
    if (!note.classList.contains('sticky-note--filtered-out') || event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    note.setPointerCapture(event.pointerId);
    origin = {x: event.clientX, y: event.clientY};
    timer = setTimeout(() => {
      revealFilteredNote(id);
      navigator.vibrate?.(35);
      timer = null;
    }, 4000);
  });
  note.addEventListener('pointermove', event => {
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) cancel();
  });
  note.addEventListener('pointerup', cancel);
  note.addEventListener('pointercancel', cancel);
}

// ---- pins for the notes that other notes have covered
let buriedPinLayerElement = null;
let buriedPinFrame = 0;
let raisedNoteId = '';
let raisedNoteTimer = null;
let raisedNoteLayer = 460;

/**
 * One layer for every pin that cannot be reached, laid over the whole canvas.
 *
 * A note's pin lives inside the note, and a note is transformed — which makes it a stacking
 * context — so no pin can be raised out of the note that covers it from the inside. The buried
 * notes' pins are therefore drawn again in a layer of their own, above every note, each one a
 * stand-in for its note: the same box, the same transform, the same pin, and nothing else.
 */
function buriedPinLayer() {
  if (!buriedPinLayerElement || !buriedPinLayerElement.isConnected) {
    buriedPinLayerElement = document.createElement('div');
    buriedPinLayerElement.className = 'board-pin-layer';
    elements.canvas.appendChild(buriedPinLayerElement);
  }
  return buriedPinLayerElement;
}

/** The notes the board is drawing, in the order it draws them: later ones lie on top. */
function drawnNotes() {
  return [...elements.canvas.querySelectorAll('.sticky-note')]
    .filter(element => !element.classList.contains('sticky-note--placing')
      && !element.classList.contains('draft-note'));
}

function drawBuriedPins() {
  buriedPinFrame = 0;
  const layer = buriedPinLayer();
  layer.replaceChildren();
  if (!showBuriedPins) return;
  const ids = new Map();
  noteEvents.forEach((record, id) => { if (record.element) ids.set(record.element, id); });
  const notes = drawnNotes().map(element => ({
    id: ids.get(element),
    box: {left: element.offsetLeft, top: element.offsetTop,
      width: element.offsetWidth, height: element.offsetHeight},
  }));
  for (const id of coveredPinNotes(notes)) {
    // The note already in front needs no way in: its own pin is reachable where it stands. A
    // note the filter is hiding is skipped too — it has no pin to reach at all.
    if (id === raisedNoteId) continue;
    const record = noteEvents.get(id);
    if (record?.element?.classList.contains('sticky-note--filtered-out')) continue;
    if (record?.element?.isConnected) layer.appendChild(buriedPinProxy(record));
  }
}

/**
 * Coalesce the redraws. One board pass renders many notes, and each rendered note would
 * otherwise walk every other note; a frame's wait costs nothing and a reader cannot see it.
 */
function scheduleBuriedPins() {
  if (!showBuriedPins) {
    if (buriedPinFrame) { cancelAnimationFrame(buriedPinFrame); buriedPinFrame = 0; }
    buriedPinLayerElement?.replaceChildren();
    return;
  }
  if (buriedPinFrame) return;
  buriedPinFrame = requestAnimationFrame(drawBuriedPins);
}

function buriedPinProxy(record) {
  const note = record.element;
  const style = getComputedStyle(note);
  const proxy = document.createElement('div');
  proxy.className = 'board-pin-layer__note';
  proxy.style.left = `${note.offsetLeft}px`;
  proxy.style.top = `${note.offsetTop}px`;
  proxy.style.width = `${note.offsetWidth}px`;
  proxy.style.height = `${note.offsetHeight}px`;
  // The note's own resolved transform and origin, so the stand-in stands exactly where the
  // note stands: the same tilt about the same centre, which is what puts the pin where the
  // reader can see the note's pin poking out from under the pile.
  proxy.style.transform = style.transform;
  proxy.style.transformOrigin = style.transformOrigin;
  const ownPin = note.querySelector('.sticky-note__pin');
  const ownArt = note.querySelector('.sticky-note__pin-art');
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = 'sticky-note__pin';
  pin.setAttribute('aria-label', 'Open this note\u2019s details and bring it to the front');
  pin.style.setProperty('--pin-left', ownPin?.style.getPropertyValue('--pin-left') || '50%');
  if (ownArt) {
    const art = document.createElement('img');
    art.className = 'sticky-note__pin-art';
    art.alt = '';
    art.decoding = 'async';
    art.src = ownArt.getAttribute('src');
    pin.appendChild(art);
  }
  // The details open exactly as a pin has always opened them, and the note comes up over the
  // pile behind them: details of a note the reader still cannot read are of no use.
  pin.addEventListener('click', click => {
    click.stopPropagation();
    openNoteMenu(record.sticky.id, pin);
    raiseNote(record.sticky.id);
  });
  proxy.appendChild(pin);
  return proxy;
}

/**
 * Lift one note over the others for `PIN_RAISE_MS`, then put it back where it belongs.
 *
 * The lift is an inline z-index, which the board otherwise never sets — notes are laid out in
 * the order they were written and the browser stacks them in that order. The value climbs with
 * each lift so a second note comes up over the first, and stays clear of the two layers the
 * board does use: a revealed filtered note (490) and one being placed (500).
 */
function raiseNote(id) {
  clearTimeout(raisedNoteTimer);
  const previous = raisedNoteId && raisedNoteId !== id ? noteEvents.get(raisedNoteId)?.element : null;
  if (previous) { previous.classList.remove('sticky-note--raised'); previous.style.zIndex = ''; }
  const element = noteEvents.get(id)?.element;
  if (!element) { raisedNoteId = ''; return; }
  raisedNoteLayer = raisedNoteLayer >= 480 ? 460 : raisedNoteLayer + 2;
  element.style.zIndex = String(raisedNoteLayer);
  element.classList.add('sticky-note--raised');
  raisedNoteId = id;
  scheduleBuriedPins();
  raisedNoteTimer = setTimeout(() => {
    element.classList.remove('sticky-note--raised');
    element.style.zIndex = '';
    raisedNoteId = '';
    scheduleBuriedPins();
  }, PIN_RAISE_MS);
}

function renderNote(sticky, event = null, temporary = false) {
  // An expired note is never drawn, whatever path asked for it: the relay should not send
  // one, but a stored flow or a note that crossed its moment between the send and this line
  // must not reach the board. Checked here, at the one funnel every render passes through.
  if (isStickyExpired(sticky)) return null;
  if (!temporary && rendered.has(sticky.id)) return null;
  if (!temporary) rendered.add(sticky.id);
  const note = document.createElement('article');
  note.className = `sticky-note sticky-note--${sticky.color} sticky-note--font-${sticky.font || 'typewriter'}${temporary ? ' sticky-note--placing' : ''}`;
  note.classList.toggle('sticky-note--dense', stickyNoteLength(sticky.content) > 280);
  // A note that carries a picture is drawn as the print that picture was pressed into. The
  // footprint is deliberately the note's own — the class adds the white paper and the
  // instant-print border, never a size — so a print sits in the same sticky layer as the
  // paper beside it, and pans, zooms and expires with it rather than beside it.
  const picture = String(sticky.image || '');
  note.classList.toggle('sticky-note--print', Boolean(picture));
  if (sticky.id) note.dataset.eventId = sticky.id;
  note.dataset.createdAt = String(sticky.createdAt || 0);
  note.tabIndex = temporary ? 0 : -1;
  const text = document.createElement('div');
  text.className = 'sticky-note__text';
  const textContent = document.createElement('span');
  renderNoteContent(textContent, sticky.content);
  text.appendChild(textContent);
  if (picture) {
    // A print is the picture and nothing else. The paper holds the image and the note's own
    // signature sits in the band at its foot, exactly as it does on a written note; the words
    // are not printed on it, because a pinned picture needs none. The text element is therefore
    // never attached here, and the picture takes the whole paper instead of sharing it.
    const print = document.createElement('figure');
    print.className = 'sticky-note__print';
    const photo = document.createElement('img');
    photo.className = 'sticky-note__print-image';
    photo.decoding = 'async';
    photo.loading = 'lazy';
    photo.alt = sticky.content ? `A pinned picture: ${sticky.content}` : 'A picture pinned on this board';
    photo.src = picture;
    print.append(photo);
    note.appendChild(print);
  } else {
    note.appendChild(text);
  }
  if (!temporary) {
    installFilteredNoteLongPress(note, sticky.id);
    const pin = document.createElement('span');
    pin.className = 'sticky-note__pin';
    pin.setAttribute('role', 'button');
    pin.tabIndex = 0;
    pin.setAttribute('aria-label', 'Open note details');
    // A picture holds the note down. The colour comes from the note's own event id, so it is
    // random between notes and identical every time this note is drawn; the button keeps the
    // note menu reachable, exactly as the painted dot did.
    const pinSeed = sticky.id || `${sticky.pubkey}:${sticky.createdAt}`;
    pin.style.setProperty('--pin-left', `${pinLeftFor(pinSeed)}%`);
    const pinArt = document.createElement('img');
    pinArt.className = 'sticky-note__pin-art';
    pinArt.alt = '';
    pinArt.decoding = 'async';
    pinArt.src = `/img/pin_${pinColourFor(pinSeed)}.png`;
    pin.appendChild(pinArt);
    pin.addEventListener('click', click => {
      click.stopPropagation();
      if (note.classList.contains('sticky-note--filtered-out') && !note.classList.contains('sticky-note--filter-revealed')) return;
      openNoteMenu(sticky.id, pin);
    });
    pin.addEventListener('keydown', key => {
      if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); openNoteMenu(sticky.id, pin); }
    });
    note.appendChild(pin);
    const author = document.createElement('span');
    author.className = 'sticky-note__author';
    labelNoteAuthor(author, sticky);
    note.appendChild(author);
    // How this note was paid for, in the foot's other corner: the signature on the right is
    // the writer's, this on the left is the reader's. It is drawn from the note's own tag,
    // never from anything this browser remembers, and a word the board does not know draws
    // nothing at all rather than a payment that was never made.
    const badge = stickyPaymentBadge(sticky.paid);
    if (badge) {
      const paid = document.createElement('span');
      paid.className = `sticky-note__paid sticky-note__paid--${badge.id}`;
      paid.title = badge.title;
      paid.setAttribute('aria-label', badge.title);
      const icon = document.createElement('i');
      icon.className = `lni ${badge.icon}`;
      icon.setAttribute('aria-hidden', 'true');
      paid.appendChild(icon);
      note.appendChild(paid);
    }
  }
  noteAtPlacement(note, sticky);
  const nextNewer = [...elements.canvas.querySelectorAll('.sticky-note:not(.sticky-note--placing)')]
    .find(existing => Number(existing.dataset.createdAt || 0) > Number(sticky.createdAt || 0));
  elements.canvas.insertBefore(note, nextNewer || placingNote || null);
  // A print's words sit in a fixed band at the foot, in the caption's own size: there is
  // nothing to fit there, and measuring it would only shrink a paper that has no text on it.
  if (!picture) {
    fitPublishedTypography(note, text, textContent, sticky.font || 'typewriter');
    document.fonts?.ready?.then(() => {
      if (note.isConnected) fitPublishedTypography(note, text, textContent, sticky.font || 'typewriter');
    });
  }
  if (!temporary && event) noteEvents.set(sticky.id, {event, sticky, element: note});
  // Limits such as "last 5" must be recalculated whenever a newer note arrives.
  if (!temporary) applyNoteFilters();
  if (!temporary) scheduleBuriedPins();
  return note;
}

/** Take every note that has passed its NIP-40 moment off the board. True when any went. */
function dropExpiredNotes() {
  let dropped = false;
  noteEvents.forEach((record, id) => {
    if (!isStickyExpired(record.sticky)) return;
    record.element.remove();
    noteEvents.delete(id);
    rendered.delete(id);
    dropped = true;
  });
  return dropped;
}

function shortAuthor(pubkey) {
  try { return shortNpub(window.NostrTools.nip19.npubEncode(pubkey)); } catch { return 'Nostr user'; }
}

function connectBoard(version = boardConnectionVersion) {
  if (!activeGeohash) {
    status(elements.boardStatus, 'Choose a geohash to open its board.');
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
    socket.send(JSON.stringify(['REQ', subscription, noteFilter]));
  });
  socket.addEventListener('message', message => {
    try {
      const data = JSON.parse(message.data);
      if (data[0] === 'EOSE' && data[1] === subscription) {
        clearTimeout(timeout);
        elements.boardStatus.hidden = true;
        applyNoteFilters();
        // The relay has sent everything it stores for this board and the notes are drawn: this is
        // the moment a picture of the board is whole. Rendered on the next frame, so nothing is
        // captured with the layout still settling.
        if (cardMode) requestAnimationFrame(() => { document.documentElement.dataset.pinstrCard = 'ready'; });
        return;
      }
      if (data[0] !== 'EVENT' || data[1] !== subscription || !window.NostrTools.verifyEvent(data[2])) return;
      const event = data[2];
      const sticky = parseStickyEvent(event);
      // NIP-40: an expired note is gone. The relay should not be sending one at
      // all, and a note that expires between the send and this line is dropped here.
      if (!sticky || isStickyExpired(sticky) || !noteBelongsToBoard(sticky)) return;
      renderNote(sticky, event);
    } catch {}
  });
  socket.addEventListener('error', () => {
    clearTimeout(timeout);
    // A notice outranks this: a reader who has a note to pin must not lose the reason
    // to a board that is merely unreachable.
    if (elements.boardStatus.dataset.notice) return;
    status(elements.boardStatus, 'The Nostr board is temporarily unavailable.', true);
  });
  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    if (boardSocket === socket) boardSocket = null;
    if (!document.hidden && version === boardConnectionVersion) {
      setTimeout(() => {
        if (version === boardConnectionVersion && (!boardSocket || boardSocket.readyState > WebSocket.OPEN)) connectBoard(version);
      }, 5000);
    }
  }, {once: true});
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
  return `Satoshi.si stops showing it around ${when} and deletes its relay copy. Other relays, apps, archives, or screenshots may keep it.`;
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
  const length = stickyNoteLength(normaliseStickyText(editorContent()));
  const full = length >= STICKY_MAX_CHARACTERS;
  const almostFull = !full && length >= Math.floor(STICKY_MAX_CHARACTERS * .9);
  elements.draft.classList.toggle('sticky-note--dense', length > 280);
  elements.capacity.classList.toggle('is-almost-full', almostFull);
  elements.capacity.classList.toggle('is-full', full);
  if (!length) elements.capacity.textContent = 'The paper is empty';
  else if (full) elements.capacity.textContent = 'The note is full';
  else elements.capacity.textContent = `${STICKY_MAX_CHARACTERS - length} characters left`;
}

function handleEditorInput() {
  if (editorPasting) {
    // The paste listener converts first and calls back here afterwards.
    updateCapacity();
    return;
  }
  // A finished address is drawn as the word the paper prints before anything is measured: five
  // thousand characters of query string drawn as `link` must not measure as five thousand.
  drawLinkChipsInEditor();
  const text = elements.editor.textContent;
  const published = normaliseStickyText(editorContent());
  elements.draft.classList.toggle('sticky-note--dense', stickyNoteLength(published) > 280);
  if (stickyNoteLength(published) > STICKY_MAX_CHARACTERS) {
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

function validateHashtags() {
  const issue = stickyHashtagIssue(elements.hashtags.value);
  elements.hashtags.classList.toggle('is-invalid', Boolean(issue));
  elements.hashtags.setAttribute('aria-invalid', String(Boolean(issue)));
  elements.hashtagStatus.classList.toggle('is-error', Boolean(issue));
  const tags = normaliseStickyHashtags(elements.hashtags.value);
  elements.hashtagStatus.textContent = issue || (tags.length ? tags.map(tag => `#${tag}`).join(' · ') : '');
  elements.pay.disabled = Boolean(issue);
  return {issue, tags};
}

// ---------------------------------------------------------------- pinned pictures
// The five grades come from the model (STICKY_IMAGE_GRADES), which is also what the upload
// query names, so the look the reader picks is the look the desk applies. The previews are
// drawn here from that same list, on the reader's OWN picture as soon as they have chosen one,
// so a look is judged on the picture it will be printed on. Until then they are drawn on a
// sample painted in code: the choice can be made before anything is sent, offline, and without
// a file ever being read into the page.
const PREVIEW_PIXELS = 120;

/** The reader's own picture, decoded once for the previews; null until they choose one. */
let pickedPreview = null;
let pickedPreviewUrl = '';

/** The one sample every grade is drawn on until a picture is chosen: a postcard, painted in code. */
function paintSamplePicture(context, size) {
  const sky = context.createLinearGradient(0, 0, 0, size * .7);
  sky.addColorStop(0, '#8fc6e8');
  sky.addColorStop(1, '#f4d9a6');
  context.fillStyle = sky;
  context.fillRect(0, 0, size, size * .7);
  context.fillStyle = '#f6e7b0';
  context.beginPath();
  context.arc(size * .68, size * .26, size * .11, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#6d8f5a';
  context.beginPath();
  context.moveTo(0, size * .72);
  context.lineTo(size * .36, size * .42);
  context.lineTo(size * .72, size * .72);
  context.closePath();
  context.fill();
  context.fillStyle = '#4f6b42';
  context.beginPath();
  context.moveTo(size * .42, size * .74);
  context.lineTo(size * .78, size * .5);
  context.lineTo(size, size * .74);
  context.closePath();
  context.fill();
  context.fillStyle = '#c9b48b';
  context.fillRect(0, size * .74, size, size * .26);
  context.strokeStyle = '#8d7a55';
  context.lineWidth = Math.max(1, size / 60);
  for (let index = 0; index < 4; index += 1) {
    const post = size * (.12 + index * .24);
    context.beginPath();
    context.moveTo(post, size * .76);
    context.lineTo(post, size);
    context.stroke();
  }
}

/**
 * Cover the whole mat with the picture, as the print itself does: what is stored keeps the
 * photograph's own shape and is drawn to fill, so a preview that letterboxed would be showing
 * a different picture than the one the board ends up with.
 */
function drawCovered(context, source, size) {
  const width = Number(source.naturalWidth) || Number(source.width) || size;
  const height = Number(source.naturalHeight) || Number(source.height) || size;
  const scale = Math.max(size / width, size / height);
  context.drawImage(source, (size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale);
}

/**
 * Speckle that lands in the same place every time. A preview is repainted whenever the reader
 * changes their mind, and grain that moved between repaints would make two views of one look
 * look like two looks.
 */
function speckle(index) {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * One grade, drawn: the picture through that grade's own filter, then its tint and its grain.
 * The filter is set on the context, so a browser without canvas filters shows the picture
 * ungraded rather than nothing — the tint and the grain still tell the grades apart.
 */
function paintGradePreview(canvas, grade) {
  const size = Number(canvas.width) || PREVIEW_PIXELS;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, size, size);
  context.save();
  if (grade.filter && grade.filter !== 'none') context.filter = grade.filter;
  if (pickedPreview) drawCovered(context, pickedPreview, size);
  else paintSamplePicture(context, size);
  context.restore();
  if (grade.tint) {
    context.save();
    context.fillStyle = grade.tint;
    context.fillRect(0, 0, size, size);
    context.restore();
  }
  if (grade.grain) {
    context.save();
    const specks = Math.round(size * size * grade.grain * .04);
    for (let index = 0; index < specks; index += 1) {
      context.fillStyle = index % 2 ? 'rgba(28,22,14,.3)' : 'rgba(255,255,255,.32)';
      context.fillRect(speckle(index * 2) * size, speckle(index * 2 + 1) * size, 1, 1);
    }
    context.restore();
  }
}

/**
 * Take up the picture the reader chose, or let it go. A GIF is decoded like any other picture:
 * the browser animates it wherever it is shown in the page, and a canvas — which is a still —
 * draws the frame it is on when the grade is drawn. The print keeps its motion because the desk
 * stores the animation itself, not this still.
 */
async function loadPickedPreview(file) {
  releasePickedPreview();
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await (image.decode ? image.decode() : new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    }));
  } catch {
    // A file the browser cannot draw is not refused here — the desk has the last word on what
    // it will take — and the grades simply keep showing the sample.
    URL.revokeObjectURL(url);
    return;
  }
  pickedPreview = image;
  pickedPreviewUrl = url;
}

/** Let the picture go with its object URL, so a chosen file is not held after its note is done. */
function releasePickedPreview() {
  if (pickedPreviewUrl) URL.revokeObjectURL(pickedPreviewUrl);
  pickedPreview = null;
  pickedPreviewUrl = '';
}

/** Draw every look again: over the picture just chosen, or back over the sample. */
function repaintImagePreviews() {
  elements.noteImageGradeList?.querySelectorAll('[data-grade]').forEach(button => {
    const grade = stickyImageGrade(button.dataset.grade);
    const canvas = button.querySelector('canvas');
    if (grade && canvas) paintGradePreview(canvas, grade);
  });
  paintImagePreview();
  if (elements.noteImageGradesHint) {
    elements.noteImageGradesHint.textContent = pickedPreview
      ? 'Every look is drawn on your picture, as the print would carry it.'
      : 'Every look is drawn on a sample picture until you choose yours.';
  }
}

/** The six mockups, built once, as the radio group the reader picks a look from. */
function renderImageGrades() {
  if (!elements.noteImageGradeList || elements.noteImageGradeList.childElementCount) return;
  elements.noteImageGradeList.replaceChildren(...STICKY_IMAGE_GRADES.map(grade => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = grade.id === selectedImageGrade ? 'note-image__grade is-selected' : 'note-image__grade';
    button.dataset.grade = grade.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(grade.id === selectedImageGrade));
    const canvas = document.createElement('canvas');
    canvas.width = PREVIEW_PIXELS;
    canvas.height = PREVIEW_PIXELS;
    canvas.setAttribute('aria-hidden', 'true');
    paintGradePreview(canvas, grade);
    const label = document.createElement('span');
    label.textContent = grade.label;
    button.append(canvas, label);
    button.addEventListener('click', () => selectImageGrade(grade.id));
    return button;
  }));
  paintImagePreview();
}

/** Light the grade the reader picked, and redraw the print below the list to match. */
function selectImageGrade(id) {
  const grade = stickyImageGrade(id) || stickyImageGrade(STICKY_IMAGE_DEFAULT_GRADE);
  selectedImageGrade = grade.id;
  elements.noteImageGradeList?.querySelectorAll('[data-grade]').forEach(button => {
    const chosen = button.dataset.grade === grade.id;
    button.classList.toggle('is-selected', chosen);
    button.setAttribute('aria-checked', String(chosen));
  });
  if (elements.noteImagePreviewLabel) elements.noteImagePreviewLabel.textContent = grade.label;
  paintImagePreview();
}

/** The chosen grade drawn as the print it will become, so a look is chosen, not a name. */
function paintImagePreview() {
  const grade = stickyImageGrade(selectedImageGrade);
  if (grade && elements.noteImagePreview?.getContext) paintGradePreview(elements.noteImagePreview, grade);
}

function setImageStatus(message = '', error = false) {
  if (!elements.noteImageStatus) return;
  elements.noteImageStatus.textContent = message;
  elements.noteImageStatus.classList.toggle('is-error', Boolean(error));
}

/**
 * Written note or pinned picture. Both put the same note on the same board for the same
 * price and the same term; the difference is only where the picture lives — the desk stores
 * it and the note points at it, so the note itself stays as small as a written one.
 */
function selectNoteKind(kind) {
  noteKind = kind === 'image' ? 'image' : 'text';
  elements.noteKind?.querySelectorAll('[data-note-kind]').forEach(button => {
    const chosen = button.dataset.noteKind === noteKind;
    button.classList.toggle('is-selected', chosen);
    button.setAttribute('aria-pressed', String(chosen));
  });
  if (elements.noteImage) elements.noteImage.hidden = noteKind !== 'image';
  // A picture note has no words on it, so the paper and the counter are offered to a written note
  // only: an empty text box, or a placeholder asking for words, invites typing that the print
  // would never show anyone.
  if (elements.draftNote) elements.draftNote.hidden = noteKind === 'image';
  if (elements.composerCount) elements.composerCount.hidden = noteKind === 'image';
  // The heading says what is being pinned, in the word this board uses everywhere else for it.
  if (elements.composerTitle) elements.composerTitle.textContent = noteKind === 'image' ? 'Pin a picture' : 'Pin a note';
  elements.editor.setAttribute('data-placeholder', 'Type here...');
  if (noteKind === 'image') renderImageGrades();
  requestAnimationFrame(() => { fitDraftTypography(); updateCapacity(); });
}

/**
 * Forget the picture of a note that is done or gone, so the next note starts written and no
 * file the reader chose once can ride along onto something else.
 */
function forgetPinnedPicture() {
  selectNoteKind('text');
  chooseNoteImage(null);
  selectImageGrade(STICKY_IMAGE_DEFAULT_GRADE);
}

/** The guard runs on the file's own size, so an oversized picture never leaves the device. */
function chooseNoteImage(file) {
  pickedImage = null;
  setImageStatus('');
  if (!file) {
    // Nothing chosen is a clean input as well, so the field cannot keep showing a file that
    // belongs to a note that is finished or gone.
    if (elements.noteImageFile) elements.noteImageFile.value = '';
    loadPickedPreview(null).then(repaintImagePreviews);
    return;
  }
  const problem = stickyImageIssue(file.size);
  if (problem) {
    setImageStatus(problem, true);
    elements.noteImageFile.value = '';
    loadPickedPreview(null).then(repaintImagePreviews);
    return;
  }
  pickedImage = file;
  setImageStatus(`${file.name || 'Picture'} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
  loadPickedPreview(file).then(repaintImagePreviews);
}

/**
 * Hand the picture to the desk, before the note is pinned. The body is the picture itself —
 * raw bytes, not a form — and the grade and the order the publish belongs to travel in the
 * query. Everything else is the desk's work: it reads the picture, strips its metadata, cuts
 * it down, writes the WebP and applies the grade, then answers with the address the note will
 * carry. The page never sends a processed picture and never keeps one.
 */
async function uploadPinnedImage(file, {orderId, grade}) {
  const problem = stickyImageIssue(file.size);
  if (problem) throw new Error(problem);
  if (!orderId) throw new Error('This note has no order for the picture to belong to.');
  const query = new URLSearchParams({order: orderId, grade});
  const response = await fetch(`${API}/images?${query}`, {
    method: 'POST',
    headers: {'content-type': file.type || 'application/octet-stream'},
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !body.url) {
    // The desk's own words, so a refusal reads here exactly as the desk wrote it.
    throw new Error(body.error || `The picture was refused (${response.status}).`);
  }
  return String(body.url);
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
  // The one place a subscription is bought, so the one place to refuse it for an
  // identity that can never use it: a throwaway key cannot hold a name, the desk prices
  // its one note directly, and a plan bought here would be sats spent on nothing.
  if (session.method === 'anonymous') {
    throw new Error(`This temporary identity cannot hold a subscription. Post anonymously for ${STICKY_ANONYMOUS_PRICE_SATS} sats a note, or log in with your own key to use one.`);
  }
  const order = await api('/orders', {
    method: 'POST',
    body: JSON.stringify({pubkey: session.pubkey, action: 'subscribe', plan: subscribePlan}),
  });
  const sats = stickyOrderPrice(order, stickySubscriptionPrice(subscribePlan, {offPercent: actionInfo.offPercent}));
  savePending({...notePending, subscribeOrderId: order.id, subscribePlan, subscribeSats: sats,
    paidBadge: order.paidBadge || '', status: 'waiting_subscription'});
  // A free plan (a three-character name) has nothing to pay, so there is no
  // invoice and no dialog to pay in: the desk has already put the time on the key.
  // Go straight to the poll that finishes whatever the reader was doing.
  if (sats === 0 || order.freeTier === true) {
    if (statusElement) status(statusElement, 'Your name makes this plan free — finishing what you started...');
    pollPayment();
    return;
  }
  showPaymentPreparing(sats);
  const railReady = await renderPayment(order);
  if (!railReady && order.checkoutLink) location.assign(order.checkoutLink);
  if (statusElement) status(statusElement, `Subscribe for ${sats} sats — the rest continues by itself.`);
  status(elements.paymentStatus, `Waiting for the ${sats}-sat subscription payment...`);
  pollPayment();
}

function shouldBuySubscription(error, session) {
  return session?.method !== 'anonymous'
    && error?.status === 402
    && error?.reason === 'subscription_required';
}

async function startPayment() {
  try {
    status(elements.paymentStatus, '');
    const {issue: hashtagProblem, tags: hashtags} = validateHashtags();
    if (hashtagProblem) throw new Error(hashtagProblem);
    const session = getNostrSession();
    if (!session) { showDialog(elements.login); return; }
    if (session.method === 'anonymous' && session.noteEventId) {
      throw new Error('This anonymous key already posted its one note. Leave anonymous mode, then start again for a fresh key.');
    }
    // The identity the note belongs to: in memory while the composer is open, or read
    // back from the saved note when the page has reloaded since. Signing it with a
    // different key would publish a note its writer cannot remove again.
    const authorKey = composingPubkey || (pending?.action === 'pin' ? String(pending.pubkey || '') : '');
    if (authorKey && authorKey !== session.pubkey) {
      const error = new Error('This note was written by a different Nostr identity. Log out to switch back to the one that wrote it, then pin the note again.');
      error.code = 'identity_changed';
      throw error;
    }
    // The cells the note was written on: in memory while the composer is open, or
    // read back from the saved note when the page has reloaded since — a
    // subscription paid from a wallet app reloads the page under the reader's feet,
    // and refusing then would strand a note they have already paid for.
    const composed = composingGeohashes.length
      ? composingGeohashes
      : (pending?.action === 'pin' && Array.isArray(pending.geohashes) ? pending.geohashes : []);
    if (!activeGeohash || composed.join(',') !== activeGeohashes.join(',')) {
      throw new Error('Choose the geohash board again, then reopen the note.');
    }
    await ensureReadySigner();
    // A picture note carries no words at all: its paper is not even offered, and whatever a
    // written draft left in it is not part of the note — the print has no words on it, so they
    // would be paid for, published, and never shown to anyone.
    const pictureComing = noteKind === 'image';
    const mentions = pictureComing ? [] : editorMentions();
    const content = pictureComing ? '' : normaliseStickyText(editorContent());
    // A written note has to say something. A pinned picture is the note itself, so it may be
    // placed with no words at all — but never with no picture: that is asked here, before
    // anything is ordered, so an empty note cannot reach the desk without one.
    if (!content && !pictureComing) throw new Error('Write something on the note first.');
    if (pictureComing && !pickedImage && !pending?.image) throw new Error('Choose the picture first, then place it.');
    if (!pictureComing && editorOverflows()) throw new Error('The note is too full.');
    elements.pay.disabled = true;
    status(elements.paymentStatus, quotedPrice === 0 ? 'Checking your subscription...' : 'Preparing invoice...');
    if (quotedPrice > 0) showPaymentPreparing(quotedPrice);
    const contentHash = await stickyContentHash(content, selectedColor, selectedFont, globalThis.crypto, {picture: pictureComing});
    // The picture's own digest, when the note has one. A wordless note commits to nothing but the
    // paper and the font, so the desk needs this to tell two of them apart and to keep letting a
    // reader pin picture after picture (see stickyPictureDigest and the desk's duplicateLivePin).
    // Not sent for a written note: there the words are the difference.
    const pictureHash = pictureComing && pickedImage ? await stickyPictureDigest(pickedImage) : '';
    const exactGeohash = elements.exactGeohash.checked;
    const liveliness = livelinessRung().key;
    const notePending = {action: 'pin', content, color: selectedColor, font: selectedFont, liveliness, mentions, hashtags,
      geohash: activeGeohash, geohashes: [...activeGeohashes], exactGeohash, contentHash,
      pubkey: session.pubkey, anonymous: session.method === 'anonymous',
      // A picture note points at what the desk stored. The address rides in the draft with
      // everything else, so a reload between paying and pinning does not lose it; a written
      // note carries none. The grade is kept here too, for the composer's own memory only —
      // it is baked into the stored picture and never travels in the note.
      image: noteKind === 'image' ? String(pending?.image || '') : '',
      imageGrade: noteKind === 'image' ? selectedImageGrade : ''};
    let order;
    try {
      order = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({pubkey: session.pubkey, action: 'pin', contentHash,
          geohash: activeGeohash, geohashes: [...activeGeohashes],
          ...(pictureHash ? {pictureHash} : {}),
          ...(miningRequested ? {pow: true, powName: String(session.profile?.nip05 || '').trim()} : {}),
          geohashMode: exactGeohash ? 'exact' : 'prefix', ...(session.method === 'anonymous' ? {anonymous: true} : {})}),
      });
    } catch (error) {
      // 402 is the desk saying "this key is registered but has no subscription".
      // Buy one now and come back to this note; anything else is a real failure.
      if (!shouldBuySubscription(error, session)) throw error;
      // Mining is the other way to pay for one note, and it is offered here — before the
      // plan chooser is insisted on — because a reader with a NIP-05 name who cannot or
      // will not subscribe has a way to post that costs them time rather than sats. The
      // desk decides whether the work is enough; this only decides whether to offer it.
      const offer = stickyPowOffer({
        method: session.method,
        nip05: session.profile?.nip05,
        bits: await miningDifficulty(),
      });
      showPowOffer(offer);
      if (!subscriptionResolved) {
        subscription = {active: false, prices: error.body?.prices || {}};
        subscriptionResolved = true;
        renderQuotedPrice();
        throw new Error(offer.offered
          ? 'Choose weekly or yearly and subscribe, or tap "Free with POW" to mine this note instead.'
          : 'Choose weekly or yearly, then tap Subscribe & place.');
      }
      await buySubscriptionThen(session, notePending, elements.paymentStatus);
      return;
    }
    if (session.method === 'anonymous' && Number(order?.sats) !== STICKY_ANONYMOUS_PRICE_SATS) {
      throw new Error(`Anonymous posting is waiting for the ${STICKY_ANONYMOUS_PRICE_SATS}-sat price update on the payment service. No invoice was shown.`);
    }
    const sats = stickyOrderPrice(order, session.method === 'anonymous' ? STICKY_ANONYMOUS_PRICE_SATS : STICKY_SUB_WEEK_SATS);
    // The picture goes to the site before anything is placed: the note carries the address the
    // desk hands back, so that address has to exist first. It is the same order as the note —
    // one note, one order — and the guard runs again here, measured on the file itself. A
    // draft that came back without its file (the tab was reclaimed while a wallet app paid)
    // says so rather than pinning a note that points at nothing.
    if (noteKind === 'image' && !notePending.image) {
      if (!pickedImage) throw new Error('Choose the picture again: this page no longer holds the file you picked.');
      status(elements.paymentStatus, 'Sending the picture to the site...');
      notePending.image = await uploadPinnedImage(pickedImage, {orderId: order.id, grade: selectedImageGrade});
    }
    if (sats === 0) {
      // Covered by the subscription the desk just confirmed, or admitted by the mining this
      // order asked for: either way nothing is due, the publish token is already there, and
      // the note goes straight to placing. A mined note is not published yet — the work is
      // counted when "Pin note" is tapped, on the finished note, because the placement and
      // the moment it was written are both part of the id the work has to cover.
      if (!order.paid || !order.publishToken) throw new Error('The payment service did not settle this note. No note was published.');
      stopInvoiceMessages();
      if (elements.paymentDialog.open) elements.paymentDialog.close();
      const powBits = miningRequested ? stickyPowDifficulty({pow: {bits: order.powBits}}) : null;
      miningRequested = false;
      if (miningRequested && !powBits) throw new Error('The payment service did not confirm the mining difficulty. No note was published.');
      if (miningRequested) showPowOffer(null);
      savePending({...notePending, orderId: order.id, sats, status: 'paid', publishToken: order.publishToken,
        paidBadge: order.paidBadge || '', ...(powBits ? {powBits} : {})});
      if (elements.composer.open) elements.composer.close();
      status(elements.boardStatus, powBits
        ? 'Place the note on the board — it will be mined when you pin it.'
        : 'Included in your subscription. Place the note on the board.');
      elements.boardStatus.hidden = false;
      beginPlacement();
      return;
    }
    miningRequested = false;   // this attempt is being paid for in sats, not in work
    savePending({...notePending, orderId: order.id, sats, status: 'waiting'});
    if (!elements.paymentDialog.open) showPaymentPreparing(sats);
    const railReady = await renderPayment(order);
    if (!railReady && order.checkoutLink) location.assign(order.checkoutLink);
    else if (!railReady) status(elements.paymentStatus, 'Preparing invoice...');
    status(elements.paymentStatus, `Waiting for the ${sats}-sat payment...`);
    pollPayment();
  } catch (error) {
    stopInvoiceMessages();
    const closedOverMessage = elements.paymentDialog.open && !pending?.orderId;
    if (closedOverMessage) elements.paymentDialog.close();
    status(elements.paymentStatus, error.message, true);
    // A refusal the reader has to act on must outlive the dialog it was reported in:
    // closing the dialog over the message is how a stranded note looked like nothing had
    // happened at all.
    if (closedOverMessage) {
      status(elements.boardStatus, error.message, true);
      elements.boardStatus.hidden = false;
    }
    validateHashtags();
  }
}

async function pollPayment() {
  clearTimeout(paymentTimer);
  // What this run is polling. The reader can dismiss the invoice while a request is in flight,
  // and the answer to an order that no longer exists must not be reported over what came next.
  const pollingOrderId = pending?.subscribeOrderId || pending?.orderId || '';
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
      stopInvoiceMessages();
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
      await startPayment();
      return;
    } catch (error) {
      if ((pending?.subscribeOrderId || '') !== pollingOrderId) return;
      status(elements.paymentStatus, error.message, true);
      paymentTimer = setTimeout(pollPayment, 2500);
      return;
    }
  }
  if (!pending?.orderId) return;
  try {
    const order = await api(`/orders/${encodeURIComponent(pending.orderId)}`);
    if (pending.sats > 0) await renderPayment(order);
    if (order.paid && order.publishToken) {
      stopInvoiceMessages();
      if (elements.paymentDialog.open) elements.paymentDialog.close();
      savePending({...pending, status: 'paid', publishToken: order.publishToken,
        paidBadge: order.paidBadge || pending.paidBadge || ''});
      if (elements.composer.open) elements.composer.close();
      beginPlacement();
      return;
    }
    if (['expired', 'invalid', 'cancelled'].includes(String(order.status || '').toLowerCase())) throw new Error('The invoice expired. Start again when you are ready.');
    const invoicePending = String(order.status || '').toLowerCase() === 'awaiting_invoice' || !order.payment;
    status(elements.paymentStatus, invoicePending ? 'Preparing invoice...' : 'Waiting for payment...');
    if (invoicePending) startInvoiceMessages();
    paymentTimer = setTimeout(pollPayment, 3000);
  } catch (error) {
    if ((pending?.orderId || '') !== pollingOrderId) return;
    stopInvoiceMessages();
    status(elements.paymentStatus, error.message, true);
    elements.pay.disabled = false;
  }
}

/**
 * The X on the invoice means "I do not want this". The order is unpaid and nothing was
 * published, so the request goes with it instead of being left running behind a closed dialog
 * — and the note goes back to the reader. The composer behind the dialog is untouched, and a
 * pin draft is saved as a note with no order, which the boot already knows how to hand back
 * rather than poll.
 *
 * An order the desk has already paid for is not taken back here: the X cannot un-charge it,
 * and the note it paid for is the reader's.
 */
async function discardInvoice() {
  if (!pending || pending.status === 'paid') return;
  const quotedOrderId = pending.orderId;
  if (quotedOrderId) {
    // The desk may have been paid in the moment before the reader dismissed this invoice: a
    // wallet app is another app, and the poll has not looked again yet. Money that is already
    // in must not be thrown away with the dialog, so ask once — and if it is paid, finish the
    // payment instead of discarding it. No answer is not a reason to keep an invoice the
    // reader has dismissed.
    try {
      const order = await api(`/orders/${encodeURIComponent(quotedOrderId)}`);
      if (order.paid && order.publishToken) { await pollPayment(); return; }
    } catch {}
  }
  clearTimeout(paymentTimer);
  paymentTimer = null;
  stopInvoiceMessages();
  // Only what belonged to the order is dropped: the reader's writing stays theirs.
  const {orderId, sats, status: _status, publishToken, subscribeOrderId, subscribePlan, subscribeSats, ...draft} = pending;
  savePending(draft.action === 'pin' && draft.content ? draft : null);
  elements.pay.disabled = false;
  // Nothing of the discarded invoice is left on the screen to be scanned or copied.
  elements.paymentAmount.textContent = '';
  elements.paymentRails.hidden = true;
  elements.paymentRails.replaceChildren();
  elements.paymentQr.hidden = true;
  elements.paymentQr.removeAttribute('src');
  elements.paymentValue.textContent = '';
  elements.paymentValue.hidden = true;
  elements.copyPayment.hidden = true;
  elements.paymentHint.textContent = '';
  currentRails = [];
  currentRailId = '';
  currentPaymentValue = '';
  status(elements.paymentStatus, 'Invoice discarded. Nothing was charged.');
}

function pendingBelongsToSession() {
  const session = getNostrSession();
  if (!session) return false;
  return !pending?.pubkey || session.pubkey === pending.pubkey;
}

/** Put a saved, unpaid draft back into the editor only for the identity that wrote it. */
function restoreSavedDraft() {
  if (!isStrandedPinDraft() || !pendingBelongsToSession()) return false;
  selectColor(pending.color);
  selectFont(pending.font || 'typewriter');
  elements.exactGeohash.checked = Boolean(pending.exactGeohash);
  elements.hashtags.value = (pending.hashtags || []).join(', ');
  validateHashtags();
  selectLiveliness(pending.liveliness || STICKY_DEFAULT_LIVELINESS);
  // A saved note comes back as whatever it was. A picture note keeps the address the desk
  // already gave it — the file itself cannot survive a reload, and does not have to: the
  // picture lives on the site from the moment it was stored, and the note only points at it.
  selectNoteKind(pending.image ? 'image' : 'text');
  selectImageGrade(pending.imageGrade || STICKY_IMAGE_DEFAULT_GRADE);
  elements.editor.textContent = pending.content;
  lastValidEditor = pending.content;
  composingPubkey = pending.pubkey;
  composingGeohashes = Array.isArray(pending.geohashes) && pending.geohashes.length
    ? [...pending.geohashes]
    : [...activeGeohashes];
  handleEditorInput();
  status(elements.paymentStatus, 'Your saved note is ready.');
  return true;
}

/** Take the unpinned note off the board, keeping the saved note itself. */
function withdrawPlacement() {
  placingNote?.remove();
  placingNote = null;
  elements.placementControls.hidden = true;
  setBinArmed(false);
  elements.discardBin.hidden = true;
  if (elements.discardDialog.open) elements.discardDialog.close();
}

/**
 * An unpinned note belongs to the identity that was pinning it, and it is not on the board
 * while that identity is gone: nobody else can publish it, and sitting there it invites the
 * reader to place something they cannot finish. The saved note stays, so signing back in
 * brings it straight back.
 */
function syncPlacementWithSession() {
  // A picture note has no words, so "has something to place" is its words OR the picture the
  // desk stored for it. Waiting on words alone meant a paid picture note never came back to
  // the board after a reload, and could not be placed at all.
  if (pending?.action === 'pin' && pending?.status === 'paid' && (pending?.content || pending?.image) && pendingBelongsToSession()) {
    beginPlacement();
    return true;
  }
  withdrawPlacement();
  return false;
}

function beginPlacement() {
  // The same rule as the resume above: words, or the picture that is the whole note. Without
  // the picture in this test the composer closed on "Place your note", the placement never
  // appeared, and there was nothing for the reader to pin - the note was paid for, the print
  // was stored, and no publish request was ever made.
  if (pending?.action !== 'pin' || (!pending?.content && !pending?.image) || pending.status !== 'paid') return;
  if (!pendingBelongsToSession()) return;
  placingNote?.remove();
  // The render below inserts before the placement note, so a reference to the node just
  // removed would be a detached anchor and `insertBefore` throws — which is what a second
  // pass over an existing placement did.
  placingNote = null;
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
  placementGestureController?.abort();
  placementGestureController = new AbortController();
  const {signal} = placementGestureController;
  const pointers = new Map();
  let gesture = null;
  // Where the note sat before this drag, so a declined discard can put it back.
  let dragOrigin = null;

  const point = event => ({x: event.clientX, y: event.clientY});
  const angleBetween = () => {
    const [first, second] = [...pointers.values()];
    return Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI;
  };
  const distanceBetween = () => {
    const [first, second] = [...pointers.values()];
    return Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
  };
  const midpoint = () => {
    const [first, second] = [...pointers.values()];
    return {x:(first.x + second.x) / 2, y:(first.y + second.y) / 2};
  };
  const resetSinglePointer = () => {
    const [remaining] = pointers.entries();
    if (!remaining) { gesture = null; return; }
    gesture = {id: remaining[0], startX: remaining[1].x, startY: remaining[1].y, placement: {...currentPlacement()}, rotate: false};
  };

  const beginTwoFingerGesture = () => {
    const center = midpoint();
    const rect = elements.board.getBoundingClientRect();
    const localX = center.x - rect.left;
    const localY = center.y - rect.top;
    gesture = {
      twoFinger:true,
      angle:angleBetween(),
      distance:distanceBetween(),
      scale:boardView.scale,
      worldX:(localX - boardView.x) / boardView.scale,
      worldY:(localY - boardView.y) / boardView.scale,
      placement:{...currentPlacement()},
    };
    dragOrigin = null;
  };

  elements.board.addEventListener('pointerdown', event => {
    if (placingNote !== note || event.button > 0) return;
    event.preventDefault();
    elements.board.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 1) {
      gesture = {id: event.pointerId, startX: event.clientX, startY: event.clientY, placement: {...currentPlacement()}, rotate: event.shiftKey};
      dragOrigin = {...gesture.placement};
    } else if (pointers.size === 2) {
      beginTwoFingerGesture();
    }
  }, {signal});
  elements.board.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size >= 2 && gesture.twoFinger) {
      const center = midpoint();
      const rect = elements.board.getBoundingClientRect();
      boardView.scale = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN,
        gesture.scale * distanceBetween() / gesture.distance));
      boardView.x = center.x - rect.left - gesture.worldX * boardView.scale;
      boardView.y = center.y - rect.top - gesture.worldY * boardView.scale;
      let difference = angleBetween() - gesture.angle;
      if (difference > 180) difference -= 360;
      if (difference < -180) difference += 360;
      setPlacement({...gesture.placement, rotation: gesture.placement.rotation + difference});
      scheduleBoardTransform(rect);
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
  }, {signal});
  const release = event => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) resetSinglePointer();
    else if (!pointers.size) gesture = null;
  };
  elements.board.addEventListener('pointerup', event => {
    const dropped = Boolean(dragOrigin) && Boolean(gesture) && !gesture.twoFinger && !gesture.rotate
      && gesture.id === event.pointerId && isOverBin(event.clientX, event.clientY);
    const origin = dragOrigin;
    dragOrigin = null;
    release(event);
    setBinArmed(false);
    if (dropped) openDiscardDialog(origin);
  }, {signal});
  elements.board.addEventListener('pointercancel', event => { dragOrigin = null; setBinArmed(false); release(event); }, {signal});
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
  }, {signal});
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
  elements.hashtags.value = '';
  validateHashtags();
  forgetPinnedPicture();
  lastValidEditor = '';
  elements.pay.disabled = false;
  updateCapacity();
  status(elements.boardStatus, wasPaid
    ? 'Note discarded. It was never pinned, and the sats you paid are not refunded.'
    : 'Note discarded.');
  elements.boardStatus.hidden = false;
  setTimeout(() => { elements.boardStatus.hidden = true; }, 4500);
}

async function publishPinnedNote(resumedEvent = null, report = null) {
  let published = false;
  try {
    elements.pin.disabled = true;
    if (!resumedEvent) await ensureReadySigner();
    const placement = currentPlacement();
    // A picture note's content is its print's own address: that is what makes any other Nostr
    // client show the picture instead of an empty note, and the desk checks it against the print it
    // stored for this order. A written note's content stays its words.
    const pictureAddress = pending.image ? stickyImageUrl(pending.image) : '';
    const template = makeStickyTemplate({...pending, ...placement, content: pictureAddress || pending.content, liveliness: pending.liveliness || STICKY_DEFAULT_LIVELINESS, anonymous: Boolean(pending.anonymous), paid: pending.paidBadge || ''});
    // The hand-over goes in front of the reader *before* the request leaves for Amber, which is the
    // order the sign-in route has always used (showAmberCopyDialog() then beginAmberLogin()) and the
    // one this device is known to complete. The navigation to the signer happens inside
    // signNostrEvent, so a dialog surfaced only after it returns is never seen on a phone that comes
    // back through no focus and no visibility event — and the button it carries reads the clipboard
    // inside the reader's own tap, where user activation permits the read.
    // Paying with work: the note is complete here — placed, written, and with the moment it
    // was written — so this is the first id that means anything, and the last chance to mine
    // before the signature fixes it. A resumed signature (Amber handed it back) was already
    // mined before it left, so it is not mined again.
    if (!resumedEvent && pending.powBits) {
      const mined = await mineThisNote(template, pending.powBits);
      if (!mined) { elements.pin.disabled = false; return; }
    }
    if (!resumedEvent && getNostrSession()?.method === 'amber') {
      showAmberHandOver(AMBER_HAND_OVER_WAITING_LINE);
    }
    const event = resumedEvent || await signNostrEvent(template, {orderId: pending.orderId, action: 'pin'});
    // A signing request that travels through Amber hands nothing back here: the answer arrives on the
    // clipboard once the reader returns. Saying so is the difference between a wait and a page that
    // looks broken, because in Amber both buttons close the app. The clipboard is then polled for it,
    // because returning fires none of the events the old "read it when the reader comes back" path
    // waited for.
    if (!event) {
      if (amberSignaturePending()) {
        showAmberHandOver(AMBER_HAND_OVER_WAITING_LINE);
        startAmberClipboardPoll();
      }
      return;
    }
    if (!window.NostrTools.verifyEvent(event)) throw new Error('Your signer returned an invalid event.');
    signalStickyFlow('signed', {orderId: pending.orderId});
    const result = await api(`/orders/${encodeURIComponent(pending.orderId)}/publish`, {
      method: 'POST', headers: {authorization: `Bearer ${pending.publishToken}`}, body: JSON.stringify({event}),
    });
    const orderId = pending.orderId;
    const sticky = parseStickyEvent(event);
    if (pending.anonymous) markAnonymousNotePublished(event.id);
    placingNote?.remove(); placingNote = null;
    if (sticky) renderNote(sticky, event);
    elements.placementControls.hidden = true;
    setBinArmed(false);
    elements.discardBin.hidden = true;
    // Signal before clearing the shared draft. Amber may have returned into a browser tab
    // while the installed PWA is still visible; this lets that original board finish too.
    signalStickyFlow('published', {orderId, event, message: result.message || 'Your note is pinned.'});
    // The pin is done on this page, so the hand-over that asked for the signature comes down with it.
    retireAmberHandOver();
    // The flow that launched this publish hears the outcome before anything else, so it can retire
    // its own wait even when this page's reader has already looked away.
    report?.(true, result.message || 'Your note is pinned.');
    savePending(null);
    elements.editor.textContent = '';
    elements.hashtags.value = '';
    validateHashtags();
    forgetPinnedPicture();
    lastValidEditor = '';
    elements.pay.disabled = false;
    published = true;
    elements.pin.querySelector('span').textContent = 'Pinned';
    status(elements.boardStatus, result.message || 'Your note is pinned.');
    elements.boardStatus.hidden = false;
    setTimeout(() => { elements.boardStatus.hidden = true; }, 3500);
  } catch (error) {
    // A second Android context can finish while the first is resuming. The publish endpoint
    // is authoritative: an already-published answer means this paid note is complete.
    if (resumedEvent && ['already_pinned', 'already_published'].includes(error.reason)) {
      signalStickyFlow('published', {orderId: pending?.orderId || '', event: resumedEvent, message: 'Your note is pinned.'});
      retireAmberHandOver();
      savePending(null);
      placingNote?.remove(); placingNote = null;
      elements.placementControls.hidden = true;
      elements.discardBin.hidden = true;
      elements.pin.querySelector('span').textContent = 'Pinned';
      status(elements.boardStatus, 'Your note is pinned.');
      elements.boardStatus.hidden = false;
      published = true;
      report?.(true, 'Your note is pinned.');
      if (activeGeohash) connectBoard();
      return;
    }
    status(elements.boardStatus, error.message, true);
    elements.boardStatus.hidden = false;
    // The desk refused the publish, or the page never reached it. Either way the round trip that
    // handed the signature over has to say so where it was being watched.
    report?.(false, error.message);
  } finally {
    elements.pin.disabled = published;
  }
}

function closeNoteMenu() {
  clearInterval(noteExpiryTimer);
  noteExpiryTimer = null;
  elements.noteMenu.hidden = true;
  elements.noteEventJsonDetails.open = false;
  elements.noteEventJson.textContent = '';
  selectedNoteId = '';
  status(elements.noteMenuStatus, '');
}

function startNoteExpiryCountdown(expiresAt) {
  clearInterval(noteExpiryTimer);
  noteExpiryTimer = null;
  if (!expiresAt) return;
  const tick = () => {
    elements.noteExpiryCountdown.textContent = stickyExpiryCountdown(expiresAt / 1000);
  };
  tick();
  noteExpiryTimer = setInterval(tick, 1000);
}

function keepNoteMenuOnScreen() {
  if (elements.noteMenu.hidden) return;
  const rect = elements.noteMenu.getBoundingClientRect();
  if (rect.bottom > innerHeight - 12) {
    elements.noteMenu.style.top = `${Math.max(12, innerHeight - rect.height - 12)}px`;
  }
}

function openNoteMenu(eventId, pin) {
  const record = noteEvents.get(eventId);
  if (!record) return;
  selectedNoteId = eventId;
  elements.noteEventId.textContent = eventId;
  elements.noteEventJsonDetails.open = false;
  elements.noteEventJson.textContent = JSON.stringify(record.event, null, 2);
  elements.notePostedAt.dateTime = new Date(record.event.created_at * 1000).toISOString();
  elements.notePostedAt.textContent = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(record.event.created_at * 1000);
  // The note's own NIP-40 moment: older notes carry none and show no row.
  const expiresTag = Number(record.event.tags?.find(tag => tag?.[0] === 'expiration')?.[1]);
  const expiresAt = Number.isFinite(expiresTag) && expiresTag > 0 ? expiresTag * 1000 : 0;
  elements.noteExpiresLabel.hidden = !expiresAt;
  elements.noteExpirationValue.hidden = !expiresAt;
  if (expiresAt) {
    elements.noteExpiresAt.dateTime = new Date(expiresAt).toISOString();
    elements.noteExpiresAt.textContent = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(expiresAt);
  }
  startNoteExpiryCountdown(expiresAt);
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

function installBoardNavigation() {
  const pointers = new Map();
  let gesture = null;
  let gestureRect = null;

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
    const rect = gestureRect || elements.board.getBoundingClientRect();
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
    if (placingNote) return;
    // Ordinary paper is part of the board surface: dragging or pinching on it must move
    // the board too. A pin and a note's own link remain buttons, while concealed paper owns a
    // four-second hold.
    if (event.target.closest('.sticky-note__pin, .sticky-note__link, .board-plate')
        || event.target.closest('.sticky-note--filtered-out:not(.sticky-note--filter-revealed)')) return;
    closeNoteMenu();
    elements.board.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point(event));
    gestureRect = elements.board.getBoundingClientRect();
    elements.board.classList.add('is-panning');
    if (pointers.size === 1) resetPan();
    else if (pointers.size === 2) beginPinch();
  });
  elements.board.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, point(event));
    const rect = gestureRect || elements.board.getBoundingClientRect();
    if (pointers.size >= 2 && gesture.pinch) {
      const center = midpoint();
      boardView.scale = Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, gesture.scale * distance() / gesture.distance));
      boardView.x = center.x - rect.left - gesture.worldX * boardView.scale;
      boardView.y = center.y - rect.top - gesture.worldY * boardView.scale;
    } else if (gesture.id === event.pointerId) {
      boardView.x = gesture.boardX + event.clientX - gesture.x;
      boardView.y = gesture.boardY + event.clientY - gesture.y;
    }
    scheduleBoardTransform(rect);
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
      gestureRect = null;
      elements.board.classList.remove('is-panning');
    }
  };
  elements.board.addEventListener('pointerup', stop);
  elements.board.addEventListener('pointercancel', stop);
  elements.board.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = elements.board.getBoundingClientRect();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1;
    const delta = Math.max(-140, Math.min(140, event.deltaY * unit));
    setZoom(boardView.scale * Math.exp(-delta * .0016), event.clientX, event.clientY, rect, true);
  }, {passive: false});
}

/**
 * What the login dialog can honestly offer. A saved bunker connection is the way back in for a
 * reader whose signer is a mobile app: the link they pasted is usually a one-use invitation,
 * so the page must not need it a second time to let them sign in again.
 */
function refreshLoginDialog() {
  const saved = savedBunker();
  elements.bunkerReconnect.hidden = !saved;
  if (saved && !elements.bunker.value) elements.bunker.value = saved.url;
}

async function handleLogin(method) {
  try {
    status(elements.loginStatus, 'Connecting...');
    if (method === 'extension') await loginWithExtension();
    else if (method === 'amber') {
      // A desktop browser has no signer app to hand a request to, but a phone does: it shows a code
      // Amber reads, and the connection is then made over a relay with nothing to copy.
      if (!/Android/i.test(navigator.userAgent || '')) { await showNostrConnectDialog(); return; }
      // Android: the request goes out with no callback URL at all, which is the one return path that
      // cannot be lost between two apps - the signer copies the identity instead. The dialog that
      // follows is where that copy is handed over, so show it before the intent can take the page.
      showAmberCopyDialog();
      beginAmberLogin({copy: true});
      status(elements.amberCopyStatus, 'Approve it in Amber, then come back to this page.');
      return;
    }
    // The pairing route is the NIP-46 flow a desktop reaches through the Amber button, but on a phone
    // it walks the invitation straight into Amber instead of showing a code to be scanned.
    else if (method === 'amber-pair') { await showNostrConnectDialog(); return; }
    else if (method === 'bunker') await loginWithBunker(elements.bunker.value);
    else if (method === 'bunker-saved') await reconnectBunker();
    else if (method === 'anonymous') loginAnonymously();
    else if (method === 'private') {
      loginWithPrivateKey(elements.privateKey.value);
      elements.privateKey.value = '';
    }
    updateAccount();
    status(elements.loginStatus, '');
    elements.login.close();
    if (pending?.status === 'paid') {
      beginPlacement();
    } else {
      showLoginConfirmation(getNostrSession());
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
  if (session.method === 'anonymous' && session.noteEventId) {
    status(elements.boardStatus, 'This one-time key already posted its note. Leave anonymous mode, then start again for a fresh key.');
    elements.boardStatus.hidden = false;
    return;
  }
  const restoredDraft = restoreSavedDraft();
  if (!restoredDraft) {
    composingPubkey = session.pubkey;
    composingGeohashes = [...activeGeohashes];
  }
  // Opening on a stale quote is how the buttons came to describe the wrong identity, so
  // the composer asks again every time it opens.
  refreshPriceQuote(session).catch(() => {});
  if (!restoredDraft && !pending?.orderId) {
    elements.exactGeohash.checked = false;
    // A fresh note starts written. The picture side is cleared with it, so a file chosen for a
    // note that was never pinned cannot quietly ride along on the next one.
    forgetPinnedPicture();
  }
  if (!restoredDraft && !pending?.orderId) elements.hashtags.value = '';
  if (!restoredDraft) selectLiveliness(pending?.liveliness || selectedLiveliness);
  validateHashtags();
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

// ---- a link in a note: the word "link" on the board, the address one confirmation away
const LINK_LABEL = 'link';

function linkRestLabel() {
  return `Show the rest (${elements.linkDialogRest.textContent.length} more characters)`;
}

/** Confirms an address before anything opens: the first 200 characters, the rest behind the arrow. */
function openLinkDialog(href) {
  const safe = linkHref(href);
  if (!safe) return;
  const shown = linkDisplay(safe);
  elements.linkDialogUrl.textContent = shown.head;
  elements.linkDialogRest.textContent = shown.tail;
  elements.linkDialogRest.hidden = true;
  elements.linkExpand.hidden = !shown.truncated;
  elements.linkExpand.classList.remove('is-open');
  elements.linkExpand.setAttribute('aria-expanded', 'false');
  if (shown.truncated) elements.linkExpand.querySelector('span').textContent = linkRestLabel();
  elements.linkOpen.href = safe;
  elements.linkOpen.setAttribute('aria-label', `Open ${shown.truncated ? `${shown.head}…` : shown.head}`);
  if (!elements.linkDialog.open) elements.linkDialog.showModal();
  requestAnimationFrame(() => elements.linkCancel.focus());
}

function toggleLinkRest() {
  const expanded = elements.linkExpand.getAttribute('aria-expanded') === 'true';
  elements.linkExpand.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  elements.linkExpand.classList.toggle('is-open', !expanded);
  elements.linkDialogRest.hidden = expanded;
  elements.linkExpand.querySelector('span').textContent = expanded ? linkRestLabel() : 'Show less';
}

function renderNoteContent(container, content) {
  const parts = stickyTextParts(content);
  parts.forEach((part, index) => {
    // A link chip must never sit welded to the character before it. A note whose text has no
    // space where the address starts - one pasted in that ate the space, or written that way -
    // reads as a single word on the paper otherwise. The stored text stays exactly as written:
    // this is only the drawing, and only where a text run is what touches the chip.
    const previous = parts[index - 1];
    if (part.type === 'link' && index && previous.type === 'text' && !/\s$/.test(previous.text)) {
      container.appendChild(document.createTextNode(' '));
    }
    if (part.type === 'link') {
      const href = linkHref(part.url);
      if (!href) { container.appendChild(document.createTextNode(part.url)); return; }
      const shown = linkDisplay(href);
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'sticky-note__link';
      link.textContent = LINK_LABEL;
      link.title = shown.truncated ? `${shown.head}…` : shown.head;
      link.dataset.href = href;
      link.setAttribute('aria-label', `Open link ${shown.truncated ? `${shown.head}…` : shown.head}`);
      link.addEventListener('click', click => {
        click.stopPropagation();
        openLinkDialog(href);
      });
      container.appendChild(link);
      return;
    }
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
    // A link chip is the word the paper prints; the address it stands for is what travels.
    else if (node.dataset?.href) out += node.dataset.href;
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

// While a paste is being turned into chips the length and fitting guards stand aside: the text
// they would measure is not the text the reader will be left with. They run again, on the converted
// text, when the conversion is done.
let editorPasting = false;

/** Put the caret just after a chip, the way an inserted mention leaves it. */
function caretAfterChip(chip) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const next = chip.nextSibling;
  if (next && next.nodeType === 3) range.setStart(next, 0);
  else range.setStartAfter(chip);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Draw every finished address in the composer as the word the paper prints, keeping the address on
 * the chip. A pasted query string can run to thousands of characters: drawn as itself it fills the
 * note and is refused for not fitting, while the paper will only ever show four characters.
 */
function drawLinkChipsInEditor({force = false} = {}) {
  const editor = elements.editor;
  const selection = window.getSelection();
  const caretNode = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
  const caretOffset = selection && selection.rangeCount ? selection.getRangeAt(0).startOffset : null;
  const nodes = [];
  editor.childNodes.forEach(node => {
    if (node.nodeType === 3) nodes.push(node);
  });
  let changed = false;
  for (const node of nodes) {
    const text = node.textContent || '';
    const matches = linkMatches(text);
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index];
      const caret = caretNode === node ? caretOffset : null;
      if (!linkRunIsComplete(match, text.length, {caret, force})) continue;
      const href = linkHref(match.url);
      if (!href) continue;
      const shown = linkDisplay(href);
      const chip = document.createElement('span');
      chip.className = 'sticky-editor__link';
      chip.contentEditable = 'false';
      chip.dataset.href = href;
      chip.textContent = LINK_LABEL;
      chip.title = shown.truncated ? `${shown.head}…` : shown.head;
      const head = text.slice(0, match.index);
      const rest = text.slice(match.index + match.length);
      const parent = node.parentNode;
      const anchor = node.nextSibling;
      if (head) node.textContent = head;
      else node.remove();
      parent.insertBefore(chip, anchor);
      if (rest) parent.insertBefore(document.createTextNode(rest), chip.nextSibling);
      changed = true;
      if (caretNode === node) caretAfterChip(chip);
    }
  }
  return changed;
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

// ---- board sorting and filters
function readContactListFromRelay(url, pubkey) {
  return new Promise(resolve => {
    const socket = new WebSocket(url);
    const subscription = `sticky-follows-${crypto.randomUUID?.() || Date.now()}`;
    let newest = null;
    let finished = false;
    const finish = reachedRelay => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve({event: newest, reachedRelay: Boolean(reachedRelay)});
    };
    const timer = setTimeout(() => finish(false), 4000);
    socket.addEventListener('open', () => socket.send(JSON.stringify([
      'REQ', subscription, {authors: [pubkey], kinds: [3], limit: 5},
    ])));
    socket.addEventListener('message', message => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EOSE' && data[1] === subscription) { finish(true); return; }
      const event = data[2];
      if (data[0] !== 'EVENT' || data[1] !== subscription || event?.kind !== 3
          || event.pubkey !== pubkey || !window.NostrTools.verifyEvent(event)) return;
      if (!newest || event.created_at > newest.created_at) newest = event;
    });
    socket.addEventListener('error', () => finish(false));
    socket.addEventListener('close', () => finish(false));
  });
}

function namedNostrSession() {
  const session = getNostrSession();
  return session && session.method !== 'anonymous' ? session : null;
}

async function loadFollowList(session = namedNostrSession()) {
  if (!session || followsLoadedFor === session.pubkey || followsLoadingFor === session.pubkey) return;
  followsLoadingFor = session.pubkey;
  status(elements.noteSortStatus, 'Loading your Nostr follows...');
  const results = await Promise.allSettled([
    readContactListFromRelay(RELAY, session.pubkey),
    readContactListFromRelay('wss://relay.damus.io', session.pubkey),
    readContactListFromRelay('wss://nos.lol', session.pubkey),
    readContactListFromRelay('wss://relay.ditto.pub', session.pubkey),
  ]);
  if (getNostrSession()?.pubkey !== session.pubkey) {
    if (followsLoadingFor === session.pubkey) followsLoadingFor = '';
    return;
  }
  const responses = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const newest = responses.filter(response => response.event)
    .map(response => response.event)
    .sort((left, right) => right.created_at - left.created_at)[0];
  if (!newest && !responses.some(response => response.reachedRelay)) {
    followsLoadingFor = '';
    throw new Error('No follow-list relay answered.');
  }
  followedPubkeys = new Set((newest?.tags || [])
    .filter(tag => tag?.[0] === 'p' && /^[0-9a-f]{64}$/.test(String(tag[1] || '').toLowerCase()))
    .map(tag => String(tag[1]).toLowerCase()));
  followsLoadedFor = session.pubkey;
  followsLoadingFor = '';
  status(elements.noteSortStatus, newest
    ? `${followedPubkeys.size} follow${followedPubkeys.size === 1 ? '' : 's'} loaded.`
    : 'No Nostr follow list was found for this account.');
  applyNoteFilters();
}

function noteViewLabel(view) {
  return ({last5: 'the last 5 notes', last15: 'the last 15 notes', day: 'notes from the last 24 hours',
    week: 'notes from the last 7 days', mentions: 'notes that mention you'})[view] || 'all notes';
}

function applyNoteFilters() {
  const session = getNostrSession();
  const named = namedNostrSession();
  const followsActive = Boolean(followsOnlyPreference && named && followsLoadedFor === named.pubkey);
  const visible = new Set(stickyVisibleNoteIds(
    [...noteEvents.values()].map(record => record.sticky),
    {view: noteView, pubkey: session?.pubkey, followsOnly: followsActive, follows: followedPubkeys},
  ));
  noteEvents.forEach((record, id) => record.element.classList.toggle('sticky-note--filtered-out', !visible.has(id)));
  scheduleBuriedPins();
  const filtered = noteView !== 'all' || Boolean(followsOnlyPreference && named);
  elements.noteSort.classList.toggle('has-active-filter', filtered);
  elements.noteSort.setAttribute('aria-pressed', String(filtered));
  elements.noteSort.title = filtered
    ? `Filtering ${noteViewLabel(noteView)}${followsActive ? ' from people you follow' : ''}`
    : 'Sort and filter notes';
  elements.noteSort.setAttribute('aria-label', elements.noteSort.title);
  const revealed = noteEvents.get(revealedFilteredNoteId)?.element;
  if (revealed && !revealed.classList.contains('sticky-note--filtered-out')) clearRevealedFilteredNote();
}

function refreshNoteSortControls() {
  const session = getNostrSession();
  const named = namedNostrSession();
  const mention = mentionFilterAvailability(session);
  const mentionInput = elements.noteViewOptions.querySelector('input[value="mentions"]');
  mentionInput.disabled = !mention.available;
  if (noteView === 'mentions' && !mention.available) noteView = 'all';
  elements.noteViewOptions.querySelectorAll('input[name="noteView"]').forEach(input => {
    input.checked = input.value === noteView;
  });
  elements.followsOnlyRow.hidden = !named;
  elements.followsOnly.checked = followsOnlyPreference;
  elements.buriedPins.checked = showBuriedPins;
  if (named && followsOnlyPreference) loadFollowList(named).catch(() => {
    status(elements.noteSortStatus, 'Your Nostr follow list could not be loaded.', true);
  });
  applyNoteFilters();
}

function openNoteSort() {
  refreshNoteSortControls();
  showDialog(elements.noteSortDialog);
  if (namedNostrSession()) loadFollowList().catch(() => {
    status(elements.noteSortStatus, 'Your Nostr follow list could not be loaded.', true);
  });
}

elements.noteSort.addEventListener('click', openNoteSort);
elements.noteViewOptions.addEventListener('change', event => {
  if (!event.target.matches('input[name="noteView"]') || !STICKY_NOTE_VIEWS.includes(event.target.value)) return;
  noteView = event.target.value;
  localStorage.setItem(NOTE_VIEW_KEY, noteView);
  applyNoteFilters();
});
elements.followsOnly.addEventListener('change', () => {
  followsOnlyPreference = elements.followsOnly.checked;
  localStorage.setItem(FOLLOWS_FILTER_KEY, followsOnlyPreference ? '1' : '0');
  if (followsOnlyPreference) loadFollowList().catch(() => {
    status(elements.noteSortStatus, 'Your Nostr follow list could not be loaded.', true);
  });
  applyNoteFilters();
});
elements.buriedPins.addEventListener('change', () => {
  showBuriedPins = elements.buriedPins.checked;
  localStorage.setItem(BURIED_PINS_KEY, showBuriedPins ? '1' : '0');
  applyNoteFilters();
});
elements.editor.addEventListener('keydown', handleMentionKeys);
elements.editor.addEventListener('input', updateMentionMenu);
elements.editor.addEventListener('click', updateMentionMenu);
elements.account.addEventListener('click', () => {
  if (getNostrSession()) { showDialog(elements.accountDialog); return; }
  // A way back in is put on screen before the reader has to wonder what happened.
  refreshLoginDialog();
  showDialog(elements.login);
});

// The X on the invoice, and Esc on it, mean the reader does not want it. Bound here rather
// than to the dialog's `close` event: the page closes this dialog itself when a payment
// settles, and those closes must not throw away an order the desk has just been paid for.
elements.closePayment.addEventListener('click', discardInvoice);
elements.paymentDialog.addEventListener('cancel', discardInvoice);
elements.newSticky.addEventListener('click', openComposer);
elements.amberPaste.addEventListener('click', async () => {
  try {
    // A tap is the reader taking the hand-over into their own hands: the background poll stands down
    // so the two can never read, and spend, the same parked request at once.
    stopAmberClipboardPoll();
    // What is parked decides what this button hands over. A signing request sent without a callback
    // has its signature on the clipboard; one whose callback never came back is sent again through
    // the clipboard, the one return path Android cannot drop. Anything else is an ordinary sign-in.
    const parked = pendingAmberRequest();
    if (parked?.action === 'sign' && parked.copy) {
      // The read happens here, inside the reader's own tap, which is the only place the browser is
      // guaranteed to allow it — this is the read that cannot be refused.
      sayAmberRoundTrip('Amber has copied a signature - reading it');
      const answer = await adoptAmberSignature();
      await completeAmberSignature(answer);
      return;
    }
    if (parked?.action === 'sign') {
      beginAmberSigning(parked.template, parked.context, {copy: true});
      // The re-sent request is waited on the same way the first was: Amber copies the signature, and
      // the page watches for it instead of waiting for a return event that does not come.
      startAmberClipboardPoll();
      return;
    }
    // What was parked decides this too, not only what is parked now: a verified signature spends the
    // request that carried it, so a tap after one was handed over has nothing parked left to branch
    // on - and reading that as a sign-in told the reader to start a sign-in for a note they had
    // already signed. The note's own last line is repeated instead, the desk's refusal above all,
    // because that is what the reader came back to. A sign-in keeps the wording below: it is its own.
    const spent = spentAmberHandOver({parked, handed: lastAmberHandOver()});
    if (spent) {
      sayAmberRoundTrip(spent.message, spent.error);
      return;
    }
    status(elements.amberCopyStatus, 'Reading what Amber copied...');
    const answer = await adoptAmberClipboard();
    updateAccount();
    status(elements.amberCopyStatus, '');
    if (elements.amberDialog.open) elements.amberDialog.close();
    if (elements.login.open) elements.login.close();
    showLoginConfirmation(answer.session);
  } catch (error) {
    status(elements.amberCopyStatus, error.message, true);
    // The tap did not finish the round trip, but the request is still parked: the poll picks the wait
    // back up rather than leaving the reader with a stopped clock and no second chance. The request is
    // spent only by a verified signature, so this can never publish twice.
    if (amberSignaturePending()) startAmberClipboardPoll();
  }
});
elements.nostrConnectCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(elements.nostrConnectUri.textContent);
    status(elements.nostrConnectStatus, 'Link copied. In Amber, Add a new application, then Paste from clipboard.');
  } catch {
    status(elements.nostrConnectStatus, 'This browser will not let the page copy it. Select the link below and copy it by hand.', true);
  }
});
elements.nostrConnectOpen.addEventListener('click', () => {
  // On the same phone the invitation goes straight into Amber through its own scheme: no code to scan
  // and nothing to copy by hand. The URI is the one already in the field, so the two can never drift.
  const uri = nostrConnectRequest?.uri || elements.nostrConnectUri.textContent;
  if (uri) location.assign(uri);
});
// Closing either step hands the reader back to the ways in, and an unanswered code is cancelled with
// it: its subscription must not outlive the dialog it was shown in.
elements.amberDialog.addEventListener('close', () => {
  // Closing the step is the reader cancelling this hand-over: the poll stops with it. The parked
  // request stays, so reopening the step (or the login dialog) lands back on it and polls again.
  stopAmberClipboardPoll();
  status(elements.amberCopyStatus, '');
  if (!getNostrSession() && !elements.login.open) elements.login.showModal();
});
elements.nostrConnect.addEventListener('close', () => {
  nostrConnectRequest?.cancel();
  nostrConnectRequest = null;
  status(elements.nostrConnectStatus, '');
  if (!getNostrSession() && !elements.login.open) elements.login.showModal();
});
elements.stickySettings.addEventListener('click', openBoardStyle);
elements.resetBoardTexture.addEventListener('click', () => applyBoardTexture(''));
elements.boardStyleForm.addEventListener('submit', event => {
  event.preventDefault();
  const typed = elements.boardTextureUrl.value;
  const url = boardTextureUrl(typed);
  if (typed.trim() && !url) {
    sayBoardStyle('Use an https:// link, a /path on this site, or leave it empty for the default.', true);
    return;
  }
  applyBoardTexture(url);
});
elements.openGeohashMap.addEventListener('click', () => {
  openGeohashMap().catch(error => {
    console.error('Could not open the geohash map:', error);
    sayMapTrouble('The map could not open — the geohash can still be typed by hand.');
  });
});
elements.placeSearch.addEventListener('input', schedulePlaceSearch);
elements.placeSearch.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (geohashPlaceResults.length) choosePlace(0);
  else searchPlaces();
});
elements.placeResults.addEventListener('click', event => {
  const button = event.target.closest('.geohash-map-search__result');
  if (button) choosePlace(button.dataset.index);
});
elements.clearPlaceSearch.addEventListener('click', () => {
  clearPlaceSearch();
  elements.placeSearch.focus();
});
elements.closeGeohashMap.addEventListener('click', () => elements.geohashMapDialog.close());
elements.geohashMapDialog.addEventListener('close', () => {
  // The search is an aid to this picking session, not a state of its own: the field and the
  // marker go together, so the next open starts clean rather than showing a stale pin.
  clearPlaceSearch();
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
        ? 'Enter a geohash of 3 to 9 characters using 0-9 and b-h, j, k, m, n, p-z.'
        : issue, true);
    return;
  }
  selectBoard(cells);
});
elements.boardDepth.addEventListener('change', () => {
  boardDepth = Math.max(0, Math.min(GEOHASH_MAX_BOARD_DEPTH, Number.parseInt(elements.boardDepth.value, 10) || 0));
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
    status(elements.areaStatus, 'Pin the current note before changing boards.', true);
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

/**
 * The board's share dialog. The link is the desk's page for this board, so whoever it is sent to
 * sees the board itself in the preview before they open it. Tapping the engraved plate opens it,
 * because the plate is what names the board.
 */
function openShareBoard(cells = activeGeohashes) {
  const chosen = (cells || []).filter(Boolean);
  if (!chosen.length) {
    status(elements.boardChooserStatus, 'Enter or open a geohash before sharing it.', true);
    return;
  }
  // The board's own host, not this page's: satoshi.si serves no board pages, and the picture a
  // preview fetches is built there too - so the link and its picture always agree.
  const url = boardShareUrl(chosen);
  elements.shareBoardLink.value = url;
  elements.shareBoardNative.hidden = !navigator.share;
  const preview = elements.shareBoardPreview;
  preview.hidden = false;
  preview.src = `${url}.webp`;
  status(elements.shareBoardStatus, 'Drawing the board...');
  if (!elements.shareBoardDialog.open) elements.shareBoardDialog.showModal();
}

elements.shareBoardPreview.addEventListener('load', () => status(elements.shareBoardStatus, ''));
elements.shareBoardPreview.addEventListener('error', () => {
  elements.shareBoardPreview.hidden = true;
  status(elements.shareBoardStatus, 'The board picture is still being drawn. The link works either way.', true);
});

/** Both plaques name the board, so both of them open the one share dialog. */
const shareThisBoard = () => openShareBoard();
elements.boardPlate.addEventListener('click', shareThisBoard);
elements.boardPlateTop.addEventListener('click', shareThisBoard);

elements.shareBoard.addEventListener('click', () => {
  const typed = geohashCellsFrom(elements.boardGeohash.value);
  openShareBoard(typed.length ? typed : activeGeohashes);
});

elements.copyBoardLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(elements.shareBoardLink.value);
    status(elements.shareBoardStatus, 'Board link copied.');
  } catch {
    elements.shareBoardLink.select();
    status(elements.shareBoardStatus, 'Select the link and copy it.', true);
  }
});

elements.shareBoardNative.addEventListener('click', async () => {
  const cells = geohashCellsFrom(elements.shareBoardLink.value.split('/b/')[1] || '');
  const geohash = cells.length ? boardCellsLabel(cells) : 'Pinstr';
  try {
    await navigator.share({title: `Board ${geohash}`, text: `Open the ${geohash} board on pinstr.si.`, url: elements.shareBoardLink.value});
    status(elements.shareBoardStatus, 'Board link shared.');
  } catch (error) {
    if (error?.name !== 'AbortError') status(elements.shareBoardStatus, 'Could not open the share sheet.', true);
  }
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
elements.linkExpand.addEventListener('click', toggleLinkRest);
elements.linkCancel.addEventListener('click', () => elements.linkDialog.close());
elements.linkOpen.addEventListener('click', () => {
  // The browser takes the address from here; the confirmation has done its job.
  if (elements.linkDialog.open) elements.linkDialog.close();
});
document.querySelectorAll('[data-login]').forEach(button => button.addEventListener('click', () => handleLogin(button.dataset.login)));
elements.logout.addEventListener('click', () => {
  // Closing first guarantees a broken downstream session listener cannot trap the reader
  // inside a modal. The account state is then cleared and redrawn normally.
  if (elements.accountDialog.open) elements.accountDialog.close();
  logoutNostr();
  updateAccount();
});
elements.accountPicture.addEventListener('error', () => { elements.accountPicture.hidden = true; });
elements.colors.addEventListener('click', event => selectColor(event.target.closest('[data-color]')?.dataset.color));
elements.font.addEventListener('change', () => selectFont(elements.font.value));
elements.liveliness.addEventListener('input', () => selectLiveliness(STICKY_LIVELINESS[Number(elements.liveliness.value)]?.key));
renderLiveliness();
elements.editor.addEventListener('beforeinput', () => { lastValidEditor = elements.editor.textContent; });
elements.editor.addEventListener('input', handleEditorInput);
elements.editor.addEventListener('paste', event => {
  event.preventDefault();
  const pasted = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
  editorPasting = true;
  try {
    document.execCommand('insertText', false, pasted);
    // A pasted address arrives whole, so it is converted even when it ends the note.
    drawLinkChipsInEditor({force: true});
  } finally {
    editorPasting = false;
  }
  handleEditorInput();
  fitDraftTypography();
});
elements.hashtags.addEventListener('input', validateHashtags);
elements.noteKind?.addEventListener('click', event => {
  const button = event.target.closest('[data-note-kind]');
  if (button) selectNoteKind(button.dataset.noteKind);
});
elements.noteImageFile?.addEventListener('change', () => chooseNoteImage(elements.noteImageFile.files?.[0] || null));
// The size the reader is told they may send comes from the same constant the guard measures
// against, so the promise and the refusal can never drift apart.
if (elements.noteImageLimit) elements.noteImageLimit.textContent = `up to ${STICKY_IMAGE_MAX_BYTES / (1024 * 1024)} MB`;
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
elements.pin.addEventListener('click', () => {
  // While a note is being mined this button is the way out of it: stopping costs nothing,
  // and the note stays where it was placed, ready to mine again.
  if (mining) { mining.abort(); return; }
  publishPinnedNote();
});
elements.discardBin.addEventListener('click', () => openDiscardDialog());
elements.discardConfirm.addEventListener('click', () => discardPendingNote());
elements.discardCancel.addEventListener('click', () => keepDiscardedNote());
// Closing with the X or Escape is a no: put the note back where the drag started.
elements.discardDialog.addEventListener('close', () => { if (discardRestore) keepDiscardedNote(); });
elements.copyNoteId.addEventListener('click', copySelectedNoteId);
document.getElementById('closeNoteMenu').addEventListener('click', closeNoteMenu);
elements.noteEventJsonDetails.addEventListener('toggle', () => requestAnimationFrame(keepNoteMenuOnScreen));
document.addEventListener('pointerdown', event => {
  if (!elements.noteMenu.hidden && !event.target.closest('#noteMenu') && !event.target.closest('.sticky-note__pin')) closeNoteMenu();
});
function handleNostrSessionChange() {
  const session = getNostrSession();
  if (!session || session.method === 'anonymous' || followsLoadedFor !== session.pubkey) {
    followedPubkeys = new Set();
    followsLoadedFor = '';
    followsLoadingFor = '';
  }
  updateAccount();
  if (session && elements.login.open) elements.login.close();
  // Signing out withdraws the unpinned note; signing in returns it.
  syncPlacementWithSession();
  if (isStrandedPinDraft() && pendingBelongsToSession()) {
    status(elements.boardStatus, 'Your saved note is ready. Tap + when you want to continue.');
    elements.boardStatus.hidden = false;
    setTimeout(() => { elements.boardStatus.hidden = true; }, 4500);
  }
  // The identity decides what the buttons mean — an anonymous one can never use a
  // subscription — so a change has to re-ask the desk and re-draw rather than only
  // relabel the account: a stale quote is what offered a plan to a temporary identity.
  refreshPriceQuote(session).catch(() => {});
}
window.addEventListener('satoshi-nostr-session', handleNostrSessionChange);
// Amber commonly opens its HTTPS callback in a browser tab even when the request came from
// the installed PWA. Both contexts share origin storage; let the original page see the login
// completed instead of leaving its older dialog on "Connecting".
window.addEventListener('storage', event => {
  if (event.key === 'satoshi:nostr:session:v1') handleNostrSessionChange();
  if (event.key !== FLOW_SYNC_KEY || !event.newValue) return;
  let flow;
  try { flow = JSON.parse(event.newValue); } catch { return; }
  if (!pending?.orderId || flow.orderId !== pending.orderId) return;
  if (flow.type === 'signed') {
    elements.pin.disabled = true;
    elements.pin.querySelector('span').textContent = 'Publishing...';
    status(elements.boardStatus, 'Signature received. Publishing your note...');
    elements.boardStatus.hidden = false;
    return;
  }
  if (flow.type !== 'published' || !flow.event) return;
  // The pin succeeded in the other context and that context has signalled it. This page was waiting on
  // the same note with its own hand-over in front of the reader, so it comes down here too: the
  // signature it is asking for has already been used, in the tab the reader is now looking at.
  retireAmberHandOver();
  const sticky = parseStickyEvent(flow.event);
  if (pending.anonymous) markAnonymousNotePublished(flow.event.id);
  placingNote?.remove(); placingNote = null;
  if (sticky) renderNote(sticky, flow.event);
  elements.placementControls.hidden = true;
  setBinArmed(false);
  elements.discardBin.hidden = true;
  savePending(null);
  elements.editor.textContent = '';
  lastValidEditor = '';
  elements.pin.disabled = true;
  elements.pin.querySelector('span').textContent = 'Pinned';
  status(elements.boardStatus, flow.message || 'Your note is pinned.');
  elements.boardStatus.hidden = false;
});
loadBoardImage();
window.addEventListener('beforeunload', () => { try { boardSocket?.close(); } catch {} });
let boardResizeFrame = 0;
window.addEventListener('resize', () => {
  // The footer can change height with the viewport (or with the text it shows), so the board's own
  // area is re-measured here rather than only at load.
  applyBoardChrome();
  cancelAnimationFrame(boardResizeFrame);
  boardResizeFrame = requestAnimationFrame(() => {
    const rect = elements.board.getBoundingClientRect();
    if (boardViewport) {
      boardView.x += (rect.width - boardViewport.width) / 2;
      boardView.y += (rect.height - boardViewport.height) / 2;
      applyBoardTransform(rect);
    } else fillBoard();
  });
});
setInterval(() => {
  const before = elements.account.getAttribute('aria-label');
  updateAnonymousCountdown();
  const session = getNostrSession();
  const after = session ? `Nostr account: ${sessionLabel(session)}` : 'Log in to Nostr';
  if (before !== after) updateAccount();
  // A note that crosses its own NIP-40 moment while the page is open stops being shown, the
  // way the relay stops serving it. Nothing on this board outlives the moment it names.
  if (dropExpiredNotes()) applyNoteFilters();
}, 1000);

setInterval(() => {
  if (noteView === 'day' || noteView === 'week') applyNoteFilters();
}, 60000);

updateAccount();
// One source for the rail's thickness: the stylesheet reads this variable, the
// fitting maths reads the constant, so the frame and the fit cannot disagree.
elements.canvas.style.setProperty('--board-frame', `${BOARD_FRAME_WIDTH}px`);
// Room for any fixed chrome across the foot of the page, before the board is sized for the first
// time, so the first fit already knows where the board's bottom edge is allowed to be.
applyBoardChrome();
// The canvas wears its board's size from the first paint. The board the reader arrives on comes
// from the link, the kept place or the remembered board, and that resolution does not pass
// through selectBoard, so the size is worked out from what it settled on here as well.
applyBoardSize();
elements.boardDepth.value = String(boardDepth);
elements.rememberBoard.checked = rememberBoard;
updateBoardControl();
installBoardNavigation();
requestAnimationFrame(fillBoard);
if (activeGeohash) connectBoard();
else {
  status(elements.boardStatus, 'Choose a geohash to open its board.');
  showDialog(elements.boardDialog);
  requestAnimationFrame(() => elements.boardGeohash.focus());
}
// A signature is made in another app, so the page leaves and comes back — reloaded, or
// resumed exactly as it was: a browser that keeps the running page only changes the URL, and
// then nothing would look at the answer at all. So it is read wherever it arrives.
let resumedSigning = false;

/**
 * The signer's answer, if the URL carries one. A paid note is one tap from being pinned, so
 * a signature that cannot be used is named to the reader rather than dropped.
 */
async function applySignerReturn() {
  let applied = false;
  let unusable = '';
  try {
    const amber = resumeAmber();
    if (amber?.action === 'login') {
      applied = true;
      updateAccount();
      status(elements.loginStatus, '');
      if (elements.login.open) elements.login.close();
      // The reader's own note comes back with the identity that was pinning it.
      if (!syncPlacementWithSession()) showLoginConfirmation(amber.session);
    } else if (amber?.action === 'sign' && pending?.orderId === amber.context?.orderId) {
      applied = true;
      signalStickyFlow('signed', {orderId: pending.orderId});
      await publishPinnedNote(amber.event);
    } else if (amber?.action === 'sign') {
      unusable = 'That signature was for a different note. Your note is still here — pin it again.';
    }
  } catch (error) {
    unusable = error.message;
  }
  if (unusable) {
    notice(unusable);
    if (!getNostrSession()) status(elements.loginStatus, unusable, true);
  }
  // A return that worked retires the notice it answered — a "the signer did not come back"
  // line under a note that is now pinned reads as a second failure.
  if (applied && noticeText && elements.boardStatus.textContent === noticeText) {
    status(elements.boardStatus, '');
    elements.boardStatus.hidden = true;
  }
  return {applied, unusable};
}

/**
 * Apply a signature that came back through the clipboard, exactly as the callback route does: tell
 * the flow that launched the request, then publish the paid note the signature belongs to. A
 * signature for another note is named rather than dropped - that note is paid for and one tap from
 * being pinned. Every stage of the round trip is written where the reader is looking, and the last
 * line stays up — the hand-over is not closed on the way in or on success, so no stage of the round
 * trip is cleared before it can be read.
 */
async function completeAmberSignature(answer) {
  if (!answer || answer.action !== 'sign') return false;
  // The round trip is over, whichever path finished it: the background poll has nothing left to watch.
  stopAmberClipboardPoll();
  // A note that is already pinned leaves nothing to finish here, and a duplicate of its own signature
  // arriving from a second path must not be announced as a signature for some other note.
  if (!pending?.orderId) {
    // The signature was handed over twice, or the note is already pinned. Saying so beats going quiet
    // on a reader who is watching this line.
    sayAmberOutcome(AMBER_HANDED_OVER_LINE);
    return false;
  }
  if (pending?.orderId !== answer.context?.orderId) {
    const mismatch = 'That signature did not match your note. Your note is still here - pin it again.';
    sayAmberOutcome(mismatch, true);
    notice(mismatch);
    return false;
  }
  sayAmberRoundTrip('Signature verified - pinning your note');
  signalStickyFlow('signed', {orderId: pending.orderId});
  // The publish is the last thing that can refuse, and its own words are what the reader gets,
  // prefixed so it is clear the signature was good and it was the desk that said no.
  let outcome = null;
  await publishPinnedNote(answer.event, (published, message) => { outcome = {published, message}; });
  if (outcome?.published) {
    // The signature has been used and the note is on the board, so the hand-over is retired rather
    // than left up for the reader to close: the step it was describing is over. What it said is still
    // written down, so the dialog repeating it on a later tap is the same sentence, not a silence.
    noteAmberHandOverOutcome('Your note is pinned');
    retireAmberHandOver();
  } else if (outcome?.message) {
    sayAmberOutcome(`The server refused the pin: ${outcome.message}`, true);
  } else {
    sayAmberOutcome('The pin did not finish. Your note is still here - try again.', true);
  }
  return Boolean(outcome?.published);
}

/**
 * Put the hand-over step in front of the reader with the one button that always works - the same
 * surfaces the login hand-over uses, because it is the same clipboard step. Shared by a signature
 * already sitting on the clipboard and a signing request that has to be sent again through it, so
 * both end at the same tap.
 */
function showAmberHandOver(message) {
  if (elements.login.open) elements.login.close();
  if (!elements.amberDialog.open) elements.amberDialog.showModal();
  // This step is a signature, and the front of the dialog has to say which one it is: a sign-in and a
  // signature are the same clipboard step. What is waiting and what to tap are named on the dialog's
  // one line, in the messages that pass through here.
  elements.amberCopyTitle.textContent = 'Finish signing with Amber';
  status(elements.amberCopyStatus, message);
}

/**
 * Retire the clipboard hand-over: the pin is done, so there is nothing left to ask for and nothing
 * left to watch.
 *
 * A successful pin can be known in two places - here, on the page the reader was looking at, and in
 * another context that finished it and signalled (Amber opens its own tab even when the request came
 * from the installed app). Both call this. The dialog closes rather than staying up with its last
 * line for the reader to dismiss, and the clipboard poll stops with it, so no page goes on reading the
 * clipboard every half second to watch for a signature it already has. The board's own line - "Your
 * note is pinned." - is what the reader is left looking at, and it is the whole of the news.
 */
function retireAmberHandOver() {
  stopAmberClipboardPoll();
  if (elements.amberDialog.open) elements.amberDialog.close();
}

// How a copy-route signature gets home once the reader has left the page. Android fires no
// visibilitychange and no focus event on the way back, so waiting for a "reader returned" event can
// wait forever. While a copy-route signing request is parked the page therefore polls the clipboard
// every half second and *attempts* a read on every tick. A refused read
// (NotAllowedError: "Document is not focused") is the expected answer while the signer is still in
// front, so it means "try again next tick" and never stops the poll — gating the read on focus once
// meant that on a window whose focus check miscarries not one read was attempted at all, and the
// board ran out its timeout in perfect silence. snort's own client gives up after 120 s and so does
// this one, so an abandoned page cannot poll forever.
const AMBER_CLIPBOARD_POLL_MS = 500;
const AMBER_CLIPBOARD_POLL_TIMEOUT_MS = 120000;
let amberClipboardTimer = 0;
let amberClipboardDeadline = 0;

/**
 * The copy round trip crosses two apps and a reload, and the reader has to be able to see where it
 * stopped from the page itself — a log on a phone is not something they can open. Every step writes
 * one line here, and the last line stays up.
 */
function sayAmberRoundTrip(message, error = false) {
  if (!message) return;
  // Written once: the poll ticks twice a second, and a live region re-announcing the same sentence is
  // noise rather than a status.
  if (elements.amberCopyStatus.textContent === message
      && elements.amberCopyStatus.classList.contains('is-error') === error) return;
  status(elements.amberCopyStatus, message, error);
}

/**
 * One line that is both what the reader sees and what a later tap repeats. A hand-over's own last
 * line is the whole answer for the hand-over button once the request that carried it is spent, so
 * it is written down here rather than said in one place and remembered in another.
 */
function sayAmberOutcome(message, error = false) {
  sayAmberRoundTrip(message, error);
  noteAmberHandOverOutcome(message, error);
}

/**
 * The reader's sentence for whatever the last clipboard read reported, so a round trip that stops
 * says which step it stopped at. Each failure point gets its own wording.
 */
function amberReadFailure(code, focused) {
  if (code === 'refused' || code === 'no-api') {
    // document.hasFocus() is a hint here and nowhere else: it only picks which of two true sentences
    // fits. A refusal on a page that says it is focused is a permission problem; one on a page that
    // says it is not is the ordinary "the signer is still in front" answer. The read is attempted
    // either way, which is the whole point of the change.
    return focused
      ? 'The browser would not let the page read the clipboard. Tap the button below to read what Amber copied.'
      : 'This page cannot read the clipboard while it is in the background. Tap the button below to read what Amber copied.';
  }
  if (code === 'empty' || code === 'invalid') {
    return 'Nothing valid on the clipboard yet. Approve the note in Amber, then come back and tap the button below.';
  }
  // 'waiting' is not a failure: this page's own marker is still on the clipboard and the hand-over
  // wording already says what to do, so it is not overwritten with a failure line.
  return '';
}

// Only one read of a parked signature may be in flight at a time. The poll and the resume path both
// try to finish the same round trip, and a request is spent only *after* the read resolves, so two
// overlapping reads could both accept the same signature and both publish. This makes them serialise:
// whichever finishes first spends the request, and the other then finds nothing to do.
let amberAdoptRunning = false;
// Why the last read produced nothing, in adoptAmberSignature's own codes. Kept between ticks so the
// poll can put the right sentence on the page instead of the same silence every half second.
let amberLastReadCode = '';
async function adoptParkedSignature() {
  if (amberAdoptRunning) return null;
  amberAdoptRunning = true;
  amberLastReadCode = '';
  try {
    return await adoptAmberSignature({silent: true, onStatus: code => {
      amberLastReadCode = code;
      // The one code that means the round trip may be finishing: something that is not this page's
      // own marker is on the clipboard, and it is about to be judged.
      if (code === 'copied') sayAmberRoundTrip('Amber has copied a signature - reading it');
    }});
  } catch { return null; } finally { amberAdoptRunning = false; }
}

function stopAmberClipboardPoll() {
  if (!amberClipboardTimer) return;
  clearInterval(amberClipboardTimer);
  amberClipboardTimer = 0;
}

/** One turn of the poll: attempt the read, and finish the round trip if Amber has copied a signature. */
async function pollAmberClipboard() {
  // The request being spent is what tells this loop there is nothing left to wait for: the poll only
  // runs while a copy-route signing request is parked, and every path spends it in the same place.
  if (!amberSignaturePending()) { stopAmberClipboardPoll(); return; }
  if (Date.now() > amberClipboardDeadline) {
    stopAmberClipboardPoll();
    // Handing the reader the paste button is the whole point of the timeout: nothing arrived within
    // the window the shipped clients use, so the route that always works is put in front of them.
    showAmberHandOver('Amber never handed a signature back. Tap Pin again, or use the paste button.');
    return;
  }
  // The read is attempted on every tick. document.hasFocus() never decides whether it happens — an
  // installed Android window can report no focus while the reader is looking straight at it, and
  // gating on it meant not one read was ever made — it is only a hint for the sentence below. A read
  // that is refused is expected while the signer is still in front, so it is "try again next tick"
  // and the poll keeps going.
  const focused = document.hasFocus();
  const answer = await adoptParkedSignature();
  if (answer?.action !== 'sign') {
    sayAmberRoundTrip(amberReadFailure(amberLastReadCode, focused), true);
    return;
  }
  stopAmberClipboardPoll();
  await completeAmberSignature(answer);
}

/** Start watching the clipboard for a copied signature, or restart it for a freshly parked request. */
function startAmberClipboardPoll() {
  if (!amberSignaturePending()) return;
  // The control that reads the clipboard inside the reader's own tap is put in front of them here,
  // the moment a copy-route request is parked. This device fires no focus and no visibility event on
  // the way back from the signer, so a hand-over that waits for one never appears at all — which is
  // why the pin path shows this same dialog in the tap that sends the request, exactly as the sign-in
  // path does. The poll still watches the clipboard in the background: the reader may never come back
  // to the dialog, and an answer Amber has already copied must not be left unread.
  if (!elements.amberDialog.open) {
    showAmberHandOver(AMBER_HAND_OVER_WAITING_LINE);
  }
  amberClipboardDeadline = Date.now() + AMBER_CLIPBOARD_POLL_TIMEOUT_MS;
  if (amberClipboardTimer) return;
  amberClipboardTimer = setInterval(() => { pollAmberClipboard().catch(() => {}); }, AMBER_CLIPBOARD_POLL_MS);
}

const signerReturn = await applySignerReturn();
resumedSigning = signerReturn.applied;
// The other way a round trip loses its answer: the signer never came back at all, so nothing
// was thrown and the request is still parked. Same advice, and the note below is what makes
// it possible to act on.
let unusableReturn = signerReturn.unusable;
if (!signerReturn.applied) {
  const parkedRequest = pendingAmberRequest();
  if (parkedRequest?.action === 'sign' && pending?.status === 'paid'
      && parkedRequest.context?.orderId === pending.orderId) {
    unusableReturn = 'The signer did not come back with a signature. Your note is still here — pin it again.';
  }
  // A browser may reload before Android appends the callback. A parked request is therefore
  // still waiting, not a failed login; the reader can retry from the same dialog if needed.
  if (parkedRequest?.action === 'login' && Date.now() - parkedRequest.createdAt < 10 * 60 * 1000) {
    status(elements.loginStatus, parkedRequest.copy
      ? 'Amber is waiting for your approval. Come back to this page when you are done.'
      : 'Waiting for Amber. Tap Amber again if no answer arrives.');
  }
  // A reload between the two apps loses the poll the request began under. A copy-route signature
  // still parked is picked up again here, so an answer Amber has already copied is not left unread.
  if (amberSignaturePending()) startAmberClipboardPoll();
}
// The answer can also arrive with no reload at all: the browser resumes the page it already
// has and only the URL changes. Nothing else reads that hash, so these are where it is read.
let resumeFlowRunning = false;
async function resumeExternalFlow() {
  if (resumeFlowRunning || document.hidden) return;
  resumeFlowRunning = true;
  try {
    const signer = await applySignerReturn();
    if (!signer.applied) {
      if (pending?.status === 'waiting' || pending?.status === 'waiting_subscription') pollPayment();
      else if (pending?.status === 'paid') syncPlacementWithSession();
    }
    const parked = pendingAmberRequest();
    if (!signer.applied && !signer.unusable && amberSignaturePending()) {
      // The signature is copied rather than called back. Finish the round trip here where the browser
      // allows the read; where it does not, the button that always works is put in front of the reader.
      const automatic = await adoptParkedSignature();
      if (automatic?.action === 'sign') {
        // The hand-over stays up through the publish so the reader can see each stage of it;
        // completeAmberSignature closes it once the note is pinned, and leaves it up with the reason
        // when it is not.
        await completeAmberSignature(automatic);
      } else {
        showAmberHandOver(AMBER_HAND_OVER_WAITING_LINE);
        // A resume is not the reader coming back for certain - Android fires none of these events on
        // the way home - so the clipboard keeps being watched rather than the answer being left for an
        // event that will not come.
        startAmberClipboardPoll();
      }
    } else if (!signer.applied && !signer.unusable && parked?.action === 'sign'
        && pending?.status === 'paid' && parked.context?.orderId === pending.orderId) {
      // The signer never came back and the request is still parked. The boot path names this only on a
      // fresh load, so a page that is merely resumed would otherwise leave the reader in silence. The
      // same advice is given, and the retry is the clipboard route - the one return path Android
      // cannot drop between the two apps.
      notice('The signer did not come back with a signature. Your note is still here — pin it again.');
      showAmberHandOver('Amber did not come back with a signature. Tap the button to send the request again.');
    } else if (!signer.applied && !signer.unusable && parked?.action === 'login' && parked.copy) {
      // This request has no callback URL, so the signer answers by copying. Reading that needs a
      // permission this origin may already hold, in which case the sign-in finishes with no tap at
      // all; where the browser refuses, the button under the form is the way in.
      const automatic = await adoptAmberClipboard({silent: true});
      if (automatic?.action === 'login') {
        updateAccount();
        status(elements.loginStatus, '');
        status(elements.amberCopyStatus, '');
        if (elements.amberDialog.open) elements.amberDialog.close();
        if (elements.login.open) elements.login.close();
        if (!syncPlacementWithSession()) showLoginConfirmation(automatic.session);
      } else if (elements.amberDialog.open || elements.login.open) {
        // The automatic read did not happen here, so the step with the button that always works is put in
        // front of the reader rather than waiting for them to reopen the login dialog. A reader who has
        // walked away from the sign-in is left alone: the request stays parked, and opening the login
        // dialog leads straight back to this step.
        if (!elements.amberDialog.open) showAmberCopyDialog();
        status(elements.amberCopyStatus, 'Amber has it on your clipboard. Tap the button to hand it over.');
      }
    } else if (!signer.applied && !signer.unusable && parked?.action === 'login') {
      // Android commonly focuses the browser before Amber follows the callback URL. Focus is
      // not a failed sign-in: leave the request parked and let hashchange/pageshow consume the
      // public key when the callback lands.
      status(elements.loginStatus, 'Waiting for Amber...');
    }
    // Mobile browsers commonly close sockets while a wallet or signer app is in front.
    // A closed board must reconnect as soon as this page becomes visible again.
    if (activeGeohash && (!boardSocket || boardSocket.readyState > WebSocket.OPEN)) {
      connectBoard(boardConnectionVersion);
    }
  } finally {
    resumeFlowRunning = false;
  }
}
window.addEventListener('hashchange', () => { resumeExternalFlow().catch(() => {}); });
window.addEventListener('pageshow', () => { resumeExternalFlow().catch(() => {}); });
window.addEventListener('focus', () => { resumeExternalFlow().catch(() => {}); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeExternalFlow().catch(() => {});
});
// An unpaid saved draft is not a reason to interrupt somebody opening a board. It waits
// for its original signer and returns only when that person deliberately opens the editor.
// A temporary draft cannot outlive its anonymous key: there is then nobody who can sign it.
const strandedNote = isStrandedPinDraft();
if (strandedNote && pending?.anonymous && !pendingBelongsToSession()) savePending(null);
if (!resumedSigning && pending?.status === 'waiting') {
  if (pendingBelongsToSession()) {
    selectColor(pending.color);
    selectFont(pending.font || 'typewriter');
    elements.exactGeohash.checked = Boolean(pending.exactGeohash);
    elements.hashtags.value = (pending.hashtags || []).join(', ');
    validateHashtags();
    selectLiveliness(pending.liveliness || STICKY_DEFAULT_LIVELINESS);
    elements.editor.textContent = pending.content;
    lastValidEditor = pending.content;
    showDialog(elements.composer);
    status(elements.paymentStatus, 'Checking your payment...');
  }
  pollPayment();
} else if (!resumedSigning && isStrandedPinDraft() && pendingBelongsToSession()) {
  status(elements.boardStatus, 'Your saved note is ready. Tap + when you want to continue.');
  elements.boardStatus.hidden = false;
  setTimeout(() => { elements.boardStatus.hidden = true; }, 4500);
} else if (!resumedSigning && pending?.status === 'paid') {
  syncPlacementWithSession();
  if (unusableReturn) notice(unusableReturn);
}
