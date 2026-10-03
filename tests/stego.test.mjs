import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

function field(value = '') {
  return {
    value,
    textContent: '',
    dataset: {},
    style: {},
    addEventListener() {},
    appendChild() {}
  };
}

function textStegoContext({visible = 'Visible message', hidden = 'hidden message', key = '', nostr = false} = {}) {
  const elements = {
    visibleMessage: field(visible),
    hiddenMessage: field(hidden),
    encryptionKey: field(key),
    encodedOutput: field(),
    encodedMessage: field(),
    decryptionKey: field(key),
    decodedOutput: field(),
    encodeButton: field(),
    decodeButton: field()
  };
  const context = {
    crypto: webcrypto,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    URLSearchParams,
    atob,
    btoa,
    clearTimeout,
    setTimeout,
    console: {log() {}, warn() {}, error() {}},
    document: {
      getElementById: id => elements[id],
      createElement: () => field()
    },
    showToast() {},
    showLoader() {},
    hideLoader() {},
    decodeMessageWithThreeChar() { return ''; },
    decodeEmoji() { return ''; },
    checkForConfettiTrigger() { return true; },
    triggerSparkleEffect() {},
    displayTruncatedText(element, text) { element.textContent = text; }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('../stego/vendor/crypto-js.min.js'), context);
  if (nostr) {
    vm.runInContext(source('../stego/vendor/nostr-tools.bundle.js'), context);
    vm.runInContext(source('../stego/nostr-recipient.js'), context);
  }
  vm.runInContext(source('../stego/text-stego.js'), context);
  return {context, elements};
}

test('compact text steganography preserves visible and hidden emojis', async () => {
  const {context, elements} = textStegoContext({visible: 'Coffee and sats ☕', hidden: 'Hidden lightning ⚡ and bitcoin 🧡'});
  await vm.runInContext('encodeMessage()', context);
  assert.ok(elements.encodedOutput.textContent.startsWith('Coffee and sats ☕'));
  elements.encodedMessage.value = elements.encodedOutput.textContent;
  await vm.runInContext('decodeMessage()', context);
  assert.equal(elements.decodedOutput.textContent, 'Hidden lightning ⚡ and bitcoin 🧡');
});

test('encrypted emoji text survives the compact format', async () => {
  const {context, elements} = textStegoContext({hidden: 'secret sats 🔐', key: 'correct horse'});
  await vm.runInContext('encodeMessage()', context);
  elements.encodedMessage.value = elements.encodedOutput.textContent;
  await vm.runInContext('decodeMessage()', context);
  assert.equal(elements.decodedOutput.textContent, 'secret sats 🔐');
});

test('Nostr recipient envelopes decrypt only with the matching private key', () => {
  const context = {
    crypto: webcrypto,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    URLSearchParams,
    atob,
    btoa,
    clearTimeout,
    setTimeout,
    console: {log() {}, warn() {}, error() {}}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('../stego/vendor/nostr-tools.bundle.js'), context);
  vm.runInContext(source('../stego/nostr-recipient.js'), context);

  const secret = vm.runInContext('NostrTools.generateSecretKey()', context);
  context.secret = secret;
  context.recipientNpub = vm.runInContext(
    'NostrTools.nip19.npubEncode(NostrTools.getPublicKey(secret))', context
  );
  context.recipientNsec = vm.runInContext('NostrTools.nip19.nsecEncode(secret)', context);
  context.envelopeText = vm.runInContext(
    `StegoNostrRecipient.encryptForRecipient('recipient only', recipientNpub)`, context
  );
  assert.equal(
    vm.runInContext(
      'StegoNostrRecipient.decryptWithSecret(StegoNostrRecipient.parseEnvelope(envelopeText), recipientNsec)',
      context
    ),
    'recipient only'
  );

  context.wrongSecret = vm.runInContext('NostrTools.nip19.nsecEncode(NostrTools.generateSecretKey())', context);
  assert.throws(
    () => vm.runInContext(
      'StegoNostrRecipient.decryptWithSecret(StegoNostrRecipient.parseEnvelope(envelopeText), wrongSecret)',
      context
    ),
    /different Nostr account/
  );
});

test('NIP-07 signer decrypts a recipient envelope without exposing its key', async () => {
  const context = {
    crypto: webcrypto,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    URLSearchParams,
    atob,
    btoa,
    clearTimeout,
    setTimeout,
    console: {log() {}, warn() {}, error() {}}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('../stego/vendor/nostr-tools.bundle.js'), context);
  vm.runInContext(source('../stego/nostr-recipient.js'), context);
  vm.runInContext(`
    signerSecret = NostrTools.generateSecretKey();
    signerPubkey = NostrTools.getPublicKey(signerSecret);
    signerNpub = NostrTools.nip19.npubEncode(signerPubkey);
    signerEnvelope = StegoNostrRecipient.parseEnvelope(
      StegoNostrRecipient.encryptForRecipient('wrapped file key', signerNpub)
    );
    nostr = {
      getPublicKey: async () => signerPubkey,
      nip44: {
        decrypt: async (pubkey, ciphertext) => NostrTools.nip44.v2.decrypt(
          ciphertext,
          NostrTools.nip44.v2.utils.getConversationKey(signerSecret, pubkey)
        )
      }
    };
  `, context);
  assert.equal(
    await vm.runInContext(
      `StegoNostrRecipient.decryptWithPreferredSigner(signerEnvelope, 'file')`, context
    ),
    'wrapped file key'
  );
});

test('text steganography locks an encoded message to an npub', async () => {
  const {context, elements} = textStegoContext({hidden: 'for your eyes only', nostr: true});
  context.recipientSecret = vm.runInContext('NostrTools.generateSecretKey()', context);
  elements.encryptionKey.value = vm.runInContext(
    'NostrTools.nip19.npubEncode(NostrTools.getPublicKey(recipientSecret))', context
  );
  await vm.runInContext('encodeMessage()', context);
  assert.ok(elements.encodedOutput.textContent.startsWith('Visible message'));

  elements.encodedMessage.value = elements.encodedOutput.textContent;
  elements.decryptionKey.value = vm.runInContext('NostrTools.nip19.nsecEncode(recipientSecret)', context);
  await vm.runInContext('decodeMessage()', context);
  assert.equal(elements.decodedOutput.textContent, 'for your eyes only');
  assert.equal(elements.decryptionKey.value, '');
});

test('NIP-55 opens Amber, verifies the recipient, and returns decrypted text', () => {
  const makeStorage = () => {
    const values = new Map();
    return {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key)
    };
  };
  const location = {
    origin: 'https://satoshi.si',
    pathname: '/stego.html',
    search: '',
    hash: '',
    assigned: '',
    assign(value) { this.assigned = value; }
  };
  const context = {
    crypto: webcrypto,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    URLSearchParams,
    atob,
    btoa,
    clearTimeout,
    setTimeout,
    navigator: {userAgent: 'Mozilla/5.0 (Linux; Android 14)'},
    location,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    history: {replaceState() { location.hash = ''; }},
    console: {log() {}, warn() {}, error() {}}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('../stego/vendor/nostr-tools.bundle.js'), context);
  vm.runInContext(source('../stego/nostr-recipient.js'), context);
  context.secret = vm.runInContext('NostrTools.generateSecretKey()', context);
  context.npub = vm.runInContext('NostrTools.nip19.npubEncode(NostrTools.getPublicKey(secret))', context);
  context.pubkey = vm.runInContext('NostrTools.getPublicKey(secret)', context);
  context.envelope = vm.runInContext(
    `StegoNostrRecipient.parseEnvelope(StegoNostrRecipient.encryptForRecipient('from Amber', npub))`, context
  );

  vm.runInContext(`StegoNostrRecipient.beginAndroidDecryption(envelope, 'text')`, context);
  let params = new URLSearchParams(location.assigned.split('?')[1]);
  assert.equal(params.get('type'), 'get_public_key');
  let callback = new URL(params.get('callbackUrl'));
  location.hash = callback.hash + encodeURIComponent(context.pubkey);
  const confirmation = vm.runInContext('StegoNostrRecipient.resumeAndroidDecryption()', context);
  assert.equal(confirmation.source, 'text');
  assert.ok(confirmation.continueId);

  context.confirmationId = confirmation.continueId;
  vm.runInContext('StegoNostrRecipient.continueAndroidDecryption(confirmationId)', context);
  params = new URLSearchParams(location.assigned.split('?')[1]);
  assert.equal(params.get('type'), 'nip44_decrypt');
  assert.equal(params.get('pubkey'), context.envelope.senderPubkey);
  assert.equal(params.get('current_user'), context.pubkey);

  callback = new URL(params.get('callbackUrl'));
  location.hash = callback.hash + encodeURIComponent('decrypted by Amber');
  const result = vm.runInContext('StegoNostrRecipient.resumeAndroidDecryption()', context);
  assert.equal(result.plaintext, 'decrypted by Amber');
  assert.equal(result.source, 'text');

  vm.runInContext(`StegoNostrRecipient.beginAndroidDecryption(envelope, 'text')`, context);
  params = new URLSearchParams(location.assigned.split('?')[1]);
  assert.equal(params.get('type'), 'nip44_decrypt');
});

test('legacy 32-bit zero-width messages remain readable', async () => {
  const {context, elements} = textStegoContext();
  context.legacySecret = 'old hidden emoji ⚡';
  elements.encodedMessage.value = vm.runInContext(
    `'Legacy carrier' + MARKER + textToLegacyBinary(legacySecret).replace(/0/g, ZWNJ).replace(/1/g, ZWJ)`,
    context
  );
  await vm.runInContext('decodeMessage()', context);
  assert.equal(elements.decodedOutput.textContent, 'old hidden emoji ⚡');
});

test('compact UTF-8 uses far fewer invisible characters than the legacy format', async () => {
  const {context, elements} = textStegoContext({hidden: 'A reasonably sized hidden message'});
  await vm.runInContext('encodeMessage()', context);
  context.comparisonText = 'A reasonably sized hidden message';
  const legacyLength = vm.runInContext(
    `MARKER.length + textToLegacyBinary(comparisonText).replace(/0/g, ZWNJ).replace(/1/g, ZWJ).length`,
    context
  );
  const compactLength = elements.encodedOutput.textContent.length - elements.visibleMessage.value.length;
  assert.ok(compactLength < legacyLength / 3);
});

test('the variation-selector emoji decoder remains compatible', () => {
  const context = {TextDecoder, Uint8Array};
  vm.createContext(context);
  vm.runInContext(source('../stego/emojiDecoder.js'), context);
  const message = 'emoji secret ⚡';
  const selectors = Array.from(new TextEncoder().encode(message), byte => String.fromCodePoint(
    byte < 16 ? 0xFE00 + byte : 0xE0100 + byte - 16
  )).join('');
  context.encodedEmoji = `🙂${selectors}`;
  assert.equal(vm.runInContext('decodeEmoji(encodedEmoji)', context), message);
});

test('Nostr note1 identifiers decode back to their event id', () => {
  const controls = new Proxy({}, {
    get(target, key) {
      if (!target[key]) target[key] = {...field(), files: [], querySelectorAll: () => []};
      return target[key];
    }
  });
  const context = {
    TextDecoder,
    TextEncoder,
    Uint8Array,
    clearTimeout,
    setTimeout,
    console: {log() {}, warn() {}, error() {}},
    alert() {},
    WebSocket: function WebSocket() {},
    showLoader() {},
    hideLoader() {},
    document: {
      getElementById: id => controls[id],
      querySelector: () => controls.section,
      querySelectorAll: () => [],
      createElement: () => ({...field(), setAttribute() {}})
    }
  };
  vm.createContext(context);
  vm.runInContext(source('../stego/vendor/bech32.js'), context);
  vm.runInContext(source('../stego/nostrStegoFetch.js'), context);

  const eventId = '0001917b7176006a407f4c7d4a9b7408064fee7db0ad8a5b4f0f825bf0321b1b';
  const decoded = vm.runInContext(
    `note1ToHex(bech32.encode('note', bech32.toWords(hexToBytes('${eventId}'))))`,
    context
  );
  assert.equal(decoded, eventId);

  context.suppliedNevent = 'nevent1qgsqqqqqqp0fmkspg7w8d305ln96a0jw0ptwqtuwskkm5pddv2kkjfcqypltrkkl43dag98ah8vuj8rw8xv7pupxu25f3p3x2hnc4v4xchs22ekaaz0';
  const nevent = vm.runInContext('neventToEvent(suppliedNevent)', context);
  assert.equal(nevent.eventId, '7eb1dadfac5bd414fdb9d9c91c6e3999e0f026e2a898862655e78ab2a6c5e0a5');
  assert.equal(nevent.pubKey, '000000005e9dda01479c76c5f4fccbaebe4e7856e02f8e85adba05ad62ad6927');
  assert.equal(nevent.relays.length, 0);
});

test('file steganography downloads the original carrier type and extension', async () => {
  const elements = {
    encodedFileTextOutput: field(),
    stegoDownloadLink: field()
  };
  let createdFile;
  let resolveCreated;
  const created = new Promise(resolve => { resolveCreated = resolve; });

  class TestFileReader {
    readAsArrayBuffer(file) {
      file.arrayBuffer().then(result => this.onload({target: {result}}));
    }
  }

  const context = {
    Blob,
    File,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    btoa,
    atob,
    window: {btoa, atob},
    FileReader: TestFileReader,
    URL: {
      createObjectURL(file) {
        createdFile = file;
        resolveCreated();
        return 'blob:stego-carrier';
      },
      revokeObjectURL() {}
    },
    document: {getElementById: id => elements[id]},
    hideLoader() {}
  };
  vm.createContext(context);
  vm.runInContext(source('../stego/file-stego.js'), context);

  const originalBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  context.carrier = new File([originalBytes], 'price-tag.png');
  vm.runInContext(
    `proceedWithEncoding({name: 'secret.txt', type: 'text/plain', data: 'c2VjcmV0'}, carrier, '')`,
    context
  );
  await created;

  assert.equal(createdFile.name, 'stego_price-tag.png');
  assert.equal(createdFile.type, 'image/png');
  assert.equal(elements.stegoDownloadLink.download, 'stego_price-tag.png');
  assert.equal(elements.stegoDownloadLink.type, 'image/png');
  const outputBytes = new Uint8Array(await createdFile.arrayBuffer());
  assert.deepEqual(outputBytes.slice(0, originalBytes.length), originalBytes);
  assert.match(new TextDecoder().decode(outputBytes.slice(originalBytes.length)), /^STEGOFILE\|\|RAW\|\|/);
});

test('file steganography uses a recipient-wrapped key for npub encryption', async () => {
  const elements = {
    encodedFileTextOutput: field(),
    stegoDownloadLink: field()
  };
  let createdFile;
  let resolveCreated;
  const created = new Promise(resolve => { resolveCreated = resolve; });

  class TestFileReader {
    readAsArrayBuffer(file) {
      file.arrayBuffer().then(result => this.onload({target: {result}}));
    }
  }

  const context = {
    Blob,
    File,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL: {
      createObjectURL(file) {
        createdFile = file;
        resolveCreated();
        return 'blob:nostr-stego-carrier';
      },
      revokeObjectURL() {}
    },
    URLSearchParams,
    crypto: webcrypto,
    atob,
    btoa,
    clearTimeout,
    setTimeout,
    FileReader: TestFileReader,
    document: {getElementById: id => elements[id]},
    hideLoader() {},
    showToast() {},
    console: {log() {}, warn() {}, error() {}}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('../stego/vendor/crypto-js.min.js'), context);
  vm.runInContext(source('../stego/vendor/nostr-tools.bundle.js'), context);
  vm.runInContext(source('../stego/nostr-recipient.js'), context);
  vm.runInContext(source('../stego/file-stego.js'), context);

  context.secret = vm.runInContext('NostrTools.generateSecretKey()', context);
  context.npub = vm.runInContext('NostrTools.nip19.npubEncode(NostrTools.getPublicKey(secret))', context);
  context.nsec = vm.runInContext('NostrTools.nip19.nsecEncode(secret)', context);
  context.carrier = new File([new Uint8Array([1, 2, 3, 4])], 'carrier.png', {type: 'image/png'});
  vm.runInContext(
    `proceedWithEncoding({name: 'wallet.txt', type: 'text/plain', data: 'bm90IGEgc2VlZA=='}, carrier, npub)`,
    context
  );
  await created;

  const outputText = new TextDecoder().decode(await createdFile.arrayBuffer());
  const markerIndex = outputText.lastIndexOf('STEGOFILE||N44||');
  assert.ok(markerIndex >= 0);
  context.lockedFilePayload = outputText.slice(markerIndex + 'STEGOFILE||N44||'.length);
  const decoded = vm.runInContext(`(() => {
    const locked = parseNostrFilePayload(lockedFilePayload);
    const fileKey = StegoNostrRecipient.decryptWithSecret(locked.envelope, nsec);
    return decryptNostrFilePayload(fileKey, locked.encryptedData);
  })()`, context);
  assert.equal(decoded.name, 'wallet.txt');
  assert.equal(decoded.type, 'text/plain');
  assert.equal(decoded.data, 'bm90IGEgc2VlZA==');
});

test('file decoder exposes the same Nostr unlock choices as text decoding', () => {
  const html = source('../stego.html');
  assert.match(html, /id="decodeFileButton"/);
  assert.match(html, /id="fileNostrSignerButton"[^>]*>Sign with Nostr<\/button>/);
  assert.match(html, /id="fileNostrBunkerButton"[^>]*>Use bunker<\/button>/);
  assert.doesNotMatch(html, /id="fileNostrUnlockActions"\s+hidden/);

  const script = source('../stego/file-stego.js');
  assert.match(script, /decodeFileStego\('extension'\)/);
  assert.match(script, /decodeFileStego\('bunker'\)/);
});

test('Nostr event fetcher exposes direct password, signer, Amber, and bunker paths', () => {
  const html = source('../stego.html');
  assert.match(html, /id="fetchNostrButton"[^>]*>Fetch Nostr Event<\/button>/);
  assert.match(html, /id="nostrEventSignerButton"[^>]*>Sign with Nostr<\/button>/);
  assert.match(html, /id="nostrEventBunkerButton"[^>]*>Use bunker<\/button>/);
  assert.doesNotMatch(html, /id="nostrEventUnlockActions"\s+hidden/);

  const fetcher = source('../stego/nostrStegoFetch.js');
  assert.match(fetcher, /fetchNostrEvent\('extension'\)/);
  assert.match(fetcher, /fetchNostrEvent\('bunker'\)/);
  assert.match(fetcher, /await decryptNostrEnvelope\(/);
  assert.match(fetcher, /NostrTools\?\.verifyEvent/);
});
