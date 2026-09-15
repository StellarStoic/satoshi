import { wordlist as bip39Words } from './vendor/bip39.mjs';
import { explainTerms } from './bip39Glossary.mjs';

// From Jameson Lopp's repeated words findings at https://blog.lopp.net/how-many-bitcoin-seed-phrases-are-only-one-repeated-word/
const repeatedWords12x = new Set([
  "action", "agent", "aim", "all", "ankle", "announce", "audit", "awesome", "beef", "believe", "blue", "border", "brand",
  "breeze", "bus", "business", "cannon", "canyon", "carry", "cave", "century", "cereal", "chronic", "coast", "convince",
  "cute", "dawn", "dilemma", "divorce", "dry", "elevator", "else", "embrace", "enroll", "escape", "evolve", "exclude",
  "excuse", "exercise", "expire", "fetch", "fever", "forward", "fury", "garment", "gauge", "gym", "half", "harsh", "hole",
  "hybrid", "illegal", "include", "index", "into", "invest", "involve", "jeans", "kick", "kite", "later", "layer", "legend",
  "life", "lyrics", "margin", "melody", "mom", "more", "morning", "nation", "neck", "neglect", "never", "noble", "novel",
  "obvious", "ocean", "oil", "orphan", "oxygen", "pause", "peasant", "permit", "piano", "proof", "pumpkin", "question",
  "real", "report", "rough", "rude", "salad", "scale", "screen", "sea", "seat", "sell", "seminar", "seven", "sheriff",
  "siege", "silver", "soldier", "spell", "split", "spray", "stadium", "sugar", "sunny", "sure", "tobacco", "tongue",
  "track", "tree", "trouble", "twelve", "twice", "type", "uniform", "useless", "valid", "very", "vibrant", "virtual",
  "vocal", "warrior", "word", "world", "yellow"
]);

const repeatedWords24x = new Set([
  "bacon", "flag", "gas", "great", "slice", "solution", "summer", "they", "trade", "trap", "zebra"
]);


const input = document.getElementById('bip39Input');
const suggestionsBox = document.getElementById('suggestions');
const warningBox = document.getElementById('repetitionWarning');

let currentMatches = [];
let inputRevision = 0;

input.addEventListener('input', () => {
  const value = input.value.trim().toLowerCase();
  const revision = ++inputRevision;
  const validityInfo = document.getElementById('wordValidityInfo');
  validityInfo.textContent = '';
  validityInfo.classList.remove('visible');
  document.getElementById('lab-use-checked-word').hidden = true;
  warningBox.textContent = '';
  warningBox.classList.remove('visible');
  currentMatches = [];

  if (value === "") {
    input.classList.remove('valid', 'invalid');
    suggestionsBox.textContent = "";
    suggestionsBox.classList.remove('active');
    return;
  }

  // Reset UI
  suggestionsBox.innerHTML = '';
  suggestionsBox.classList.remove('active');
  warningBox.classList.remove('visible');
  warningBox.textContent = '';

  if (bip39Words.includes(value)) {
    input.classList.add('valid');
    input.classList.remove('invalid');
  
  } else {
    input.classList.add('invalid');
    input.classList.remove('valid');
  }

  const isValid = bip39Words.includes(value);
  document.getElementById('lab-use-checked-word').hidden = !isValid;
  const validity = document.createElement('strong');
  validity.className = isValid ? 'word-valid' : 'word-invalid';
  validity.textContent = isValid ? 'valid' : 'NOT';
  validityInfo.append(
    `${value} is ${isValid ? 'a ' : ''}`,
    validity,
    isValid ? ' BIP39 word.' : ' valid BIP39 word.'
  );
  validityInfo.classList.add('visible');
  explainTerms(validityInfo);

  // If invalid BIP39 word, fetch similar real words
  if (!bip39Words.includes(value) && /^[a-z]{3,}$/.test(value)) {
    fetchSimilarEnglishWords(value).then(similarWords => {
      if (revision !== inputRevision) return;
      let html = '';
  
      // 1. Datamuse Suggestions
      const datamuseSuggestions = similarWords.filter(word => !usedWords.has(word));
      if (datamuseSuggestions.length) {
        const wordElements = datamuseSuggestions.map(word => {
          const isBip = bip39Words.includes(word);
          usedWords.add(word);
          const color = isBip ? 'limegreen' : '#999';
          const fontWeight = isBip ? '600' : 'normal';
          return `<span style="color:${color}; font-weight:${fontWeight};">${word}</span>`;
        });
      
        html += `<div><span style="color:#999;">Other similar English words: ${wordElements.join(', ')}</span></div>`;
      }
  
      // 2. Levenshtein fallback only if Datamuse gave nothing
      if (similarWords.length === 0) {
        const typoFixes = getClosestWordsByDistance(
          value,
          bip39Words.filter(w => !usedWords.has(w)), // avoid duplicates
          value.length <= 4 ? 1 : 2
        );
        
        if (typoFixes.length) {
          html += `<div><span style="color:#ccc;">Did you mean: <span style="color:limegreen;">${typoFixes.join(', ')}</span>?</span></div>`;
        }
      }
  
      if (bip39SuggestionHTML || html) {
        suggestionsBox.innerHTML = [bip39SuggestionHTML, html].filter(Boolean).join('<br>');
        suggestionsBox.classList.add('active');
      }
    });
  }
  
  const usedWords = new Set(); // keeps track of already suggested words

// --- First: BIP39 "startsWith" suggestions ---
currentMatches = bip39Words.filter(word => word.startsWith(value)).slice(0, 5);
let bip39SuggestionHTML = '';
if (currentMatches.length) {
  const matchElements = currentMatches.map(word => {
    usedWords.add(word);
    return `<span class="suggestion">${word}</span>`;
  }).join(', ');
  bip39SuggestionHTML = `Suggestions: ${matchElements}`;
}
if (!isValid && bip39SuggestionHTML) {
  suggestionsBox.innerHTML = bip39SuggestionHTML;
  suggestionsBox.classList.add('active');
}

// Repeated seed phrase warning
let warns12 = repeatedWords12x.has(value);
let warns24 = repeatedWords24x.has(value);

if (warns12 || warns24) {
  let repeatNote = `"${value}" is one of the rare words that can form a valid seed phrase when repeated `;

  if (warns12 && warns24) {
    repeatNote += `12 or 24 times.`;
  } else if (warns12) {
    repeatNote += `12 times.`;
  } else {
    repeatNote += `24 times.`;
  }

  repeatNote += ` Never use such phrases – they're insecure and publicly known.`;

  warningBox.textContent = repeatNote;
  warningBox.classList.add('visible');
  explainTerms(warningBox);
} else {
  warningBox.textContent = '';
  warningBox.classList.remove('visible');
}
});

// Autocomplete on click
suggestionsBox.addEventListener('click', (e) => {
  if (e.target.classList.contains('suggestion')) {
    input.value = e.target.textContent;
    input.dispatchEvent(new Event('input'));
  }
});

// Autocomplete on TAB if one match
input.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey && currentMatches.length === 1 && currentMatches[0] !== input.value.trim().toLowerCase()) {
    e.preventDefault();
    input.value = currentMatches[0];
    input.dispatchEvent(new Event('input'));
  }
});

// Levenshtein typo correction for mistyped words
function getClosestWordsByDistance(input, wordList, maxDistance = 2, maxResults = 5) {
  function levenshtein(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  return wordList
    .map(word => ({word, distance: levenshtein(input.toLowerCase(), word.toLowerCase())}))
    .filter(entry => entry.distance > 0 && entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map(entry => entry.word);
}

function fetchSimilarEnglishWords(inputWord) {
  const url = `https://api.datamuse.com/words?sp=${inputWord}&sl=${inputWord}&md=f&max=10`;

  return fetch(url)
    .then(res => res.json())
    .then(data => {
      return data
        .filter(entry => {
          const freqTag = entry.tags?.find(tag => tag.startsWith("f:"));
          if (!freqTag) return false;
          const frequency = parseFloat(freqTag.slice(2));
          return frequency >= 1; // only show common words
        })
        .map(entry => entry.word)
        .filter(word => word.length >= 3 && word !== inputWord);
    })
    .catch(() => []);
}

function closeAllModals() {
  document.querySelectorAll('.description-modal.active').forEach(modal => {
    modal.classList.remove('active');
  });
  document.body.classList.remove('modal-open');
}


// Open the modal
function openBipModal(event) {
    if (event) event.stopPropagation();
    closeAllModals(); // if you use this globally
    const modal = document.getElementById("bip39Modal");
    modal.classList.add("active");
    document.body.classList.add("modal-open");
  }
  
  // Close the modal
  function closeBipModal() {
    const modal = document.getElementById("bip39Modal");
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
  }
  
  // Global registration
  window.openBipModal = openBipModal;
  window.closeBipModal = closeBipModal;
  
  document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById("openBipInfoModal");
    const closeBtn = document.getElementById("closeBipModal");
    const modal = document.getElementById("bip39Modal");

    if (openBtn) {
      openBtn.addEventListener("click", openBipModal);
    }
  
    if (closeBtn) {
      closeBtn.addEventListener("click", closeBipModal);
    }
  
    // Close when clicking outside modal-content
    window.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeBipModal();
      }
    });
  });
