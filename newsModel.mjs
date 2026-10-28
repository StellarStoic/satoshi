export function parseKeywords(value) {
  return [...new Set(String(value || '').split(',').map(word => word.trim().toLocaleLowerCase()).filter(Boolean))];
}

export function filterNews(items, {enabledSources = null, blocked = [], required = [], query = ''} = {}) {
  const enabled = enabledSources === null ? null : new Set(enabledSources);
  const blockedWords = Array.isArray(blocked) ? blocked : parseKeywords(blocked);
  const requiredWords = Array.isArray(required) ? required : parseKeywords(required);
  const searchWords = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    if (enabled && !enabled.has(item.sourceId)) return false;
    const searchable = `${item.title || ''} ${item.summary || ''} ${item.source || ''}`.toLocaleLowerCase();
    if (searchWords.length && !searchWords.every(word => searchable.includes(word))) return false;
    if (blockedWords.some(word => searchable.includes(word))) return false;
    if (requiredWords.length && !requiredWords.some(word => searchable.includes(word))) return false;
    return true;
  });
}

export function deduplicateNews(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.url || `${item.sourceId}:${item.title}:${item.published}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --------------------------------------------------------------------------------------------- media
// A few of the Nostr sources put a picture in the title itself — "…#6 📰 Nostr in the Media
// https://blossom.primal.net/f15b76…" — because a note's title is whatever the author wrote. The feed shows that as a
// wall of URL text. These helpers pull the picture out, so the item can render a thumbnail and read like a headline.

const IMAGE_PATH = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:[?#].*)?$/i;
// Blossom and the other nostr blob hosts serve bare hashes with no file extension to test, so the host is the only tell.
const BLOB_HOST = /^(?:blossom\.[a-z0-9.-]+|(?:i\.|image\.|media\.)?nostr\.build|void\.cat|catbox\.moe|files\.catbox\.moe|pbs\.twimg\.com|i\.ibb\.co)$/i;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

export function isImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!/^https?:$/.test(url.protocol)) return false;
    if (IMAGE_PATH.test(url.pathname)) return true;
    return BLOB_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** The first image URL in a string, or '' — scanned in order so the author's own lead picture wins. */
export function imageUrlFrom(...values) {
  for (const value of values) {
    for (const match of String(value || '').match(URL_PATTERN) || []) {
      const candidate = match.replace(/[.,;:]+$/, '');
      if (isImageUrl(candidate)) return candidate;
    }
  }
  return '';
}

/** The same text with every image URL taken out, so a title reads as a title. */
export function stripImageUrls(value) {
  return String(value || '')
    .replace(URL_PATTERN, match => (isImageUrl(match.replace(/[.,;:]+$/, '')) ? ' ' : match))
    .replace(/\s+/g, ' ')
    .trim();
}

/** An item with its picture lifted out of the text and its title cleaned. Nothing else about it changes. */
export function withMedia(item) {
  // the incoming image is destructured OUT, not spread in and hoped over: spreading the item first kept a rejected
  // image URL on the result whenever the ternary decided there was no picture after all
  const {image: incoming, ...rest} = item || {};
  const title = stripImageUrls(rest.title);
  const summary = stripImageUrls(rest.summary);
  const image = incoming && isImageUrl(incoming) ? incoming : imageUrlFrom(rest.title, rest.summary);
  return {...rest, title: title || rest.title || '', summary, ...(image ? {image} : {})};
}
