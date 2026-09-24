import {wordlist as bip39Words} from './vendor/bip39.mjs';

const input = document.getElementById('bip39Input');
const suggestions = document.getElementById('suggestions');
const validity = document.getElementById('wordValidityInfo');
const wordSet = new Set(bip39Words);

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

const featured = [
  'abandon', 'ability', 'acoustic', 'alien', 'ancient', 'balance', 'bamboo', 'beach',
  'bitcoin', 'block', 'brave', 'cactus', 'coin', 'digital', 'dream', 'energy', 'future',
  'galaxy', 'honest', 'liberty', 'light', 'matrix', 'network', 'orange', 'proof', 'quantum',
  'signal', 'trust',
].filter(word => wordSet.has(word));

function levenshtein(a, b) {
  const previous = Array.from({length: b.length + 1}, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= b.length; column++) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1,
        diagonal + (a[row - 1] === b[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function sharedPrefix(a, b) {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

function phonetic(word) {
  const groups = {b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2,
    d: 3, t: 3, l: 4, m: 5, n: 5, r: 6};
  let code = word[0] || '', previous = groups[code] || 0;
  for (const letter of word.slice(1)) {
    const value = groups[letter] || 0;
    if (value && value !== previous) code += value;
    previous = value;
  }
  return (code + '000').slice(0, 4);
}

function score(word, query) {
  const prefix = sharedPrefix(word, query);
  let value = levenshtein(word, query) * 12 + Math.abs(word.length - query.length) * 2 - prefix * 10;
  if (word.startsWith(query)) value -= 90 + query.length * 7;
  else if (word.includes(query)) value -= 28;
  if (word[0] === query[0]) value -= 8;
  if (query.length >= 3 && phonetic(word) === phonetic(query)) value -= 20;
  return value;
}

function rankedWords(query, count) {
  if (!query) {
    const chosen = [...featured];
    for (let index = 17; chosen.length < count; index += 73) {
      const word = bip39Words[index % bip39Words.length];
      if (!chosen.includes(word)) chosen.push(word);
    }
    return chosen.slice(0, count);
  }
  return bip39Words
    .filter(word => word !== query)
    .map(word => ({word, score: score(word, query)}))
    .sort((a, b) => a.score - b.score || a.word.localeCompare(b.word))
    .slice(0, count)
    .map(match => match.word);
}

function setValidity(value) {
  input.classList.remove('valid', 'invalid');
  validity.replaceChildren();
  if (!value) return;
  const valid = wordSet.has(value);
  input.classList.add(valid ? 'valid' : 'invalid');
  const state = document.createElement('strong');
  state.className = valid ? 'word-valid' : 'word-invalid';
  state.textContent = valid ? 'valid' : 'not';
  validity.append(`"${value}" is `, state, ' a BIP39 word');
}

function render() {
  const value = input.value.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (input.value !== value) input.value = value;
  setValidity(value);
  const slots = matchMedia('(max-width: 650px)').matches ? narrowSlots : wideSlots;
  const words = rankedWords(value, slots.length);
  const nodes = words.map((word, index) => {
    const button = document.createElement('button');
    const [x, y] = slots[index];
    const prominence = index === 0 ? 22 : index < 3 ? 18 : index < 10 ? 15 : 13;
    button.type = 'button';
    button.className = 'word-suggestion';
    button.dataset.rank = String(index);
    button.textContent = word;
    button.setAttribute('aria-label', `Use BIP39 word ${word}`);
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
      input.value = word;
      render();
      input.focus();
    });
    return button;
  });
  suggestions.replaceChildren(...nodes);
}

input.addEventListener('input', render);
input.addEventListener('keydown', event => {
  const words = [...suggestions.querySelectorAll('button')];
  if (event.key === 'ArrowDown' && words.length) {
    event.preventDefault();
    words[0].focus();
  } else if (event.key === 'Tab' && !event.shiftKey && words.length === 1) {
    event.preventDefault();
    words[0].click();
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
render();
