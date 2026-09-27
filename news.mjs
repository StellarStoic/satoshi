import {deduplicateNews, filterNews, parseKeywords} from './newsModel.mjs';

const SETTINGS_KEY = 'bitcoinNewsSettings';
const PAGE_SIZE = 24;
const feed = document.getElementById('newsFeed');
const status = document.getElementById('newsStatus');
const updated = document.getElementById('newsUpdated');
const dialog = document.getElementById('newsSettings');
const sourceOptions = document.getElementById('defaultNewsSources');
const customSourcesNode = document.getElementById('customNewsSources');
const requiredInput = document.getElementById('requiredKeywords');
const blockedInput = document.getElementById('blockedKeywords');
const customInput = document.getElementById('customFeedInput');
const moreButton = document.getElementById('showMoreNews');
let dataset = {sources: [], items: [], generatedAt: null};
let customItems = [];
let visibleCount = PAGE_SIZE;
let settings = loadSettings();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      enabledSources: Array.isArray(saved?.enabledSources) ? saved.enabledSources : null,
      required: String(saved?.required || ''),
      blocked: String(saved?.blocked || ''),
      customSources: Array.isArray(saved?.customSources) ? saved.customSources : [],
    };
  } catch {
    return {enabledSources: null, required: '', blocked: '', customSources: []};
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Preferences remain active for this visit. */ }
}

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium'}).format(date);
}

function renderSources() {
  const available = dataset.sources.filter(source => source.status !== 'failed');
  if (settings.enabledSources === null) settings.enabledSources = available.map(source => source.id);
  sourceOptions.replaceChildren(...dataset.sources.map(source => {
    const label = node('label', undefined, 'news-source-option');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = settings.enabledSources.includes(source.id);
    checkbox.disabled = source.status === 'failed';
    if (checkbox.disabled) label.title = `Latest refresh: ${source.error || 'feed unavailable'}`;
    checkbox.addEventListener('change', () => {
      const selected = new Set(settings.enabledSources);
      if (checkbox.checked) selected.add(source.id); else selected.delete(source.id);
      settings.enabledSources = [...selected];
      visibleCount = PAGE_SIZE;
      saveSettings();
      renderNews();
    });
    label.append(checkbox, document.createTextNode(`${source.label}${checkbox.disabled ? ' (unavailable)' : ''}`));
    return label;
  }));
}

function renderCustomSources() {
  customSourcesNode.replaceChildren(...settings.customSources.map(source => {
    const row = node('div', undefined, 'custom-source');
    row.append(node('span', source.value));
    const remove = node('button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${source.value}`);
    remove.title = 'Remove source';
    remove.addEventListener('click', () => {
      settings.customSources = settings.customSources.filter(item => item.id !== source.id);
      customItems = customItems.filter(item => item.sourceId !== source.id);
      saveSettings();
      renderCustomSources();
      renderNews();
    });
    row.append(remove);
    return row;
  }));
}

function currentFilteredNews() {
  const enabled = [...(settings.enabledSources || []), ...settings.customSources.map(source => source.id)];
  return filterNews(deduplicateNews([...dataset.items, ...customItems]).sort((a, b) => new Date(b.published) - new Date(a.published)), {
    enabledSources: enabled,
    blocked: parseKeywords(settings.blocked),
    required: parseKeywords(settings.required),
  });
}

function renderNews() {
  const enabled = [...(settings.enabledSources || []), ...settings.customSources.map(source => source.id)];
  const filtered = currentFilteredNews();
  const shown = filtered.slice(0, visibleCount);
  feed.replaceChildren(...shown.map(item => {
    const article = node('article', undefined, 'news-item');
    article.id = `news-${item.id}`;
    article.tabIndex = -1;
    const meta = node('div', undefined, 'news-item-meta');
    meta.append(node('strong', item.source, 'news-item-source'), node('time', formatDate(item.published)));
    const content = node('div');
    const heading = node('h2');
    const link = node('a', item.title || 'Untitled');
    try {
      const url = new URL(item.url, location.origin);
      link.href = /^https?:$/.test(url.protocol) ? url.href : '#';
    } catch { link.href = '#'; }
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    heading.append(link);
    content.append(heading);
    if (item.summary) content.append(node('p', item.summary));
    content.append(node('span', item.kind || 'article', 'news-item-kind'));
    article.append(meta, content);
    return article;
  }));
  status.textContent = filtered.length ? `${filtered.length} posts from ${enabled.length} enabled sources` : 'No posts match the current sources and keyword filters.';
  moreButton.hidden = shown.length >= filtered.length;
  focusNewsHash(filtered);
}

function focusNewsHash(filtered = currentFilteredNews()) {
  if (!location.hash.startsWith('#news-')) return;
  const id = location.hash.slice(6);
  const index = filtered.findIndex(item => String(item.id) === id);
  if (index < 0) return;
  if (index >= visibleCount) {
    visibleCount = Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE;
    renderNews();
    return;
  }
  requestAnimationFrame(() => {
    const target = document.getElementById(`news-${CSS.escape(id)}`);
    target?.focus({preventScroll: true});
    target?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center'});
  });
}

window.getSatoshiPageContext = query => {
  const words = parseKeywords(String(query || '').replace(/[^\p{L}\p{N}]+/gu, ','))
    .filter(word => word.length > 2 && !['the', 'and', 'any', 'about', 'news'].includes(word));
  const ranked = currentFilteredNews().map((item, index) => {
    const searchable = `${item.title} ${item.summary} ${item.source}`.toLocaleLowerCase();
    return {item, index, score: words.reduce((score, word) => score + (searchable.includes(word) ? 1 : 0), 0)};
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, 60).map(({item}) => item)
  .map(item => `${item.source}: ${item.title}${item.summary ? ` — ${item.summary}` : ''} | Local news link: /news.html#news-${item.id}`)
  .join('\n');
};

window.addEventListener('hashchange', () => focusNewsHash());

function cleanText(value) {
  const parsed = new DOMParser().parseFromString(`<body>${value || ''}</body>`, 'text/html');
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 420);
}

function xmlItems(xmlText, source) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid RSS or Atom response');
  const entries = [...doc.querySelectorAll('item, entry')].slice(0, 40);
  return entries.map((entry, index) => {
    const get = (...names) => names.map(name => entry.querySelector(name)?.textContent?.trim()).find(Boolean) || '';
    const atomLink = [...entry.querySelectorAll('link')].find(link => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate')?.getAttribute('href');
    return {
      id: `${source.id}-${index}-${get('guid', 'id') || atomLink || get('link')}`,
      sourceId: source.id,
      source: source.label,
      kind: 'custom feed',
      title: cleanText(get('title')),
      summary: cleanText(get('description', 'summary', 'content')),
      url: atomLink || get('link'),
      published: get('pubDate', 'published', 'updated') || new Date().toISOString(),
    };
  }).filter(item => item.title && /^https?:/i.test(item.url));
}

async function fetchCustomRss(source) {
  try {
    const response = await fetch(source.value, {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return xmlItems(await response.text(), source);
  } catch {
    const proxy = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.value)}`;
    const response = await fetch(proxy, {cache: 'no-store'});
    if (!response.ok) throw new Error('Feed blocked browser access');
    const payload = await response.json();
    return (payload.items || []).slice(0, 40).map((item, index) => ({
      id: `${source.id}-${index}-${item.guid || item.link}`,
      sourceId: source.id,
      source: source.label,
      kind: 'custom feed',
      title: cleanText(item.title),
      summary: cleanText(item.description || item.content),
      url: item.link,
      published: item.pubDate || new Date().toISOString(),
    })).filter(item => item.title && /^https?:/i.test(item.url));
  }
}

function bech32NpubToHex(npub) {
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const separator = npub.lastIndexOf('1');
  if (!npub.toLowerCase().startsWith('npub1') || separator < 1) throw new Error('Invalid npub');
  const encoded = [...npub.toLowerCase().slice(separator + 1)].map(char => alphabet.indexOf(char));
  if (encoded.some(value => value < 0) || encoded.length < 7) throw new Error('Invalid npub');
  const polymod = encoded.reduce((checksum, value) => {
    const top = checksum >>> 25;
    let next = ((checksum & 0x1ffffff) << 5) ^ value;
    const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    generators.forEach((generator, index) => { if ((top >>> index) & 1) next ^= generator; });
    return next;
  }, 1);
  if (polymod !== 1) throw new Error('Invalid npub checksum');
  const values = encoded.slice(0, -6);
  if (values.some(value => value < 0)) throw new Error('Invalid npub');
  let accumulator = 0;
  let bits = 0;
  const bytes = [];
  for (const value of values) {
    accumulator = (accumulator << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  if (bytes.length !== 32) throw new Error('Invalid npub length');
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveNostrIdentity(value) {
  if (value.toLowerCase().startsWith('npub1')) return bech32NpubToHex(value);
  const match = value.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) throw new Error('Enter an RSS URL, npub, or NIP-05 address');
  const response = await fetch(`https://${match[2]}/.well-known/nostr.json?name=${encodeURIComponent(match[1])}`);
  if (!response.ok) throw new Error('NIP-05 address could not be resolved');
  const payload = await response.json();
  const pubkey = payload.names?.[match[1]] || payload.names?.[match[1].toLowerCase()];
  if (!/^[0-9a-f]{64}$/i.test(pubkey || '')) throw new Error('NIP-05 response has no public key');
  return pubkey;
}

function readRelay(url, pubkey, source) {
  return new Promise(resolve => {
    const socket = new WebSocket(url);
    const subscription = `satoshi-news-${crypto.randomUUID()}`;
    const items = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { socket.close(); } catch {}
      resolve(items);
    };
    const timer = setTimeout(finish, 4500);
    socket.onopen = () => socket.send(JSON.stringify(['REQ', subscription, {authors: [pubkey], kinds: [1, 30023], limit: 30}]));
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message[0] === 'EOSE') { clearTimeout(timer); finish(); return; }
      if (message[0] !== 'EVENT') return;
      const note = message[2];
      const titleTag = note.tags?.find(tag => tag[0] === 'title')?.[1];
      const summaryTag = note.tags?.find(tag => tag[0] === 'summary')?.[1];
      const content = cleanText(note.content);
      items.push({
        id: note.id,
        sourceId: source.id,
        source: source.label,
        kind: note.kind === 30023 ? 'Nostr article' : 'Nostr note',
        title: titleTag || content.slice(0, 110) || 'Nostr post',
        summary: summaryTag || (titleTag ? content : ''),
        url: `https://njump.me/${note.id}`,
        published: new Date(note.created_at * 1000).toISOString(),
      });
    };
    socket.onerror = finish;
  });
}

async function fetchNostr(source) {
  const pubkey = await resolveNostrIdentity(source.value);
  const results = await Promise.all([
    readRelay('wss://relay.damus.io', pubkey, source),
    readRelay('wss://nos.lol', pubkey, source),
    readRelay('wss://relay.primal.net', pubkey, source),
  ]);
  return deduplicateNews(results.flat());
}

async function loadCustomSources() {
  if (!settings.customSources.length) return;
  status.textContent = 'Loading your local feeds…';
  const settled = await Promise.allSettled(settings.customSources.map(async source => source.type === 'rss' ? fetchCustomRss(source) : fetchNostr(source)));
  customItems = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const failures = settled.filter(result => result.status === 'rejected').length;
  if (failures) status.textContent = `${failures} custom source${failures === 1 ? '' : 's'} could not be reached.`;
  renderNews();
}

document.getElementById('openNewsSettings').addEventListener('click', () => dialog.showModal());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
requiredInput.value = settings.required;
blockedInput.value = settings.blocked;
for (const input of [requiredInput, blockedInput]) input.addEventListener('input', () => {
  settings.required = requiredInput.value;
  settings.blocked = blockedInput.value;
  visibleCount = PAGE_SIZE;
  saveSettings();
  renderNews();
});
document.getElementById('addCustomFeed').addEventListener('click', async () => {
  const value = customInput.value.trim();
  if (!value) return;
  const isRss = /^https?:\/\//i.test(value);
  if (!isRss && !value.toLowerCase().startsWith('npub1') && !value.includes('@')) {
    customInput.setCustomValidity('Enter an RSS URL, npub, or NIP-05 address.');
    customInput.reportValidity();
    return;
  }
  customInput.setCustomValidity('');
  const source = {id: `custom-${crypto.randomUUID()}`, type: isRss ? 'rss' : 'nostr', value, label: isRss ? new URL(value).hostname : `Nostr ${value.slice(0, 12)}…`};
  settings.customSources.push(source);
  saveSettings();
  customInput.value = '';
  renderCustomSources();
  await loadCustomSources();
});
customInput.addEventListener('input', () => customInput.setCustomValidity(''));
moreButton.addEventListener('click', () => { visibleCount += PAGE_SIZE; renderNews(); });

try {
  const response = await fetch('/news-data.json', {cache: 'no-store'});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  dataset = await response.json();
  updated.textContent = dataset.generatedAt ? `Updated ${formatDate(dataset.generatedAt)}` : 'Latest collected posts';
  renderSources();
  renderCustomSources();
  renderNews();
  await loadCustomSources();
} catch (error) {
  status.textContent = `News could not be loaded: ${error.message}`;
}

window.lucide?.createIcons();
