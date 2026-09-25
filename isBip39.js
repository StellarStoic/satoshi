import {
  czechWordlist,
  englishWordlist,
  frenchWordlist,
  italianWordlist,
  japaneseWordlist,
  koreanWordlist,
  portugueseWordlist,
  simplifiedChineseWordlist,
  spanishWordlist,
  traditionalChineseWordlist,
} from './vendor/bip39.mjs';

const LANGUAGE_STORAGE_KEY = 'bip39WordlistLanguage';
const languages = {
  english: {label: 'English', locale: 'en', words: englishWordlist, phonetic: true},
  spanish: {label: 'Español', statusLabel: 'Spanish', locale: 'es', words: spanishWordlist},
  french: {label: 'Français', statusLabel: 'French', locale: 'fr', words: frenchWordlist},
  italian: {label: 'Italiano', statusLabel: 'Italian', locale: 'it', words: italianWordlist},
  portuguese: {label: 'Português', statusLabel: 'Portuguese', locale: 'pt', words: portugueseWordlist},
  czech: {label: 'Čeština', statusLabel: 'Czech', locale: 'cs', words: czechWordlist},
  japanese: {label: '日本語', statusLabel: 'Japanese', locale: 'ja', words: japaneseWordlist},
  korean: {label: '한국어', statusLabel: 'Korean', locale: 'ko', words: koreanWordlist},
  simplifiedChinese: {label: '简体中文', statusLabel: 'Simplified Chinese', locale: 'zh-Hans', words: simplifiedChineseWordlist},
  traditionalChinese: {label: '繁體中文', statusLabel: 'Traditional Chinese', locale: 'zh-Hant', words: traditionalChineseWordlist},
};

const input = document.getElementById('bip39Input');
const suggestions = document.getElementById('suggestions');
const validity = document.getElementById('wordValidityInfo');
const settingsDialog = document.getElementById('wordlistSettings');
const languageSelect = document.getElementById('wordlistLanguage');
let languageKey = getSavedLanguage();
let language;
let entries;
let wordIndex;

const wideSlots = [
  [50, 30], [50, 70], [22, 38], [78, 38], [20, 62], [80, 62], [9, 50], [91, 50],
  [13, 11], [32, 13], [69, 11], [87, 14], [20, 23], [39, 21], [63, 22], [82, 24],
  [14, 78], [34, 80], [66, 79], [86, 78], [9, 89], [27, 91], [48, 88], [70, 91],
  [90, 89], [8, 34], [92, 34], [8, 66],
];

const narrowSlots = [
  [50, 28], [50, 72], [24, 35], [76, 35], [22, 66], [78, 66],
  [17, 10], [50, 11], [82, 13], [20, 20], [79, 22],
  [18, 81], [50, 82], [82, 79], [14, 91], [40, 91], [68, 91], [88, 89],
];

const englishFeatured = [
  'abandon', 'ability', 'acoustic', 'alien', 'ancient', 'balance', 'bamboo', 'beach',
  'bitcoin', 'block', 'brave', 'cactus', 'coin', 'digital', 'dream', 'energy', 'future',
  'galaxy', 'honest', 'liberty', 'light', 'matrix', 'network', 'orange', 'proof', 'quantum',
  'signal', 'trust',
];

function normalizeWord(value, locale = language?.locale || 'en') {
  return value.trim().toLocaleLowerCase(locale).normalize('NFKD');
}

function displayWord(value) {
  return value.normalize('NFC');
}

function getSavedLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved && languages[saved] ? saved : 'english';
  } catch {
    return 'english';
  }
}

function saveLanguage() {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, languageKey);
  } catch {
    // The selection still works for this visit when storage is unavailable.
  }
}

function selectLanguage(key) {
  languageKey = languages[key] ? key : 'english';
  language = languages[languageKey];
  entries = language.words.map((raw, index) => ({
    raw,
    normalized: normalizeWord(raw, language.locale),
    display: displayWord(raw),
    index,
  }));
  wordIndex = new Map(entries.map(entry => [entry.normalized, entry]));
  languageSelect.value = languageKey;
  saveLanguage();
  render();
}

function characters(value) {
  if ('Segmenter' in Intl) {
    return [...new Intl.Segmenter(language.locale, {granularity: 'grapheme'}).segment(value)]
      .map(segment => segment.segment);
  }
  return Array.from(value);
}

function emphasizedWord(value) {
  const mark = document.createElement('span');
  mark.className = 'word-mark';
  const letters = characters(displayWord(value));
  const firstFour = document.createElement('strong');
  const remainder = document.createElement('span');
  firstFour.textContent = letters.slice(0, 4).join('');
  remainder.textContent = letters.slice(4).join('');
  mark.append(firstFour, remainder);
  return mark;
}

function levenshtein(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  const previous = Array.from({length: right.length + 1}, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column++) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

function sharedPrefix(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length++;
  return length;
}

function phonetic(word) {
  const groups = {b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2,
    d: 3, t: 3, l: 4, m: 5, n: 5, r: 6};
  let code = word[0] || '';
  let previous = groups[code] || 0;
  for (const letter of word.slice(1)) {
    const value = groups[letter] || 0;
    if (value && value !== previous) code += value;
    previous = value;
  }
  return (code + '000').slice(0, 4);
}

function score(entry, query) {
  const word = entry.normalized;
  const prefix = sharedPrefix(word, query);
  let value = levenshtein(word, query) * 12
    + Math.abs(Array.from(word).length - Array.from(query).length) * 2
    - prefix * 10;
  if (word.startsWith(query)) value -= 90 + Array.from(query).length * 7;
  else if (word.includes(query)) value -= 28;
  if (word[0] === query[0]) value -= 8;
  if (language.phonetic && query.length >= 3 && phonetic(word) === phonetic(query)) value -= 20;
  return value;
}

function rankedWords(query, count) {
  if (!query) {
    const featured = languageKey === 'english'
      ? englishFeatured.map(word => wordIndex.get(word)).filter(Boolean)
      : [];
    const chosen = [...featured];
    for (let index = 17; chosen.length < count; index += 73) {
      const entry = entries[index % entries.length];
      if (!chosen.includes(entry)) chosen.push(entry);
    }
    return chosen.slice(0, count);
  }
  return entries
    .filter(entry => entry.normalized !== query)
    .map(entry => ({entry, score: score(entry, query)}))
    .sort((a, b) => a.score - b.score || a.entry.index - b.entry.index)
    .slice(0, count)
    .map(match => match.entry);
}

function ordinal(number) {
  const remainder100 = number % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${number}th`;
  return `${number}${{1: 'st', 2: 'nd', 3: 'rd'}[number % 10] || 'th'}`;
}

function setValidity(value) {
  input.classList.remove('valid', 'invalid');
  validity.replaceChildren();
  if (!value) return;
  const entry = wordIndex.get(value);
  const valid = Boolean(entry);
  input.classList.add(valid ? 'valid' : 'invalid');
  const state = document.createElement('strong');
  state.className = valid ? 'word-valid' : 'word-invalid';
  state.textContent = valid ? 'valid' : 'NOT';
  validity.append('"', emphasizedWord(entry?.display || input.value.trim()), '" is ',
    ...(valid
      ? ['a ', state, ` BIP39 word and is the ${ordinal(entry.index + 1)} word in the ${language.statusLabel || language.label} wordlist.`]
      : [state, ` a valid BIP39 word in the ${language.statusLabel || language.label} wordlist.`]));
}

function render() {
  const value = normalizeWord(input.value);
  setValidity(value);
  const slots = matchMedia('(max-width: 650px)').matches ? narrowSlots : wideSlots;
  const words = rankedWords(value, slots.length);
  const nodes = words.map((entry, index) => {
    const button = document.createElement('button');
    const [x, y] = slots[index];
    const prominence = index === 0 ? 22 : index < 3 ? 18 : index < 10 ? 15 : 13;
    button.type = 'button';
    button.className = 'word-suggestion';
    button.dataset.rank = String(index);
    button.append(emphasizedWord(entry.display));
    button.setAttribute('aria-label', `Use ${language.statusLabel || language.label} BIP39 word ${entry.display}`);
    button.style.setProperty('--word-x', `${x}%`);
    button.style.setProperty('--word-y', `${y}%`);
    button.style.setProperty('--word-size', `${prominence}px`);
    button.style.setProperty('--word-opacity', String(index < 4 ? .95 : Math.max(.3, .78 - index * .017)));
    button.style.setProperty('--word-enter-delay', `${Math.min(index * 16, 240)}ms`);
    button.style.setProperty('--word-delay', `${-((index * 1.37) % 7)}s`);
    button.style.setProperty('--word-speed', `${6 + index % 5}s`);
    button.style.setProperty('--word-drift-x', `${index % 2 ? -3 : 3}px`);
    button.style.setProperty('--word-drift-y', `${index % 3 ? 2 : -3}px`);
    button.addEventListener('click', () => {
      input.value = entry.display;
      render();
      input.focus();
    });
    return button;
  });
  suggestions.replaceChildren(...nodes);
}

Object.entries(languages).forEach(([value, details]) => {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = details.label;
  languageSelect.append(option);
});

input.addEventListener('input', render);
input.addEventListener('keydown', event => {
  const words = [...suggestions.querySelectorAll('button')];
  if (event.key === 'ArrowDown' && words.length) {
    event.preventDefault();
    words[0].focus();
  }
});

suggestions.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Escape') { input.focus(); return; }
  const words = [...suggestions.querySelectorAll('button')];
  const current = words.indexOf(document.activeElement);
  const step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
  words[(current + step + words.length) % words.length]?.focus();
});

languageSelect.addEventListener('change', () => selectLanguage(languageSelect.value));
document.getElementById('openWordlistSettings')?.addEventListener('click', () => settingsDialog.showModal());
settingsDialog.addEventListener('click', event => {
  if (event.target === settingsDialog) settingsDialog.close();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});

function closeAllModals() {
  document.querySelectorAll('.description-modal.active').forEach(modal => modal.classList.remove('active'));
  document.body.classList.remove('modal-open');
}

function openBipModal(event) {
  event?.stopPropagation();
  closeAllModals();
  document.getElementById('bip39Modal').classList.add('active');
  document.body.classList.add('modal-open');
}

function closeBipModal() {
  document.getElementById('bip39Modal').classList.remove('active');
  document.body.classList.remove('modal-open');
}

document.getElementById('openBipInfoModal')?.addEventListener('click', openBipModal);
document.getElementById('closeBipModal')?.addEventListener('click', closeBipModal);
document.getElementById('bip39Modal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) closeBipModal();
});

window.openBipModal = openBipModal;
window.closeBipModal = closeBipModal;
selectLanguage(languageKey);
window.lucide?.createIcons();
