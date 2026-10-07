export const STICKY_EVENT_KIND = 1;
export const STICKY_TOPIC = 'satoshi-sticky';
export const STICKY_VERSION = 'v1';
export const STICKY_PRICE_SATS = 21;
export const STICKY_MEMBER_PRICE_SATS = 11;
export const STICKY_MAX_CHARACTERS = 501;
export const STICKY_COLORS = Object.freeze(['yellow', 'pink', 'blue', 'green', 'orange']);
export const STICKY_FONTS = Object.freeze(['typewriter', 'mono', 'handwritten', 'serif']);

export function stickyOrderPrice(value, fallback = STICKY_PRICE_SATS) {
  const sats = Number(value?.sats ?? value?.priceSats ?? value);
  return Number.isInteger(sats) && sats > 0 && sats <= STICKY_PRICE_SATS ? sats : fallback;
}

export function normaliseStickyText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

export function clampPlacement(value, fallback = 0.5) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

export function clampRotation(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(12, Math.max(-12, number)) : 0;
}

export function makeStickyTemplate({content, color, font = 'typewriter', x, y, rotation, createdAt = Math.floor(Date.now() / 1000)}) {
  const text = normaliseStickyText(content);
  if (!text) throw new Error('Write something on the note first.');
  if (text.length > STICKY_MAX_CHARACTERS) throw new Error('The note is full.');
  if (!STICKY_COLORS.includes(color)) throw new Error('Choose an available note color.');
  if (!STICKY_FONTS.includes(font)) throw new Error('Choose an available note font.');
  return {
    kind: STICKY_EVENT_KIND,
    created_at: createdAt,
    content: text,
    tags: [
      ['t', STICKY_TOPIC],
      ['client', 'satoshi.si'],
      ['sticky', STICKY_VERSION, color, clampPlacement(x).toFixed(5), clampPlacement(y).toFixed(5), clampRotation(rotation).toFixed(2), font],
      ['alt', 'A paid sticky note pinned on satoshi.si'],
    ],
  };
}

export function parseStickyEvent(event) {
  if (!event || event.kind !== STICKY_EVENT_KIND || typeof event.content !== 'string') return null;
  if (!event.tags?.some(tag => tag?.[0] === 't' && tag[1] === STICKY_TOPIC)) return null;
  const sticky = event.tags.find(tag => tag?.[0] === 'sticky' && tag[1] === STICKY_VERSION);
  if (!sticky || !STICKY_COLORS.includes(sticky[2])) return null;
  const font = sticky[6] || 'typewriter';
  if (!STICKY_FONTS.includes(font)) return null;
  const content = normaliseStickyText(event.content);
  if (!content || content.length > STICKY_MAX_CHARACTERS) return null;
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content,
    color: sticky[2],
    font,
    x: clampPlacement(sticky[3]),
    y: clampPlacement(sticky[4]),
    rotation: clampRotation(sticky[5]),
  };
}

export async function stickyContentHash(content, color, font = 'typewriter', cryptoObject = globalThis.crypto) {
  const text = normaliseStickyText(content);
  if (!text || !STICKY_COLORS.includes(color) || !STICKY_FONTS.includes(font)) throw new Error('The note is incomplete.');
  const bytes = new TextEncoder().encode(`${STICKY_VERSION}\n${color}\n${font}\n${text}`);
  const digest = await cryptoObject.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function makeDeletionTemplate({eventId, createdAt = Math.floor(Date.now() / 1000)}) {
  if (!/^[0-9a-f]{64}$/.test(String(eventId || ''))) throw new Error('The note ID is invalid.');
  return {
    kind: 5,
    created_at: createdAt,
    content: 'Remove sticky note',
    tags: [
      ['e', eventId, 'wss://nostr.satoshi.si'],
      ['k', '1'],
      ['t', 'satoshi-sticky-delete'],
      ['alt', 'A paid request to remove a sticky note from satoshi.si'],
    ],
  };
}
