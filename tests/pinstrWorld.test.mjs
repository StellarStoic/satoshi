import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  boardHref,
  boardPlacementFromWorld,
  placementWorldHref,
  readWorldBoard,
  worldCellForNote,
  worldBoardRelation,
  worldComposerHref,
  worldFlightProgress,
  worldPortalWarpProgress,
  worldHref,
  worldNearbyCells,
  worldNotePosition,
  worldPortalPosition,
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

test('nearby boards are classified and placed as depth-aware portals', () => {
  assert.equal(worldBoardRelation('u24jed', 'u24je'), 'parent');
  assert.equal(worldBoardRelation('u24jed', 'u24jed9'), 'child');
  const nearby = worldNearbyCells('u24jed');
  const sibling = nearby.find(cell => worldBoardRelation('u24jed', cell) === 'sibling');
  assert.ok(sibling, 'a same-level neighbour is included');
  assert.equal(worldBoardRelation('u24jed', sibling), 'sibling');
  assert.ok(nearby.includes('u24'));
  assert.equal(nearby.filter(cell => cell.startsWith('u24jed') && cell.length === 7).length, 32);
  assert.ok(worldPortalPosition('u24jed', 'u24je').y > 0, 'parent portals are above the board');
  assert.ok(worldPortalPosition('u24jed', 'u24jed9').y < 0, 'child portals are below the board');
  assert.equal(worldPortalPosition('u24jed', sibling).relation, 'sibling');
});

test('platforms and notes have stable bounded positions', () => {
  assert.deepEqual(worldPlatformPosition(0), {x:0, y:0, z:0});
  assert.deepEqual(worldPlatformPosition(3), worldPlatformPosition(3));
  assert.notDeepEqual(worldPlatformPosition(1), worldPlatformPosition(2));
  const first = worldNotePosition('a'.repeat(64), 4);
  assert.deepEqual(first, worldNotePosition('a'.repeat(64), 4));
  const radius = Math.hypot(first.x, first.z);
  assert.ok(radius >= 1.65 && radius <= 4.7);
  assert.ok(first.floor ? first.y === .04 : first.y >= .72 && first.y <= 4.47);

  const positions = Array.from({length:64}, (_, index) => worldNotePosition(`note-${index}`, index));
  assert.ok(positions.some(position => position.floor), 'some notes lie on the cork surface');
  assert.ok(positions.some(position => !position.floor), 'some notes float around the viewer');
  for (const position of positions) {
    assert.ok(Math.hypot(position.x, position.z) >= 1.65, 'the standing point remains clear');
  }

  const sparse = Array.from({length:12}, (_, index) => worldNotePosition(`density-${index}`, index, 12));
  const dense = Array.from({length:12}, (_, index) => worldNotePosition(`density-${index}`, index, 1000));
  const averageRadius = values => values.reduce((sum, value) => sum + Math.hypot(value.x, value.z), 0) / values.length;
  const averageHeight = values => values.reduce((sum, value) => sum + value.y, 0) / values.length;
  assert.ok(averageRadius(dense) > averageRadius(sparse), 'dense boards spread notes farther away');
  assert.ok(averageHeight(dense) > averageHeight(sparse), 'dense boards spread notes higher');
  assert.equal(dense[0].density, 1);
});

test('world flight accelerates, moves slightly forward, and settles exactly', () => {
  assert.equal(worldFlightProgress(0), 0);
  assert.ok(worldFlightProgress(.25) < worldFlightProgress(.5));
  assert.ok(worldFlightProgress(.9) > 1, 'the last approach moves slightly beyond the destination');
  assert.ok(Math.abs(worldFlightProgress(1) - 1) < 1e-10);
});

test('portal warp accelerates hard and brakes into the destination', () => {
  assert.equal(worldPortalWarpProgress(0), 0);
  assert.ok(worldPortalWarpProgress(.25) < worldPortalWarpProgress(.5));
  assert.ok(worldPortalWarpProgress(.72) > .8);
  assert.ok(worldPortalWarpProgress(.9) < 1);
  assert.equal(worldPortalWarpProgress(1), 1);
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
  assert.match(world, /id="worldControlsShell" class="world-controls-shell" hidden/);
  assert.match(world, /id="worldControlsToggle"[^>]+aria-expanded="false"/);
  assert.match(world, /id="worldCompass"[^>]+hidden[^>]+aria-pressed="false"/);
  assert.match(world, /id="worldAr"[^>]+hidden[^>]+aria-pressed="false"/);
  assert.doesNotMatch(world, /id="worldBoardVisibility"/);
  assert.match(help, /embeddedControlId: 'worldControlsShell'/);
  assert.match(help, /panel\.append\(embeddedControl\)/);
  assert.match(world, /href="\/stickyNotes\.css"/);
  for (const id of ['noteMenu', 'closeNoteMenu', 'noteEventId', 'copyNoteId', 'noteAgentBadge',
    'notePaidBadge', 'notePostedAt', 'noteExpirationValue', 'noteEventJsonDetails', 'copyNoteJson']) {
    assert.match(world, new RegExp(`id="${id}"`));
    assert.match(boardPage, new RegExp(`id="${id}"`));
  }
  assert.match(world, /id="worldPictureLayer"/);
  assert.match(world, /id="noteGiftDialog"/);
  assert.match(world, /id="noteGiftLogin"[^>]+stickyNotes\.html\?login=1/);
  assert.match(world, /id="noteGiftReactions"/);
  assert.match(world, /id="noteGiftAmounts"/);
  assert.match(world, /src="\/qrCodeGenerator_1_4_4\.js"/);
  assert.match(worldCss, /\.world-picture\[hidden\] \{ display:none; \}/);
  assert.match(world, /W A S D/);
  assert.match(world, /Wheel \/ pinch/);
  assert.match(page, /raycaster\.intersectObjects\(pinMeshes/);
  assert.match(page, /function signatureAt\(clientX, clientY\)/);
  assert.match(page, /hit\.uv\.x < \.27 \|\| hit\.uv\.y > \.16/);
  assert.match(page, /openWorldGiftDialog\(signature\.id\)/);
  assert.match(page, /url\.searchParams\.set\('login', '1'\)/);
  assert.match(page, /readAuthorProfiles\(RELAY, pubkeys\)/);
  assert.match(page, /authorLabels\.set\(pubkey, authorLabelFromProfile/);
  assert.match(page, /new THREE\.SphereGeometry\(\.06, 16, 10\)/);
  assert.match(page, /pin\.position\.set\(0, width \* \.47, \.055\)/);
  assert.match(page, /new THREE\.SphereGeometry\(\.12, 12, 8\)/);
  assert.match(page, /pinMeshes\.push\(pinTarget\)/);
  assert.match(page, /const PIN_HOLD_MS = 500/);
  assert.match(page, /setTimeout\(\(\) => \{[\s\S]+\}, PIN_HOLD_MS\)/);
  assert.match(page, /function moveDraggedNote\(clientX, clientY\)/);
  assert.match(page, /addScaledVector\(raycaster\.ray\.direction, dragged\.distance\)/);
  assert.match(page, /draggedPinOffset\.copy\(dragged\.grabLocal\)\.applyQuaternion/);
  assert.match(page, /group\.lookAt\(camera\.position\)/);
  assert.doesNotMatch(page, /dragged\.turn|updateDraggedNote/);
  assert.match(page, /function setWorldZoom\(value\)/);
  assert.match(page, /const WORLD_ZOOM_MIN = \.45/);
  assert.match(page, /const WORLD_ZOOM_MAX = 6/);
  assert.match(page, /Math\.max\(WORLD_ZOOM_MIN, Math\.min\(WORLD_ZOOM_MAX/);
  assert.match(page, /camera\.zoom \* Math\.exp\(-event\.deltaY \* \.0012\)/);
  assert.match(page, /pinchZoom\.zoom \* distance \/ pinchZoom\.distance/);
  assert.match(page, /DeviceOrientationEvent\.requestPermission/);
  assert.match(page, /window\.addEventListener\('deviceorientationabsolute', handleDeviceOrientation/);
  assert.match(page, /compassCalibration = camera\.quaternion\.clone\(\)\.multiply\(device\.clone\(\)\.invert\(\)\)/);
  assert.match(page, /navigator\.xr\.isSessionSupported\('immersive-ar'\)/);
  assert.match(page, /navigator\.xr\.requestSession\('immersive-ar'/);
  assert.match(page, /optionalFeatures:\['local-floor', 'dom-overlay'\]/);
  assert.match(page, /scene\.scale\.setScalar\(\.22\)/);
  assert.match(page, /renderer\.setClearColor\(0x000000, 0\)/);
  assert.match(page, /xrController\.addEventListener\('select', selectInAr\)/);
  assert.match(page, /raycaster\.intersectObjects\(portalMeshes, false\)/);
  assert.match(page, /beginPortalWarp\(portal\)/);
  assert.match(page, /location\.assign\(worldHref\(\[portalWarp\.cell\], board\.depth\)\)/);
  assert.match(page, /function animatePortals\(now\)/);
  assert.match(page, /group\.scale\.setScalar\(1\.07 \+ wave \* \.14\)/);
  assert.match(page, /worldPortalWarpProgress\(amount\)/);
  assert.match(worldCss, /\.world-flight\.is-warping::before/);
  assert.match(page, /new THREE\.RingGeometry/);
  for (const colour of ['#43d17b', '#ff5151', '#bf78ff']) assert.match(page, new RegExp(colour));
  assert.match(page, /function connectNearbyBoards\(cell = activeCell\)/);
  assert.match(page, /'#g':requested/);
  assert.doesNotMatch(page, /toggleBoardVisibility|solidBoardsHidden/);
  assert.match(page, /transparent:true, opacity:0, depthWrite:false/);
  assert.match(page, /context\.font = '300 54px/);
  assert.match(page, /context\.fillText\(text, 512, 64, 940\)/);
  assert.doesNotMatch(page, /context\.strokeText\(text/);
  assert.match(page, /raycaster\.ray\.direction\.set\(0, 0, -1\)\.applyMatrix4\(xrSelectMatrix\)/);
  assert.match(page, /image\.src = note\.image/);
  assert.match(page, /const surfaceTexture = noteTexture\(note\)/);
  assert.match(page, /new THREE\.MeshBasicMaterial\(\{map:surfaceTexture/);
  assert.doesNotMatch(page, /note\.image \? '#f5f3eb'/);
  assert.match(page, /paperGrainImage\.src = '\/img\/grain\.png'/);
  assert.match(page, /paperCreaseImage\.src = '\/img\/note-crumple\.png'/);
  for (const colour of ['#f7dc63', '#f3a7c4', '#91d2eb', '#acd986', '#f4b266']) assert.match(page, new RegExp(colour));
  assert.match(page, /context\.globalCompositeOperation = 'multiply'/);
  assert.match(page, /drawPaperWear\(context, note\)/);
  assert.match(page, /fittedNoteText\(context, note\)/);
  assert.match(page, /texture\.needsUpdate = true/);
  assert.match(page, /--age-angle/);
  assert.match(page, /noteAgeTextureOpacity\(noteAgeFraction\(record\.born, record\.dies, now\)\)/);
  assert.doesNotMatch(page, /blending:THREE\.MultiplyBlending/);
  assert.match(page, /noteSurfaces\.forEach\(record => renderNoteSurface\(record, now\)\)/);
  assert.match(worldCss, /\.world-picture__age \{ inset:-24%; width:148%; height:148%;[\s\S]*mix-blend-mode:multiply/);
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
  assert.match(page, /function layoutCellNotes\(cell\)/);
  assert.match(page, /localeCompare\(String\(right\.userData\.note\.id\)\)/);
  assert.match(page, /worldNotePosition\(group\.userData\.note\.id \|\| pending\?\.contentHash \|\| 'draft', index, total\)/);
  assert.match(page, /limit:1000/);
  assert.match(page, /worldFlightProgress/);
  assert.match(page, /group\.lookAt\(platform\.position\.x, platform\.position\.y \+ 1\.65, platform\.position\.z\)/);
  assert.match(page, /group\.rotation\.set\(-Math\.PI \/ 2, 0, local\.roll\)/);
  assert.match(page, /orbit\.maxPolarAngle = Math\.PI - \.05/);
  assert.match(page, /camera\.position\.set\(platform\.position\.x, platform\.position\.y \+ 1\.65, platform\.position\.z \+ \.05\)/);
  assert.match(page, /geohash:activeCell, geohashes:\[activeCell\]/);
  assert.match(page, /new THREE\.PlaneGeometry\(10\.4, 10\.4\)/);
  assert.doesNotMatch(page, /boardSurfaceMaterial|woodMaterial|woodEdgeMaterial/);
  assert.match(page, /function addBoardEngravings\(group, cell\)/);
  assert.match(page, /new THREE\.PlaneGeometry\(4\.5, \.28\)/);
  assert.match(page, /\{x:0, z:-5\.184, turn:0\}/);
  assert.match(page, /\{x:0, z:5\.184, turn:Math\.PI\}/);
  assert.match(page, /\{x:-5\.264, z:0, turn:Math\.PI \/ 2\}/);
  assert.match(page, /\{x:5\.264, z:0, turn:-Math\.PI \/ 2\}/);
  assert.match(page, /label\.position\.set\(engraving\.x, \.03, engraving\.z\)/);
  assert.match(page, /label\.rotation\.set\(0, engraving\.turn, 0\)/);
  assert.doesNotMatch(page, /new THREE\.Sprite/);
  assert.doesNotMatch(page, /CylinderGeometry|TorusGeometry/);
  assert.doesNotMatch(world + page, /getUserMedia|geolocation|Panoramax|panoramax|maplibre|streetView/i);
  assert.match(three, /three\.core\.min\.js/);
});
