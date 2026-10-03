import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const transformerSource = readFileSync(new URL('../stego/textTransformer.js', import.meta.url), 'utf8');

function makeElement(value = '') {
  return {
    value,
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    options: [],
    addEventListener() {},
    appendChild() {},
    classList: {add() {}, remove() {}},
    querySelector() { return null; },
    getBoundingClientRect() { return {bottom: 0, left: 0}; }
  };
}

function transformerContext() {
  const elements = new Map();
  const context = {
    TextDecoder,
    TextEncoder,
    Uint8Array,
    BigInt,
    Intl,
    URL,
    atob,
    btoa,
    clearTimeout,
    setTimeout,
    console,
    MARKER: '\u200b\u200c\u200d',
    showToast() {},
    navigator: {clipboard: {writeText: async () => {}}},
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeElement());
        return elements.get(id);
      },
      addEventListener() {},
      querySelectorAll() { return []; },
      createElement() { return makeElement(); }
    },
    addEventListener() {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(transformerSource, context);
  return context;
}

const pairs = [
  ['binaryEncoder', 'binaryDecoder'],
  ['base32Encoder', 'base32Decoder'],
  ['base58Encoder', 'base58Decoder'],
  ['base64Encoder', 'base64Decoder'],
  ['morseCode', 'morseDecoder'],
  ['leetSpeak', 'leetDecoder']
];

test('all paired codecs round-trip Unicode and exact whitespace', () => {
  const {obfuscationMethods: methods} = transformerContext().textObfuscator;
  const original = '  Bitcoin, \u010dokolada \ud83e\udde1\nPrice 9.30\t';
  for (const [encoder, decoder] of pairs) {
    const encoded = methods[encoder].func(original);
    assert.notEqual(encoded, null, encoder);
    assert.equal(methods[decoder].func(encoded), original, `${encoder} -> ${decoder}`);
  }
});

test('self-reversing transformations restore graphemes and whitespace', () => {
  const {obfuscationMethods: methods} = transformerContext().textObfuscator;
  const samples = {
    fullFlip: 'Family \ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67 and sats',
    wordFlip: '  Emoji \ud83e\udde1  stays whole ',
    readableReverser: '  leading  and   trailing  ',
    sentenceInverter: '  Any   fool can know.  Keep\tthese spaces!\n',
    scrambler: 'Scrambling preserves ordinary words.'
  };
  for (const [name, original] of Object.entries(samples)) {
    assert.equal(methods[name].func(methods[name].func(original)), original, name);
  }
});

test('Base58 preserves leading zero bytes and decoders reject malformed input', () => {
  const {obfuscationMethods: methods} = transformerContext().textObfuscator;
  const original = '\0\0bitcoin';
  assert.equal(methods.base58Decoder.func(methods.base58Encoder.func(original)), original);
  assert.equal(methods.binaryDecoder.func('01000001 nope'), null);
  assert.equal(methods.base32Decoder.func('INVALID!'), null);
  assert.equal(methods.base58Decoder.func('0OIl'), null);
  assert.equal(methods.base64Decoder.func('%%%='), null);
});

test('legacy Morse and leetspeak transformations remain available', () => {
  const {obfuscationMethods: methods} = transformerContext().textObfuscator;
  assert.equal(methods.morseCode.legacyFunc('.... ..'), 'HI');
  assert.equal(methods.leetSpeak.legacyFunc('h3ll0'), 'hEllO');
});
