const PAGE_HEADING = /^### Page: \[([^\]]+)]\s*$/gm;
const RULES_HEADING = /^## Interaction Rules\s*$/m;

export function normalizeContextPath(pathname = '/') {
  const cleanPath = String(pathname || '/')
    .split(/[?#]/, 1)[0]
    .replace(/\/+$/, '');
  if (!cleanPath) return '/index.html';
  const filename = cleanPath.slice(cleanPath.lastIndexOf('/') + 1);
  if (!filename || !filename.includes('.')) return '/index.html';
  return `/${filename}`;
}

export function parseAiContext(markdown) {
  const source = String(markdown || '').replace(/\r\n?/g, '\n').trim();
  const headings = [...source.matchAll(PAGE_HEADING)];
  const rulesMatch = source.match(RULES_HEADING);
  const firstPageIndex = headings[0]?.index ?? source.length;
  const rulesIndex = rulesMatch?.index ?? source.length;
  const pages = new Map();

  headings.forEach((heading, index) => {
    const start = heading.index;
    const nextPage = headings[index + 1]?.index ?? rulesIndex;
    const section = source.slice(start, Math.min(nextPage, rulesIndex)).trim();
    const url = section.match(/^- \*\*URL\*\*:\s*(\/\S+)\s*$/m)?.[1];
    if (url) pages.set(normalizeContextPath(url), {name: heading[1].trim(), content: section});
  });

  const introduction = source.slice(0, firstPageIndex).trim();
  const rules = rulesIndex < source.length ? source.slice(rulesIndex).trim() : '';
  return {introduction, rules, pages};
}

export function selectAiContext(parsed, pathname) {
  if (!parsed) return '';
  const page = parsed.pages?.get(normalizeContextPath(pathname));
  return [parsed.introduction, page?.content, parsed.rules].filter(Boolean).join('\n\n---\n\n');
}
