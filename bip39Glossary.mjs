const glossary = {
    random: {
        title: 'Randomness', aliases: ['random', 'randomness', 'randomly', 'secure random generator'],
        simple: 'An outcome you cannot predict in advance, like the next result of a fair coin flip.',
        here: 'Real wallets need a secure source of randomness. Choosing favorite words or following an easy pattern is predictable. The playground also offers predictable patterns to make the bits easier to study.', related: ['entropy', 'bits']
    },
    derive: {
        title: 'Derive', aliases: ['derive', 'derived', 'deriving', 'derivation'],
        simple: 'Calculate something from a starting value by following a recipe.',
        here: 'A wallet derives keys from a seed. With the same seed and the same recipe and settings, it can calculate the same keys again instead of saving every key separately.', related: ['seed', 'keys', 'wallet']
    },
    password: {
        title: 'Password', aliases: ['password', 'passwords'],
        simple: 'Secret text used as part of checking access or protecting information.',
        here: 'In the technical BIP39 recipe, "password" is the name of an input, and the recovery words go there. Your wallet app may also have an unlock password. That app password is separate from the optional BIP39 passphrase.', related: ['passphrase', 'pbkdf2', 'recovery']
    },
    bitcoin: {
        title: 'Bitcoin', aliases: ['Bitcoin'],
        simple: 'Imagine a shared notebook of payments that many computers check together. No single company gets to secretly rewrite it.',
        here: 'Your wallet uses keys to authorize spending bitcoin. This playground explains one common way wallets turn recovery words into those keys.', related: ['wallet', 'keys']
    },
    bip39: {
        title: 'BIP39', aliases: ['BIP39'],
        simple: 'A shared recipe for turning a computer\'s random numbers into words people can write down.',
        here: 'BIP stands for Bitcoin Improvement Proposal. Recipe 39 defines the word lists, checksum, and conversion from words plus an optional passphrase to a seed.', related: ['entropy', 'checksum', 'seed']
    },
    entropy: {
        title: 'Entropy', aliases: ['entropy'],
        simple: 'Think of flipping a fair coin many times. The results are hard to guess because you cannot choose whether each flip lands heads or tails.',
        here: 'A wallet gets unpredictable zeros and ones from a secure random generator. A 12-word BIP39 phrase starts with 128 of these bits; a 24-word phrase starts with 256. Our counting and all-zero examples are predictable, so they are only for learning.', related: ['bits', 'recovery', 'checksum']
    },
    entropy_bits: {
        title: 'Entropy bits', aliases: ['entropy bits', 'entropy bit', 'random bits', 'random bit'],
        simple: 'The zeros and ones from the coin flips, before adding any check. Each result is one bit of the starting data.',
        here: 'These are the teal bits in the playground. A 12-word phrase starts with 128 entropy bits; a 24-word phrase starts with 256. A real wallet generates them unpredictably. The last word contains some entropy bits too, alongside the checksum bits.', related: ['entropy', 'checksum_bits', 'bits']
    },
    checksum_bits: {
        title: 'Checksum bits', aliases: ['checksum bits', 'checksum bit', 'check bits', 'check bit'],
        simple: 'A few extra zeros and ones that act like a tiny error-check label for the starting data. They are calculated, not extra coin flips.',
        here: 'These are the orange bits at the end of the last word. BIP39 adds 4 for a 12-word phrase or 8 for a 24-word phrase. They come from hashing the entropy. A mismatch catches an error, but a match does not guarantee that the phrase is correct or safe.', related: ['checksum', 'entropy_bits', 'sha256']
    },
    wordlist: {
        title: 'BIP39 word list', aliases: ['English BIP39 word list', 'English BIP39 list', 'BIP39 English word list', 'BIP39 word list', 'word list', 'word lists'],
        simple: 'A numbered dictionary everyone following this recipe agrees to use, so a number always points to the same word.',
        here: 'The English BIP39 list contains 2,048 words. Their indices run from 0 to 2,047, so each fits in 11 bits. The first four letters identify a word uniquely; shorter words use their whole spelling.', related: ['index', 'bits', 'bip39']
    },
    bits: {
        title: 'Bits & binary', aliases: ['bits', 'bit', 'binary', '11-bit', '512-bit', '11-bit value', '11-bit pieces', '11 bits', '512 bits', 'binary digits'],
        simple: 'A bit is a tiny switch with two positions: 0 or 1. Binary is a way to write numbers using only those two digits.',
        here: 'Eleven bits can describe 2,048 different values, from 0 to 2,047. That is exactly enough to pick one word from the English BIP39 list. A byte is a group of eight bits.', related: ['index', 'bytes', 'entropy']
    },
    bytes: {
        title: 'Byte', aliases: ['byte', 'bytes', '64-byte'],
        simple: 'A byte is a little bundle of eight bits, like a row of eight tiny switches.',
        here: 'The final BIP39 seed always contains 64 bytes, or 512 bits. In the seed display, each pair of hexadecimal characters represents one byte.', related: ['bits', 'hex', 'seed']
    },
    checksum: {
        title: 'Checksum', aliases: ['checksum', 'checksums', 'stored check', 'expected check'],
        simple: 'A small check number added to a message. When you read the message back, you work out the check again. If they differ, something changed.',
        here: 'BIP39 puts a few check bits inside the last word. They catch some mistakes, but not all. A matching checksum does not prove that a phrase is secret, safe, or belongs to your wallet.', related: ['sha256', 'bits', 'recovery']
    },
    recovery: {
        title: 'Recovery phrase / mnemonic', aliases: ['recovery phrase', 'recovery phrases', 'recovery words', 'seed phrase', 'seed phrases', 'BIP39 phrase', 'BIP39 phrases', 'BIP39 seed phrase', 'mnemonic', 'mnemonics'],
        simple: 'A list of words that lets compatible wallet software rebuild the same wallet. The words are a readable way to record numbers.',
        here: 'A BIP39 phrase contains 12, 15, 18, 21, or 24 words in a particular order. It is not the same thing as the seed. If you use an extra passphrase, you need that too.', related: ['seed', 'passphrase', 'bip39']
    },
    seed: {
        title: 'Seed', aliases: ['seed', 'seeds', '64-byte seed', 'BIP39 seed', 'seed bytes'],
        simple: 'Imagine a starting recipe that can grow the same tree every time. Here, the branches are the wallet\'s keys and addresses.',
        here: 'BIP39 turns the ordered words and optional passphrase into 64 bytes. Wallet software uses this starting data to derive keys. The seed is not an address and should not be shared.', related: ['recovery', 'passphrase', 'keys']
    },
    passphrase: {
        title: 'Optional passphrase', aliases: ['passphrase', 'passphrases', 'optional passphrase', 'practice passphrase', 'BIP39 passphrase', '13th word', '25th word', '13th', '25th'],
        simple: 'An optional extra ingredient in the recipe. The same words with a different extra ingredient lead to a different wallet.',
        here: 'It can be a sentence, not just a "13th" or "25th" word. Empty is allowed. Case and spaces matter, and a typo does not produce a wrong-password warning: it produces another seed.', related: ['seed', 'recovery', 'normalization']
    },
    wallet: {
        title: 'Wallet', aliases: ['wallet', 'wallets', 'Bitcoin wallet', 'Bitcoin wallets', 'wallet software'],
        simple: 'Think of a key ring and a payment app together. It helps you see your bitcoin and use the keys that authorize spending it.',
        here: 'The bitcoin is recorded on the network, not inside the app. Compatible wallet software can recreate keys from the same recovery phrase and passphrase, using the same wallet settings.', related: ['keys', 'address', 'recovery']
    },
    keys: {
        title: 'Keys', aliases: ['keys', 'key', 'private key', 'private keys', 'public key', 'public keys'],
        simple: 'A private key is a secret number that lets you approve a payment. A related public key lets others check that approval without learning the secret.',
        here: 'Wallets can derive many keys from one seed. This playground stops at the seed: it does not create spendable wallet addresses or sign payments.', related: ['seed', 'address', 'wallet']
    },
    address: {
        title: 'Bitcoin address', aliases: ['Bitcoin address', 'Bitcoin addresses', 'address', 'addresses'],
        simple: 'Like payment instructions you can share so someone knows where to send bitcoin.',
        here: 'An address is different from a secret key or recovery phrase. Wallets create addresses from keys and other rules. The long seed shown here is not an address.', related: ['keys', 'wallet', 'seed']
    },
    index: {
        title: 'Word index', aliases: ['index', 'indices', 'word index', 'word indices', 'list position'],
        simple: 'A word\'s number in the list. Computers often start counting at zero instead of one.',
        here: '"abandon" is at list position 1, but its index is 0. "zoo" is at position 2,048, with index 2,047. We store the index as eleven binary digits.', related: ['bits', 'bip39']
    },
    hex: {
        title: 'Hexadecimal', aliases: ['hexadecimal', 'hex'],
        simple: 'A shorter way to write numbers. Instead of only 0 through 9, it also uses a through f.',
        here: 'One hex digit represents four bits. Two represent a byte: 00 means zero, and ff means 255. This makes the seed easier to display than 512 separate zeros and ones.', related: ['bytes', 'bits', 'seed']
    },
    sha256: {
        title: 'SHA-256', aliases: ['SHA-256', 'SHA-256 hash'],
        simple: 'A mathematical machine that makes a fixed-size label from some data. Feed it the same data and you get the same label. A tiny change usually makes the label look very different.',
        here: 'BIP39 takes a few bits from this label to make the checksum. It is a hash, not encryption: it is not designed to be reversed to retrieve the original data.', related: ['checksum', 'hash']
    },
    hash: {
        title: 'Hash', aliases: ['hash', 'hashes', 'hashing'],
        simple: 'A short, fixed-size result calculated from data, a bit like a fingerprint for that data.',
        here: 'The same input gives the same hash. Different inputs usually look unrelated. BIP39 uses the SHA-256 hash for its checksum and SHA-512 inside its seed-making recipe.', related: ['sha256', 'sha512', 'checksum']
    },
    pbkdf2: {
        title: 'PBKDF2-HMAC-SHA512', aliases: ['PBKDF2-HMAC-SHA512', 'PBKDF2'],
        simple: 'A standard mixing recipe for words and extra text. It repeats a calculation so each guess takes more work than a single quick calculation.',
        here: 'BIP39 uses 2,048 iterations of PBKDF2 with HMAC-SHA512 to produce the 64-byte seed. This does not make a predictable practice phrase safe to use.', related: ['iterations', 'salt', 'hmac', 'sha512']
    },
    hmac: {
        title: 'HMAC', aliases: ['HMAC', 'HMAC-SHA512', 'HMAC-SHA-512'],
        simple: 'A way to mix a key into a hash calculation, so the result depends on both the key and the message.',
        here: 'It is an ingredient inside the BIP39 seed recipe. The recipe uses HMAC with SHA-512, repeatedly, to turn the words and passphrase into seed bytes.', related: ['hash', 'sha512', 'pbkdf2']
    },
    sha512: {
        title: 'SHA-512', aliases: ['SHA-512', 'SHA512'],
        simple: 'A hash recipe that produces 512 bits of output, regardless of how long its input was.',
        here: 'BIP39 uses SHA-512 inside HMAC and PBKDF2 when making the seed. The checksum uses a different hash recipe, SHA-256.', related: ['hash', 'pbkdf2', 'sha256']
    },
    iterations: {
        title: 'Iterations', aliases: ['iterations', 'iteration'],
        simple: 'A technical word for repetitions. Doing something ten times means doing ten iterations.',
        here: 'BIP39 specifies 2,048 iterations in its seed-making recipe. Compatible wallets use the same count so the same words and passphrase produce the same seed.', related: ['pbkdf2', 'seed']
    },
    salt: {
        title: 'Salt', aliases: ['salt'],
        simple: 'Extra input mixed into a password-based calculation, like adding another ingredient to a recipe.',
        here: 'In BIP39, the salt is the exact text "mnemonic" followed by the optional passphrase. Without a passphrase, it is just "mnemonic".', related: ['pbkdf2', 'passphrase', 'recovery']
    },
    normalization: {
        title: 'Unicode NFKD normalization', aliases: ['Unicode NFKD normalization', 'NFKD normalization', 'normalization', 'NFKD', 'Unicode'],
        simple: 'Computers can store some similar-looking letters in different ways. This step puts the text into a standard form before doing the calculation.',
        here: 'For example, an accented letter may be stored as one character or as a letter plus an accent. NFKD makes equivalent forms agree. It does not ignore capitalization or remove spaces from your passphrase.', related: ['passphrase', 'pbkdf2']
    }
};

const aliases = new Map(Object.entries(glossary).flatMap(([key, entry]) => entry.aliases.map(alias => [alias.toLowerCase(), key])));
const terms = [...aliases.keys()].sort((a, b) => b.length - a.length);
const pattern = new RegExp('\\b(' + terms.map(term => term.replaceAll(' ', '\\s+')).join('|') + ')\\b', 'gi');

export function matchGlossaryTerms(text) {
    return [...text.matchAll(pattern)].map(match => ({
        text: match[0],
        index: match.index,
        key: aliases.get(match[0].toLowerCase().replace(/\s+/g, ' '))
    }));
}

export function explainTerms(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return node.parentElement.closest('button, a, input, select, textarea, code, summary, label, script, style, dialog, [data-no-glossary]')
                ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
        const matches = matchGlossaryTerms(node.textContent);
        if (!matches.length) continue;
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const match of matches) {
            fragment.append(node.textContent.slice(offset, match.index));
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'lab-term';
            button.dataset.term = match.key;
            button.textContent = match.text;
            button.title = `Explain ${match.text}`;
            button.setAttribute('aria-label', `Explain ${match.text}`);
            button.setAttribute('aria-haspopup', 'dialog');
            button.setAttribute('aria-controls', 'lab-glossary');
            fragment.append(button);
            offset = match.index + match.text.length;
        }
        fragment.append(node.textContent.slice(offset));
        node.replaceWith(fragment);
    }
}

export function setupGlossary(root) {
    const dialog = root.querySelector('#lab-glossary');
    const title = root.querySelector('#lab-glossary-title');
    const simple = root.querySelector('#lab-glossary-simple');
    const context = root.querySelector('#lab-glossary-context');
    const related = root.querySelector('#lab-glossary-related');
    const close = root.querySelector('#lab-glossary-close');
    let opener;

    root.addEventListener('click', event => {
        const button = event.target.closest('button[data-term]');
        if (!button) return;
        const entry = glossary[button.dataset.term];
        if (!entry) return;
        title.textContent = entry.title;
        simple.textContent = entry.simple;
        context.textContent = entry.here;
        related.replaceChildren(...entry.related.map(key => {
            const link = document.createElement('button');
            link.type = 'button';
            link.dataset.term = key;
            link.className = 'lab-related-term';
            link.textContent = glossary[key].title;
            return link;
        }));
        if (!dialog.open) {
            opener = button;
            dialog.showModal();
        }
        close.focus();
    });
    dialog.addEventListener('close', () => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    explainTerms(root);
}
