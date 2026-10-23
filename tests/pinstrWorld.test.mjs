import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  boardHref,
  boardPlacementFromWorld,
  placementWorldHref,
  readWorldBoard,
  worldCellForNote,
  worldComposerHref,
  worldFlightProgress,
  worldHref,
  worldNotePosition,
  worldPlatformPosition,
} from '../pinstrWorldModel.mjs';

test('3D links carry the selected boards, depth, composer intent, and paid placement intent', () => {
  assert.equal(worldHref(['u24jed'], 2), '/pinstrWorld.html?g=u24jed&d=2');
  assert.equal(placementWorldHref(['u24jed'], 2), '/pinstrWorld.html?g=u24jed&d=2&place=1');
  assert.equal(boardHref(['u24jed']), '/stickyNotes.html?g=u24jed');
  assert.equal(worldComposerHref(['u24jed']), '/stickyNotes.html?g=u24jed&compose=world');
  assert.deepEqual(readWorldBoard('?g=u24jed&d=2'), {cells:['u24jed'], depth:2});
});

test('the selected depth determines which deeper world receives a note', () => {
  const note = {geohashes:['u24jed9']};
  assert.equal(worldCellForNote(note, ['u24'], 0), 'u24');
  assert.equal(worldCellForNote(note, ['u24'], 2), 'u24je');
  assert.equal(worldCellForNote(note, ['u24'], 6), 'u24jed9');
  assert.equal(worldCellForNote({geohashes:['ezs42']}, ['u24'], 2), 'u24');
});

test('platforms and notes have stable bounded positions', () => {
  assert.deepEqual(worldPlatformPosition(0), {x:0, y:0, z:0});
  assert.deepEqual(worldPlatformPosition(3), worldPlatformPosition(3));
  assert.notDeepEqual(worldPlatformPosition(1), worldPlatformPosition(2));
  const first = worldNotePosition('a'.repeat(64), 4);
  assert.deepEqual(first, worldNotePosition('a'.repeat(64), 4));
  const radius = Math.hypot(first.x, first.z);
  assert.ok(radius >= 1.3 && radius <= 4.7);
  assert.ok(first.floor ? first.y === .04 : first.y >= .72 && first.y <= 4.47);

  const positions = Array.from({length:64}, (_, index) => worldNotePosition(`note-${index}`, index));
  assert.ok(positions.some(position => position.floor), 'some notes lie on the cork surface');
  assert.ok(positions.some(position => !position.floor), 'some notes float around the viewer');
  for (const position of positions) {
    assert.ok(Math.hypot(position.x, position.z) >= 1.3, 'the standing point remains clear');
  }
});

test('world flight accelerates, moves slightly forward, and settles exactly', () => {
  assert.equal(worldFlightProgress(0), 0);
  assert.ok(worldFlightProgress(.25) < worldFlightProgress(.5));
  assert.ok(worldFlightProgress(.9) > 1, 'the last approach moves slightly beyond the destination');
  assert.ok(Math.abs(worldFlightProgress(1) - 1) < 1e-10);
});

test('a 3D draft position becomes the ordinary board placement signed into the note', () => {
  assert.deepEqual(boardPlacementFromWorld({x:0, y:2.65, rotation:12}, {x:0, y:0}), {x:.5, y:.5, rotation:12});
  assert.equal(boardPlacementFromWorld({x:99, y:-99, rotation:200}, {x:0, y:0}).x, 1);
  assert.equal(boardPlacementFromWorld({x:99, y:-99, rotation:200}, {x:0, y:0}).y, 1);
  assert.equal(boardPlacementFromWorld({x:99, y:-99, rotation:200}, {x:0, y:0}).rotation, 75);
});

test('the world is pure 3D, uses pins as handles, and includes compact desktop controls', async () => {
  const [boardPage, world, worldCss, page, help, three] = await Promise.all([
    readFile(new URL('../stickyNotes.html', import.meta.url), 'utf8'),
    readFile(new URL('../pinstrWorld.html', import.meta.url), 'utf8'),
    readFile(new URL('../pinstrWorld.css', import.meta.url), 'utf8'),
    readFile(new URL('../pinstrWorld.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../siteHelp.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../vendor/three/three.module.min.js', import.meta.url), 'utf8'),
  ]);
  assert.match(boardPage, /id="openPinstrWorld"[^>]+Open this board in 3D/);
  assert.match(boardPage, /id="placeStickyWorld"[^>]+Place this note in the 3D world/);
  assert.match(world, /id="writeWorldNote"[^>]+aria-label="Write a note for this board"/);
  assert.match(help, /'\/pinstrWorld\.html': \{selector: '#writeWorldNote', group: true, icon: true\}/);
  assert.match(worldCss, /\.world-write \{ border:0; border-radius:0; background:transparent; box-shadow:none; \}/);
  assert.match(world, /id="worldControlsToggle"[^>]+aria-expanded="false"/);
  assert.match(world, /href="\/stickyNotes\.css"/);
  for (const id of ['noteMenu', 'closeNoteMenu', 'noteEventId', 'copyNoteId', 'noteAgentBadge',
    'notePaidBadge', 'notePostedAt', 'noteExpirationValue', 'noteEventJsonDetails', 'copyNoteJson']) {
    assert.match(world, new RegExp(`id="${id}"`));
    assert.match(boardPage, new RegExp(`id="${id}"`));
  }
  assert.match(world, /id="worldPictureLayer"/);
  assert.match(worldCss, /\.world-picture\[hidden\] \{ display:none; \}/);
  assert.match(world, /W A S D/);
  assert.match(world, /Wheel \/ pinch/);
  assert.match(page, /raycaster\.intersectObjects\(pinMeshes/);
  assert.match(page, /const PIN_HOLD_MS = 500/);
  assert.match(page, /setTimeout\(\(\) => \{[\s\S]+\}, PIN_HOLD_MS\)/);
  assert.match(page, /function updateDraggedNote\(now\)/);
  assert.match(page, /dragged\.angle \+= dragged\.turn \* elapsed \* 1\.9/);
  assert.match(page, /group\.lookAt\(camera\.position\)/);
  assert.match(page, /updateDraggedNote\(now\)/);
  assert.match(page, /function setWorldZoom\(value\)/);
  assert.match(page, /Math\.max\(\.65, Math\.min\(2\.5/);
  assert.match(page, /camera\.zoom \* Math\.exp\(-event\.deltaY \* \.0012\)/);
  assert.match(page, /pinchZoom\.zoom \* distance \/ pinchZoom\.distance/);
  assert.match(page, /image\.src = note\.image/);
  assert.match(page, /textureLoader\.load\('\/img\/note-crumple\.png'/);
  assert.match(page, /noteAgeTextureOpacity\(noteAgeFraction\(record\.born, record\.dies, now\)\)/);
  assert.match(page, /blending:THREE\.MultiplyBlending/);
  assert.match(page, /ageSurfaces\.forEach\(record => updateAgeSurface\(record, now\)\)/);
  assert.match(worldCss, /\.world-picture__age \{ opacity:0; mix-blend-mode:multiply/);
  assert.match(page, /updatePictureOverlays\(\)/);
  assert.match(page, /function quadrilateralTransform\(/);
  assert.match(page, /matrix3d\(/);
  assert.match(page, /const frontFacing = overlayNormal\.dot\(overlayToCamera\) > 0/);
  assert.match(page, /function pictureIsOccluded\(overlay\)/);
  assert.match(page, /occlusionRaycaster\.intersectObjects\(paperMeshes, false\)/);
  assert.match(page, /hit\.object !== overlay\.paper/);
  assert.match(page, /onScreen && !overlay\.occluded/);
  assert.match(page, /now - overlay\.lastOcclusionCheck >= 80/);
  assert.doesNotMatch(page, /translate\(-50%, -50%\) rotate/);
  assert.match(page, /stickyPaymentBadge\(note\.paid\)/);
  assert.match(page, /JSON\.stringify\(note\.event, null, 2\)/);
  assert.match(page, /worldCellForNote/);
  assert.match(page, /worldFlightProgress/);
  assert.match(page, /group\.lookAt\(platform\.position\.x, platform\.position\.y \+ 1\.65, platform\.position\.z\)/);
  assert.match(page, /group\.rotation\.set\(-Math\.PI \/ 2, 0, local\.roll\)/);
  assert.match(page, /orbit\.maxPolarAngle = Math\.PI - \.05/);
  assert.match(page, /camera\.position\.set\(platform\.position\.x, platform\.position\.y \+ 1\.65, platform\.position\.z \+ \.05\)/);
  assert.match(page, /geohash:activeCell, geohashes:\[activeCell\]/);
  assert.match(page, /boardTextureUrl\(localStorage\.getItem\(BOARD_TEXTURE_KEY\)\)/);
  assert.match(page, /new THREE\.PlaneGeometry\(10\.4, 10\.4\)/);
  assert.match(page, /new THREE\.BoxGeometry\(11\.3, \.4, \.38\)/);
  assert.doesNotMatch(page, /CylinderGeometry|TorusGeometry/);
  assert.doesNotMatch(world + page, /getUserMedia|geolocation|DeviceOrientation|Panoramax|panoramax|maplibre|streetView/i);
  assert.match(three, /three\.core\.min\.js/);
});
