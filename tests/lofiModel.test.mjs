import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanHash, compositionFromBlock, describeTransaction, fallbackChainState, flowFromTransactions, foldTransactionIds, latestBlockFromFrame, mempoolToSound, summarizeTransactions, transactionGravityPoint} from '../lofiModel.mjs';

const HASH = '000000000000000000000000b4c9f08f7ef4d967bc812591a4fa25e65a19d7ac';

test('block composition is deterministic and musically bounded', () => {
  const first = compositionFromBlock(HASH, 900000);
  const second = compositionFromBlock(HASH, 900000);
  assert.deepEqual(first, second);
  assert.equal(first.chords.length, 4);
  assert.equal(first.chords.every(chord => chord.length >= 3 && chord.length <= 4), true);
  assert.equal(first.melody.length, 32);
  assert.equal(first.palette.length, 21);
  assert.ok(first.bpm >= 56 && first.bpm <= 92);
  assert.ok(first.swing >= 0.5 && first.swing <= 0.68);
  assert.equal(first.rhythm.kick.length, 64);
  assert.equal(first.rhythm.snare.length, 64);
  assert.equal(first.rhythm.chord.length, 64);
  assert.equal(first.arrangement.length, 4);
  assert.ok(first.sound.chordVoice >= 0 && first.sound.chordVoice < 6);
  assert.ok(first.sound.leadVoice >= 0 && first.sound.leadVoice < 8);
  assert.ok(first.sound.bassVoice >= 0 && first.sound.bassVoice < 6);
  assert.ok(first.sound.drumKit >= 0 && first.sound.drumKit < 5);
  assert.ok(first.sound.padVoice >= 0 && first.sound.padVoice < 5);
  assert.ok(first.sound.arpVoice >= 0 && first.sound.arpVoice < 6);
  assert.ok(first.sound.malletVoice >= 0 && first.sound.malletVoice < 5);
  assert.ok(first.sound.percussionVoice >= 0 && first.sound.percussionVoice < 8);
  assert.ok(first.sound.textureVoice >= 0 && first.sound.textureVoice < 4);
  assert.ok(first.sound.reverbWet >= .04 && first.sound.reverbWet <= .21);
});

test('proof-of-work zero prefixes do not collapse real blocks into one style', () => {
  const blocks = [
    '000000000000000000000000b4c9f08f7ef4d967bc812591a4fa25e65a19d7ac',
    '000000000000000000019f4c03f7cd4d1414582857f53d96be456b3948c7a2d1',
    '00000000000000000000a3e4b22452fb558d08f3699bfee9c6d0e3f17d153d48',
  ].map((hash, index) => compositionFromBlock(hash, 900000 + index));
  assert.ok(new Set(blocks.map(block => `${block.session}|${block.key}|${block.voicing}|${block.sound.leadVoice}`)).size >= 3);
});

test('a run of blocks explores the session, harmony and instrument palette', () => {
  const blocks = Array.from({length: 64}, (_, index) => compositionFromBlock(index.toString(16).padStart(64, '0'), 900100 + index));
  assert.ok(new Set(blocks.map(block => block.session)).size >= 8);
  assert.ok(new Set(blocks.map(block => block.voicing)).size >= 4);
  assert.ok(new Set(blocks.map(block => block.sound.leadVoice)).size >= 7);
  assert.ok(new Set(blocks.map(block => block.sound.drumKit)).size >= 3);
  assert.ok(new Set(blocks.map(block => block.sound.padVoice)).size >= 4);
  assert.ok(new Set(blocks.map(block => block.sound.arpVoice)).size >= 5);
});

test('live block parser accepts singular updates and block snapshots', () => {
  assert.equal(latestBlockFromFrame({block: {height: 12, id: 'a'}}).height, 12);
  assert.equal(latestBlockFromFrame({blocks: [{height: 10}, {height: 13}, {height: 11}]}).height, 13);
  assert.equal(latestBlockFromFrame({}), null);
});

test('different blocks can select different sessions, rhythms and instruments', () => {
  const first = compositionFromBlock('1'.repeat(64), 900001);
  const second = compositionFromBlock('abcdef0123456789'.repeat(4), 900002);
  assert.notDeepEqual(first.rhythm, second.rhythm);
  assert.notDeepEqual(first.sound, second.sound);
  assert.notEqual(`${first.session}:${first.key}`, `${second.session}:${second.key}`);
});

test('consecutive blocks never repeat the previous production scene', () => {
  let previous = compositionFromBlock(HASH, 900000);
  for (let index = 1; index <= 64; index += 1) {
    const current = compositionFromBlock(index.toString(16).padStart(64, '0'), 900000 + index, previous);
    assert.notEqual(current.sceneIndex, previous.sceneIndex);
    const changedRoles = ['chordVoice', 'bassVoice', 'leadVoice', 'drumKit', 'padVoice', 'arpVoice', 'malletVoice', 'percussionVoice', 'textureVoice']
      .filter(role => current.sound[role] !== previous.sound[role]);
    assert.ok(changedRoles.length >= 4);
    previous = current;
  }
});

test('live transaction IDs continually change the musical flow', () => {
  const composition = compositionFromBlock(HASH, 900000);
  const firstSeed = foldTransactionIds(HASH, ['a'.repeat(64)], 1);
  const secondSeed = foldTransactionIds(firstSeed, ['b'.repeat(64), 'c'.repeat(64)], 2);
  const first = flowFromTransactions(firstSeed, composition);
  const second = flowFromTransactions(secondSeed, composition);
  assert.notEqual(firstSeed, secondSeed);
  assert.notDeepEqual(first.phrase, second.phrase);
  assert.equal(first.phrase.length, 16);
  assert.equal(first.chordInversions.length, 4);
});

test('mempool mapping clamps extreme network values', () => {
  const quiet = mempoolToSound({fee: 0, vsize: -10, count: 0, projectedBlocks: 0});
  const busy = mempoolToSound({fee: 10000, vsize: 1e12, count: 1e9, projectedBlocks: 999});
  assert.equal(quiet.pressure, 0);
  assert.equal(busy.pressure, 1);
  assert.equal(busy.weight, 1);
  assert.equal(busy.activity, 1);
  assert.ok(busy.filterHz <= 2850);
  assert.ok(busy.tempoLift <= 4);
});

test('transaction details expose musical and visual characteristics', () => {
  const transaction = describeTransaction({
    txid: 'd'.repeat(64),
    weight: 800,
    fee: 2000,
    vin: [{sequence: 0xfffffffd, prevout: {scriptpubkey_type: 'v1_p2tr'}}],
    vout: [{value: 80000, scriptpubkey_type: 'v1_p2tr'}, {value: 0, scriptpubkey_type: 'op_return'}],
  });
  assert.equal(transaction.vsize, 200);
  assert.equal(transaction.feeRate, 10);
  assert.equal(transaction.type, 'Data');
  assert.equal(transaction.rbf, true);
  assert.equal(transaction.hasData, true);
});

test('transaction batches influence bounded flow properties', () => {
  const composition = compositionFromBlock(HASH, 900000);
  const summary = summarizeTransactions([{
    txid: 'e'.repeat(64), vsize: 480, fee: 9600,
    vin: Array.from({length: 5}, () => ({sequence: 0xfffffffd, prevout: {scriptpubkey_type: 'v0_p2wpkh'}})),
    vout: [{value: 120000, scriptpubkey_type: 'v0_p2wpkh'}],
  }]);
  const flow = flowFromTransactions('f'.repeat(64), composition, summary);
  assert.equal(summary.dominantType, 'Consolidation');
  assert.equal(flow.summary.count, 1);
  assert.ok(flow.rhythmicDetail >= 0 && flow.rhythmicDetail <= 1);
  assert.ok(['16n', '8n', '4n'].includes(flow.noteLength));
  assert.ok(flow.kickVelocity <= .78);
});

test('fallback state always produces a playable composition', () => {
  const fallback = fallbackChainState();
  assert.equal(cleanHash(fallback.hash).length, 64);
  assert.doesNotThrow(() => compositionFromBlock(fallback.hash, fallback.height));
});

test('gravity catches regular and fast center-flyby transactions on the ring', () => {
  const base = {cx: 500, cy: 300, radius: 180, edgeDistance: 760, entryAngle: .25, targetAngle: 2.1, orbit: -1, bend: .6};
  for (const crossesCenter of [false, true]) {
    for (const feeMotion of [0, .5, 1]) {
      const point = transactionGravityPoint({...base, crossesCenter, feeMotion, progress: 1});
      assert.ok(Math.abs(Math.hypot(point.x - base.cx, point.y - base.cy) - base.radius * .78) < .0001);
    }
  }
  const slowFlyby = transactionGravityPoint({...base, crossesCenter: true, feeMotion: 0, progress: .39});
  const fastFlyby = transactionGravityPoint({...base, crossesCenter: true, feeMotion: 1, progress: .39});
  assert.ok(Math.hypot(fastFlyby.x - base.cx, fastFlyby.y - base.cy) > Math.hypot(slowFlyby.x - base.cx, slowFlyby.y - base.cy));
  assert.ok(Math.hypot(fastFlyby.x - base.cx, fastFlyby.y - base.cy) < base.radius * .35);
});
