
// The currency module boots at import time, so every mutable binding it touches must already be
// initialised. This was a real failure: the chooser and the TON dialog were declared below the boot
// call and the module died with "Cannot access 'chooser' before initialization" - silently, since a
// module that throws on load shows nothing to the reader. This test keeps that from shipping again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../pinstr-currency.mjs', import.meta.url), 'utf8');
const lines = source.split('\n');

function lineOf(needle) {
  const index = lines.findIndex((line) => line.includes(needle));
  assert.notEqual(index, -1, `expected to find ${needle}`);
  return index;
}

test('the boot call happens after every mutable module binding is declared', () => {
  const boot = lineOf('try {');
  const declarations = [...source.matchAll(/^let (\w+) =/gm)].map((match) => ({ name: match[1], at: match.index }));
  assert.ok(declarations.length >= 3, 'expected the chooser, TON dialog and poll handles');
  for (const decl of declarations) {
    const declLine = source.slice(0, decl.at).split('\n').length - 1;
    assert.ok(declLine < boot, `${decl.name} is declared at line ${declLine + 1}, after the boot call at line ${boot + 1}`);
  }
});

test('a failure to start is reported rather than swallowed', () => {
  assert.match(source, /catch \(err\) \{\s*\n\s*console\.error\('\[pinstr-currency\] failed to start'/);
});

test('the host gate keeps TON off satoshi.si', () => {
  assert.match(source, /const ON_PINSTR = \/\(\^\|\\\.\)pinstr\\\.si\$\/i\.test\(location\.hostname\)/);
  assert.match(source, /not pinstr\.si, staying out of the way/);
});
