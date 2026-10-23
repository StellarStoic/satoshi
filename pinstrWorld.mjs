import * as THREE from 'three';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {
  STICKY_TOPIC,
  geohashMatchesBoard,
  isStickyExpired,
  parseStickyEvent,
  pinColourFor,
  boardTextureUrl,
  DEFAULT_BOARD_TEXTURE_URL,
  stickyExpiryCountdown,
  stickyPaymentBadge,
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
  worldFlightProgress,
  worldNotePosition,
  worldPlatformPosition,
} from './pinstrWorldModel.mjs';

const RELAY = 'wss://nostr.satoshi.si';
const PENDING_KEY = 'satoshi:sticky:pending:v1';
const BOARD_CELLS_KEY = 'satoshi:sticky:geohash-cells:v1';
const BOARD_KEY = 'satoshi:sticky:geohash:v1';
const BOARD_DEPTH_KEY = 'satoshi:sticky:geohash-depth:v1';
const BOARD_TEXTURE_KEY = 'satoshi:sticky:board-texture:v1';
const PIN_HOLD_MS = 500;
const PIN_MOVE_SLOP_PX = 8;
const NOTE_COLORS = Object.freeze({yellow:'#f1d76b', pink:'#ed8baa', blue:'#76b9dc', green:'#83c995', orange:'#efaa58'});
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
const renderer = new THREE.WebGLRenderer({canvas:elements.canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x0d0f0f, 1);

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

const boardSurfaceMaterial = new THREE.MeshStandardMaterial({color:0xb27b42, roughness:.96, metalness:0});
const woodMaterial = new THREE.MeshStandardMaterial({color:0x81522e, roughness:.82, metalness:.04});
const woodEdgeMaterial = new THREE.MeshStandardMaterial({color:0x4d2c16, roughness:.9, metalness:0});
const textureLoader = new THREE.TextureLoader();
function applyBoardTexture(source, mayFallback = true) {
  textureLoader.load(source, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3.42, 3.42);
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    boardSurfaceMaterial.map = texture;
    boardSurfaceMaterial.color.set(0xffffff);
    boardSurfaceMaterial.needsUpdate = true;
  }, undefined, () => {
    if (mayFallback && source !== DEFAULT_BOARD_TEXTURE_URL) applyBoardTexture(DEFAULT_BOARD_TEXTURE_URL, false);
  });
}
applyBoardTexture(boardTextureUrl(localStorage.getItem(BOARD_TEXTURE_KEY)) || DEFAULT_BOARD_TEXTURE_URL);

const starPositions = [];
for (let index = 0; index < 650; index += 1) {
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
const notes = new Map();
const noteGroups = [];
const paperMeshes = [];
const pinMeshes = [];
const pictureOverlays = [];
const ageSurfaces = [];
let ageTextureVariants = [];
let activeCell = board.cells[0] || '';
let boardSocket = null;
let reconnectTimer = 0;
let flight = null;
let pointerStart = null;
let pinPress = null;
let dragged = null;
let draftGroup = null;
let selectedNote = null;
let noteExpiryTimer = 0;
const zoomPointers = new Map();
let pinchZoom = null;

function setWorldZoom(value) {
  camera.zoom = Math.max(.65, Math.min(2.5, Number(value) || 1));
  camera.updateProjectionMatrix();
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

function wrapLines(context, text, maxWidth, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && lines.join(' ').length < words.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}...`;
  }
  return lines;
}

function noteTexture(note) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = note.image ? '#f5f3eb' : (NOTE_COLORS[note.color] || NOTE_COLORS.yellow);
  context.fillRect(0, 0, 512, 512);
  const shade = context.createLinearGradient(0, 0, 512, 512);
  shade.addColorStop(0, 'rgba(255,255,255,.23)');
  shade.addColorStop(.72, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(60,35,0,.16)');
  context.fillStyle = shade;
  context.fillRect(0, 0, 512, 512);
  context.fillStyle = '#171612';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (note.image) {
    context.fillStyle = '#d7d4ca';
    context.fillRect(42, 42, 428, 374);
  } else {
    const content = note.content || 'Your note';
    const size = content.length > 300 ? 25 : content.length > 150 ? 31 : content.length > 70 ? 39 : 48;
    context.font = `${size}px "${FONT_FAMILIES[note.font] || 'Noto Sans'}", sans-serif`;
    const lines = wrapLines(context, content, 430, Math.max(4, Math.floor(345 / (size * 1.28))));
    const lineHeight = size * 1.28;
    const start = 226 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => context.fillText(line, 256, start + index * lineHeight, 440));
  }
  context.fillStyle = 'rgba(31,29,25,.64)';
  context.textAlign = 'right';
  context.font = '22px "Roboto Mono", monospace';
  context.fillText(noteAuthor(note), 480, 474, 330);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function noteAuthor(note) {
  if (note?.anonymous) return '~anonymous';
  try {
    const npub = window.NostrTools.nip19.npubEncode(note?.pubkey || '');
    return `~${npub.slice(0, 9)}...${npub.slice(-5)}`;
  } catch {
    const key = String(note?.pubkey || '');
    return key ? `~${key.slice(0, 8)}...${key.slice(-5)}` : '~unknown';
  }
}

function updateAgeSurface(record, now = Math.floor(Date.now() / 1000)) {
  const opacity = noteAgeTextureOpacity(noteAgeFraction(record.born, record.dies, now));
  record.material.opacity = opacity;
  if (record.pictureAge) record.pictureAge.style.opacity = opacity.toFixed(3);
}

function applyAgeTexture(record) {
  if (!ageTextureVariants.length) return;
  record.material.map = ageTextureVariants[record.variant % ageTextureVariants.length];
  record.material.needsUpdate = true;
}

function attachAgeSurface(group, note, width, pictureAge = null) {
  const placement = noteTexturePlacement(note.id);
  const material = new THREE.MeshBasicMaterial({
    color:0xffffff,
    transparent:true,
    opacity:0,
    depthWrite:false,
    side:THREE.DoubleSide,
    blending:THREE.MultiplyBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width), material);
  mesh.position.z = .009;
  group.add(mesh);
  const record = {
    material,
    pictureAge,
    born:Number(note.createdAt || 0),
    dies:Number(note.expiration || 0),
    variant:Math.floor((((placement.angle % 360) + 360) % 360) / 45),
  };
  ageSurfaces.push(record);
  applyAgeTexture(record);
  updateAgeSurface(record);
}

textureLoader.load('/img/note-crumple.png', texture => {
  texture.colorSpace = THREE.SRGBColorSpace;
  ageTextureVariants = Array.from({length:8}, (_, index) => {
    const variant = texture.clone();
    variant.center.set(.5, .5);
    variant.rotation = index * Math.PI / 4;
    variant.needsUpdate = true;
    return variant;
  });
  ageSurfaces.forEach(applyAgeTexture);
});

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
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(12,13,14,.82)';
  context.fillRect(0, 18, 768, 92);
  context.strokeStyle = '#f2a900';
  context.lineWidth = 3;
  context.strokeRect(2, 20, 764, 88);
  context.fillStyle = '#ffffff';
  context.font = '700 42px "Roboto Mono", monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 384, 64, 720);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function ensurePlatform(cell) {
  if (!cell) return null;
  if (platforms.has(cell)) return platforms.get(cell);
  const index = platformOrder.length;
  const position = worldPlatformPosition(index);
  const group = new THREE.Group();
  group.position.set(position.x, position.y, position.z);
  // The platform is the same square board as the 2D desk: a tiled board surface inside wooden rails.
  const backing = new THREE.Mesh(new THREE.BoxGeometry(10.9, .28, 10.9), woodEdgeMaterial);
  backing.position.y = -.22;
  group.add(backing);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 10.4), boardSurfaceMaterial);
  base.rotation.x = -Math.PI / 2;
  base.position.y = -.065;
  base.userData.cell = cell;
  group.add(base);
  const railLong = new THREE.BoxGeometry(11.3, .4, .38);
  const railShort = new THREE.BoxGeometry(.38, .4, 10.55);
  for (const z of [-5.38, 5.38]) {
    const rail = new THREE.Mesh(railLong, woodMaterial);
    rail.position.set(0, .03, z);
    group.add(rail);
  }
  for (const x of [-5.46, 5.46]) {
    const rail = new THREE.Mesh(railShort, woodMaterial);
    rail.position.set(x, .03, 0);
    group.add(rail);
  }
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(11.36, .46, 11.36)),
    new THREE.LineBasicMaterial({color:0xf2a900, transparent:true, opacity:index ? .24 : .66}),
  );
  outline.position.y = -.03;
  group.add(outline);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture(cell), transparent:true, depthWrite:false}));
  label.scale.set(4.8, .8, 1);
  label.position.set(0, .35, -4.55);
  group.add(label);
  group.userData = {cell, index, base, outline};
  scene.add(group);
  platforms.set(cell, group);
  platformOrder.push(cell);
  platformMeshes.push(base);
  return group;
}

function buildNote(note, {draft = false} = {}) {
  const group = new THREE.Group();
  const width = 1.28;
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width),
    new THREE.MeshStandardMaterial({map:noteTexture(note), side:THREE.DoubleSide, roughness:.9, metalness:0,
      transparent:draft, opacity:draft ? .9 : 1}),
  );
  group.add(paper);
  paper.userData = {note, group};
  paperMeshes.push(paper);
  const pictureAge = attachPicture(group, paper, note, width);
  attachAgeSurface(group, note, width, pictureAge);
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(.095, 18, 12),
    new THREE.MeshStandardMaterial({color:PIN_COLORS[pinColourFor(note.id || pending?.contentHash)] || PIN_COLORS.red,
      roughness:.28, metalness:.2}),
  );
  pin.position.set(0, width * .43, .055);
  pin.userData = {note, group};
  group.add(pin);
  group.userData = {note, pin, draft};
  pinMeshes.push(pin);
  noteGroups.push(group);
  scene.add(group);
  return group;
}

function placeNoteGroup(group, cell, index = 0) {
  const platform = ensurePlatform(cell);
  const local = worldNotePosition(group.userData.note.id || pending?.contentHash || 'draft', index);
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

function addNote(note, event = null) {
  if (!note?.id || notes.has(note.id)) return;
  const cell = worldCellForNote(note, board.cells, board.depth);
  if (!cell) return;
  const detailed = {...note, event};
  notes.set(note.id, detailed);
  const group = buildNote(detailed);
  placeNoteGroup(group, cell, notes.size - 1);
}

function createDraft() {
  if (!canPlace || draftGroup) return;
  const draft = {...pending, id:pending.contentHash || `draft-${Date.now()}`};
  draftGroup = buildNote(draft, {draft:true});
  placeNoteGroup(draftGroup, activeCell, noteGroups.length + 3);
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

function platformAt(clientX, clientY) {
  updatePointer(clientX, clientY);
  return raycaster.intersectObjects(platformMeshes, false)[0]?.object?.userData?.cell || '';
}

function setActiveCell(cell) {
  activeCell = cell;
  for (const [platformCell, platform] of platforms) {
    platform.userData.outline.material.opacity = platformCell === cell ? .66 : .24;
  }
  elements.geohash.textContent = cell || 'No board selected';
  elements.back.href = boardHref(cell ? [cell] : board.cells);
  elements.write.href = worldComposerHref(cell ? [cell] : board.cells);
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
  if (!cell || cell === activeCell || flight || !platforms.has(cell)) return;
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
  if (flight) return;
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

function updateDraggedNote(now) {
  if (!dragged) return;
  const elapsed = Math.min(.05, Math.max(0, (now - dragged.lastFrame) / 1000));
  dragged.lastFrame = now;
  dragged.angle += dragged.turn * elapsed * 1.9;
  dragged.group.position.x = dragged.centre.x + Math.cos(dragged.angle) * dragged.radius;
  dragged.group.position.z = dragged.centre.z + Math.sin(dragged.angle) * dragged.radius;
  faceDraggedNote(dragged.group);
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
  if (!board.cells.length) { setStatus('Choose a geohash on the corkboard first.'); return; }
  const subscription = `pinstr-world-${Date.now()}`;
  const socket = new WebSocket(RELAY);
  boardSocket = socket;
  socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, {
    kinds:[1], '#t':[STICKY_TOPIC], '#g':board.cells, limit:500,
  }])));
  socket.addEventListener('message', message => {
    try {
      const data = JSON.parse(message.data);
      if (data[0] === 'EOSE' && data[1] === subscription) {
        setStatus(notes.size ? 'Tap a pin for details. Hold it for 500 ms to move the note.' : 'No notes are pinned in this world yet.', 5000);
        return;
      }
      if (data[0] !== 'EVENT' || data[1] !== subscription || !window.NostrTools?.verifyEvent(data[2])) return;
      const note = parseStickyEvent(data[2]);
      if (!note || isStickyExpired(note)
        || !geohashMatchesBoard(note.geohashes, board.cells, board.depth, note.exactGeohash)) return;
      addNote(note, data[2]);
    } catch {}
  });
  socket.addEventListener('error', () => setStatus('The public Nostr board is temporarily unavailable.'));
  socket.addEventListener('close', () => {
    if (boardSocket === socket) boardSocket = null;
    if (!document.hidden) reconnectTimer = setTimeout(connectBoard, 5000);
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
      return;
    }
  }
  if (event.button > 0 || flight) return;
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
    dragged = {
      ...press,
      centre:new THREE.Vector3(camera.position.x, press.group.userData.home.y, camera.position.z),
      radius:Math.max(1.25, Math.hypot(
        press.group.position.x - camera.position.x,
        press.group.position.z - camera.position.z,
      )),
      angle:Math.atan2(
        press.group.position.z - camera.position.z,
        press.group.position.x - camera.position.x,
      ),
      startY:Math.max(press.group.userData.home.y + .65, press.group.position.y),
      turn:0,
      lastFrame:performance.now(),
      moved:false,
    };
    pinPress = null;
    dragged.group.position.y = dragged.startY;
    dragged.group.userData.floor = false;
    faceDraggedNote(dragged.group);
    setStatus('Move left or right to orbit the note. Return to the starting point to stop.', 2600);
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
  if (pinPress?.id === event.pointerId) {
    if (Math.hypot(event.clientX - pinPress.x, event.clientY - pinPress.y) > PIN_MOVE_SLOP_PX) {
      clearTimeout(pinPress.timer);
      pinPress = null;
      orbit.enabled = !flight;
    }
    return;
  }
  if (!dragged || dragged.id !== event.pointerId) return;
  const distance = Math.max(2, camera.position.distanceTo(dragged.group.position));
  const scale = distance * .00145;
  const home = dragged.group.userData.home;
  dragged.turn = Math.max(-1, Math.min(1,
    (event.clientX - dragged.x) / Math.max(80, innerWidth * .22)));
  dragged.group.position.y = Math.max(home.y + .6, Math.min(home.y + 4.8,
    dragged.startY - (event.clientY - dragged.y) * scale));
  dragged.moved ||= Math.hypot(event.clientX - dragged.x, event.clientY - dragged.y) > 6;
});

function releasePointer(event) {
  if (event.pointerType === 'touch') {
    zoomPointers.delete(event.pointerId);
    if (zoomPointers.size < 2) pinchZoom = null;
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
  if (dragged?.id === event.pointerId) { dragged = null; orbit.enabled = !flight; }
  pointerStart = null;
});
elements.canvas.addEventListener('contextmenu', event => event.preventDefault());

elements.controlsToggle.addEventListener('click', () => {
  const opening = elements.controls.hidden;
  elements.controls.hidden = !opening;
  elements.controlsToggle.setAttribute('aria-expanded', String(opening));
});
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
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !boardSocket) connectBoard(); });
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  ageSurfaces.forEach(record => updateAgeSurface(record, now));
}, 60000);
window.addEventListener('beforeunload', () => {
  clearTimeout(reconnectTimer);
  try { boardSocket?.close(); } catch {}
});

for (const cell of board.cells) ensurePlatform(cell);
setActiveCell(activeCell);
resetView();
createDraft();
connectBoard();
renderer.setAnimationLoop(now => {
  stepFlight(now);
  updateDraggedNote(now);
  if (!flight) orbit.update();
  renderer.render(scene, camera);
  updatePictureOverlays();
});
