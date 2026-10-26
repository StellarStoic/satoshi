import * as THREE from 'three';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {createWorldGiftDialog} from './pinstrWorldGifts.mjs';
import {
  STICKY_TOPIC,
  geohashMatchesBoard,
  isStickyExpired,
  parseStickyEvent,
  pinColourFor,
  stickyExpiryCountdown,
  stickyPaymentBadge,
  noteWear,
  noteAgeFraction,
  noteAgeTextureOpacity,
  noteTexturePlacement,
} from './stickyNotesModel.mjs';
import {
  boardHref,
  boardPlacementFromWorld,
  readWorldBoard,
  worldCellForNote,
  worldComposerHref,
  worldBoardRelation,
  worldFlightProgress,
  worldHref,
  worldPortalWarpProgress,
  worldNearbyCells,
  worldNotePosition,
  worldPortalPosition,
  worldPlatformPosition,
} from './pinstrWorldModel.mjs';

const RELAY = 'wss://nostr.satoshi.si';
const PENDING_KEY = 'satoshi:sticky:pending:v1';
const BOARD_CELLS_KEY = 'satoshi:sticky:geohash-cells:v1';
const BOARD_KEY = 'satoshi:sticky:geohash:v1';
const BOARD_DEPTH_KEY = 'satoshi:sticky:geohash-depth:v1';
const PIN_HOLD_MS = 500;
const PIN_MOVE_SLOP_PX = 8;
const WORLD_ZOOM_MIN = .45;
const WORLD_ZOOM_MAX = 6;
const MOBILE_RENDERING = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 1;
const NOTE_TEXTURE_SCALE = MOBILE_RENDERING ? .25 : 1;
const LABEL_TEXTURE_SCALE = MOBILE_RENDERING ? .5 : 1;
const RENDER_PIXEL_RATIO = MOBILE_RENDERING ? 1 : 1.6;
// Keep these identical to the --note colours used by the 2D board.
const NOTE_COLORS = Object.freeze({yellow:'#f7dc63', pink:'#f3a7c4', blue:'#91d2eb', green:'#acd986', orange:'#f4b266'});
const PIN_COLORS = Object.freeze({red:'#c73935', blue:'#2975c7', yellow:'#e3be28', green:'#2d9a55', white:'#eeeeea', purple:'#8752b5', magenta:'#ca3b91', black:'#171717'});
const FONT_FAMILIES = Object.freeze({typewriter:'Special Elite', handwritten:'Caveat', comfortaa:'Comfortaa'});

const elements = {
  canvas:document.getElementById('worldCanvas'), status:document.getElementById('worldStatus'),
  geohash:document.getElementById('worldGeohash'), back:document.getElementById('backToBoard'),
  write:document.getElementById('writeWorldNote'), pictureLayer:document.getElementById('worldPictureLayer'),
  noteMenu:document.getElementById('noteMenu'), closeNoteMenu:document.getElementById('closeNoteMenu'),
  noteEventId:document.getElementById('noteEventId'), copyNoteId:document.getElementById('copyNoteId'),
  noteAgentBadge:document.getElementById('noteAgentBadge'), noteAgentBadgeIcon:document.getElementById('noteAgentBadgeIcon'),
  noteAgentBadgeLabel:document.getElementById('noteAgentBadgeLabel'), notePaidBadge:document.getElementById('notePaidBadge'),
  notePaidBadgeIcon:document.getElementById('notePaidBadgeIcon'), notePaidBadgeLabel:document.getElementById('notePaidBadgeLabel'),
  notePostedAt:document.getElementById('notePostedAt'), noteExpiresLabel:document.getElementById('noteExpiresLabel'),
  noteExpirationValue:document.getElementById('noteExpirationValue'), noteExpiresAt:document.getElementById('noteExpiresAt'),
  noteExpiryCountdown:document.getElementById('noteExpiryCountdown'), noteExpiryAged:document.getElementById('noteExpiryAged'),
  noteMenuStatus:document.getElementById('noteMenuStatus'), noteEventJsonDetails:document.getElementById('noteEventJsonDetails'),
  noteEventJson:document.getElementById('noteEventJson'), copyNoteJson:document.getElementById('copyNoteJson'),
  placement:document.getElementById('worldPlacement'),
  cancelPlacement:document.getElementById('cancelWorldPlacement'), finishPlacement:document.getElementById('finishWorldPlacement'),
  controlsToggle:document.getElementById('worldControlsToggle'), controls:document.getElementById('worldControls'),
  compass:document.getElementById('worldCompass'), ar:document.getElementById('worldAr'),
  flight:document.getElementById('worldFlight'),
};

const storedCells = localStorage.getItem(BOARD_CELLS_KEY) || localStorage.getItem(BOARD_KEY) || '';
const board = readWorldBoard(location.search, storedCells, localStorage.getItem(BOARD_DEPTH_KEY));
const boardUrl = boardHref(board.cells);
const wantsPlacement = new URL(location.href).searchParams.get('place') === '1';
let pending = readPending();
const canPlace = wantsPlacement && pending?.action === 'pin' && pending?.status === 'paid'
  && Boolean(pending?.content || pending?.image);
elements.back.href = boardUrl;
elements.cancelPlacement.href = boardUrl;
elements.write.href = worldComposerHref(board.cells);
elements.write.hidden = canPlace;
elements.placement.hidden = !canPlace;
document.body.classList.toggle('is-placing', canPlace);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0d0f0f, 0.018);
const camera = new THREE.PerspectiveCamera(58, innerWidth / Math.max(1, innerHeight), 0.05, 260);
camera.position.set(0, 1.65, .05);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas:elements.canvas,
    antialias:!MOBILE_RENDERING,
    alpha:true,
    powerPreference:MOBILE_RENDERING ? 'default' : 'high-performance',
  });
} catch (error) {
  elements.status.textContent = 'This browser could not start the 3D renderer.';
  elements.status.hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, RENDER_PIXEL_RATIO));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x0d0f0f, 1);
renderer.xr.enabled = true;

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.075;
orbit.minDistance = .05;
orbit.maxDistance = .05;
orbit.minPolarAngle = .05;
orbit.maxPolarAngle = Math.PI - .05;
orbit.enablePan = false;
orbit.enableZoom = false;
orbit.target.set(0, 1.65, 0);

scene.add(new THREE.HemisphereLight(0xfff4d8, 0x171a1a, 2.3));
const keyLight = new THREE.DirectionalLight(0xffc95c, 2.1);
keyLight.position.set(-6, 10, 8);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x75bde0, 18, 35);
rimLight.position.set(8, 7, -8);
scene.add(rimLight);

const starPositions = [];
const starCount = MOBILE_RENDERING ? 320 : 650;
for (let index = 0; index < starCount; index += 1) {
  const angle = index * 2.399963;
  const radius = 28 + (index % 31) * 2.8;
  starPositions.push(Math.cos(angle) * radius, ((index * 37) % 70) - 20, Math.sin(angle) * radius);
}
const starsGeometry = new THREE.BufferGeometry();
starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({color:0xb8bbb6, size:.075, transparent:true, opacity:.6})));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const platforms = new Map();
const platformOrder = [];
const platformMeshes = [];
const portalMeshes = [];
const portals = new Map();
const notes = new Map();
const noteGroups = [];
const paperMeshes = [];
const pinMeshes = [];
const pictureOverlays = [];
const noteSurfaces = [];
const paperGrainImage = new Image();
const paperCreaseImage = new Image();
const authorLabels = new Map();
const authorProfileQueue = new Set();
const authorProfilesLoading = new Set();
let authorProfileTimer = 0;
let activeCell = board.cells[0] || '';
let boardSocket = null;
let reconnectTimer = 0;
let nearbySocket = null;
let nearbyReconnectTimer = 0;
let nearbyConnectionVersion = 0;
let flight = null;
let portalWarp = null;
let portalPress = null;
let hoveredPortalCell = '';
let pointerStart = null;
let pinPress = null;
let dragged = null;
let draftGroup = null;
let selectedNote = null;
let noteExpiryTimer = 0;
const zoomPointers = new Map();
let pinchZoom = null;
let compassActive = false;
let compassCalibration = null;
let compassReceived = false;
let compassHasAbsoluteReading = false;
let xrSession = null;
const normalFog = scene.fog;
const orientationEuler = new THREE.Euler();
const orientationDevice = new THREE.Quaternion();
const orientationScreen = new THREE.Quaternion();
const orientationCorrection = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
const orientationUp = new THREE.Vector3(0, 0, 1);
const xrSelectMatrix = new THREE.Matrix4();
const xrController = renderer.xr.getController(0);
scene.add(xrController);

function setWorldZoom(value) {
  camera.zoom = Math.max(WORLD_ZOOM_MIN, Math.min(WORLD_ZOOM_MAX, Number(value) || 1));
  camera.updateProjectionMatrix();
}

function deviceQuaternion(event) {
  if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return null;
  const radians = THREE.MathUtils.DEG2RAD;
  const screenAngle = Number(screen.orientation?.angle ?? window.orientation ?? 0) * radians;
  orientationEuler.set(event.beta * radians, event.alpha * radians, -event.gamma * radians, 'YXZ');
  orientationDevice.setFromEuler(orientationEuler);
  orientationDevice.multiply(orientationCorrection);
  orientationDevice.multiply(orientationScreen.setFromAxisAngle(orientationUp, -screenAngle));
  return orientationDevice;
}

function handleDeviceOrientation(event) {
  if (!compassActive || xrSession) return;
  const isAbsolute = event.type === 'deviceorientationabsolute' || event.absolute === true;
  if (compassHasAbsoluteReading && !isAbsolute) return;
  const device = deviceQuaternion(event);
  if (!device) return;
  if (isAbsolute) compassHasAbsoluteReading = true;
  if (!compassCalibration) compassCalibration = camera.quaternion.clone().multiply(device.clone().invert());
  camera.quaternion.copy(compassCalibration).multiply(device);
  compassReceived = true;
}

function stopCompass(message = '') {
  compassActive = false;
  compassCalibration = null;
  compassHasAbsoluteReading = false;
  elements.compass.setAttribute('aria-pressed', 'false');
  elements.compass.querySelector('span').textContent = 'Look with phone';
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  orbit.target.copy(camera.position).addScaledVector(direction, .05);
  orbit.enabled = !flight && !xrSession;
  if (message) setStatus(message, 3500);
}

async function toggleCompass() {
  if (compassActive) { stopCompass('Phone looking is off.'); return; }
  try {
    if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') {
      const permission = await window.DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') throw new Error('Motion access was not allowed.');
    }
    compassActive = true;
    compassReceived = false;
    compassHasAbsoluteReading = false;
    compassCalibration = null;
    orbit.enabled = false;
    elements.compass.setAttribute('aria-pressed', 'true');
    elements.compass.querySelector('span').textContent = 'Stop phone look';
    setStatus('Move your phone to look around.', 3500);
    setTimeout(() => {
      if (compassActive && !compassReceived) stopCompass('This browser did not provide orientation data.');
    }, 3000);
  } catch (error) {
    stopCompass(error.message || 'Phone orientation is unavailable.');
  }
}

function finishArSession() {
  xrSession = null;
  document.body.classList.remove('is-xr');
  scene.scale.setScalar(1);
  scene.fog = normalFog;
  renderer.setClearColor(0x0d0f0f, 1);
  elements.ar.setAttribute('aria-pressed', 'false');
  elements.ar.querySelector('span').textContent = 'View in AR';
  resetView();
  setStatus('Returned to the 3D board.', 2500);
}

async function toggleAr() {
  if (xrSession) { await xrSession.end(); return; }
  try {
    stopCompass();
    renderer.xr.setReferenceSpaceType('local-floor');
    const session = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures:['local-floor', 'dom-overlay'],
      domOverlay:{root:document.body},
    });
    xrSession = session;
    session.addEventListener('end', finishArSession, {once:true});
    document.body.classList.add('is-xr');
    scene.scale.setScalar(.22);
    scene.fog = null;
    renderer.setClearColor(0x000000, 0);
    orbit.enabled = false;
    elements.ar.setAttribute('aria-pressed', 'true');
    elements.ar.querySelector('span').textContent = 'Exit AR';
    elements.ar.closest('dialog')?.close();
    await renderer.xr.setSession(session);
  } catch (error) {
    if (xrSession) try { await xrSession.end(); } catch {}
    finishArSession();
    setStatus(error?.name === 'NotAllowedError' ? 'AR permission was not allowed.' : 'AR could not start on this device.', 4500);
  }
}

async function detectWorldModes() {
  elements.compass.hidden = !('DeviceOrientationEvent' in window);
  if (!navigator.xr?.isSessionSupported) return;
  try { elements.ar.hidden = !await navigator.xr.isSessionSupported('immersive-ar'); }
  catch { elements.ar.hidden = true; }
}

function pointerDistance(points) {
  const [first, second] = [...points.values()];
  return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
}

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
}

function setStatus(message = '', timeout = 0) {
  elements.status.textContent = message;
  elements.status.hidden = !message;
  if (timeout && message) setTimeout(() => {
    if (elements.status.textContent === message) elements.status.hidden = true;
  }, timeout);
}

function textureCanvas(logicalWidth, logicalHeight, scale = LABEL_TEXTURE_SCALE) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(logicalWidth * scale);
  canvas.height = Math.round(logicalHeight * scale);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  return {canvas, context};
}

function wrapLines(context, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text || '').replace(/\r/g, '').split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = '';
    for (const sourceWord of words) {
      const chunks = [];
      let chunk = '';
      for (const character of sourceWord) {
        if (chunk && context.measureText(chunk + character).width > maxWidth) {
          chunks.push(chunk);
          chunk = character;
        } else chunk += character;
      }
      if (chunk) chunks.push(chunk);
      chunks.forEach((word, index) => {
        const next = line && index === 0 ? `${line} ${word}` : (line ? `${line}${word}` : word);
        if (context.measureText(next).width <= maxWidth) line = next;
        else { if (line) lines.push(line); line = word; }
      });
    }
    if (line) lines.push(line);
    if (!words.length) lines.push('');
  }
  return lines;
}

function fittedNoteText(context, note) {
  const content = String(note.content || 'Your note');
  const family = FONT_FAMILIES[note.font] || FONT_FAMILIES.typewriter;
  let size = note.font === 'handwritten' ? 51 : 40;
  let lines = [];
  while (size >= 23) {
    context.font = `${size}px "${family}", sans-serif`;
    lines = wrapLines(context, content, 428);
    if (lines.length * size * 1.42 <= 390 && lines.every(line => context.measureText(line).width <= 434)) break;
    if (size === 23) break;
    size -= 2;
  }
  return {size, lines, lineHeight:size * 1.42};
}

function drawPaperWear(context, note) {
  const wear = noteWear(note.id);
  if (!wear) return;
  const corners = {tl:[0, 0], tr:[512, 0], bl:[0, 512], br:[512, 512]};
  wear.corners.forEach((corner, index) => {
    const [x, y] = corners[corner];
    const reach = wear.reach[index] * (512 / 220);
    const shade = context.createRadialGradient(x, y, 0, x, y, reach);
    shade.addColorStop(0, `rgba(31,16,5,${wear.alpha})`);
    shade.addColorStop(.52, `rgba(31,16,5,${wear.alpha * .4})`);
    shade.addColorStop(1, 'rgba(31,16,5,0)');
    context.fillStyle = shade;
    context.fillRect(0, 0, 512, 512);
  });
}

function drawPaperTexture(context, record, now) {
  if (paperGrainImage.complete && paperGrainImage.naturalWidth) {
    const pattern = context.createPattern(paperGrainImage, 'repeat');
    context.save();
    context.globalAlpha = .16;
    context.fillStyle = pattern;
    context.fillRect(0, 0, 512, 512);
    context.restore();
  }
  const opacity = noteAgeTextureOpacity(noteAgeFraction(record.born, record.dies, now));
  if (opacity > 0 && paperCreaseImage.complete && paperCreaseImage.naturalWidth) {
    const placement = noteTexturePlacement(record.note.id);
    const scale = placement.scale * 1.5;
    context.save();
    context.globalAlpha = opacity;
    context.globalCompositeOperation = 'multiply';
    context.translate(256 + placement.shiftX * 2.33, 256 + placement.shiftY * 2.33);
    context.rotate(placement.angle * Math.PI / 180);
    context.scale(scale, scale);
    context.drawImage(paperCreaseImage, -256, -256, 512, 512);
    context.restore();
  }
  return opacity;
}

function renderNoteSurface(record, now = Math.floor(Date.now() / 1000)) {
  const {context, note} = record;
  context.clearRect(0, 0, 512, 512);
  context.fillStyle = NOTE_COLORS[note.color] || NOTE_COLORS.yellow;
  context.fillRect(0, 0, 512, 512);
  const shade = context.createLinearGradient(0, 0, 512, 512);
  shade.addColorStop(0, 'rgba(255,255,255,.23)');
  shade.addColorStop(.72, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(60,35,0,.16)');
  context.fillStyle = shade;
  context.fillRect(0, 0, 512, 512);
  drawPaperWear(context, note);
  const ageOpacity = drawPaperTexture(context, record, now);
  if (record.pictureAge) record.pictureAge.style.opacity = ageOpacity.toFixed(3);
  context.fillStyle = '#26231e';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (note.image) {
    context.fillStyle = '#d7d4ca';
    context.fillRect(42, 42, 428, 374);
  } else {
    const {size, lines, lineHeight} = fittedNoteText(context, note);
    context.font = `${size}px "${FONT_FAMILIES[note.font] || FONT_FAMILIES.typewriter}", sans-serif`;
    const start = 226 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => context.fillText(line, 256, start + index * lineHeight, 434));
  }
  context.fillStyle = 'rgba(38,35,30,.64)';
  context.textAlign = 'right';
  context.font = '22px "Roboto Mono", monospace';
  context.fillText(noteAuthor(note), 480, 474, 330);
  record.texture.needsUpdate = true;
}

function noteTexture(note) {
  const {canvas, context} = textureCanvas(512, 512, NOTE_TEXTURE_SCALE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const record = {canvas, context, texture, note, pictureAge:null,
    born:Number(note.createdAt || 0), dies:Number(note.expiration || 0)};
  noteSurfaces.push(record);
  renderNoteSurface(record);
  texture.userData.surface = record;
  return texture;
}

function noteAuthor(note) {
  if (note?.anonymous) return '~anonymous';
  const known = authorLabels.get(note?.pubkey);
  if (known) return known;
  try {
    const npub = window.NostrTools.nip19.npubEncode(note?.pubkey || '');
    return `~${npub.slice(0, 9)}...${npub.slice(-5)}`;
  } catch {
    const key = String(note?.pubkey || '');
    return key ? `~${key.slice(0, 8)}...${key.slice(-5)}` : '~unknown';
  }
}

function readAuthorProfiles(relay, pubkeys) {
  return new Promise(resolve => {
    const profiles = new Map();
    let socket;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve(profiles);
    };
    const timer = setTimeout(finish, 3500);
    try { socket = new WebSocket(relay); } catch { finish(); return; }
    const subscription = `pinstr-world-authors-${Date.now()}-${Math.random()}`;
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription,
      {authors:pubkeys, kinds:[0], limit:Math.min(1000, pubkeys.length * 2)}])));
    socket.addEventListener('message', message => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EOSE' && data[1] === subscription) { finish(); return; }
      const event = data[2];
      if (data[0] !== 'EVENT' || data[1] !== subscription || !pubkeys.includes(event?.pubkey)
          || !window.NostrTools?.verifyEvent(event)) return;
      const current = profiles.get(event.pubkey);
      if (!current || event.created_at > current.created_at) profiles.set(event.pubkey, event);
    });
    socket.addEventListener('error', finish);
    socket.addEventListener('close', finish);
  });
}

function authorLabelFromProfile(event, pubkey) {
  if (event) {
    try {
      const profile = JSON.parse(event.content || '{}');
      const identity = String(profile.name || profile.display_name || profile.displayName || profile.nip05 || '')
        .trim().replace(/\s+/g, ' ');
      if (identity) return `~${identity.slice(0, 80)}`;
    } catch {}
  }
  try {
    const npub = window.NostrTools.nip19.npubEncode(pubkey);
    return `~${npub.slice(0, 9)}...${npub.slice(-5)}`;
  } catch { return `~${String(pubkey || '').slice(0, 8)}...${String(pubkey || '').slice(-5)}`; }
}

function redrawAuthor(pubkey) {
  noteSurfaces.filter(record => record.note.pubkey === pubkey)
    .forEach(record => renderNoteSurface(record));
}

async function flushAuthorProfiles() {
  authorProfileTimer = 0;
  const pubkeys = [...authorProfileQueue].filter(pubkey => !authorProfilesLoading.has(pubkey));
  authorProfileQueue.clear();
  if (!pubkeys.length) return;
  pubkeys.forEach(pubkey => authorProfilesLoading.add(pubkey));
  try {
    const results = await Promise.allSettled([
      readAuthorProfiles(RELAY, pubkeys),
      readAuthorProfiles('wss://relay.damus.io', pubkeys),
      readAuthorProfiles('wss://nos.lol', pubkeys),
      readAuthorProfiles('wss://relay.ditto.pub', pubkeys),
    ]);
    const newest = new Map();
    results.filter(result => result.status === 'fulfilled').forEach(result => result.value.forEach((event, pubkey) => {
      if (!newest.has(pubkey) || event.created_at > newest.get(pubkey).created_at) newest.set(pubkey, event);
    }));
    pubkeys.forEach(pubkey => {
      authorLabels.set(pubkey, authorLabelFromProfile(newest.get(pubkey), pubkey));
      redrawAuthor(pubkey);
    });
  } finally { pubkeys.forEach(pubkey => authorProfilesLoading.delete(pubkey)); }
}

function requestAuthorProfile(note) {
  const pubkey = String(note?.pubkey || '');
  if (note?.anonymous || !/^[0-9a-f]{64}$/.test(pubkey) || authorLabels.has(pubkey)
      || authorProfilesLoading.has(pubkey)) return;
  authorProfileQueue.add(pubkey);
  clearTimeout(authorProfileTimer);
  authorProfileTimer = setTimeout(flushAuthorProfiles, 90);
}

const openWorldGiftDialog = createWorldGiftDialog({
  relay:RELAY,
  noteFor:eventId => notes.get(eventId),
  authorFor:note => noteAuthor(note),
  loginHref:(() => {
    const url = new URL(boardUrl, location.origin);
    url.searchParams.set('login', '1');
    return `${url.pathname}?${url.searchParams}`;
  })(),
});

function redrawNoteSurfaces() { noteSurfaces.forEach(record => renderNoteSurface(record)); }
paperGrainImage.addEventListener('load', redrawNoteSurfaces);
paperCreaseImage.addEventListener('load', redrawNoteSurfaces);
paperGrainImage.src = '/img/grain.png';
paperCreaseImage.src = '/img/note-crumple.png';
document.fonts?.ready?.then(redrawNoteSurfaces);

function attachPicture(group, paper, note, width) {
  if (!note.image) return null;
  const cssWidth = 512;
  const cssHeight = 445;
  const imageWidth = width * .84;
  const imageHeight = width * .73;
  const centreY = .065;
  const depth = .014;
  const picture = document.createElement('div');
  picture.className = 'world-picture';
  picture.hidden = true;
  picture.style.width = `${cssWidth}px`;
  picture.style.height = `${cssHeight}px`;
  const image = document.createElement('img');
  image.className = 'world-picture__image';
  image.src = note.image;
  image.alt = '';
  image.decoding = 'async';
  image.loading = 'lazy';
  const age = document.createElement('img');
  age.className = 'world-picture__age';
  age.src = '/img/note-crumple.png';
  age.alt = '';
  age.setAttribute('aria-hidden', 'true');
  picture.append(image, age);
  elements.pictureLayer.append(picture);
  pictureOverlays.push({
    group, paper, picture, cssWidth, cssHeight,
    corners:[
      new THREE.Vector3(-imageWidth / 2, centreY + imageHeight / 2, depth),
      new THREE.Vector3(imageWidth / 2, centreY + imageHeight / 2, depth),
      new THREE.Vector3(imageWidth / 2, centreY - imageHeight / 2, depth),
      new THREE.Vector3(-imageWidth / 2, centreY - imageHeight / 2, depth),
    ],
    projected:Array.from({length:4}, () => new THREE.Vector3()),
    centre:new THREE.Vector3(0, centreY, depth),
    front:new THREE.Vector3(0, centreY, depth + .1),
    occlusionSamples:[
      new THREE.Vector3(0, centreY, depth),
      new THREE.Vector3(-imageWidth * .35, centreY + imageHeight * .35, depth),
      new THREE.Vector3(imageWidth * .35, centreY + imageHeight * .35, depth),
      new THREE.Vector3(imageWidth * .35, centreY - imageHeight * .35, depth),
      new THREE.Vector3(-imageWidth * .35, centreY - imageHeight * .35, depth),
    ],
    occlusionWorld:Array.from({length:5}, () => new THREE.Vector3()),
    occluded:false,
    lastOcclusionCheck:0,
  });
  return age;
}

function quadrilateralTransform(points, width, height) {
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > .00001 || Math.abs(dy3) > .00001) {
    if (Math.abs(determinant) < .00001) return '';
    g = (dx3 * dy2 - dx2 * dy3) / determinant;
    h = (dx1 * dy3 - dx3 * dy1) / determinant;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  return `matrix3d(${a / width},${d / width},0,${g / width},${b / height},${e / height},0,${h / height},0,0,1,0,${p0.x},${p0.y},0,1)`;
}

const overlayCentre = new THREE.Vector3();
const overlayFront = new THREE.Vector3();
const overlayNormal = new THREE.Vector3();
const overlayToCamera = new THREE.Vector3();
const occlusionDirection = new THREE.Vector3();
const occlusionRaycaster = new THREE.Raycaster();
function pictureIsOccluded(overlay) {
  return overlay.occlusionSamples.some((sample, index) => {
    const target = overlay.occlusionWorld[index].copy(sample).applyMatrix4(overlay.group.matrixWorld);
    occlusionDirection.copy(target).sub(camera.position);
    const distance = occlusionDirection.length();
    if (distance <= .03) return false;
    occlusionRaycaster.set(camera.position, occlusionDirection.normalize());
    occlusionRaycaster.near = .02;
    occlusionRaycaster.far = distance - .02;
    return occlusionRaycaster.intersectObjects(paperMeshes, false)
      .some(hit => hit.object !== overlay.paper);
  });
}

function updatePictureOverlays() {
  const now = performance.now();
  for (const overlay of pictureOverlays) {
    overlay.group.updateWorldMatrix(true, false);
    overlayCentre.copy(overlay.centre).applyMatrix4(overlay.group.matrixWorld);
    overlayFront.copy(overlay.front).applyMatrix4(overlay.group.matrixWorld);
    overlayNormal.copy(overlayFront).sub(overlayCentre).normalize();
    overlayToCamera.copy(camera.position).sub(overlayCentre);
    const frontFacing = overlayNormal.dot(overlayToCamera) > 0;
    const points = overlay.projected.map((projected, index) => {
      projected.copy(overlay.corners[index]).applyMatrix4(overlay.group.matrixWorld).project(camera);
      return {
        x:(projected.x * .5 + .5) * innerWidth,
        y:(-projected.y * .5 + .5) * innerHeight,
        z:projected.z,
      };
    });
    const inDepth = points.every(point => point.z > -1 && point.z < 1);
    const onScreen = Math.max(...points.map(point => point.x)) >= 0
      && Math.min(...points.map(point => point.x)) <= innerWidth
      && Math.max(...points.map(point => point.y)) >= 0
      && Math.min(...points.map(point => point.y)) <= innerHeight;
    if (frontFacing && inDepth && onScreen && now - overlay.lastOcclusionCheck >= 80) {
      overlay.occluded = pictureIsOccluded(overlay);
      overlay.lastOcclusionCheck = now;
    }
    const transform = frontFacing && inDepth && onScreen && !overlay.occluded
      ? quadrilateralTransform(points, overlay.cssWidth, overlay.cssHeight) : '';
    const visible = Boolean(transform);
    overlay.picture.hidden = !visible;
    if (!visible) continue;
    overlay.picture.style.transform = transform;
    overlay.picture.style.zIndex = String(Math.max(1,
      Math.round(10000 - overlayToCamera.length() * 100)));
  }
}

function labelTexture(text) {
  const {canvas, context} = textureCanvas(1024, 128);
  context.font = '300 54px "Roboto Mono", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(242,169,0,.82)';
  context.fillText(text, 512, 64, 940);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function addBoardEngravings(group, cell) {
  const geometry = new THREE.PlaneGeometry(4.5, .28);
  const material = new THREE.MeshBasicMaterial({
    map:labelTexture(cell),
    transparent:true,
    depthWrite:false,
    side:THREE.DoubleSide,
  });
  const engravings = [
    // Each wire label sits on an inside edge and faces the board centre.
    {x:0, z:-5.184, turn:0},
    {x:0, z:5.184, turn:Math.PI},
    {x:-5.264, z:0, turn:Math.PI / 2},
    {x:5.264, z:0, turn:-Math.PI / 2},
  ];
  return engravings.map(engraving => {
    const label = new THREE.Mesh(geometry, material);
    label.position.set(engraving.x, .03, engraving.z);
    label.rotation.set(0, engraving.turn, 0);
    label.renderOrder = 2;
    group.add(label);
    return label;
  });
}

function ensurePlatform(cell) {
  if (!cell) return null;
  if (platforms.has(cell)) return platforms.get(cell);
  const index = platformOrder.length;
  const position = worldPlatformPosition(index);
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);
  // Keep an invisible hit plane so an outline-only board remains selectable.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 10.4), new THREE.MeshBasicMaterial({
    transparent:true, opacity:0, depthWrite:false,
  }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -.065;
  base.userData.cell = cell;
  group.add(base);
  const engravings = addBoardEngravings(group, cell);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(11.36, .46, 11.36)),
    new THREE.LineBasicMaterial({color:0xf2a900, transparent:true, opacity:index ? .24 : .66}),
  );
  outline.position.y = -.03;
  group.add(outline);
  group.userData = {cell, index, base, outline, engravings};
  scene.add(group);
  platforms.set(cell, group);
  platformOrder.push(cell);
  platformMeshes.push(base);
  return group;
}

function portalLabelTexture(cell, count, color) {
  const logicalWidth = 768;
  const logicalHeight = 160;
  const {canvas, context} = textureCanvas(logicalWidth, logicalHeight);
  context.fillStyle = 'rgba(8,10,10,.78)';
  context.fillRect(0, 0, logicalWidth, logicalHeight);
  context.strokeStyle = color;
  context.lineWidth = 8;
  context.strokeRect(4, 4, logicalWidth - 8, logicalHeight - 8);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 54px "Roboto Mono", monospace';
  context.fillText(cell, logicalWidth / 2, 61, 700);
  context.fillStyle = color;
  context.font = '600 31px "Roboto Mono", monospace';
  context.fillText(`${count} live note${count === 1 ? '' : 's'}`, logicalWidth / 2, 119, 700);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clearPortals() {
  setHoveredPortal(null);
  for (const portal of portals.values()) {
    scene.remove(portal);
    portal.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
      else object.material?.dispose?.();
      object.material?.map?.dispose?.();
    });
  }
  portals.clear();
  portalMeshes.length = 0;
}

function renderPortals(activity, origin = activeCell) {
  clearPortals();
  const centre = platforms.get(origin)?.position || new THREE.Vector3();
  const colors = {parent:'#43d17b', child:'#ff5151', sibling:'#bf78ff'};
  [...activity.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([cell, ids]) => {
    const placement = worldPortalPosition(origin, cell);
    if (!placement || !ids.size) return;
    const color = colors[placement.relation];
    const group = new THREE.Group();
    group.position.set(centre.x + placement.x, centre.y + placement.y, centre.z + placement.z);
    group.lookAt(centre.x, centre.y + 1.65, centre.z);
    const glow = new THREE.Mesh(new THREE.RingGeometry(.72, 1.05, 48), new THREE.MeshBasicMaterial({
      color, transparent:true, opacity:.24, side:THREE.DoubleSide, depthWrite:false,
    }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(.82, .94, 48), new THREE.MeshBasicMaterial({
      color, transparent:true, opacity:.9, side:THREE.DoubleSide, depthWrite:false,
    }));
    const hit = new THREE.Mesh(new THREE.CircleGeometry(1.08, 32), new THREE.MeshBasicMaterial({
      transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false,
    }));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.7, .56), new THREE.MeshBasicMaterial({
      map:portalLabelTexture(cell, ids.size, color), transparent:true, side:THREE.DoubleSide, depthWrite:false,
    }));
    label.position.y = -1.42;
    group.add(glow, ring, hit, label);
    const portalData = {
      cell, relation:placement.relation, group, glow, ring, hit,
      phase:portals.size * .73,
    };
    group.userData = portalData;
    hit.userData = portalData;
    scene.add(group);
    portals.set(cell, group);
    portalMeshes.push(hit);
  });
}

function buildNote(note, {draft = false} = {}) {
  const group = new THREE.Group();
  const width = 1.28;
  const surfaceTexture = noteTexture(note);
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width),
    new THREE.MeshBasicMaterial({map:surfaceTexture, side:THREE.DoubleSide,
      transparent:draft, opacity:draft ? .9 : 1}),
  );
  group.add(paper);
  paper.userData = {note, group};
  paperMeshes.push(paper);
  const pictureAge = attachPicture(group, paper, note, width);
  const surface = surfaceTexture.userData.surface;
  surface.pictureAge = pictureAge;
  if (pictureAge) {
    pictureAge.style.setProperty('--age-angle', `${noteTexturePlacement(note.id).angle}deg`);
    renderNoteSurface(surface);
  }
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(.06, 16, 10),
    new THREE.MeshStandardMaterial({color:PIN_COLORS[pinColourFor(note.id || pending?.contentHash)] || PIN_COLORS.red,
      roughness:.28, metalness:.2}),
  );
  pin.position.set(0, width * .47, .055);
  pin.userData = {note, group};
  group.add(pin);
  const pinTarget = new THREE.Mesh(
    new THREE.SphereGeometry(.12, 12, 8),
    new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false}),
  );
  pinTarget.position.copy(pin.position);
  pinTarget.userData = {note, group};
  group.add(pinTarget);
  group.userData = {note, pin, pinTarget, draft};
  pinMeshes.push(pinTarget);
  noteGroups.push(group);
  scene.add(group);
  return group;
}

function placeNoteGroup(group, cell, index = 0, total = 1) {
  const platform = ensurePlatform(cell);
  const local = worldNotePosition(group.userData.note.id || pending?.contentHash || 'draft', index, total);
  group.position.set(platform.position.x + local.x, platform.position.y + local.y, platform.position.z + local.z);
  if (local.floor) {
    group.rotation.set(-Math.PI / 2, 0, local.roll);
  } else {
    group.lookAt(platform.position.x, platform.position.y + 1.65, platform.position.z);
    group.rotateZ(local.roll);
    group.rotateX(local.pitch);
  }
  group.userData.cell = cell;
  group.userData.home = {x:platform.position.x, y:platform.position.y, z:platform.position.z};
  group.userData.boardRotation = local.roll;
  group.userData.floor = local.floor;
}

function layoutCellNotes(cell) {
  const groups = noteGroups
    .filter(group => !group.userData.draft && group.userData.cell === cell)
    .sort((left, right) => String(left.userData.note.id).localeCompare(String(right.userData.note.id)));
  groups.forEach((group, index) => placeNoteGroup(group, cell, index, groups.length));
}

function addNote(note, event = null, {layout = true} = {}) {
  if (!note?.id || notes.has(note.id)) return '';
  const cell = worldCellForNote(note, board.cells, board.depth);
  if (!cell) return '';
  const detailed = {...note, event};
  notes.set(note.id, detailed);
  const group = buildNote(detailed);
  requestAuthorProfile(detailed);
  placeNoteGroup(group, cell);
  if (layout) layoutCellNotes(cell);
  return cell;
}

function createDraft() {
  if (!canPlace || draftGroup) return;
  const draft = {...pending, id:pending.contentHash || `draft-${Date.now()}`};
  draftGroup = buildNote(draft, {draft:true});
  const neighbours = noteGroups.filter(group => !group.userData.draft && group.userData.cell === activeCell).length;
  placeNoteGroup(draftGroup, activeCell, neighbours, neighbours + 1);
  draftGroup.position.z += .45;
  setStatus('Hold the pin for half a second, then move the note.', 5000);
}

function closeNoteMenu() {
  clearInterval(noteExpiryTimer);
  noteExpiryTimer = 0;
  selectedNote = null;
  elements.noteMenu.hidden = true;
  elements.noteEventJsonDetails.open = false;
  elements.noteEventJson.textContent = '';
  elements.noteMenuStatus.textContent = '';
  elements.noteMenuStatus.classList.remove('is-error');
}

function startNoteExpiryCountdown(expiresAt, createdAt) {
  clearInterval(noteExpiryTimer);
  noteExpiryTimer = 0;
  if (!expiresAt) {
    elements.noteExpiryAged.hidden = true;
    return;
  }
  const tick = () => {
    elements.noteExpiryCountdown.textContent = stickyExpiryCountdown(expiresAt / 1000);
    const age = noteAgeFraction(createdAt, expiresAt / 1000);
    const aged = age === null ? '' : `${Math.round(age * 100)}% aged`;
    elements.noteExpiryAged.textContent = aged;
    elements.noteExpiryAged.hidden = !aged;
  };
  tick();
  noteExpiryTimer = setInterval(tick, 1000);
}

function showNote(note, anchor = {}) {
  if (!note?.event) return;
  selectedNote = note;
  elements.noteEventId.textContent = note.id;
  const badge = stickyPaymentBadge(note.paid);
  elements.notePaidBadge.hidden = !badge;
  elements.notePaidBadge.dataset.payment = badge?.id || '';
  if (badge) {
    elements.notePaidBadgeIcon.className = `lni ${badge.icon}`;
    elements.notePaidBadgeLabel.textContent = badge.label;
    elements.notePaidBadge.title = badge.title;
  }
  const agentTag = note.event.tags?.find(tag => tag?.[0] === 'agent');
  elements.noteAgentBadge.hidden = !agentTag;
  if (agentTag) {
    elements.noteAgentBadgeIcon.className = 'lni lni-bedrock';
    elements.noteAgentBadgeLabel.textContent = 'Posted by an AI agent';
    elements.noteAgentBadge.title = `${agentTag[1] || 'an agent'} - declared in the note itself`;
  }
  elements.noteEventJsonDetails.open = false;
  elements.noteEventJson.textContent = JSON.stringify(note.event, null, 2);
  elements.notePostedAt.dateTime = new Date(note.event.created_at * 1000).toISOString();
  elements.notePostedAt.textContent = new Intl.DateTimeFormat(undefined,
    {dateStyle:'medium', timeStyle:'short'}).format(note.event.created_at * 1000);
  const expiresTag = Number(note.event.tags?.find(tag => tag?.[0] === 'expiration')?.[1]);
  const expiresAt = Number.isFinite(expiresTag) && expiresTag > 0 ? expiresTag * 1000 : 0;
  elements.noteExpiresLabel.hidden = !expiresAt;
  elements.noteExpirationValue.hidden = !expiresAt;
  if (expiresAt) {
    elements.noteExpiresAt.dateTime = new Date(expiresAt).toISOString();
    elements.noteExpiresAt.textContent = new Intl.DateTimeFormat(undefined,
      {dateStyle:'medium', timeStyle:'short'}).format(expiresAt);
  }
  startNoteExpiryCountdown(expiresAt, Number(note.event.created_at));
  elements.noteMenu.hidden = false;
  const rect = elements.noteMenu.getBoundingClientRect();
  const x = Number(anchor.x) || innerWidth / 2;
  const y = Number(anchor.y) || innerHeight / 2;
  elements.noteMenu.style.left = `${Math.min(innerWidth - rect.width - 12, Math.max(12, x - rect.width / 2))}px`;
  elements.noteMenu.style.top = `${Math.min(innerHeight - rect.height - 12, Math.max(12, y + 12))}px`;
}

async function copyText(value, button, success) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const field = document.createElement('textarea');
      field.value = value;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed');
      field.remove();
    }
    button.querySelector('span').textContent = success;
    setTimeout(() => { button.querySelector('span').textContent = button === elements.copyNoteId ? 'Copy ID' : 'Copy JSON'; }, 1800);
  } catch {
    elements.noteMenuStatus.textContent = 'Could not copy that value.';
    elements.noteMenuStatus.classList.add('is-error');
  }
}

function updatePointer(clientX, clientY) {
  const box = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - box.left) / box.width) * 2 - 1;
  pointer.y = -((clientY - box.top) / box.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function pinAt(clientX, clientY) {
  updatePointer(clientX, clientY);
  return raycaster.intersectObjects(pinMeshes, false)[0]?.object || null;
}

function signatureFromHit(hit) {
  if (!hit?.uv || hit.uv.x < .27 || hit.uv.y > .16) return null;
  return hit.object.userData.note || null;
}

function signatureAt(clientX, clientY) {
  updatePointer(clientX, clientY);
  return signatureFromHit(raycaster.intersectObjects(paperMeshes, false)[0]);
}

function selectInAr() {
  if (!xrSession) return;
  xrSelectMatrix.identity().extractRotation(xrController.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(xrController.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(xrSelectMatrix);
  const portal = raycaster.intersectObjects(portalMeshes, false)[0]?.object?.userData;
  if (portal?.cell) { beginPortalWarp(portal); return; }
  const pin = raycaster.intersectObjects(pinMeshes, false)[0]?.object;
  if (pin) { showNote(pin.userData.note, {x:innerWidth / 2, y:innerHeight / 2}); return; }
  const signature = signatureFromHit(raycaster.intersectObjects(paperMeshes, false)[0]);
  if (signature) openWorldGiftDialog(signature.id);
}

function platformAt(clientX, clientY) {
  updatePointer(clientX, clientY);
  return raycaster.intersectObjects(platformMeshes, false)[0]?.object?.userData?.cell || '';
}

function portalAt(clientX, clientY) {
  updatePointer(clientX, clientY);
  return raycaster.intersectObjects(portalMeshes, false)[0]?.object?.userData || null;
}

function setHoveredPortal(portal) {
  hoveredPortalCell = portal?.cell || '';
  elements.canvas.style.cursor = hoveredPortalCell ? 'pointer' : '';
}

function animatePortals(now) {
  for (const group of portals.values()) {
    const data = group.userData;
    const hovered = data.cell === hoveredPortalCell;
    if (!hovered) {
      group.scale.setScalar(1);
      data.glow.material.opacity = .24;
      data.ring.material.opacity = .9;
      continue;
    }
    const wave = .5 + Math.sin(now * .012 + data.phase) * .5;
    group.scale.setScalar(1.07 + wave * .14);
    data.glow.material.opacity = .34 + wave * .38;
    data.ring.material.opacity = .82 + wave * .18;
    data.ring.rotation.z = now * .0008;
  }
}

function setActiveCell(cell) {
  activeCell = cell;
  for (const [platformCell, platform] of platforms) {
    platform.userData.outline.material.opacity = platformCell === cell ? .66 : .24;
  }
  elements.geohash.textContent = cell || 'No board selected';
  elements.back.href = boardHref(cell ? [cell] : board.cells);
  elements.write.href = worldComposerHref(cell ? [cell] : board.cells);
  connectNearbyBoards(cell);
}

function resetView() {
  const platform = platforms.get(activeCell) || ensurePlatform(activeCell);
  if (!platform) return;
  orbit.target.set(platform.position.x, platform.position.y + 1.65, platform.position.z);
  camera.position.set(platform.position.x, platform.position.y + 1.65, platform.position.z + .05);
  setWorldZoom(1);
  orbit.update();
}

function flyToWorld(cell) {
  if (!cell || cell === activeCell || flight || portalWarp || !platforms.has(cell)) return;
  const destination = platforms.get(cell).position;
  flight = {
    cell,
    started:performance.now(),
    duration:matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 920,
    fromCamera:camera.position.clone(),
    fromTarget:orbit.target.clone(),
    toCamera:new THREE.Vector3(destination.x, destination.y + 1.65, destination.z + .05),
    toTarget:new THREE.Vector3(destination.x, destination.y + 1.65, destination.z),
  };
  orbit.enabled = false;
  closeNoteMenu();
  elements.flight.classList.remove('is-flying');
  void elements.flight.offsetWidth;
  elements.flight.classList.add('is-flying');
}

function beginPortalWarp(portal) {
  if (!portal?.cell || portalWarp || flight) return;
  const group = portals.get(portal.cell);
  if (!group) return;
  const destination = new THREE.Vector3();
  group.getWorldPosition(destination);
  const direction = destination.clone().sub(camera.position).normalize();
  portalWarp = {
    cell:portal.cell,
    started:performance.now(),
    duration:matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1120,
    fromCamera:camera.position.clone(),
    fromTarget:orbit.target.clone(),
    toCamera:destination.clone().addScaledVector(direction, -.18),
    toTarget:destination,
    fromZoom:camera.zoom,
  };
  setHoveredPortal(portal);
  orbit.enabled = false;
  closeNoteMenu();
  setStatus(`Warping to ${portal.cell}...`);
  elements.flight.classList.remove('is-flying', 'is-warping');
  void elements.flight.offsetWidth;
  elements.flight.classList.add('is-warping');
}

function stepPortalWarp(now) {
  if (!portalWarp || portalWarp.finished) return;
  const amount = Math.min(1, (now - portalWarp.started) / portalWarp.duration);
  const eased = worldPortalWarpProgress(amount);
  camera.position.lerpVectors(portalWarp.fromCamera, portalWarp.toCamera, eased);
  orbit.target.lerpVectors(portalWarp.fromTarget, portalWarp.toTarget, eased);
  camera.zoom = portalWarp.fromZoom * (1 + eased * .16);
  camera.updateProjectionMatrix();
  if (amount < 1) return;
  portalWarp.finished = true;
  location.assign(worldHref([portalWarp.cell], board.depth));
}

function stepFlight(now) {
  if (!flight) return;
  const amount = Math.min(1, (now - flight.started) / flight.duration);
  const eased = worldFlightProgress(amount);
  camera.position.lerpVectors(flight.fromCamera, flight.toCamera, eased);
  orbit.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
  if (amount < 1) return;
  camera.position.copy(flight.toCamera);
  orbit.target.copy(flight.toTarget);
  setActiveCell(flight.cell);
  flight = null;
  orbit.enabled = !dragged;
  elements.flight.classList.remove('is-flying');
}

function moveView(forward, sideways = 0, vertical = 0) {
  if (flight || portalWarp) return;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;
  direction.normalize();
  const side = new THREE.Vector3(direction.z, 0, -direction.x);
  const movement = direction.multiplyScalar(forward).add(side.multiplyScalar(sideways));
  movement.y = vertical;
  camera.position.add(movement);
  orbit.target.add(movement);
}

function rotateView(angle) {
  const offset = camera.position.clone().sub(orbit.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  camera.position.copy(orbit.target).add(offset);
}

function faceDraggedNote(group) {
  group.lookAt(camera.position);
  group.rotateZ(group.userData.boardRotation || 0);
}

const draggedTarget = new THREE.Vector3();
const draggedPinOffset = new THREE.Vector3();
function moveDraggedNote(clientX, clientY) {
  if (!dragged) return;
  updatePointer(clientX, clientY);
  draggedTarget.copy(camera.position).addScaledVector(raycaster.ray.direction, dragged.distance);
  dragged.group.position.copy(draggedTarget);
  faceDraggedNote(dragged.group);
  draggedPinOffset.copy(dragged.grabLocal).applyQuaternion(dragged.group.quaternion);
  dragged.group.position.sub(draggedPinOffset);
  faceDraggedNote(dragged.group);
  draggedPinOffset.copy(dragged.grabLocal).applyQuaternion(dragged.group.quaternion);
  dragged.group.position.copy(draggedTarget).sub(draggedPinOffset);
}

function neighbouringWorld(step) {
  if (platformOrder.length < 2) return;
  const current = Math.max(0, platformOrder.indexOf(activeCell));
  flyToWorld(platformOrder[(current + step + platformOrder.length) % platformOrder.length]);
}

function finishPlacement() {
  if (!draftGroup) return;
  const platform = platforms.get(activeCell);
  const placement = boardPlacementFromWorld({
    x:draftGroup.position.x,
    y:draftGroup.position.y,
    rotation:THREE.MathUtils.radToDeg(draftGroup.userData.boardRotation || 0),
  }, platform?.position || {});
  const next = {...readPending(), placement, geohash:activeCell, geohashes:[activeCell]};
  localStorage.setItem(PENDING_KEY, JSON.stringify(next));
  const returnUrl = new URL(boardHref(next.geohashes || board.cells), location.origin);
  returnUrl.searchParams.set('world', 'ready');
  location.assign(`${returnUrl.pathname}${returnUrl.search}`);
}

function connectBoard() {
  clearTimeout(reconnectTimer);
  if (!board.cells.length) { setStatus('Choose a geohash on the board first.'); return; }
  const subscription = `pinstr-world-${Date.now()}`;
  let initialSync = true;
  const pendingLayouts = new Set();
  const socket = new WebSocket(RELAY);
  boardSocket = socket;
  socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, {
    kinds:[1], '#t':[STICKY_TOPIC], '#g':board.cells, limit:1000,
  }])));
  socket.addEventListener('message', message => {
    try {
      const data = JSON.parse(message.data);
      if (data[0] === 'EOSE' && data[1] === subscription) {
        initialSync = false;
        pendingLayouts.forEach(layoutCellNotes);
        pendingLayouts.clear();
        setStatus(notes.size ? 'Tap a pin for details. Hold it for 500 ms to move the note.' : 'No notes are pinned in this world yet.', 5000);
        return;
      }
      if (data[0] !== 'EVENT' || data[1] !== subscription || !window.NostrTools?.verifyEvent(data[2])) return;
      const note = parseStickyEvent(data[2]);
      if (!note || isStickyExpired(note)
        || !geohashMatchesBoard(note.geohashes, board.cells, board.depth, note.exactGeohash)) return;
      const cell = addNote(note, data[2], {layout:!initialSync});
      if (cell && initialSync) pendingLayouts.add(cell);
    } catch {}
  });
  socket.addEventListener('error', () => setStatus('The public Nostr board is temporarily unavailable.'));
  socket.addEventListener('close', () => {
    if (boardSocket === socket) boardSocket = null;
    if (!document.hidden) reconnectTimer = setTimeout(connectBoard, 5000);
  }, {once:true});
}

function nearbyPortalCell(noteCell, origin, siblings) {
  const relation = worldBoardRelation(origin, noteCell);
  if (relation) return noteCell;
  return siblings.find(cell => noteCell.startsWith(cell)) || '';
}

function connectNearbyBoards(cell = activeCell) {
  clearTimeout(nearbyReconnectTimer);
  nearbyReconnectTimer = 0;
  nearbyConnectionVersion += 1;
  const version = nearbyConnectionVersion;
  try { nearbySocket?.close(); } catch {}
  nearbySocket = null;
  clearPortals();
  if (!cell) return;
  const related = worldNearbyCells(cell);
  const siblings = related.filter(destination => worldBoardRelation(cell, destination) === 'sibling');
  const requested = [...new Set([cell, ...related])];
  const activity = new Map();
  let socket;
  try { socket = new WebSocket(RELAY); } catch { return; }
  nearbySocket = socket;
  const subscription = `pinstr-world-portals-${Date.now()}-${version}`;
  socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, {
    kinds:[1], '#t':[STICKY_TOPIC], '#g':requested, limit:1000,
  }])));
  socket.addEventListener('message', message => {
    if (version !== nearbyConnectionVersion || cell !== activeCell) return;
    let data;
    try { data = JSON.parse(message.data); } catch { return; }
    if (data[0] === 'EOSE' && data[1] === subscription) {
      renderPortals(activity, cell);
      return;
    }
    const event = data[2];
    if (data[0] !== 'EVENT' || data[1] !== subscription || !window.NostrTools?.verifyEvent(event)) return;
    const note = parseStickyEvent(event);
    if (!note || isStickyExpired(note)) return;
    for (const noteCell of note.geohashes || [note.geohash]) {
      const destination = nearbyPortalCell(noteCell, cell, siblings);
      if (!destination || destination === cell) continue;
      const ids = activity.get(destination) || new Set();
      ids.add(note.id);
      activity.set(destination, ids);
    }
  });
  socket.addEventListener('close', () => {
    if (version !== nearbyConnectionVersion) return;
    if (nearbySocket === socket) nearbySocket = null;
    if (!document.hidden) nearbyReconnectTimer = setTimeout(() => connectNearbyBoards(cell), 7000);
  }, {once:true});
}

elements.canvas.addEventListener('wheel', event => {
  event.preventDefault();
  setWorldZoom(camera.zoom * Math.exp(-event.deltaY * .0012));
}, {passive:false});

elements.canvas.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') {
    zoomPointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    if (zoomPointers.size === 2) {
      const distance = pointerDistance(zoomPointers);
      pinchZoom = distance ? {distance, zoom:camera.zoom} : null;
      if (pinPress) {
        clearTimeout(pinPress.timer);
        pinPress = null;
        orbit.enabled = !flight;
      }
      if (portalPress) {
        portalPress = null;
        orbit.enabled = !flight && !portalWarp;
      }
      return;
    }
  }
  if (event.button > 0 || flight || portalWarp) return;
  const portal = portalAt(event.clientX, event.clientY);
  if (portal?.cell) {
    event.preventDefault();
    elements.canvas.setPointerCapture(event.pointerId);
    orbit.enabled = false;
    portalPress = {id:event.pointerId, portal, x:event.clientX, y:event.clientY};
    setHoveredPortal(portal);
    return;
  }
  const signature = signatureAt(event.clientX, event.clientY);
  if (signature) {
    event.preventDefault();
    openWorldGiftDialog(signature.id);
    return;
  }
  pointerStart = {x:event.clientX, y:event.clientY};
  const pin = pinAt(event.clientX, event.clientY);
  if (!pin) return;
  event.preventDefault();
  elements.canvas.setPointerCapture(event.pointerId);
  orbit.enabled = false;
  const press = {
    id:event.pointerId,
    pin,
    group:pin.userData.group,
    x:event.clientX,
    y:event.clientY,
    timer:0,
  };
  press.timer = setTimeout(() => {
    if (pinPress !== press) return;
    press.pin.getWorldPosition(draggedTarget);
    dragged = {
      ...press,
      distance:Math.max(1.25, camera.position.distanceTo(draggedTarget)),
      grabLocal:press.pin.position.clone(),
      moved:false,
    };
    pinPress = null;
    dragged.group.userData.floor = false;
    moveDraggedNote(press.x, press.y);
    setStatus('The note now follows your pointer.', 1800);
  }, PIN_HOLD_MS);
  pinPress = press;
});

elements.canvas.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' && zoomPointers.has(event.pointerId)) {
    zoomPointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    if (zoomPointers.size >= 2 && pinchZoom) {
      event.preventDefault();
      const distance = pointerDistance(zoomPointers);
      if (distance) setWorldZoom(pinchZoom.zoom * distance / pinchZoom.distance);
      return;
    }
  }
  if (portalPress?.id === event.pointerId) {
    if (Math.hypot(event.clientX - portalPress.x, event.clientY - portalPress.y) > 12) {
      portalPress = null;
      orbit.enabled = !flight && !portalWarp;
    }
    return;
  }
  if (pinPress?.id === event.pointerId) {
    if (Math.hypot(event.clientX - pinPress.x, event.clientY - pinPress.y) > PIN_MOVE_SLOP_PX) {
      clearTimeout(pinPress.timer);
      pinPress = null;
      orbit.enabled = !flight;
    }
    return;
  }
  if (!dragged || dragged.id !== event.pointerId) {
    if (event.pointerType !== 'touch' && !flight && !portalWarp) setHoveredPortal(portalAt(event.clientX, event.clientY));
    return;
  }
  moveDraggedNote(event.clientX, event.clientY);
  dragged.moved ||= Math.hypot(event.clientX - dragged.x, event.clientY - dragged.y) > 6;
});

function releasePointer(event) {
  if (event.pointerType === 'touch') {
    zoomPointers.delete(event.pointerId);
    if (zoomPointers.size < 2) pinchZoom = null;
  }
  if (portalPress?.id === event.pointerId) {
    const released = portalPress;
    portalPress = null;
    beginPortalWarp(released.portal);
    pointerStart = null;
    return;
  }
  if (pinPress?.id === event.pointerId) {
    const released = pinPress;
    clearTimeout(released.timer);
    pinPress = null;
    orbit.enabled = !flight;
    pointerStart = null;
    showNote(released.pin.userData.note, {x:event.clientX, y:event.clientY});
    return;
  }
  if (dragged?.id === event.pointerId) {
    const released = dragged;
    dragged = null;
    orbit.enabled = !flight;
    if (!released.moved) showNote(released.pin.userData.note, {x:event.clientX, y:event.clientY});
    pointerStart = null;
    return;
  }
  if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) <= 7) {
    const cell = platformAt(event.clientX, event.clientY);
    if (cell) flyToWorld(cell);
  }
  pointerStart = null;
}
elements.canvas.addEventListener('pointerup', releasePointer);
elements.canvas.addEventListener('pointercancel', event => {
  if (event.pointerType === 'touch') {
    zoomPointers.delete(event.pointerId);
    if (zoomPointers.size < 2) pinchZoom = null;
  }
  if (pinPress?.id === event.pointerId) {
    clearTimeout(pinPress.timer);
    pinPress = null;
    orbit.enabled = !flight;
  }
  if (portalPress?.id === event.pointerId) {
    portalPress = null;
    orbit.enabled = !flight && !portalWarp;
  }
  if (dragged?.id === event.pointerId) { dragged = null; orbit.enabled = !flight; }
  pointerStart = null;
});
elements.canvas.addEventListener('pointerleave', event => {
  if (event.pointerType !== 'touch' && !portalPress) setHoveredPortal(null);
});
elements.canvas.addEventListener('contextmenu', event => event.preventDefault());
elements.canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  setStatus('3D paused because the graphics context was lost. Restoring it…');
});
elements.canvas.addEventListener('webglcontextrestored', () => {
  setStatus('3D restored.', 1800);
});

elements.controlsToggle.addEventListener('click', () => {
  const opening = elements.controls.hidden;
  elements.controls.hidden = !opening;
  elements.controlsToggle.setAttribute('aria-expanded', String(opening));
});
elements.compass.addEventListener('click', toggleCompass);
elements.ar.addEventListener('click', toggleAr);
xrController.addEventListener('select', selectInAr);
window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
window.addEventListener('deviceorientation', handleDeviceOrientation, true);
document.addEventListener('pointerdown', event => {
  if (!elements.noteMenu.hidden && !event.target.closest('#noteMenu')) closeNoteMenu();
  if (elements.controls.hidden || event.target.closest('#worldControls, #worldControlsToggle')) return;
  elements.controls.hidden = true;
  elements.controlsToggle.setAttribute('aria-expanded', 'false');
});
elements.closeNoteMenu.addEventListener('click', closeNoteMenu);
elements.copyNoteId.addEventListener('click', () => {
  if (selectedNote) copyText(selectedNote.id, elements.copyNoteId, 'ID copied');
});
elements.copyNoteJson.addEventListener('click', () => {
  if (selectedNote?.event) copyText(JSON.stringify(selectedNote.event, null, 2), elements.copyNoteJson, 'JSON copied');
});
elements.finishPlacement.addEventListener('click', finishPlacement);

window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.toLowerCase();
  if (['w','a','s','d','q','e','r','arrowup','arrowdown','arrowleft','arrowright','escape'].includes(key)) event.preventDefault();
  if (key === 'w' || key === 'arrowup') moveView(.55, 0, key === 'arrowup' ? .12 : 0);
  else if (key === 's' || key === 'arrowdown') moveView(-.55, 0, key === 'arrowdown' ? -.12 : 0);
  else if (key === 'a') moveView(0, -.55);
  else if (key === 'd') moveView(0, .55);
  else if (key === 'arrowleft') rotateView(.12);
  else if (key === 'arrowright') rotateView(-.12);
  else if (key === 'q') neighbouringWorld(-1);
  else if (key === 'e') neighbouringWorld(1);
  else if (key === 'r') resetView();
  else if (key === 'escape') closeNoteMenu();
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, RENDER_PIXEL_RATIO));
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!boardSocket) connectBoard();
  if (!nearbySocket) connectNearbyBoards(activeCell);
});
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  noteSurfaces.forEach(record => renderNoteSurface(record, now));
}, 60000);
window.addEventListener('beforeunload', () => {
  clearTimeout(reconnectTimer);
  clearTimeout(nearbyReconnectTimer);
  try { boardSocket?.close(); } catch {}
  try { nearbySocket?.close(); } catch {}
});

for (const cell of board.cells) ensurePlatform(cell);
setActiveCell(activeCell);
resetView();
createDraft();
connectBoard();
renderer.setAnimationLoop(now => {
  if (MOBILE_RENDERING && !xrSession && now - renderer.userData.lastMobileFrame < 32) return;
  renderer.userData.lastMobileFrame = now;
  stepFlight(now);
  stepPortalWarp(now);
  animatePortals(now);
  if (!flight && !portalWarp && !compassActive && !xrSession) orbit.update();
  renderer.render(scene, camera);
  if (!xrSession) updatePictureOverlays();
});
detectWorldModes();
