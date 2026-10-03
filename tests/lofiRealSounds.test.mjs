import test from 'node:test';
import assert from 'node:assert/strict';
import {access, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {REAL_DRUM_KITS, REAL_PERCUSSION, REAL_SOUND_FILES} from '../lofiRealSounds.mjs';

test('recorded drum and percussion library is complete and compact', async () => {
  assert.equal(REAL_SOUND_FILES.length, 28);
  assert.equal(REAL_DRUM_KITS.length, 10);
  assert.equal(REAL_DRUM_KITS.filter(Boolean).length, 7);
  assert.equal(REAL_PERCUSSION.length, 8);

  let totalBytes = 0;
  for (const url of REAL_SOUND_FILES) {
    assert.match(url, /^\/audio\/lofi\/real\/[a-z0-9-]+\.mp3$/);
    const path = fileURLToPath(new URL(`..${url}`, import.meta.url));
    await access(path);
    totalBytes += (await stat(path)).size;
  }
  assert.ok(totalBytes > 500_000);
  assert.ok(totalBytes < 1_000_000);
});

test('every recorded kit and percussion voice has round-robin alternatives', () => {
  REAL_DRUM_KITS.filter(Boolean).forEach(kit => {
    assert.equal(kit.kick.length, 2);
    assert.equal(kit.snare.length, 2);
    assert.equal(kit.hat.length, 2);
  });
  REAL_PERCUSSION.forEach(voice => assert.equal(voice.urls.length, 2));
});
