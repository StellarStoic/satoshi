import { wordlist, wordIndex, exampleWords, analyzeWords, flipEntropyBit, breakChecksum, validLastWords, deriveSeed, toHex } from './bip39LabModel.mjs';
import { setupGlossary, explainTerms } from './bip39Glossary.mjs';

const $ = id => document.getElementById(id);
let words = exampleWords();
let selected = 0;
let analysis;
let seedRevision = 0;
let seedTimer;
let basePhrase = '';
let baseSeed;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function renderWordEditor() {
    $('lab-word-label').textContent = `Word ${selected + 1}`;
    $('lab-use-checked-word').textContent = `Use as word ${selected + 1}`;
    $('lab-word-choice').value = words[selected];
    $('lab-word-error').textContent = '';
    $('lab-position').textContent = `${analysis.indices[selected] + 1} / 2048`;
    $('lab-index').textContent = analysis.indices[selected];
    $('lab-selected-bits').textContent = analysis.wordBits[selected];
    for (const button of $('lab-words').children) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.index) === selected));
    }
}

function renderWords() {
    $('lab-words').replaceChildren(...words.map((word, index) => {
        const button = element('button', undefined, 'lab-word');
        button.type = 'button';
        button.dataset.index = index;
        button.title = `Word ${index + 1}: ${word}. Select to edit.`;
        button.setAttribute('aria-label', `Word ${index + 1}: ${word}`);
        const name = element('span', undefined, 'lab-word-name');
        name.append(element('strong', word.slice(0, 4)), word.slice(4));
        const bits = element('span', undefined, 'lab-word-bits');
        if (index === words.length - 1) {
            bits.append(analysis.wordBits[index].slice(0, -analysis.checksumLength), element('span', analysis.checksum, 'lab-checksum-color'));
        } else {
            bits.textContent = analysis.wordBits[index];
        }
        button.append(element('span', String(index + 1).padStart(2, '0'), 'lab-word-number'), name, bits);
        return button;
    }));
    renderWordEditor();
}

function renderEntropy() {
    $('lab-entropy-count').textContent = analysis.entropyLength;
    $('lab-checksum-count').textContent = analysis.checksumLength;
    $('lab-total-count').textContent = words.length * 11;
    $('lab-piece-count').textContent = `${words.length} words x 11`;
    $('lab-entropy-hex').textContent = toHex(analysis.entropy);
    $('lab-entropy').replaceChildren(...Array.from(analysis.entropyBits, (bit, index) => {
        const button = element('button', bit, 'lab-bit');
        button.type = 'button';
        button.dataset.bit = index;
        button.setAttribute('aria-label', `Entropy bit ${index + 1}: ${bit}. Flip bit`);
        button.setAttribute('aria-pressed', String(bit === '1'));
        button.title = `Bit ${index + 1}: flip ${bit} to ${bit === '1' ? '0' : '1'}`;
        return button;
    }));
}

function renderChecksum() {
    const dataBits = 11 - analysis.checksumLength;
    $('lab-last-explainer').textContent = `Word ${words.length}, "${words.at(-1)}", contains ${dataBits} entropy bits in teal and ${analysis.checksumLength} checksum bits in orange.`;
    $('lab-last-bits').replaceChildren(...Array.from(analysis.wordBits.at(-1), (bit, index) => {
        const node = element('span', bit, index >= dataBits ? 'lab-checksum-bit' : '');
        node.title = index >= dataBits ? 'Checksum bit' : 'Entropy bit';
        return node;
    }));
    $('lab-stored-check').textContent = analysis.checksum;
    $('lab-expected-check').textContent = analysis.expectedChecksum;
    $('lab-check-status').textContent = analysis.valid
        ? 'Checksum matches. This is a valid BIP39 example.'
        : 'Checksum mismatch. Every word is on the list, but this phrase fails the BIP39 check.';
    $('lab-check-status').className = analysis.valid ? 'lab-status-valid' : 'lab-status-invalid';
    $('lab-break').disabled = !analysis.valid;
    $('lab-repair').disabled = analysis.valid;
    const options = validLastWords(words);
    $('lab-last-choice').replaceChildren(...options.map(word => {
        const option = element('option', word);
        option.value = word;
        return option;
    }));
    if (!analysis.valid) {
        const placeholder = element('option', 'Choose a matching word');
        placeholder.value = '';
        placeholder.disabled = true;
        $('lab-last-choice').prepend(placeholder);
    }
    $('lab-last-choice').value = analysis.valid ? words.at(-1) : '';
    $('lab-last-count').textContent = `With the first ${words.length - 1} words fixed, ${options.length} last words can pass. Each picks different remaining entropy bits. Only 1 in ${2 ** analysis.checksumLength} randomly chosen ${words.length}-word combinations passes the checksum.`;
}

function renderHex(id, hex, comparison) {
    $(id).replaceChildren(...hex.match(/.{2}/g).map((byte, index) => {
        const changed = comparison && byte !== comparison.slice(index * 2, index * 2 + 2);
        return element('span', byte, changed ? 'lab-changed-byte' : '');
    }));
}

function setSeedStatus(message) {
    $('lab-seed-status').textContent = message;
    explainTerms($('lab-seed-status'));
}

function scheduleSeeds() {
    const revision = ++seedRevision;
    clearTimeout(seedTimer);
    const enabled = $('lab-use-passphrase').checked;
    $('lab-passphrase-fields').hidden = !enabled;
    $('lab-passphrase').disabled = !enabled;
    $('lab-extra-seed').hidden = !enabled;
    $('lab-base-seed').replaceChildren();
    $('lab-passphrase-seed').replaceChildren();
    if (!analysis.valid) {
        setSeedStatus('Match the checksum to calculate the example seed.');
        return;
    }
    setSeedStatus('Calculating the example seed...');
    const phrase = [...words];
    const passphrase = enabled ? $('lab-passphrase').value : '';
    seedTimer = setTimeout(async () => {
        try {
            const joined = phrase.join(' ');
            if (basePhrase !== joined) {
                basePhrase = joined;
                baseSeed = deriveSeed(phrase);
            }
            const [plain, extra] = await Promise.all([baseSeed, enabled ? deriveSeed(phrase, passphrase) : baseSeed]);
            if (revision !== seedRevision) return;
            renderHex('lab-base-seed', plain);
            if (enabled) renderHex('lab-passphrase-seed', extra, plain);
            const changed = extra.match(/.{2}/g).filter((byte, index) => byte !== plain.slice(index * 2, index * 2 + 2)).length;
            setSeedStatus(!enabled
                ? 'No passphrase: the same words always produce this same seed.'
                : changed === 0
                    ? 'Empty passphrase: both seeds are identical.'
                    : `${changed} of 64 bytes changed (orange). The words and checksum stayed the same, but this seed leads to a different wallet.`);
        } catch {
            if (revision === seedRevision) {
                basePhrase = '';
                setSeedStatus('The seed could not be calculated. Reset the example to try again.');
            }
        }
    }, 150);
}

function render() {
    analysis = analyzeWords(words);
    renderWords();
    renderEntropy();
    renderChecksum();
    scheduleSeeds();
    explainTerms($('bip39-page'));
}

function markEdited() {
    $('lab-preset').value = 'edited';
}

$('lab-words').addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (!button) return;
    selected = Number(button.dataset.index);
    renderWordEditor();
});

$('lab-use-checked-word').addEventListener('click', () => {
    const word = $('bip39Input').value.trim().toLowerCase();
    if (!wordIndex.has(word)) return;
    words[selected] = word;
    markEdited();
    render();
    $('lab-words').children[selected].focus();
});

$('lab-word-form').addEventListener('submit', event => {
    event.preventDefault();
    let word = $('lab-word-choice').value.trim().toLowerCase();
    if (!wordIndex.has(word) && word.length >= 4) {
        const matches = wordlist.filter(candidate => candidate.startsWith(word));
        if (matches.length === 1) word = matches[0];
    }
    if (!wordIndex.has(word)) {
        $('lab-word-error').textContent = 'Choose a word from the English BIP39 list.';
        return;
    }
    words[selected] = word;
    markEdited();
    render();
});

$('lab-entropy').addEventListener('click', event => {
    const button = event.target.closest('button[data-bit]');
    if (!button) return;
    const index = Number(button.dataset.bit);
    words = flipEntropyBit(words, index);
    markEdited();
    render();
    $('lab-entropy').children[index].focus();
});

$('lab-length').addEventListener('change', () => {
    words = exampleWords(Number($('lab-length').value));
    selected = Math.min(selected, words.length - 1);
    $('lab-preset').value = 'counting';
    render();
});
$('lab-preset').addEventListener('change', () => {
    words = exampleWords(words.length, $('lab-preset').value);
    render();
});
$('lab-random').addEventListener('click', () => {
    words = exampleWords(words.length, 'random');
    $('lab-preset').value = 'random';
    render();
});
$('lab-reset').addEventListener('click', () => {
    words = exampleWords(words.length);
    selected = 0;
    $('lab-preset').value = 'counting';
    $('lab-use-passphrase').checked = false;
    $('lab-passphrase').value = 'satoshi';
    $('lab-show-passphrase').checked = false;
    $('lab-passphrase').type = 'password';
    render();
});
$('lab-break').addEventListener('click', () => {
    words = breakChecksum(words);
    selected = words.length - 1;
    render();
    $('lab-repair').focus();
});
$('lab-repair').addEventListener('click', () => {
    words = analysis.correctedWords;
    render();
    $('lab-break').focus();
});
$('lab-last-choice').addEventListener('change', () => {
    words[words.length - 1] = $('lab-last-choice').value;
    selected = words.length - 1;
    markEdited();
    render();
});
$('lab-use-passphrase').addEventListener('change', scheduleSeeds);
$('lab-passphrase').addEventListener('input', scheduleSeeds);
$('lab-show-passphrase').addEventListener('change', () => {
    $('lab-passphrase').type = $('lab-show-passphrase').checked ? 'text' : 'password';
});

$('lab-wordlist').replaceChildren(...wordlist.map(word => {
    const option = document.createElement('option');
    option.value = word;
    return option;
}));
const edited = element('option', 'Edited bits');
edited.value = 'edited';
edited.disabled = true;
$('lab-preset').append(edited);
setupGlossary($('bip39-page'));
render();
$('lab-loading').hidden = true;
$('lab-content').hidden = false;
$('bip39-lab').setAttribute('aria-busy', 'false');
