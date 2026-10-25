import {
  GEOHASH_MAX_BOARD_DEPTH,
  boardDepthCeiling,
  geohashNeighbours,
  normaliseGeohashes,
} from './stickyNotesModel.mjs';

const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

export function readWorldBoard(search = '', storageValue = '', storedDepth = 0) {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const rawCells = params.get('g') || storageValue;
  const cells = normaliseGeohashes(String(rawCells || '').split(',').map(cell => cell.trim()).filter(Boolean));
  const requested = Number.parseInt(params.get('d') ?? storedDepth, 10);
  const depth = Math.max(0, Math.min(
    GEOHASH_MAX_BOARD_DEPTH,
    boardDepthCeiling(cells),
    Number.isFinite(requested) ? requested : 0,
  ));
  return Object.freeze({cells, depth});
}

export function worldHref(cells = [], depth = 0) {
  const params = new URLSearchParams();
  const normal = normaliseGeohashes(cells);
  if (normal.length) params.set('g', normal.join(','));
  if (Number(depth) > 0) params.set('d', String(Math.floor(Number(depth))));
  return `/pinstrWorld.html${params.size ? `?${params}` : ''}`;
}

export function placementWorldHref(cells = [], depth = 0) {
  const url = new URL(worldHref(cells, depth), 'https://satoshi.si');
  url.searchParams.set('place', '1');
  return `${url.pathname}?${url.searchParams}`;
}

export function boardHref(cells = []) {
  const params = new URLSearchParams();
  const normal = normaliseGeohashes(cells);
  if (normal.length) params.set('g', normal.join(','));
  return `/stickyNotes.html${params.size ? `?${params}` : ''}`;
}

export function worldComposerHref(cells = []) {
  const url = new URL(boardHref(cells), 'https://satoshi.si');
  url.searchParams.set('compose', 'world');
  return `${url.pathname}?${url.searchParams}`;
}

function worldSeed(value = '') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function worldRandom(seed, salt = 0) {
  let value = (worldSeed(seed) + Math.imul(Number(salt) + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  value = Math.imul(value, 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

/** The deepest visible platform a note belongs to under the selected roots. */
export function worldCellForNote(note, roots = [], depth = 0) {
  const cells = normaliseGeohashes(roots);
  const named = normaliseGeohashes(note?.geohashes || note?.geohash || []);
  const reach = Math.max(0, Math.floor(Number(depth) || 0));
  for (const root of cells) {
    const match = named.find(cell => cell.startsWith(root));
    if (match) return match.slice(0, Math.min(match.length, root.length + reach));
  }
  return cells[0] || '';
}

/** Stable platform positions: the current board in the centre, deeper worlds around it. */
export function worldPlatformPosition(index = 0) {
  const number = Math.max(0, Math.floor(Number(index) || 0));
  if (!number) return Object.freeze({x:0, y:0, z:0});
  const slot = number - 1;
  const ring = Math.floor(slot / 8);
  const angle = (slot % 8) / 8 * Math.PI * 2 + ring * .31;
  const radius = 18 + ring * 11;
  return Object.freeze({x:Math.cos(angle) * radius, y:(slot % 3 - 1) * 1.6, z:Math.sin(angle) * radius});
}

export function worldBoardRelation(origin = '', destination = '') {
  const [from] = normaliseGeohashes(origin);
  const [to] = normaliseGeohashes(destination);
  if (!from || !to || from === to) return '';
  if (from.startsWith(to) && to.length < from.length) return 'parent';
  if (to.startsWith(from) && to.length > from.length) return 'child';
  if (from.length === to.length && geohashNeighbours(from).includes(to)) return 'sibling';
  return '';
}

export function worldNearbyCells(origin = '') {
  const [cell] = normaliseGeohashes(origin);
  if (!cell) return [];
  const parents = Array.from({length:Math.max(0, cell.length - 3)}, (_, index) => cell.slice(0, index + 3));
  const children = cell.length < 9 ? [...GEOHASH_ALPHABET].map(character => `${cell}${character}`) : [];
  return [...new Set([...parents, ...geohashNeighbours(cell), ...children])];
}

export function worldPortalPosition(origin = '', destination = '') {
  const relation = worldBoardRelation(origin, destination);
  if (!relation) return null;
  const distance = Math.abs(String(destination).length - String(origin).length);
  const angle = worldRandom(`${origin}:${destination}`, 7) * Math.PI * 2;
  const radius = relation === 'sibling' ? 13.5 : 10.5 + Math.min(3, distance) * 1.4;
  const y = relation === 'parent'
    ? 4.8 + distance * 1.5
    : relation === 'child'
      ? -3.8 - Math.min(3, distance) * 1.45
      : 1.6 + (worldRandom(`${destination}:${origin}`, 8) - .5) * 2.2;
  return Object.freeze({x:Math.cos(angle) * radius, y, z:Math.sin(angle) * radius, relation});
}

/** Stable positions around the viewer, expanding outward and upward as a board becomes denser. */
export function worldNotePosition(id = '', index = 0, total = 1) {
  const seed = `${id}:${index}`;
  const count = Math.max(1, Math.floor(Number(total) || 1));
  const density = Math.min(1, Math.sqrt((count - 1) / 999));
  const angle = worldRandom(seed, 0) * Math.PI * 2;
  const floor = worldRandom(seed, 1) < .22 * (1 - density * .75);
  const radius = floor
    ? 1.65 + density * .25 + worldRandom(seed, 2) * (3 - density * .25)
    : 2.15 + density * 2.35 + worldRandom(seed, 2) * (2.55 + density * 3.95);
  return Object.freeze({
    x:Math.cos(angle) * radius,
    y:floor ? .04 : .72 + density * .8 + worldRandom(seed, 3) * (3.75 + density * 5),
    z:Math.sin(angle) * radius,
    roll:(worldRandom(seed, 4) - .5) * (floor ? 1.4 : .48),
    pitch:floor ? 0 : (worldRandom(seed, 5) - .5) * .18,
    floor,
    density,
  });
}

/** A quick flight with a small forward overshoot before settling on the platform. */
export function worldFlightProgress(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  const smooth = t * t * (3 - 2 * t);
  const settle = t > .68 ? Math.sin((t - .68) / .32 * Math.PI) * .055 : 0;
  return smooth + settle;
}

/** Accelerate hard into a portal, then ease the final approach before navigation. */
export function worldPortalWarpProgress(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  if (t < .72) return .82 * (t / .72) ** 3;
  const brake = (t - .72) / .28;
  return .82 + .18 * (1 - (1 - brake) ** 3);
}

export function boardPlacementFromWorld(position = {}, centre = {}) {
  const x = Math.max(0, Math.min(1, .5 + (Number(position.x) - (Number(centre.x) || 0)) / 7));
  const y = Math.max(0, Math.min(1, 1 - ((Number(position.y) || 0) - .65) / 4));
  return Object.freeze({x, y, rotation:Math.max(-75, Math.min(75, Number(position.rotation) || 0))});
}
