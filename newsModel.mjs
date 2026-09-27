export function parseKeywords(value) {
  return [...new Set(String(value || '').split(',').map(word => word.trim().toLocaleLowerCase()).filter(Boolean))];
}

export function filterNews(items, {enabledSources = null, blocked = [], required = []} = {}) {
  const enabled = enabledSources === null ? null : new Set(enabledSources);
  const blockedWords = Array.isArray(blocked) ? blocked : parseKeywords(blocked);
  const requiredWords = Array.isArray(required) ? required : parseKeywords(required);
  return items.filter(item => {
    if (enabled && !enabled.has(item.sourceId)) return false;
    const searchable = `${item.title || ''} ${item.summary || ''} ${item.source || ''}`.toLocaleLowerCase();
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
