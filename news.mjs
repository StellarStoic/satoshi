import {deduplicateNews, filterNews, parseKeywords} from './newsModel.mjs';

const SETTINGS_KEY = 'bitcoinNewsSettings';
const PAGE_SIZE = 24;
const SOURCE_CATALOG_VERSION = 1;
const NOSTRRECAP_NPUB = 'npub1etjm06353tl0cnqs9wmmzfwyj283z3ee5facwlrte7l957fgqwzqsznr68';
const KNOWN_NOSTR_NAMES = new Map([[NOSTRRECAP_NPUB, 'nostrrecap']]);
const BUILTIN_NOSTR_SOURCES = [{
  id: 'nostr-nostrrecap',
  type: 'nostr',
  value: NOSTRRECAP_NPUB,
  label: 'nostrrecap',
  status: 'client',
  clientNostr: true,
}];
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
const searchInput = document.getElementById('newsSearch');
const clearSearchButton = document.getElementById('clearNewsSearch');
let dataset = {sources: [], items: [], generatedAt: null};
let customItems = [];
let visibleCount = PAGE_SIZE;
let searchQuery = '';
let settings = loadSettings();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    const enabledSources = Array.isArray(saved?.enabledSources) ? [...saved.enabledSources] : null;
    if (enabledSources && Number(saved?.sourceCatalogVersion || 0) < SOURCE_CATALOG_VERSION) {
      for (const source of BUILTIN_NOSTR_SOURCES) if (!enabledSources.includes(source.id)) enabledSources.push(source.id);
    }
    return {
      enabledSources,
      required: String(saved?.required || ''),
      blocked: String(saved?.blocked || ''),
      customSources: Array.isArray(saved?.customSources) ? saved.customSources.map(normalizeNostrSource) : [],
      sourceCatalogVersion: SOURCE_CATALOG_VERSION,
    };
  } catch {
    return {enabledSources: null, required: '', blocked: '', customSources: [], sourceCatalogVersion: SOURCE_CATALOG_VERSION};
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
      if (checkbox.checked && source.clientNostr) loadClientSources();
    });
    label.append(checkbox, document.createTextNode(`${source.label}${checkbox.disabled ? ' (unavailable)' : ''}`));
    return label;
  }));
}

function renderCustomSources() {
  customSourcesNode.replaceChildren(...settings.customSources.map(source => {
    const row = node('div', undefined, 'custom-source');
    row.append(node('span', source.type === 'nostr' ? nostrSettingsLabel(source) : source.value));
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
    query: searchQuery,
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
      const url = new URL(item.archiveUrl || item.url, location.origin);
      link.href = /^https?:$/.test(url.protocol) ? url.href : '#';
    } catch { link.href = '#'; }
    if (item.archiveUrl) {
      link.title = 'Open verified Archive.today snapshot';
      link.dataset.originalUrl = item.url;
    }
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    heading.append(link);
    content.append(heading);
    if (item.summary) content.append(node('p', item.summary));
    content.append(node('span', `${item.kind || 'article'}${item.archiveUrl ? ' · archived copy' : ''}`, 'news-item-kind'));
    article.append(meta, content);
    return article;
  }));
  status.textContent = filtered.length ? `${filtered.length} posts from ${enabled.length} enabled sources` : 'No posts match your search and filters.';
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
  if (value.toLowerCase().startsWith('npub1')) return {pubkey: bech32NpubToHex(value), npub: value.toLowerCase()};
  const match = value.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) throw new Error('Enter an RSS URL, npub, or NIP-05 address');
  const response = await fetch(`https://${match[2]}/.well-known/nostr.json?name=${encodeURIComponent(match[1])}`);
  if (!response.ok) throw new Error('NIP-05 address could not be resolved');
  const payload = await response.json();
  const pubkey = payload.names?.[match[1]] || payload.names?.[match[1].toLowerCase()];
  if (!/^[0-9a-f]{64}$/i.test(pubkey || '')) throw new Error('NIP-05 response has no public key');
  return {pubkey, nip05: value};
}

function shortenNpub(value) {
  return value && value.length > 15 ? `${value.slice(0, 7)}...${value.slice(-4)}` : value;
}

function sourceNpub(source) {
  if (source.npub?.toLowerCase().startsWith('npub1')) return source.npub.toLowerCase();
  if (source.value?.toLowerCase().startsWith('npub1')) return source.value.toLowerCase();
  return '';
}

function normalizeNostrSource(source) {
  if (source?.type !== 'nostr') return source;
  const npub = sourceNpub(source);
  const knownName = KNOWN_NOSTR_NAMES.get(npub);
  return {...source, ...(npub ? {npub} : {}), ...(knownName ? {profileName: knownName, label: knownName} : {})};
}

function nostrSourceName(source) {
  const npub = sourceNpub(source);
  return source.profileName || KNOWN_NOSTR_NAMES.get(npub) || source.nip05 || shortenNpub(npub) || 'Nostr';
}

function nostrSettingsLabel(source) {
  const npub = sourceNpub(source);
  const identifier = npub ? shortenNpub(npub) : (source.nip05 || source.value);
  const name = nostrSourceName(source);
  return identifier && name !== identifier ? `${name} (${identifier})` : name;
}

function readNostrProfile(url, pubkey) {
  return new Promise(resolve => {
    const socket = new WebSocket(url);
    const subscription = `satoshi-profile-${crypto.randomUUID()}`;
    let newest = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { socket.close(); } catch {}
      resolve(newest);
    };
    const timer = setTimeout(finish, 3500);
    socket.onopen = () => socket.send(JSON.stringify(['REQ', subscription, {authors: [pubkey], kinds: [0], limit: 5}]));
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message[0] === 'EOSE') { clearTimeout(timer); finish(); return; }
      if (message[0] !== 'EVENT') return;
      if (!newest || message[2].created_at > newest.created_at) newest = message[2];
    };
    socket.onerror = finish;
  });
}

async function enrichNostrSource(source) {
  const identity = await resolveNostrIdentity(source.value);
  const events = await Promise.all([
    readNostrProfile('wss://relay.damus.io', identity.pubkey),
    readNostrProfile('wss://nos.lol', identity.pubkey),
    readNostrProfile('wss://relay.primal.net', identity.pubkey),
  ]);
  const event = events.filter(Boolean).sort((a, b) => b.created_at - a.created_at)[0];
  let profile = {};
  try { profile = JSON.parse(event?.content || '{}'); } catch {}
  const profileName = String(profile.display_name || profile.displayName || profile.name || KNOWN_NOSTR_NAMES.get(identity.npub) || '').trim();
  const nip05 = String(profile.nip05 || identity.nip05 || '').trim();
  return {...source, pubkey: identity.pubkey, npub: identity.npub || source.npub, nip05, profileName, profileResolvedAt: Date.now(), label: profileName || nip05 || shortenNpub(identity.npub || source.value)};
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
  const resolved = source.pubkey ? source : await enrichNostrSource(source);
  const pubkey = resolved.pubkey;
  const results = await Promise.all([
    readRelay('wss://relay.damus.io', pubkey, resolved),
    readRelay('wss://nos.lol', pubkey, resolved),
    readRelay('wss://relay.primal.net', pubkey, resolved),
  ]);
  return deduplicateNews(results.flat());
}

async function loadClientSources() {
  const builtInSources = dataset.sources.filter(source => source.clientNostr && settings.enabledSources?.includes(source.id));
  const sources = [...builtInSources, ...settings.customSources];
  if (!sources.length) { customItems = []; renderNews(); return; }
  status.textContent = 'Loading Nostr and local feeds…';
  const enriched = await Promise.allSettled(settings.customSources.map(source => source.type === 'nostr' && !source.profileResolvedAt ? enrichNostrSource(source) : source));
  let changed = false;
  settings.customSources = settings.customSources.map((source, index) => {
    const result = enriched[index];
    if (result.status !== 'fulfilled' || source.type !== 'nostr') return source;
    changed ||= JSON.stringify(source) !== JSON.stringify(result.value);
    return result.value;
  });
  if (changed) { saveSettings(); renderCustomSources(); }
  const resolvedBuiltIns = await Promise.allSettled(builtInSources.map(source => enrichNostrSource(source)));
  resolvedBuiltIns.forEach((result, index) => {
    if (result.status !== 'fulfilled') return;
    const datasetIndex = dataset.sources.findIndex(source => source.id === builtInSources[index].id);
    if (datasetIndex >= 0) dataset.sources[datasetIndex] = {...result.value, status: 'client', clientNostr: true};
  });
  if (resolvedBuiltIns.some(result => result.status === 'fulfilled')) renderSources();
  const resolvedSources = [
    ...resolvedBuiltIns.map((result, index) => result.status === 'fulfilled' ? result.value : builtInSources[index]),
    ...settings.customSources,
  ];
  const settled = await Promise.allSettled(resolvedSources.map(async source => source.type === 'rss' ? fetchCustomRss(source) : fetchNostr(source)));
  customItems = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const failures = settled.filter(result => result.status === 'rejected').length;
  if (failures) status.textContent = `${failures} source${failures === 1 ? '' : 's'} could not be reached.`;
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
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  clearSearchButton.hidden = !searchQuery;
  visibleCount = PAGE_SIZE;
  renderNews();
});
clearSearchButton.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
  searchInput.focus();
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
  let source = {id: `custom-${crypto.randomUUID()}`, type: isRss ? 'rss' : 'nostr', value, label: isRss ? new URL(value).hostname : shortenNpub(value)};
  if (!isRss) {
    try { source = await enrichNostrSource(source); } catch (error) {
      customInput.setCustomValidity(error.message || 'Nostr profile could not be resolved.');
      customInput.reportValidity();
      return;
    }
  }
  settings.customSources.push(source);
  saveSettings();
  customInput.value = '';
  renderCustomSources();
  await loadClientSources();
});
customInput.addEventListener('input', () => customInput.setCustomValidity(''));
moreButton.addEventListener('click', () => { visibleCount += PAGE_SIZE; renderNews(); });

try {
  const response = await fetch('/news-data.json', {cache: 'no-store'});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  dataset = await response.json();
  dataset.sources.push(...BUILTIN_NOSTR_SOURCES.filter(source => !dataset.sources.some(existing => existing.id === source.id)));
  updated.textContent = dataset.generatedAt ? `Updated ${formatDate(dataset.generatedAt)}` : 'Latest collected posts';
  renderSources();
  renderCustomSources();
  renderNews();
  await loadClientSources();
} catch (error) {
  status.textContent = `News could not be loaded: ${error.message}`;
}

window.lucide?.createIcons();
