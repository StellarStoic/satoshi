import test from 'node:test';
import assert from 'node:assert/strict';
import {access, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {INSTRUMENT_BANKS, INSTRUMENT_ROLES, selectInstrument} from '../lofiInstruments.mjs';

test('complete Tone.js instrument bank is present and addressable', async () => {
  assert.equal(Object.keys(INSTRUMENT_BANKS).length, 20);
  assert.equal(Object.values(INSTRUMENT_BANKS).reduce((total, bank) => total + Object.keys(bank.urls).length, 0), 447);

  for (const bank of Object.values(INSTRUMENT_BANKS)) {
    for (const file of Object.values(bank.urls)) {
      const path = fileURLToPath(new URL(`..${bank.baseUrl}${file}`, import.meta.url));
      await access(path);
    }
  }

  const sampleRoot = fileURLToPath(new URL('../audio/lofi/instruments/', import.meta.url));
  const files = await Promise.all((await readdir(sampleRoot, {withFileTypes: true}))
    .filter(entry => entry.isDirectory())
    .map(entry => readdir(`${sampleRoot}${entry.name}`)));
  assert.equal(files.flat().filter(file => file.endsWith('.mp3')).length, 449);
});

test('instrument roles cover every bundled instrument and hash choices are deterministic', () => {
  const covered = new Set(Object.values(INSTRUMENT_ROLES).flat());
  assert.deepEqual([...covered].sort(), Object.keys(INSTRUMENT_BANKS).sort());

  const hashes = Array.from({length: 128}, (_, index) => Array.from({length: 64}, (__, character) => ((index * 37 + character * 13) % 16).toString(16)).join(''));
  for (const role of Object.keys(INSTRUMENT_ROLES)) {
    const choices = hashes.map(hash => selectInstrument(hash, role));
    assert.ok(choices.every(choice => INSTRUMENT_ROLES[role].includes(choice)));
    assert.ok(new Set(choices).size > 1);
    assert.equal(selectInstrument(hashes[42], role), selectInstrument(hashes[42], role));
  }
});
