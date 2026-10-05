import {bip39CodeToBlockHeight, compositionFromBlock, fallbackChainState, flowFromTransactions, foldTransactionIds, halvingEraFromHeight, latestBlockFromFrame, mempoolToSound, normalizeReplayEngine, normalizeReplayHash, normalizeReplayHeight, replayCompositionFromHash, replayHashRoleAt, replaySoundStateFromHash, REPLAY_ENGINE_VERSION, summarizeTransactions, trackTitleFromBlock, transactionGravityPoint} from './lofiModel.mjs';
import {INSTRUMENT_BANKS, instrumentLabel, selectInstrument} from './lofiInstruments.mjs';
import {REAL_DRUM_KITS, REAL_PERCUSSION} from './lofiRealSounds.mjs';

const ToneApi = globalThis.Tone;
const ui = {
  play: document.getElementById('playButton'),
  volume: document.getElementById('volumeControl'),
  transport: document.getElementById('transportLabel'),
  tempo: document.getElementById('tempoLabel'),
  track: document.getElementById('trackName'),
  key: document.getElementById('trackKey'),
  connection: document.getElementById('connectionState'),
  height: document.getElementById('blockHeight'),
  hash: document.getElementById('blockHash'),
  flow: document.getElementById('flowReading'),
  shape: document.getElementById('shapeReading'),
  size: document.getElementById('sizeReading'),
  fee: document.getElementById('feeReading'),
  weight: document.getElementById('weightReading'),
  transactions: document.getElementById('transactionReading'),
  depth: document.getElementById('depthReading'),
  harmony: document.getElementById('harmonyVoice'),
  lead: document.getElementById('leadVoice'),
  bass: document.getElementById('bassVoice'),
  drums: document.getElementById('drumVoice'),
  pad: document.getElementById('padVoice'),
  arp: document.getElementById('arpVoice'),
  mallet: document.getElementById('malletVoice'),
  percussion: document.getElementById('percussionVoice'),
  texture: document.getElementById('textureVoice'),
  effects: document.getElementById('effectVoice'),
  scene: document.getElementById('productionScene'),
  transition: document.getElementById('blockTransition'),
  canvas: document.getElementById('lofiCanvas'),
  visualStage: document.getElementById('visualStage'),
  visualToggle: document.getElementById('visualToggle'),
  replaySection: document.querySelector('.block-replay'),
  replayForm: document.getElementById('replayForm'),
  replayInput: document.getElementById('replayHash'),
  replayStatus: document.getElementById('replayStatus'),
  returnLive: document.getElementById('returnLive'),
  hashInfluenceLegend: document.getElementById('hashInfluenceLegend'),
  helpTrigger: document.getElementById('lofiHelpTrigger'),
  helpDialog: document.getElementById('lofiHelpDialog'),
  helpClose: document.getElementById('lofiHelpClose'),
  helpTabs: [...document.querySelectorAll('[data-help-panel]')],
  helpPanels: [...document.querySelectorAll('.lofi-help-panel')],
  readingLabels: Object.fromEntries(['flow', 'shape', 'size', 'fee', 'weight', 'transaction', 'depth'].map(name => [name, {
    label: document.getElementById(`${name}Label`),
    hint: document.getElementById(`${name}Hint`),
  }])),
};

const STORE_KEY = 'blockLofiSettings';
const SETTINGS_VERSION = 2;
const MUSIC_BUS_LEVEL = 0.96;
const selectedInstrument = (composition, role) => selectInstrument(composition.hash, role);
const LEAN_KEYS = [
  {name: 'dusty Rhodes', oscillator: 'triangle8', attack: .045, decay: .72, sustain: .045, release: .65},
  {name: 'muted tape piano', oscillator: 'sine4', attack: .025, decay: .58, sustain: .035, release: .55},
  {name: 'felt keys', oscillator: 'triangle4', attack: .075, decay: .82, sustain: .025, release: .72},
  {name: 'cassette Wurlitzer', oscillator: 'sine6', attack: .035, decay: .68, sustain: .04, release: .62},
  {name: 'soft jazz keys', oscillator: 'triangle2', attack: .065, decay: .76, sustain: .05, release: .7},
  {name: 'worn electric piano', oscillator: 'sine3', attack: .05, decay: .9, sustain: .03, release: .8},
  {name: 'reed harmonium', oscillator: 'sine6', attack: .12, decay: .7, sustain: .2, release: 1},
  {name: 'nylon guitar', oscillator: 'triangle2', attack: .01, decay: .45, sustain: .02, release: .45},
];
const LEAN_BASSES = [
  {name: 'round sub bass', oscillator: 'sine2', attack: .025, decay: .3, sustain: .48, release: .58},
  {name: 'muted electric bass', oscillator: 'triangle2', attack: .018, decay: .24, sustain: .35, release: .42},
  {name: 'dub bass', oscillator: 'sine3', attack: .045, decay: .42, sustain: .55, release: .78},
  {name: 'tape pluck bass', oscillator: 'triangle4', attack: .008, decay: .32, sustain: .2, release: .34},
  {name: 'soft upright bass', oscillator: 'sine2', attack: .035, decay: .36, sustain: .28, release: .52},
  {name: 'rubber bass', oscillator: 'triangle2', attack: .02, decay: .4, sustain: .4, release: .66},
  {name: 'low cello bass', oscillator: 'triangle4', attack: .08, decay: .45, sustain: .38, release: .8},
];
const LEAN_LEADS = [
  {name: 'tape flute accent', oscillator: 'sine', attack: .14, decay: .42, release: .9},
  {name: 'soft vibraphone accent', oscillator: 'sine3', attack: .035, decay: .6, release: .75},
  {name: 'muted guitar accent', oscillator: 'triangle2', attack: .02, decay: .38, release: .48},
  {name: 'hollow reed accent', oscillator: 'sine2', attack: .1, decay: .48, release: .82},
  {name: 'felt mallet accent', oscillator: 'triangle4', attack: .018, decay: .52, release: .58},
  {name: 'cassette whistle accent', oscillator: 'sine', attack: .18, decay: .5, release: 1},
  {name: 'soft bell accent', oscillator: 'sine4', attack: .025, decay: .7, release: .86},
  {name: 'night-key accent', oscillator: 'triangle2', attack: .07, decay: .55, release: .8},
  {name: 'velvet sax accent', oscillator: 'sine4', attack: .09, decay: .5, release: .9},
  {name: 'cello phrase', oscillator: 'triangle4', attack: .14, decay: .55, release: 1.1},
  {name: 'harp answer', oscillator: 'triangle2', attack: .006, decay: .52, release: .7},
];
const LEAN_DRUMS = ['dust-pocket kit', 'brush-room kit', 'cassette-break kit', 'soft boom-bap kit', 'late-night kit', 'funk-pocket kit', 'breakbeat kit', 'club kit', 'electronic kit', 'cinematic kit'];
const LEAN_KICKS = [
  {pitchDecay: .06, octaves: 2.7, envelope: {attack: .003, decay: .34, sustain: 0, release: .3}, volume: -4},
  {pitchDecay: .045, octaves: 2.2, envelope: {attack: .005, decay: .4, sustain: 0, release: .34}, volume: -5},
  {pitchDecay: .035, octaves: 3.1, envelope: {attack: .002, decay: .28, sustain: 0, release: .25}, volume: -6},
  {pitchDecay: .07, octaves: 2.5, envelope: {attack: .004, decay: .36, sustain: 0, release: .32}, volume: -4},
  {pitchDecay: .025, octaves: 2, envelope: {attack: .006, decay: .46, sustain: 0, release: .38}, volume: -5},
  {pitchDecay: .035, octaves: 3.8, envelope: {attack: .002, decay: .2, sustain: 0, release: .2}, volume: -4},
  {pitchDecay: .018, octaves: 4.8, envelope: {attack: .001, decay: .16, sustain: 0, release: .14}, volume: -4},
  {pitchDecay: .028, octaves: 5.5, envelope: {attack: .001, decay: .24, sustain: 0, release: .2}, volume: -3},
  {pitchDecay: .012, octaves: 6.2, envelope: {attack: .001, decay: .13, sustain: 0, release: .12}, volume: -5},
  {pitchDecay: .09, octaves: 2.1, envelope: {attack: .009, decay: .52, sustain: 0, release: .5}, volume: -6},
];
const LEAN_SNARES = [
  {noise: {type: 'pink'}, envelope: {attack: .008, decay: .16, sustain: 0}, volume: -13},
  {noise: {type: 'brown'}, envelope: {attack: .012, decay: .22, sustain: 0}, volume: -12},
  {noise: {type: 'pink'}, envelope: {attack: .004, decay: .12, sustain: 0}, volume: -14},
  {noise: {type: 'brown'}, envelope: {attack: .007, decay: .18, sustain: 0}, volume: -13},
  {noise: {type: 'pink'}, envelope: {attack: .015, decay: .25, sustain: 0}, volume: -12},
  {noise: {type: 'white'}, envelope: {attack: .002, decay: .1, sustain: 0}, volume: -13},
  {noise: {type: 'pink'}, envelope: {attack: .001, decay: .08, sustain: 0}, volume: -12},
  {noise: {type: 'white'}, envelope: {attack: .001, decay: .14, sustain: 0}, volume: -14},
  {noise: {type: 'brown'}, envelope: {attack: .003, decay: .09, sustain: 0}, volume: -13},
  {noise: {type: 'pink'}, envelope: {attack: .02, decay: .32, sustain: 0}, volume: -15},
];
const LEAN_HATS = [
  {noise: {type: 'brown'}, envelope: {attack: .01, decay: .065, sustain: 0}, volume: -28},
  {noise: {type: 'pink'}, envelope: {attack: .012, decay: .08, sustain: 0}, volume: -30},
  {noise: {type: 'brown'}, envelope: {attack: .009, decay: .055, sustain: 0}, volume: -27},
  {noise: {type: 'pink'}, envelope: {attack: .014, decay: .075, sustain: 0}, volume: -29},
  {noise: {type: 'brown'}, envelope: {attack: .016, decay: .095, sustain: 0}, volume: -29},
  {noise: {type: 'pink'}, envelope: {attack: .003, decay: .045, sustain: 0}, volume: -28},
  {noise: {type: 'white'}, envelope: {attack: .001, decay: .032, sustain: 0}, volume: -31},
  {noise: {type: 'white'}, envelope: {attack: .001, decay: .052, sustain: 0}, volume: -30},
  {noise: {type: 'pink'}, envelope: {attack: .002, decay: .038, sustain: 0}, volume: -31},
  {noise: {type: 'brown'}, envelope: {attack: .018, decay: .14, sustain: 0}, volume: -30},
];
const PAD_PROFILES = [
  {oscillator: 'triangle4', attack: .8, decay: 1.2, sustain: .45, release: 1.8},
  {oscillator: 'sine4', attack: 1.1, decay: 1.4, sustain: .42, release: 2.1},
  {oscillator: 'sine6', attack: .3, decay: .7, sustain: .62, release: 1.1},
  {oscillator: 'triangle8', attack: .65, decay: 1.5, sustain: .38, release: 2.2},
  {oscillator: 'triangle2', attack: 1.25, decay: 1.6, sustain: .5, release: 2.5},
];
const ARP_PROFILES = [
  {oscillator: 'triangle4', attack: .008, decay: .24, release: .3},
  {oscillator: 'sine4', attack: .015, decay: .34, release: .42},
  {oscillator: 'sine6', attack: .004, decay: .22, release: .28},
  {oscillator: 'triangle8', attack: .003, decay: .3, release: .5},
  {oscillator: 'triangle2', attack: .01, decay: .18, release: .24},
  {oscillator: 'sine8', attack: .018, decay: .38, release: .55},
  {oscillator: 'triangle4', attack: .006, decay: .42, release: .62},
  {oscillator: 'triangle2', attack: .004, decay: .3, release: .4},
];
const MALLET_PROFILES = [
  {oscillator: 'sine4', attack: .004, decay: .55, release: .7},
  {oscillator: 'triangle4', attack: .003, decay: .38, release: .48},
  {oscillator: 'sine6', attack: .006, decay: .68, release: .82},
  {oscillator: 'sine2', attack: .012, decay: .8, release: 1},
  {oscillator: 'triangle8', attack: .005, decay: .5, release: .65},
];
const ARP_PATTERNS = [
  [0, null, null, 1, null, null, 2, null, 1, null, null, 2, null, null, 3, null],
  [0, null, 2, null, 1, null, 3, null, 0, null, 2, null, 1, null, 3, null],
  [0, null, null, null, 2, null, null, null, 1, null, null, null, 3, null, null, null],
];
const PERCUSSION_PATTERNS = [
  [2, 6, 10, 14], [4, 12], [4, 12], [6, 14],
  [14], [11, 15], [3, 11], [5, 13],
];
const deviceMemory = Number(globalThis.navigator?.deviceMemory || 8);
const processorCount = Number(globalThis.navigator?.hardwareConcurrency || 8);
const lowPower = globalThis.matchMedia?.('(max-width: 700px)').matches || deviceMemory <= 4 || processorCount <= 4;
const economyAudio = lowPower || processorCount <= 8;
const visualProfile = {
  activeFps: economyAudio ? 20 : 40,
  idleFps: economyAudio ? 6 : 10,
  maxParticles: economyAudio ? 24 : 48,
  batchParticles: economyAudio ? 8 : 14,
  pixelRatio: economyAudio ? 1 : 1.5,
  rings: economyAudio ? 8 : 12,
  gridStep: economyAudio ? 40 : 28,
  shadowBlur: economyAudio ? 2 : 7,
};
const state = {
  chain: fallbackChainState(),
  composition: null,
  pendingComposition: null,
  flowSeed: fallbackChainState().hash,
  activeFlow: null,
  pendingFlow: null,
  flowWindow: [],
  transactionsSeen: 0,
  flowPulse: 0,
  transactionSummary: summarizeTransactions(),
  transactionVisuals: [],
  transactionVisualBuffer: [],
  visualRefreshTimer: 0,
  lastVisualRefresh: 0,
  variation: 0,
  playing: false,
  engine: null,
  socket: null,
  reconnectTimer: 0,
  blockPollTimer: 0,
  detailQueue: [],
  detailBusy: false,
  detailTimer: 0,
  lastDetailAt: 0,
  visualStep: 0,
  transitioning: false,
  transitionTimer: 0,
  lastDrawAt: 0,
  lastSoundUpdate: 0,
  soundUpdateTimer: 0,
  soundSignature: '',
  animationEnabled: true,
  animationFrame: 0,
  replayMode: false,
  replayHash: '',
  replayEngine: REPLAY_ENGINE_VERSION,
  replayData: null,
  replayRequestId: 0,
  schedulerRecovering: false,
};
const replayBlockCache = new Map();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Number.isFinite(saved?.volume)) ui.volume.value = saved.volume;
    if (saved?.version === SETTINGS_VERSION && typeof saved.animationEnabled === 'boolean') {
      state.animationEnabled = saved.animationEnabled;
    }
  } catch { /* Defaults remain usable. */ }
  ui.visualToggle.checked = state.animationEnabled;
  ui.visualStage.classList.toggle('animation-disabled', !state.animationEnabled);
}

function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      volume: Number(ui.volume.value),
      animationEnabled: state.animationEnabled,
      version: SETTINGS_VERSION,
    }));
  } catch { /* Playback does not require persistence. */ }
}

function setReplayStatus(message, invalid = false) {
  ui.replayStatus.textContent = message;
  if (invalid) ui.replayInput.setAttribute('aria-invalid', 'true');
  else ui.replayInput.removeAttribute('aria-invalid');
}

function syncReplayUi() {
  ui.replaySection.classList.toggle('replay-active', state.replayMode);
  ui.returnLive.hidden = !state.replayMode;
  ui.hashInfluenceLegend.hidden = !state.replayMode || state.replayEngine === 'v1';
  if (state.replayMode) ui.replayInput.value = state.replayHash;
}

function cancelBlockTransition() {
  const wasTransitioning = state.transitioning;
  clearTimeout(state.transitionTimer);
  state.transitioning = false;
  state.pendingComposition = null;
  ui.transition?.classList.remove('active', 'waiting');
  if (wasTransitioning && state.engine) {
    state.engine.releaseAllVoices();
    state.engine.musicBus.gain.rampTo(MUSIC_BUS_LEVEL, .2);
  }
}

function updateReplayUrl(hash = null, engine = REPLAY_ENGINE_VERSION) {
  const url = new URL(globalThis.location.href);
  if (hash) {
    url.searchParams.set('block', hash);
    url.searchParams.set('engine', normalizeReplayEngine(engine));
  } else {
    url.searchParams.delete('block');
    url.searchParams.delete('engine');
  }
  globalThis.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function loadReplayMetadata(hash) {
  try {
    const block = await getJson(`https://mempool.space/api/block/${hash}`);
    if (!state.replayMode || state.replayHash !== hash || !Number.isInteger(Number(block?.height))) return;
    state.chain = {...state.chain, height: Number(block.height)};
    ui.height.textContent = Number(block.height).toLocaleString();
    refreshTrackTitle();
    renderChain();
  } catch { /* The hash alone is enough to replay the track. */ }
}

function cacheReplayData(hash, data) {
  replayBlockCache.set(hash, data);
  try { sessionStorage.setItem(`blockLofiReplay:${REPLAY_ENGINE_VERSION}:${hash}`, JSON.stringify(data)); } catch {}
}

function cachedReplayData(hash) {
  if (replayBlockCache.has(hash)) return replayBlockCache.get(hash);
  try {
    const cached = JSON.parse(sessionStorage.getItem(`blockLofiReplay:${REPLAY_ENGINE_VERSION}:${hash}`));
    if (cached?.hash === hash) {
      replayBlockCache.set(hash, cached);
      return cached;
    }
  } catch {}
  return null;
}

function applyReplayBlockData(data) {
  if (!state.replayMode || state.replayHash !== data.hash || state.replayEngine === 'v1') return;
  state.replayData = data;
  state.chain = {...state.chain, ...data.chain};
  refreshTrackTitle();
  state.transactionSummary = data.summary;
  state.flowSeed = data.flowSeed;
  const composition = state.pendingComposition || state.composition;
  if (composition?.hash === data.hash) {
    const flow = flowFromTransactions(data.flowSeed, composition, data.summary);
    if (state.playing) state.pendingFlow = flow;
    else state.activeFlow = flow;
    prepareVoices(composition, flow);
  }
  state.soundSignature = '';
  applyNetworkSound(true);
  if (state.animationEnabled) renderTransactionVisuals(data.summary.items);
  renderChain();
  setReplayStatus(`Recorded block loaded · ${data.chain.count.toLocaleString()} transactions · engine ${state.replayEngine}`);
}

async function loadReplayBlockData(hash) {
  const cached = cachedReplayData(hash);
  if (cached) {
    applyReplayBlockData(cached);
    return;
  }
  setReplayStatus(`Loading recorded block data · engine ${state.replayEngine}`);
  const [blockResult, txidsResult, transactionsResult] = await Promise.allSettled([
    getJson(`https://mempool.space/api/block/${hash}`),
    getJson(`https://mempool.space/api/block/${hash}/txids`),
    getJson(`https://mempool.space/api/block/${hash}/txs/0`),
  ]);
  if (!state.replayMode || state.replayHash !== hash || state.replayEngine === 'v1') return;
  const block = blockResult.status === 'fulfilled' ? blockResult.value : null;
  if (!block || !Number.isInteger(Number(block.height))) {
    setReplayStatus(`Hash replay ready · recorded block data unavailable · engine ${state.replayEngine}`);
    return;
  }
  const txids = txidsResult.status === 'fulfilled' && Array.isArray(txidsResult.value) ? txidsResult.value : [];
  const transactions = transactionsResult.status === 'fulfilled' && Array.isArray(transactionsResult.value) ? transactionsResult.value : [];
  const paidTransactions = transactions.filter(transaction => Number(transaction?.fee) > 0);
  const sampled = summarizeTransactions(paidTransactions.length ? paidTransactions : transactions);
  const count = Math.max(1, Number(block.tx_count) || txids.length || sampled.count);
  const vsize = Math.max(1, (Number(block.weight) || Number(block.size) * 4 || sampled.totalVsize * 4) / 4);
  const summary = {...sampled, count, totalVsize: vsize, averageVsize: vsize / count};
  const flowSeed = txids.length ? foldTransactionIds(hash, txids, Number(block.height)) : hash;
  const data = {
    hash,
    flowSeed,
    summary,
    chain: {
      height: Number(block.height),
      hash,
      fee: sampled.averageFeeRate || replaySoundStateFromHash(hash).fee,
      vsize,
      count,
      projectedBlocks: 1,
      connected: false,
    },
  };
  cacheReplayData(hash, data);
  applyReplayBlockData(data);
}

function activateReplay(hash, {updateUrl = true, engine = REPLAY_ENGINE_VERSION, height = 0} = {}) {
  cancelBlockTransition();
  clearTimeout(state.detailTimer);
  clearTimeout(state.visualRefreshTimer);
  state.detailQueue = [];
  state.transactionSummary = summarizeTransactions();
  state.transactionVisuals = [];
  state.transactionVisualBuffer = [];
  state.flowWindow = [];
  state.flowPulse = 0;
  state.pendingFlow = null;
  state.replayMode = true;
  state.replayHash = hash;
  state.replayEngine = normalizeReplayEngine(engine);
  state.replayData = null;
  state.chain = {...replaySoundStateFromHash(hash), height};
  state.flowSeed = hash;
  state.soundSignature = '';
  syncReplayUi();
  if (updateUrl) updateReplayUrl(hash, state.replayEngine);
  setReplayStatus(`${height > 0 ? `Block ${height.toLocaleString()} replay` : 'Hash replay'} · engine ${state.replayEngine}`);
  queueComposition(replayCompositionFromHash(hash, state.replayEngine));
  renderChain();
  if (state.replayEngine === 'v1') loadReplayMetadata(hash);
  else loadReplayBlockData(hash);
  return true;
}

async function enterReplay(value, options = {}) {
  const directHash = normalizeReplayHash(value);
  if (directHash) {
    state.replayRequestId += 1;
    return activateReplay(directHash, options);
  }

  const height = normalizeReplayHeight(value) ?? bip39CodeToBlockHeight(value);
  if (height === null) {
    setReplayStatus('Enter a block height, hash, BIP39 block code or complete 21FM title.', true);
    return false;
  }

  const requestId = ++state.replayRequestId;
  setReplayStatus(`Finding block ${height.toLocaleString()}…`);
  try {
    const hash = normalizeReplayHash(await getText(`https://mempool.space/api/block-height/${height}`));
    if (requestId !== state.replayRequestId) return false;
    if (!hash) throw new Error('Invalid block hash response');
    return activateReplay(hash, {...options, height});
  } catch {
    if (requestId === state.replayRequestId) {
      setReplayStatus(`Block ${height.toLocaleString()} could not be found.`, true);
    }
    return false;
  }
}

async function exitReplay() {
  if (!state.replayMode) return;
  state.replayRequestId += 1;
  cancelBlockTransition();
  state.replayMode = false;
  state.replayHash = '';
  state.replayData = null;
  state.chain = fallbackChainState();
  state.transactionSummary = summarizeTransactions();
  state.transactionVisuals = [];
  state.transactionVisualBuffer = [];
  state.flowWindow = [];
  state.flowPulse = 0;
  state.pendingFlow = null;
  state.soundSignature = '';
  syncReplayUi();
  updateReplayUrl();
  setReplayStatus('Finding the live chain');
  renderChain();
  try {
    const loaded = await loadSnapshot();
    if (state.replayMode) return;
    if (loaded) setReplayStatus('Live mode');
    else {
      queueComposition(makeComposition());
      setReplayStatus('Live data is temporarily unavailable');
    }
  } catch {
    if (state.replayMode) return;
    queueComposition(makeComposition());
    setReplayStatus('Live data is temporarily unavailable');
  }
}

function titleFor(composition) {
  const height = state.replayMode ? state.chain.height || composition.height : composition.height;
  return trackTitleFromBlock(composition.hash, height);
}

function renderTrackTitle(composition) {
  const title = titleFor(composition);
  const height = state.replayMode ? state.chain.height || composition.height : composition.height;
  const era = height > 0 ? halvingEraFromHeight(height) : null;
  const words = title.split(' ');
  if (!era || words.length === 0 || title.startsWith('Hash Replay')) {
    ui.track.textContent = title;
    ui.track.removeAttribute('title');
    return;
  }

  const anchorIndex = era.anchor % words.length;
  ui.track.replaceChildren(...words.flatMap((word, index) => {
    const element = document.createElement('span');
    element.className = index === anchorIndex ? 'halving-anchor' : 'track-word';
    element.textContent = word;
    return index < words.length - 1 ? [element, document.createTextNode(' ')] : [element];
  }));
  ui.track.title = `Halving era ${era.number} anchors “${words[anchorIndex]}”`;
}

function renderTrackIdentity(composition) {
  renderTrackTitle(composition);
  const height = state.replayMode ? state.chain.height || composition.height : composition.height;
  const era = height > 0 ? halvingEraFromHeight(height) : null;
  ui.key.textContent = `${composition.session} · ${composition.meter} · ${composition.key}${era ? ` · halving era ${era.number}` : ''}`;
}

function refreshTrackTitle() {
  const composition = state.pendingComposition || state.composition;
  if (composition) renderTrackIdentity(composition);
}

function makeComposition() {
  if (state.replayMode) return replayCompositionFromHash(state.replayHash, state.replayEngine);
  return compositionFromBlock(state.chain.hash, state.chain.height, state.pendingComposition || state.composition);
}

function showComposition(composition) {
  renderTrackIdentity(composition);
  ui.height.textContent = state.chain.height ? state.chain.height.toLocaleString() : state.replayMode ? 'replay' : 'offline';
  ui.hash.textContent = `${state.chain.hash.slice(0, 6)}…${state.chain.hash.slice(-6)}`;
  if (ui.harmony) ui.harmony.textContent = `${instrumentLabel(selectedInstrument(composition, 'harmony'))} · ${composition.sound.chordName}`;
  if (ui.lead) ui.lead.textContent = `${instrumentLabel(selectedInstrument(composition, 'lead'))} · ${composition.melodyForm}`;
  if (ui.bass) ui.bass.textContent = `${instrumentLabel(selectedInstrument(composition, 'bass'))} · ${composition.sound.bassName}`;
  if (ui.drums) ui.drums.textContent = REAL_DRUM_KITS[composition.sound.drumKit]?.name || (economyAudio ? LEAN_DRUMS[composition.sound.drumKit] : composition.sound.drumName);
  if (ui.pad) ui.pad.textContent = composition.sound.padName;
  if (ui.arp) ui.arp.textContent = `${instrumentLabel(selectedInstrument(composition, 'arp'))} · ${composition.sound.arpName}`;
  if (ui.mallet) ui.mallet.textContent = `${instrumentLabel(selectedInstrument(composition, 'mallet'))} · ${composition.sound.malletName}`;
  if (ui.percussion) ui.percussion.textContent = REAL_PERCUSSION[composition.sound.percussionVoice]?.name || composition.sound.percussionName;
  if (ui.texture) ui.texture.textContent = composition.sound.textureName;
  if (ui.effects) ui.effects.textContent = economyAudio ? 'tape-dark mix' : `${composition.sound.effectProfile} · ${composition.sound.space} + ${composition.sound.motion}`;
  if (ui.scene) ui.scene.textContent = `${composition.scene} · ${composition.arrangementName} · ${composition.barCount} bars`;
  state.engine?.setTexture(composition.sound.textureVoice);
  applyNetworkSound();
}

function applyComposition(composition) {
  state.composition = composition;
  state.pendingComposition = null;
  const replayData = state.replayMode && state.replayData?.hash === composition.hash ? state.replayData : null;
  state.flowSeed = replayData?.flowSeed || composition.hash;
  state.transactionSummary = replayData?.summary || state.transactionSummary;
  state.activeFlow = flowFromTransactions(state.flowSeed, composition, state.transactionSummary);
  state.pendingFlow = null;
  showComposition(composition);
  if (state.engine) {
    state.engine.step = 0;
    const transport = ToneApi.getTransport();
    transport.swing = composition.swing;
    applyNetworkSound();
  }
}

function queueComposition(composition) {
  if (state.playing) {
    state.pendingComposition = composition;
    ui.transport.textContent = state.replayMode ? 'Replay queued' : 'New block approaching';
    ui.transition?.classList.add('waiting');
  } else {
    applyComposition(composition);
  }
}

function prepareVoices(composition, flow) {
  if (!state.engine || !composition) return;
  state.engine.chordVoice(economyAudio ? composition.sound.chordVoice : flow?.chordVoice ?? composition.sound.chordVoice, selectedInstrument(composition, 'harmony'));
  state.engine.bassVoice(economyAudio ? composition.sound.bassVoice : flow?.bassVoice ?? composition.sound.bassVoice, selectedInstrument(composition, 'bass'));
  state.engine.leadVoice(economyAudio ? composition.sound.leadVoice : flow?.leadVoice ?? composition.sound.leadVoice, selectedInstrument(composition, 'lead'));
  state.engine.kickVoice(composition.sound.drumKit);
  state.engine.snareVoice(composition.sound.drumKit);
  state.engine.hatVoice(composition.sound.drumKit);
  state.engine.padVoice(composition.sound.padVoice);
  state.engine.arpVoice(composition.sound.arpVoice, selectedInstrument(composition, 'arp'));
  state.engine.malletVoice(composition.sound.malletVoice, selectedInstrument(composition, 'mallet'));
  state.engine.percussionVoice(composition.sound.percussionVoice);
}

function beginBlockTransition(nextComposition) {
  if (!state.engine || state.transitioning || !nextComposition) return;
  state.transitioning = true;
  state.pendingComposition = null;
  const barSeconds = Math.max(1.8, (state.composition?.stepsPerBar || 16) * 15 / Math.max(48, ToneApi.getTransport().bpm.value));
  const fadeOutSeconds = economyAudio ? 1.4 : Math.min(3.5, barSeconds);
  const fadeInSeconds = economyAudio ? 2 : Math.min(5, barSeconds * 1.5);
  const bus = state.engine.musicBus.gain;
  ui.transport.textContent = 'Fading out the completed block';
  ui.transition?.classList.remove('waiting');
  ui.transition?.classList.add('active');
  ui.transition?.style.setProperty('--handover-time', `${fadeOutSeconds + fadeInSeconds}s`);
  bus.rampTo(0.0001, fadeOutSeconds);
  state.engine.filter.frequency.rampTo(720, fadeOutSeconds * .85);
  clearTimeout(state.transitionTimer);
  state.transitionTimer = setTimeout(() => {
    state.engine.releaseAllVoices();
    applyComposition(nextComposition);
    prepareVoices(nextComposition, state.activeFlow);
    state.engine.step = 0;
    ui.transport.textContent = 'Fading in the new block';
    bus.rampTo(MUSIC_BUS_LEVEL, fadeInSeconds);
    applyNetworkSound();
    state.transitionTimer = setTimeout(() => {
      state.transitioning = false;
      ui.transition?.classList.remove('active');
      ui.transport.textContent = state.replayMode ? 'Block replay' : state.chain.connected ? 'New block in the groove' : 'Offline groove';
    }, fadeInSeconds * 1000);
  }, fadeOutSeconds * 1000);
}

function formatWeight(vsize) {
  if (!vsize) return 'quiet';
  return `${(vsize / 1_000_000).toFixed(vsize >= 100_000_000 ? 0 : 1)} MvB`;
}

const LIVE_READING_COPY = {
  flow: ['Incoming flow', 'new phrases + voicings'],
  shape: ['Transaction shape', 'script + input/output mix'],
  size: ['Average size', 'note length + visual mass'],
  fee: ['Half-hour fee', 'energy + brightness'],
  weight: ['Mempool weight', 'tape texture'],
  transaction: ['Unconfirmed transactions', 'currently waiting in the mempool'],
  depth: ['Projected blocks', 'echo depth'],
};
const REPLAY_READING_COPY = {
  flow: ['Recorded flow', 'all transaction IDs shape the phrases'],
  shape: ['Transaction sample', 'first block transactions'],
  size: ['Average block TX', 'block vsize divided by transaction count'],
  fee: ['Sample fee rate', 'first paid transactions in the block'],
  weight: ['Block virtual size', 'recorded block weight'],
  transaction: ['Block transactions', 'confirmed in this block'],
  depth: ['Source', 'immutable historical block'],
};

function setReadingCopy(copy) {
  Object.entries(copy).forEach(([name, values]) => {
    ui.readingLabels[name].label.textContent = values[0];
    ui.readingLabels[name].hint.textContent = values[1];
  });
}

function renderChain() {
  if (state.replayMode) {
    ui.height.textContent = state.chain.height ? state.chain.height.toLocaleString() : 'replay';
    ui.hash.textContent = `${state.chain.hash.slice(0, 6)}…${state.chain.hash.slice(-6)}`;
    if (state.replayEngine === 'v1') {
      setReadingCopy(REPLAY_READING_COPY);
      ui.flow.textContent = 'deterministic';
      ui.shape.textContent = 'hash only';
      ui.size.textContent = 'fixed seed';
      ui.fee.textContent = '—';
      ui.weight.textContent = '—';
      ui.transactions.textContent = 'not used';
      ui.depth.textContent = 'engine v1';
      ui.connection.classList.remove('live');
      ui.connection.classList.add('replay');
      ui.connection.querySelector('span').textContent = 'Deterministic block replay';
      return;
    }
    setReadingCopy(REPLAY_READING_COPY);
    const recorded = state.replayData;
    ui.flow.textContent = recorded ? `${recorded.chain.count.toLocaleString()} txids` : 'loading';
    ui.shape.textContent = recorded?.summary.dominantType || 'hash replay';
    ui.size.textContent = recorded ? `${Math.round(recorded.summary.averageVsize).toLocaleString()} vB` : '—';
    ui.fee.textContent = recorded?.summary.averageFeeRate ? `${recorded.summary.averageFeeRate.toFixed(1)} sat/vB` : '—';
    ui.weight.textContent = recorded ? formatWeight(recorded.chain.vsize) : '—';
    ui.transactions.textContent = recorded ? recorded.chain.count.toLocaleString() : '—';
    ui.depth.textContent = recorded ? 'mempool.space' : 'loading';
    ui.connection.classList.remove('live');
    ui.connection.classList.add('replay');
    ui.connection.querySelector('span').textContent = recorded ? 'Recorded block replay' : 'Loading block replay';
    return;
  }
  setReadingCopy(LIVE_READING_COPY);
  const now = Date.now();
  state.flowWindow = state.flowWindow.filter(batch => now - batch.time < 30000);
  const flowing = state.flowWindow.reduce((total, batch) => total + batch.count, 0);
  const span = state.flowWindow.length ? Math.max(5, (now - state.flowWindow[0].time) / 1000) : 1;
  ui.flow.textContent = flowing ? `${(flowing / span).toFixed(flowing / span >= 10 ? 0 : 1)} tx/s` : 'listening';
  ui.shape.textContent = state.transactionSummary.count ? state.transactionSummary.dominantType : 'listening';
  ui.size.textContent = state.transactionSummary.averageVsize ? `${Math.round(state.transactionSummary.averageVsize).toLocaleString()} vB` : '—';
  ui.fee.textContent = `${Math.max(1, Math.round(state.chain.fee))} sat/vB`;
  ui.weight.textContent = formatWeight(state.chain.vsize);
  ui.transactions.textContent = state.chain.count ? state.chain.count.toLocaleString() : 'quiet';
  ui.depth.textContent = `${Math.max(1, state.chain.projectedBlocks)} block${state.chain.projectedBlocks === 1 ? '' : 's'}`;
  ui.connection.classList.remove('replay');
  ui.connection.classList.toggle('live', state.chain.connected);
  ui.connection.querySelector('span').textContent = state.chain.connected ? 'Live from mempool.space' : 'Offline composition';
}

function renderTransactionVisuals(items) {
  if (!state.animationEnabled) return;
  const stride = Math.max(1, Math.ceil(items.length / visualProfile.batchParticles));
  items.filter((_, index) => index % stride === 0).slice(0, visualProfile.batchParticles).forEach((item, index) => {
    const seed = Number.parseInt(item.txid.slice(index % 48, index % 48 + 8), 16) || index * 997;
    state.transactionVisuals.push({
      ...item,
      born: performance.now() + index * 45,
      lane: ((seed >>> 8) % 1000) / 1000,
      bend: ((seed >>> 18) % 200 - 100) / 100,
      entryAngle: ((seed ^ (seed >>> 11)) % 6283) / 1000,
      orbit: ((seed >>> 5) & 1) ? 1 : -1,
      crossesCenter: seed % 3 === 0,
    });
  });
  state.transactionVisuals = state.transactionVisuals.slice(-visualProfile.maxParticles);
}

function addTransactionVisuals(items) {
  if (!state.animationEnabled || !items?.length) return;
  state.transactionVisualBuffer.push(...items);
  state.transactionVisualBuffer = [...new Map(state.transactionVisualBuffer.map(item => [item.txid, item])).values()].slice(-visualProfile.batchParticles * 2);
  const flush = () => {
    state.visualRefreshTimer = 0;
    state.lastVisualRefresh = performance.now();
    const buffered = state.transactionVisualBuffer.splice(0);
    renderTransactionVisuals(buffered);
  };
  const wait = Math.max(0, 4000 - (performance.now() - state.lastVisualRefresh));
  if (!state.visualRefreshTimer) state.visualRefreshTimer = setTimeout(flush, wait);
}

function ingestTransactions(txids, sequence = 0, summary = null) {
  if (state.replayMode) return;
  const incomingCount = Array.isArray(txids) ? txids.length : 0;
  const sampleLimit = lowPower ? 96 : 192;
  const stride = Math.max(1, Math.ceil(incomingCount / sampleLimit));
  const valid = [];
  for (let index = 0; index < incomingCount && valid.length < sampleLimit; index += stride) {
    if (/^[0-9a-f]{64}$/i.test(txids[index])) valid.push(txids[index]);
  }
  if (!valid.length || !state.composition) return;
  state.flowSeed = foldTransactionIds(state.flowSeed, valid, sequence);
  if (summary?.count) {
    state.transactionSummary = summary;
    addTransactionVisuals(summary.items);
  } else if (state.animationEnabled) {
    addTransactionVisuals(valid.map(txid => ({
      txid,
      vsize: 180,
      feeRate: Math.max(1, state.chain.fee),
      type: 'Live',
      rbf: false,
      hasData: false,
    })));
  }
  state.pendingFlow = flowFromTransactions(state.flowSeed, state.pendingComposition || state.composition, summary || state.transactionSummary);
  prepareVoices(state.pendingComposition || state.composition, state.pendingFlow);
  state.transactionsSeen += incomingCount;
  state.flowPulse = Math.min(1, state.flowPulse + incomingCount / 24);
  state.flowWindow.push({time: Date.now(), count: incomingCount});
  if (state.playing && !state.transitioning) ui.transport.textContent = 'Live Bitcoin session';
  renderChain();
}

function applyTransactionDetails(transactions) {
  if (state.replayMode) return;
  const valid = Array.isArray(transactions) ? transactions.filter(transaction => /^[0-9a-f]{64}$/i.test(transaction?.txid)) : [];
  if (!valid.length) return;
  const summary = summarizeTransactions(valid);
  state.transactionSummary = summary;
  addTransactionVisuals(summary.items);
  state.pendingFlow = flowFromTransactions(state.flowSeed, state.pendingComposition || state.composition, summary);
  prepareVoices(state.pendingComposition || state.composition, state.pendingFlow);
  renderChain();
}

function drainTransactionDetails() {
  if (state.detailBusy || !state.detailQueue.length) return;
  const sampleInterval = economyAudio ? 12000 : 4000;
  const wait = Math.max(0, sampleInterval - (Date.now() - state.lastDetailAt));
  clearTimeout(state.detailTimer);
  state.detailTimer = setTimeout(async () => {
    const txid = state.detailQueue.pop();
    state.detailQueue.length = 0;
    state.detailBusy = true;
    state.lastDetailAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://mempool.space/api/tx/${txid}`, {cache: 'no-store', signal: controller.signal});
      const contentLength = Number(response.headers.get('content-length') || 0);
      const payloadLimit = economyAudio ? 100000 : 300000;
      if (response.ok && (!contentLength || contentLength < payloadLimit)) {
        const payload = await response.text();
        if (payload.length < payloadLimit) applyTransactionDetails([JSON.parse(payload)]);
      }
    } catch { /* TXIDs still drive the music if detail sampling is unavailable. */ }
    clearTimeout(timeout);
    state.detailBusy = false;
    drainTransactionDetails();
  }, wait);
}

function sampleTransactionDetails(txids, sequence = 0) {
  if (state.replayMode) return;
  if (!Array.isArray(txids) || !txids.length) return;
  const txid = txids[Math.abs(Number(sequence) || 0) % txids.length];
  if (!state.detailQueue.includes(txid)) state.detailQueue.push(txid);
  state.detailQueue = state.detailQueue.slice(-2);
  drainTransactionDetails();
}

function invertChord(chord, inversion) {
  const notes = [...chord];
  for (let index = 0; index < inversion; index += 1) {
    const note = notes.shift();
    notes.push(ToneApi.Frequency(ToneApi.Frequency(note).toMidi() + 12, 'midi').toNote());
  }
  return notes;
}

function transposeNote(note, semitones) {
  if (!note || !semitones) return note;
  return ToneApi.Frequency(ToneApi.Frequency(note).toMidi() + semitones, 'midi').toNote();
}

function rampAudioProperty(target, property, value, seconds = 0) {
  const parameter = target?.[property];
  if (parameter && typeof parameter === 'object' && 'value' in parameter) {
    parameter.value = value;
    return;
  }
  try { target[property] = value; } catch { /* Some Tone properties are read-only in certain browsers. */ }
}

function applyNetworkSound(force = false) {
  if (!state.composition) return;
  const soundState = state.replayMode && !state.replayData ? replaySoundStateFromHash(state.replayHash) : state.chain;
  const mapped = mempoolToSound(soundState);
  const influence = 1;
  const requestedBpm = state.composition.bpm + mapped.tempoLift * influence;
  const bpm = state.engine?.tempoHash === state.composition.hash ? state.engine.targetBpm : requestedBpm;
  ui.tempo.textContent = `${Math.round(bpm)} BPM`;
  if (!state.engine) return;
  const signature = [
    state.composition.hash,
    Math.round(mapped.tempoLift * 10),
    Math.round(mapped.filterHz / 40),
    Math.round(mapped.delayWet * 100),
    Math.round(mapped.noiseDb),
    Math.round((state.activeFlow?.brightness || 0) * 10),
  ].join(':');
  if (signature === state.soundSignature) return;
  const now = performance.now();
  if (!force && now - state.lastSoundUpdate < 1000) {
    if (!state.soundUpdateTimer) {
      state.soundUpdateTimer = setTimeout(() => {
        state.soundUpdateTimer = 0;
        applyNetworkSound(true);
      }, 1000 - (now - state.lastSoundUpdate));
    }
    return;
  }
  state.soundSignature = signature;
  state.lastSoundUpdate = now;
  if (state.engine.tempoHash !== state.composition.hash) {
    state.engine.tempoHash = state.composition.hash;
    state.engine.targetBpm = requestedBpm;
    const transportBpm = ToneApi.getTransport().bpm;
    if (state.playing) transportBpm.rampTo(requestedBpm, 2);
    else transportBpm.value = requestedBpm;
  }
  const flowColor = (state.activeFlow?.brightness || 0) * 220 * influence;
  const filterBase = state.composition.sound.filterBase;
  const filterTarget = filterBase + state.composition.sound.filterBias + (mapped.filterHz - 1400) * influence + flowColor;
  state.engine.filter.frequency.rampTo(economyAudio ? Math.max(850, Math.min(1450, filterTarget)) : filterTarget, 2);
  state.engine.delay.wet.rampTo(economyAudio ? .035 : 0.08 + (mapped.delayWet - 0.08) * influence, 2);
  state.engine.delay.delayTime.rampTo(economyAudio ? '8n.' : state.composition.sound.delayTime, 2);
  state.engine.delay.feedback.rampTo(economyAudio ? .1 : state.composition.sound.delayFeedback, 2);
  state.engine.chorus.depth = state.composition.sound.chorusDepth;
  const effectScale = economyAudio ? .72 : 1;
  const roomSize = .35 + Math.min(.5, (state.composition.sound.reverbDecay - 1.2) / 7.6);
  rampAudioProperty(state.engine.reverb, 'roomSize', roomSize, 4);
  rampAudioProperty(state.engine.reverb, 'dampening', 1800 + state.composition.sound.filterBase * .65, 4);
  rampAudioProperty(state.engine.reverb, 'wet', state.composition.sound.reverbWet * effectScale, 4);
  rampAudioProperty(state.engine.phaser, 'wet', state.composition.sound.phaserWet * effectScale, 4);
  rampAudioProperty(state.engine.tremolo, 'wet', state.composition.sound.tremoloWet * effectScale, 4);
  rampAudioProperty(state.engine.distortion, 'wet', state.composition.sound.distortionWet * effectScale, 4);
  rampAudioProperty(state.engine.widener, 'width', state.composition.sound.stereoWidth, 4);
  const dustDb = economyAudio ? -52 + mapped.weight * 3 : -43 + state.composition.sound.noiseBias + (mapped.noiseDb + 43) * influence;
  state.engine.dustGain.gain.rampTo(ToneApi.dbToGain(dustDb), 2);
  state.engine.percussionChance = mapped.percussionChance * influence;
}

function createEngine() {
  if (!ToneApi) throw new Error('Audio engine did not load');
  const silentParam = {rampTo() {}};
  const bypass = (destination, parameters = []) => {
    const node = new ToneApi.Gain(1).connect(destination);
    parameters.forEach(parameter => { node[parameter] = silentParam; });
    return node;
  };
  const outputLevel = Math.min(1.25, Number(ui.volume.value) / 100 * (economyAudio ? 1.35 : 1));
  const master = new ToneApi.Gain(outputLevel).toDestination();
  const limiter = economyAudio ? new ToneApi.Gain(.9).connect(master) : new ToneApi.Limiter(-2).connect(master);
  const compressor = economyAudio ? new ToneApi.Gain(1).connect(limiter) : new ToneApi.Compressor(-20, 3).connect(limiter);
  const widener = economyAudio ? bypass(compressor, ['width']) : new ToneApi.StereoWidener(.35).connect(compressor);
  const reverb = economyAudio ? bypass(widener, ['roomSize', 'dampening', 'wet']) : new ToneApi.Freeverb({roomSize: .62, dampening: 2800, wet: .1}).connect(widener);
  const modulationType = state.composition?.sound?.modulationType || 'phaser';
  const phaser = economyAudio
    ? bypass(reverb, ['wet'])
    : modulationType === 'auto-filter'
      ? new ToneApi.AutoFilter({frequency: '2m', baseFrequency: 360, octaves: 2.4, depth: .32, wet: 0}).connect(reverb).start()
      : modulationType === 'auto-pan'
        ? new ToneApi.AutoPanner({frequency: '1m', depth: .3, wet: 0}).connect(reverb).start()
        : new ToneApi.Phaser({frequency: .08, octaves: 2, baseFrequency: 420, wet: 0}).connect(reverb);
  const tremolo = economyAudio ? bypass(phaser, ['wet']) : new ToneApi.Tremolo({frequency: 1.6, depth: .28, wet: 0}).connect(phaser).start();
  const distortion = economyAudio ? bypass(tremolo, ['wet']) : new ToneApi.Distortion({distortion: .12, oversample: '2x', wet: .04}).connect(tremolo);
  const filter = new ToneApi.Filter(economyAudio ? 1250 : 1800, 'lowpass').connect(distortion);
  if (economyAudio) {
    filter.channelCount = 2;
    filter.channelCountMode = 'explicit';
  }
  const musicBus = new ToneApi.Gain(MUSIC_BUS_LEVEL).connect(filter);
  const analyser = state.animationEnabled ? new ToneApi.Analyser('waveform', lowPower ? 64 : 128) : null;
  const spectrum = state.animationEnabled && !lowPower ? new ToneApi.FFT(32) : null;
  if (analyser) musicBus.connect(analyser);
  if (spectrum) musicBus.connect(spectrum);

  const harmonyGain = new ToneApi.Gain(economyAudio ? .44 : .66).connect(musicBus);
  const bassGain = new ToneApi.Gain(economyAudio ? 1.55 : 1.28).connect(musicBus);
  const melodyGain = new ToneApi.Gain(economyAudio ? .075 : .3).connect(musicBus);
  const drumsGain = new ToneApi.Gain(economyAudio ? 1.75 : 1.38).connect(musicBus);
  const padGain = new ToneApi.Gain(economyAudio ? .12 : .16).connect(musicBus);
  const arpGain = new ToneApi.Gain(economyAudio ? .16 : .21).connect(musicBus);
  const malletGain = new ToneApi.Gain(economyAudio ? .1 : .15).connect(musicBus);
  const percussionGain = new ToneApi.Gain(economyAudio ? .62 : .78).connect(musicBus);
  const dustGain = new ToneApi.Gain(ToneApi.dbToGain(economyAudio ? -52 : -39)).connect(musicBus);
  const textureGain = new ToneApi.Gain(ToneApi.dbToGain(-55)).connect(musicBus);
  const texturePanner = economyAudio ? bypass(textureGain, ['pan']) : new ToneApi.Panner(0).connect(textureGain);
  const textureFilter = new ToneApi.Filter(2400, 'lowpass').connect(texturePanner);
  const textureMotion = economyAudio ? null : new ToneApi.LFO({
    frequency: ['8m', '4m', '2m'][(state.composition?.visual?.[0] || 0) % 3],
    min: -.18,
    max: .18,
    type: 'sine',
  }).connect(texturePanner.pan).start();
  const whistleGain = new ToneApi.Gain(.72).connect(musicBus);
  const whistleFilter = new ToneApi.Filter(1750, 'lowpass').connect(whistleGain);
  const whistle = new ToneApi.Synth({
    oscillator: {type: 'sine'},
    envelope: {attack: .045, decay: .1, sustain: .035, release: .24},
    volume: -14,
  }).connect(whistleFilter);
  const delay = !economyAudio && state.composition?.sound?.delayMode === 'ping-pong'
    ? new ToneApi.PingPongDelay('8n.', .23).connect(melodyGain)
    : new ToneApi.FeedbackDelay('8n.', economyAudio ? .1 : .23).connect(melodyGain);
  delay.wet.value = economyAudio ? .035 : .12;
  const chorus = economyAudio ? bypass(harmonyGain) : new ToneApi.Chorus(1.2, 2.6, 0.18).connect(harmonyGain).start();
  if (economyAudio) chorus.depth = 0;

  const makeSampledVoice = (bankName, destination, fallbackFactory, options = {}) => {
    const bank = INSTRUMENT_BANKS[bankName];
    let failed = false;
    let fallback = null;
    const sampleFilter = new ToneApi.Filter(options.filter || 3200, 'lowpass').connect(destination);
    const sampler = new ToneApi.Sampler({
      urls: bank.urls,
      baseUrl: bank.baseUrl,
      attack: options.attack ?? .012,
      release: options.release ?? .8,
      volume: options.volume ?? -15,
      onerror: () => { failed = true; },
    }).connect(sampleFilter);
    const fallbackVoice = () => fallback ||= fallbackFactory();
    return {
      get loaded() { return !failed && sampler.loaded; },
      triggerAttackRelease(...args) {
        const voice = !failed && sampler.loaded ? sampler : fallbackVoice();
        voice.triggerAttackRelease(...args);
      },
      releaseAll() {
        try { sampler.releaseAll(); } catch {}
        try { fallback?.releaseAll?.(); } catch {}
      },
      dispose() {
        try { sampler.dispose(); } catch {}
        try { sampleFilter.dispose(); } catch {}
        try { fallback?.dispose(); } catch {}
      },
    };
  };

  const makeChordFallback = index => {
    if (economyAudio) {
      const profile = LEAN_KEYS[index];
      return new ToneApi.PolySynth(ToneApi.Synth, {
        maxPolyphony: 4,
        oscillator: {type: profile.oscillator},
        envelope: {attack: profile.attack, decay: profile.decay, sustain: profile.sustain, release: profile.release},
        volume: -22,
      }).connect(chorus);
    }
    const profiles = [
      [ToneApi.FMSynth, {harmonicity: 1.35, modulationIndex: 1.7, oscillator: {type: 'sine'}, envelope: {attack: .08, decay: .5, sustain: .38, release: 1.8}, modulation: {type: 'triangle'}, modulationEnvelope: {attack: .2, decay: .4, sustain: .15, release: 1.2}, volume: -18}],
      [ToneApi.Synth, {oscillator: {type: 'triangle8'}, envelope: {attack: .16, decay: .7, sustain: .3, release: 2.2}, volume: -20}],
      [ToneApi.AMSynth, {harmonicity: 1.5, oscillator: {type: 'sine'}, envelope: {attack: .03, decay: .8, sustain: .24, release: 1.7}, modulation: {type: 'triangle'}, modulationEnvelope: {attack: .12, decay: .5, sustain: .1, release: 1.2}, volume: -20}],
      [ToneApi.Synth, {oscillator: {type: 'square8'}, envelope: {attack: .01, decay: .2, sustain: .12, release: 1.1}, volume: -27}],
      [ToneApi.FMSynth, {harmonicity: .75, modulationIndex: .65, oscillator: {type: 'sine'}, envelope: {attack: .45, decay: 1.1, sustain: .38, release: 3.2}, modulation: {type: 'sine'}, modulationEnvelope: {attack: .7, decay: .8, sustain: .2, release: 2.4}, volume: -23}],
      [ToneApi.Synth, {oscillator: {type: 'fatsine', count: 3, spread: 18}, envelope: {attack: .32, decay: .9, sustain: .28, release: 2.8}, volume: -24}],
      [ToneApi.AMSynth, {harmonicity: 1.25, oscillator: {type: 'sine'}, envelope: {attack: .16, decay: .7, sustain: .35, release: 1.9}, modulation: {type: 'triangle'}, modulationEnvelope: {attack: .2, decay: .6, sustain: .18, release: 1.3}, volume: -21}],
      [ToneApi.Synth, {oscillator: {type: 'triangle4'}, envelope: {attack: .008, decay: .42, sustain: .04, release: .65}, volume: -22}],
    ];
    return new ToneApi.PolySynth(...profiles[index]).connect(chorus);
  };
  const makeChordVoice = (index, bank) => {
    const plucked = bank.startsWith('guitar') || bank === 'harp' || bank === 'xylophone';
    const sustained = bank === 'organ' || bank === 'harmonium';
    return makeSampledVoice(bank, chorus, () => makeChordFallback(index), {
      attack: sustained ? .045 : .008,
      release: plucked ? .48 : sustained ? 1.25 : 1.05,
      volume: plucked ? -17 : -19,
      filter: sustained ? 2700 : 2350,
    });
  };

  const makeBassFallback = index => {
    if (economyAudio) {
      const profile = LEAN_BASSES[index];
      return new ToneApi.Synth({
        oscillator: {type: profile.oscillator},
        envelope: {attack: profile.attack, decay: profile.decay, sustain: profile.sustain, release: profile.release},
        portamento: .025,
        volume: -9,
      }).connect(bassGain);
    }
    const factories = [
      () => new ToneApi.MonoSynth({oscillator: {type: 'triangle'}, filter: {Q: 1.5, type: 'lowpass', rolloff: -24}, envelope: {attack: .03, decay: .25, sustain: .5, release: .7}, filterEnvelope: {attack: .02, decay: .22, sustain: .2, release: .8, baseFrequency: 90, octaves: 2.3}, volume: -10}),
      () => new ToneApi.MonoSynth({oscillator: {type: 'sine'}, filter: {Q: 1, type: 'lowpass', rolloff: -24}, envelope: {attack: .05, decay: .35, sustain: .6, release: .9}, filterEnvelope: {attack: .04, decay: .3, sustain: .25, release: 1, baseFrequency: 70, octaves: 1.7}, volume: -9}),
      () => new ToneApi.FMSynth({harmonicity: .5, modulationIndex: 1.8, oscillator: {type: 'sine'}, envelope: {attack: .01, decay: .3, sustain: .35, release: .65}, modulation: {type: 'square'}, modulationEnvelope: {attack: .01, decay: .2, sustain: .08, release: .4}, volume: -14}),
      () => new ToneApi.Synth({oscillator: {type: 'pulse'}, envelope: {attack: .015, decay: .22, sustain: .3, release: .55}, volume: -18}),
      () => new ToneApi.PluckSynth({attackNoise: .45, dampening: 1100, resonance: .72, volume: -14}),
      () => new ToneApi.MonoSynth({oscillator: {type: 'fatsquare', count: 2, spread: 8}, filter: {Q: 2, type: 'lowpass'}, envelope: {attack: .02, decay: .3, sustain: .38, release: .75}, filterEnvelope: {attack: .03, decay: .28, sustain: .18, release: .7, baseFrequency: 65, octaves: 2.8}, volume: -18}),
      () => new ToneApi.MonoSynth({oscillator: {type: 'triangle4'}, filter: {Q: 1.2, type: 'lowpass'}, envelope: {attack: .1, decay: .4, sustain: .38, release: .9}, filterEnvelope: {attack: .08, decay: .35, sustain: .2, release: .8, baseFrequency: 80, octaves: 1.8}, volume: -15}),
    ];
    return factories[index]().connect(bassGain);
  };
  const makeBassVoice = (index, bank) => makeSampledVoice(bank, bassGain, () => makeBassFallback(index), {
    attack: ['cello', 'contrabass', 'bassoon', 'tuba', 'trombone'].includes(bank) ? .035 : .01,
    release: ['cello', 'contrabass', 'bassoon'].includes(bank) ? .82 : .5,
    volume: bank === 'bass-electric' ? -9 : -13,
    filter: [850, 700, 620, 1050, 900, 800, 950][index],
  });

  const makeLeadFallback = index => {
    if (economyAudio) {
      const profile = LEAN_LEADS[index];
      return new ToneApi.Synth({
        oscillator: {type: profile.oscillator},
        envelope: {attack: profile.attack, decay: profile.decay, sustain: .04, release: profile.release},
        portamento: .035,
        volume: -31,
      }).connect(delay);
    }
    const factories = [
      () => new ToneApi.FMSynth({harmonicity: 2, modulationIndex: 1.2, oscillator: {type: 'sine'}, envelope: {attack: .025, decay: .22, sustain: .12, release: .8}, modulation: {type: 'sine'}, modulationEnvelope: {attack: .05, decay: .2, sustain: .08, release: .5}, volume: -20}),
      () => new ToneApi.Synth({oscillator: {type: 'triangle8'}, envelope: {attack: .05, decay: .28, sustain: .1, release: 1.1}, volume: -19}),
      () => new ToneApi.AMSynth({harmonicity: 1.5, oscillator: {type: 'sine'}, envelope: {attack: .08, decay: .35, sustain: .08, release: 1.25}, modulation: {type: 'triangle'}, modulationEnvelope: {attack: .1, decay: .3, sustain: .05, release: .8}, volume: -21}),
      () => new ToneApi.PluckSynth({attackNoise: .8, dampening: 2600, resonance: .9, volume: -18}),
      () => new ToneApi.DuoSynth({harmonicity: 1.5, vibratoAmount: .12, vibratoRate: 3, voice0: {oscillator: {type: 'sine'}, envelope: {attack: .04, decay: .3, sustain: .12, release: .8}}, voice1: {oscillator: {type: 'triangle'}, envelope: {attack: .08, decay: .4, sustain: .08, release: 1}}, volume: -23}),
      () => new ToneApi.Synth({oscillator: {type: 'sine4'}, envelope: {attack: .18, decay: .5, sustain: .08, release: 1.8}, portamento: .04, volume: -20}),
      () => new ToneApi.FMSynth({harmonicity: 3.01, modulationIndex: 7, oscillator: {type: 'sine'}, envelope: {attack: .002, decay: .75, sustain: .02, release: 1.4}, modulation: {type: 'sine'}, modulationEnvelope: {attack: .002, decay: .32, sustain: 0, release: .7}, volume: -25}),
      () => new ToneApi.Synth({oscillator: {type: 'fattriangle', count: 2, spread: 12}, envelope: {attack: .09, decay: .34, sustain: .16, release: 1.35}, volume: -23}),
      () => new ToneApi.Synth({oscillator: {type: 'sine4'}, envelope: {attack: .1, decay: .45, sustain: .18, release: 1.2}, portamento: .03, volume: -21}),
      () => new ToneApi.Synth({oscillator: {type: 'triangle4'}, envelope: {attack: .16, decay: .55, sustain: .22, release: 1.5}, portamento: .02, volume: -23}),
      () => new ToneApi.PluckSynth({attackNoise: .4, dampening: 1900, resonance: .86, volume: -21}),
    ];
    return factories[index]().connect(delay);
  };
  const makeLeadVoice = (index, bank) => {
    const bowedOrWind = ['flute', 'clarinet', 'bassoon', 'french-horn', 'saxophone', 'trombone', 'trumpet', 'violin', 'cello'].includes(bank);
    return makeSampledVoice(bank, delay, () => makeLeadFallback(index), {
      attack: bowedOrWind ? .085 : .004,
      release: bank.startsWith('guitar') || bank === 'harp' || bank === 'xylophone' ? .42 : 1.05,
      volume: bowedOrWind ? -25 : -23,
      filter: bank === 'xylophone' ? 2500 : ['cello', 'bassoon', 'trombone'].includes(bank) ? 1750 : 2050,
    });
  };
  const makePadVoice = index => {
    const profile = PAD_PROFILES[index] || PAD_PROFILES[0];
    return new ToneApi.PolySynth(ToneApi.Synth, {
      maxPolyphony: 3,
      oscillator: {type: profile.oscillator},
      envelope: {attack: profile.attack, decay: profile.decay, sustain: profile.sustain, release: profile.release},
      volume: economyAudio ? -28 : -25,
    }).connect(padGain);
  };
  const makeArpFallback = index => {
    const profile = ARP_PROFILES[index] || ARP_PROFILES[0];
    return new ToneApi.Synth({
      oscillator: {type: profile.oscillator},
      envelope: {attack: profile.attack, decay: profile.decay, sustain: 0, release: profile.release},
      volume: economyAudio ? -24 : -21,
    }).connect(arpGain);
  };
  const makeArpVoice = (index, bank) => makeSampledVoice(bank, arpGain, () => makeArpFallback(index), {
    attack: .002,
    release: .24,
    volume: -22,
    filter: bank === 'xylophone' ? 2700 : 2300,
  });
  const makeMalletFallback = index => {
    const profile = MALLET_PROFILES[index] || MALLET_PROFILES[0];
    return new ToneApi.Synth({
      oscillator: {type: profile.oscillator},
      envelope: {attack: profile.attack, decay: profile.decay, sustain: 0, release: profile.release},
      volume: economyAudio ? -29 : -25,
    }).connect(malletGain);
  };
  const makeMalletVoice = (index, bank) => makeSampledVoice(bank, malletGain, () => makeMalletFallback(index), {
    attack: .002,
    release: .42 + index * .08,
    volume: -25,
    filter: 2100 + index * 120,
  });
  const makeRoundRobinVoice = (urls, output, baseVolume = -10, maxDuration = .5) => {
    const players = urls.map(url => new ToneApi.Player({url, fadeOut: .025, volume: baseVolume}).connect(output));
    let cursor = 0;
    return {
      triggerAttackRelease(...args) {
        const time = args.at(-2);
        const velocity = Math.max(.01, Number(args.at(-1)) || .5);
        const player = players[cursor++ % players.length];
        if (!player.loaded) return;
        player.volume.value = baseVolume + 20 * Math.log10(velocity);
        player.start(time, 0, maxDuration);
      },
      releaseAll() {
        players.forEach(player => { try { player.stop(); } catch {} });
      },
      dispose() {
        players.forEach(player => player.dispose());
      },
    };
  };
  const makePercussionVoice = index => ({
    pitched: false,
    node: makeRoundRobinVoice(REAL_PERCUSSION[index].urls, percussionGain, -13, .42),
  });
  const makeKickVoice = index => [
    {pitchDecay: .06, octaves: 5, envelope: {attack: .002, decay: .34, sustain: 0, release: .32}, volume: -11},
    {pitchDecay: .025, octaves: 3, envelope: {attack: .001, decay: .13, sustain: 0, release: .16}, volume: -9},
    {pitchDecay: .08, octaves: 2.5, envelope: {attack: .008, decay: .25, sustain: 0, release: .42}, volume: -14},
    {pitchDecay: .045, octaves: 3.6, envelope: {attack: .006, decay: .22, sustain: 0, release: .26}, volume: -13},
    {pitchDecay: .018, octaves: 6, envelope: {attack: .001, decay: .11, sustain: 0, release: .12}, volume: -15},
    {pitchDecay: .035, octaves: 4.2, envelope: {attack: .002, decay: .18, sustain: 0, release: .18}, volume: -10},
    {pitchDecay: .015, octaves: 7, envelope: {attack: .001, decay: .12, sustain: 0, release: .1}, volume: -12},
    {pitchDecay: .025, octaves: 5.8, envelope: {attack: .001, decay: .2, sustain: 0, release: .17}, volume: -9},
    {pitchDecay: .012, octaves: 7.5, envelope: {attack: .001, decay: .1, sustain: 0, release: .09}, volume: -14},
    {pitchDecay: .1, octaves: 2.2, envelope: {attack: .008, decay: .48, sustain: 0, release: .46}, volume: -14},
  ][index];
  const makeSnareVoice = index => [
    {noise: {type: 'pink'}, envelope: {attack: .003, decay: .13, sustain: 0}, volume: -18},
    {noise: {type: 'white'}, envelope: {attack: .001, decay: .075, sustain: 0}, volume: -23},
    {noise: {type: 'brown'}, envelope: {attack: .008, decay: .19, sustain: 0}, volume: -16},
    {noise: {type: 'pink'}, envelope: {attack: .012, decay: .27, sustain: 0}, volume: -22},
    {noise: {type: 'white'}, envelope: {attack: .001, decay: .045, sustain: 0}, volume: -25},
    {noise: {type: 'white'}, envelope: {attack: .001, decay: .09, sustain: 0}, volume: -19},
    {noise: {type: 'pink'}, envelope: {attack: .001, decay: .065, sustain: 0}, volume: -18},
    {noise: {type: 'white'}, envelope: {attack: .001, decay: .12, sustain: 0}, volume: -20},
    {noise: {type: 'brown'}, envelope: {attack: .002, decay: .08, sustain: 0}, volume: -18},
    {noise: {type: 'pink'}, envelope: {attack: .018, decay: .3, sustain: 0}, volume: -20},
  ][index];
  const makeHatVoice = index => [
    {frequency: 190, envelope: {attack: .001, decay: .045, release: .02}, harmonicity: 4.8, modulationIndex: 18, resonance: 2800, octaves: 1.2, volume: -28},
    {frequency: 135, envelope: {attack: .002, decay: .075, release: .025}, harmonicity: 3.1, modulationIndex: 10, resonance: 1900, octaves: .7, volume: -30},
    {frequency: 245, envelope: {attack: .001, decay: .028, release: .012}, harmonicity: 5.4, modulationIndex: 24, resonance: 3900, octaves: 1.5, volume: -31},
    {frequency: 110, envelope: {attack: .006, decay: .12, release: .04}, harmonicity: 2.1, modulationIndex: 7, resonance: 1500, octaves: .6, volume: -31},
    {frequency: 310, envelope: {attack: .001, decay: .022, release: .01}, harmonicity: 6.2, modulationIndex: 28, resonance: 4600, octaves: 1.8, volume: -34},
    {frequency: 165, envelope: {attack: .001, decay: .052, release: .018}, harmonicity: 3.8, modulationIndex: 14, resonance: 2400, octaves: 1, volume: -29},
    {frequency: 285, envelope: {attack: .001, decay: .025, release: .01}, harmonicity: 5.7, modulationIndex: 25, resonance: 4100, octaves: 1.6, volume: -32},
    {frequency: 225, envelope: {attack: .001, decay: .04, release: .015}, harmonicity: 5, modulationIndex: 20, resonance: 3500, octaves: 1.3, volume: -31},
    {frequency: 340, envelope: {attack: .001, decay: .02, release: .008}, harmonicity: 6.8, modulationIndex: 31, resonance: 4900, octaves: 2, volume: -35},
    {frequency: 95, envelope: {attack: .008, decay: .15, release: .05}, harmonicity: 1.9, modulationIndex: 6, resonance: 1250, octaves: .5, volume: -31},
  ][index];
  const textureFrequencies = [1800, 4000, 1200, 2600];
  const textureLevels = [-62, -60, -64, -66];
  const dustFilter = economyAudio ? null : new ToneApi.Filter(1250, 'lowpass').connect(dustGain);
  const dust = economyAudio ? new ToneApi.Noise('pink').connect(dustGain).start() : new ToneApi.Noise('pink').connect(dustFilter).start();
  const roomTexture = new ToneApi.Noise('brown').connect(textureFilter).start();
  const lastTriggerTime = new WeakMap();
  const safeTriggerTime = (voice, requestedTime) => {
    const previous = lastTriggerTime.get(voice) ?? -Infinity;
    // Firefox rejects a trigger at or before a freshly constructed source's
    // current audio time. This can happen when live flow data selects a voice
    // for the first time inside a transport callback.
    const earliest = ToneApi.now() + .005;
    const next = Math.max(requestedTime, previous + .001, earliest);
    lastTriggerTime.set(voice, next);
    return next;
  };

  const engine = {
    master, filter, musicBus, analyser, spectrum, delay, compressor, widener, reverb, phaser, tremolo, distortion,
    chordVoices: Array(8),
    bassVoices: Array(7),
    leadVoices: Array(11),
    kickVoices: Array(10),
    snareVoices: Array(10),
    hatVoices: Array(10),
    padVoices: Array(5),
    arpVoices: Array(8),
    malletVoices: Array(5),
    percussionVoices: Array(8),
    chorus, dust, dustFilter, roomTexture, textureFilter, texturePanner, textureMotion, whistle, whistleFilter,
    dustGain, textureGain,
    layerGains: {harmony: harmonyGain, bass: bassGain, melody: melodyGain, drums: drumsGain, dust: dustGain},
    step: 0,
    tempoHash: '',
    targetBpm: state.composition?.bpm || 72,
    percussionChance: 0.1,
    lastWhistleAt: 0,
    enableAnalyser() {
      if (this.analyser) return;
      this.analyser = new ToneApi.Analyser('waveform', lowPower ? 64 : 128);
      this.musicBus.connect(this.analyser);
      if (!lowPower) {
        this.spectrum = new ToneApi.FFT(32);
        this.musicBus.connect(this.spectrum);
      }
    },
    disableAnalyser() {
      if (!this.analyser) return;
      this.analyser.dispose();
      this.analyser = null;
      this.spectrum?.dispose();
      this.spectrum = null;
    },
    setTexture(index) {
      this.textureFilter.frequency.rampTo(textureFrequencies[index] || 2400, 2);
      this.textureGain.gain.rampTo(ToneApi.dbToGain(textureLevels[index] || -64), 2);
    },
    playWhistle(transaction, proximity) {
      const nowMs = performance.now();
      if (!state.playing || nowMs - this.lastWhistleAt < 320) return;
      this.lastWhistleAt = nowMs;
      const feeMotion = Math.min(1, Math.log2(Math.max(1, transaction.feeRate || state.chain.fee)) / 9);
      const audibleProximity = Math.max(.48, proximity);
      const duration = .16 + (1 - feeMotion) * .5;
      const startFrequency = 470 + feeMotion * 210;
      const now = ToneApi.now() + .01;
      this.whistleFilter.frequency.rampTo(1050 + audibleProximity * 800, .08);
      this.whistle.triggerAttack(startFrequency, now, .065 + audibleProximity * .055);
      this.whistle.frequency.rampTo(startFrequency * (1.045 + feeMotion * .06), duration);
      this.whistle.triggerRelease(now + duration);
    },
    chordVoice(index, bank) { return this.chordVoices[index] ||= makeChordVoice(index, bank); },
    bassVoice(index, bank) { return this.bassVoices[index] ||= makeBassVoice(index, bank); },
    leadVoice(index, bank) { return this.leadVoices[index] ||= makeLeadVoice(index, bank); },
    padVoice(index) { return this.padVoices[index] ||= makePadVoice(index); },
    arpVoice(index, bank) { return this.arpVoices[index] ||= makeArpVoice(index, bank); },
    malletVoice(index, bank) { return this.malletVoices[index] ||= makeMalletVoice(index, bank); },
    percussionVoice(index) { return this.percussionVoices[index] ||= makePercussionVoice(index); },
    kickVoice(index) {
      const recorded = REAL_DRUM_KITS[index];
      return this.kickVoices[index] ||= recorded
        ? makeRoundRobinVoice(recorded.kick, drumsGain, -3, .72)
        : new ToneApi.MembraneSynth(economyAudio ? LEAN_KICKS[index] : makeKickVoice(index)).connect(drumsGain);
    },
    snareVoice(index) {
      const recorded = REAL_DRUM_KITS[index];
      return this.snareVoices[index] ||= recorded
        ? makeRoundRobinVoice(recorded.snare, drumsGain, -7, .5)
        : new ToneApi.NoiseSynth(economyAudio ? LEAN_SNARES[index] : makeSnareVoice(index)).connect(drumsGain);
    },
    hatVoice(index) {
      const recorded = REAL_DRUM_KITS[index];
      return this.hatVoices[index] ||= recorded
        ? makeRoundRobinVoice(recorded.hat, drumsGain, -13, .22)
        : economyAudio
          ? new ToneApi.NoiseSynth(LEAN_HATS[index]).connect(drumsGain)
          : new ToneApi.MetalSynth(makeHatVoice(index)).connect(drumsGain);
    },
    releaseAllVoices() {
      const banks = [this.chordVoices, this.bassVoices, this.leadVoices, this.kickVoices, this.snareVoices, this.hatVoices, this.padVoices, this.arpVoices, this.malletVoices];
      banks.forEach(bank => bank.forEach((voice, index) => {
        if (!voice) return;
        try { voice.releaseAll?.(); } catch {}
        voice.dispose();
        bank[index] = undefined;
      }));
      this.percussionVoices.forEach((voice, index) => {
        if (!voice) return;
        voice.node.dispose();
        this.percussionVoices[index] = undefined;
      });
    },
    releaseUnusedVoices(composition, flow) {
      const keep = {
        chord: economyAudio ? composition.sound.chordVoice : flow?.chordVoice ?? composition.sound.chordVoice,
        bass: economyAudio ? composition.sound.bassVoice : flow?.bassVoice ?? composition.sound.bassVoice,
        lead: economyAudio ? composition.sound.leadVoice : flow?.leadVoice ?? composition.sound.leadVoice,
        drums: composition.sound.drumKit,
        pad: composition.sound.padVoice,
        arp: composition.sound.arpVoice,
        mallet: composition.sound.malletVoice,
        percussion: composition.sound.percussionVoice,
      };
      const release = (bank, activeIndex) => bank.forEach((voice, index) => {
        if (voice && index !== activeIndex) {
          voice.dispose();
          bank[index] = undefined;
        }
      });
      release(this.chordVoices, keep.chord);
      release(this.bassVoices, keep.bass);
      release(this.leadVoices, keep.lead);
      release(this.kickVoices, keep.drums);
      release(this.snareVoices, keep.drums);
      release(this.hatVoices, keep.drums);
      release(this.padVoices, keep.pad);
      release(this.arpVoices, keep.arp);
      release(this.malletVoices, keep.mallet);
      this.percussionVoices.forEach((voice, index) => {
        if (voice && index !== keep.percussion) {
          voice.node.dispose();
          this.percussionVoices[index] = undefined;
        }
      });
    },
    dispose() {
      this.loop?.dispose();
      [...this.chordVoices, ...this.bassVoices, ...this.leadVoices, ...this.kickVoices, ...this.snareVoices, ...this.hatVoices, ...this.padVoices, ...this.arpVoices, ...this.malletVoices]
        .filter(Boolean).forEach(voice => voice.dispose());
      this.percussionVoices.filter(Boolean).forEach(voice => voice.node.dispose());
      [this.dust, this.dustFilter, this.roomTexture, this.textureFilter, this.texturePanner, this.textureMotion, this.textureGain, this.whistle, this.whistleFilter, this.delay, this.chorus, this.filter, this.distortion, this.tremolo, this.phaser, this.reverb, this.widener, this.compressor, this.limiter, this.analyser, this.spectrum, this.musicBus, bassGain, padGain, arpGain, malletGain, percussionGain, whistleGain]
        .filter(Boolean).forEach(node => { try { node.dispose(); } catch {} });
    },
  };

  engine.loop = new ToneApi.Loop(time => {
    if (!state.composition) return;
    const stepsPerBar = state.composition.stepsPerBar || 16;
    const totalSteps = state.composition.totalSteps || stepsPerBar * 4;
    let step = engine.step % totalSteps;
    let position = step % stepsPerBar;
    let bar = Math.floor(step / stepsPerBar);
    if (position === 0 && state.pendingComposition && !state.transitioning) {
      const nextComposition = state.pendingComposition;
      ToneApi.Draw.schedule(() => beginBlockTransition(nextComposition), time);
    }
    if (position === 0 && state.pendingFlow) {
      state.activeFlow = state.pendingFlow;
      state.pendingFlow = null;
      ToneApi.Draw.schedule(applyNetworkSound, time);
    }
    const composition = state.composition;
    const flow = state.activeFlow || flowFromTransactions(composition.hash, composition);
    const rhythm = composition.rhythm;
    const arrangement = composition.arrangement[bar];
    const drumKit = composition.sound.drumKit;
    const kick = engine.kickVoice(drumKit);
    const snare = engine.snareVoice(drumKit);
    const hat = engine.hatVoice(drumKit);
    const pad = engine.padVoice(composition.sound.padVoice);
    const arp = engine.arpVoice(composition.sound.arpVoice, selectedInstrument(composition, 'arp'));
    const mallet = engine.malletVoice(composition.sound.malletVoice, selectedInstrument(composition, 'mallet'));
    const percussion = engine.percussionVoice(composition.sound.percussionVoice);
    if (arrangement.harmony && rhythm.chord[step]) {
      const chord = economyAudio
        ? composition.chords[bar].slice(0, 3).map((note, index) => transposeNote(note, index === 0 ? -12 : 0))
        : invertChord(composition.chords[bar], flow.chordInversions[bar % flow.chordInversions.length]);
      const chordVoice = engine.chordVoice(economyAudio ? composition.sound.chordVoice : flow.chordVoice ?? composition.sound.chordVoice, selectedInstrument(composition, 'harmony'));
      const chordVelocity = Math.min(.72, composition.sound.chordVelocity * (flow.chordWeight || 1));
      chordVoice.triggerAttackRelease(chord, economyAudio ? '4n' : rhythm.chordDuration, safeTriggerTime(chordVoice, time), economyAudio ? chordVelocity * .82 : chordVelocity);
    }
    if (arrangement.harmony && position === 0) {
      const padChord = composition.chords[bar].slice(0, 3).map(note => transposeNote(note, -12));
      const barDuration = Math.max(.5, stepsPerBar * 15 / Math.max(48, composition.bpm));
      pad.triggerAttackRelease(padChord, barDuration * .92, safeTriggerTime(pad, time), economyAudio ? .16 : .22);
    }
    const arpPattern = ARP_PATTERNS[composition.sound.arpPattern];
    const arpTone = arpPattern[Math.floor(position / stepsPerBar * arpPattern.length) % arpPattern.length];
    if (arrangement.harmony && bar % 2 === 0 && arpTone !== null) {
      const chord = composition.chords[bar];
      const note = chord[arpTone % chord.length];
      arp.triggerAttackRelease(note, '16n', safeTriggerTime(arp, time), economyAudio ? .16 : .22);
    }
    const bassPickupStep = Math.max(1, stepsPerBar - 2);
    if (arrangement.bass && (rhythm.bass[step] || (position === bassPickupStep && flow.bassPickup))) {
      const bassBar = position === bassPickupStep ? (bar + 1) % composition.barCount : bar;
      const bassVoice = engine.bassVoice(economyAudio ? composition.sound.bassVoice : flow.bassVoice ?? composition.sound.bassVoice, selectedInstrument(composition, 'bass'));
      bassVoice.triggerAttackRelease(composition.bass[bassBar], position % 4 === 0 ? '4n' : '8n', safeTriggerTime(bassVoice, time), position === bassPickupStep ? .3 : .54);
    }
    const drumsActive = economyAudio || arrangement.drums;
    const transactionKick = !economyAudio && flow.rhythmicDetail > .32 && flow.extraKicks.includes(position);
    const transactionSnare = !economyAudio && flow.rhythmicDetail > .58 && flow.extraSnares.includes(position);
    if (drumsActive && (rhythm.kick[step] || transactionKick)) kick.triggerAttackRelease(economyAudio ? 'C1' : composition.sound.kickNote, '8n', safeTriggerTime(kick, time), transactionKick ? .34 : flow.kickVelocity || 0.68);
    if (drumsActive && (rhythm.snare[step] || transactionSnare)) snare.triggerAttackRelease(transactionSnare ? '32n' : '16n', safeTriggerTime(snare, time), transactionSnare ? .15 : economyAudio ? .68 : position === Math.floor(stepsPerBar * .75) ? 0.42 : 0.5);
    if (drumsActive && !economyAudio && !rhythm.snare[step] && !transactionSnare && position % 4 === 3 && flow.rhythmicDetail > .72) snare.triggerAttackRelease('32n', safeTriggerTime(snare, time), 0.12);
    const hatOffset = economyAudio ? 0 : flow.hatOffset;
    const hatHit = rhythm.hat[(step + hatOffset) % totalSteps];
    if (hatHit) {
      const hatVelocity = economyAudio ? (position % 4 === 2 ? .28 : .2) : .1;
      hat.triggerAttackRelease('32n', safeTriggerTime(hat, time), hatVelocity);
    }
    if (!economyAudio && !hatHit && flow.rhythmicDetail > .48 && position % 4 === 3) hat.triggerAttackRelease('32n', safeTriggerTime(hat, time), 0.055 + flow.rhythmicDetail * .04);
    const melodyHit = economyAudio ? composition.economyMelodyPattern[step] : rhythm.melody[step];
    if ((economyAudio || arrangement.melody) && melodyHit) {
      const phraseIndex = step % flow.phrase.length;
      const baseNote = composition.melody[step % composition.melody.length];
      const sourceNote = economyAudio ? baseNote : bar % 3 === 0 ? baseNote : flow.phrase[phraseIndex] || baseNote;
      const transpose = economyAudio ? 0 : flow.melodyTranspose;
      const note = transposeNote(sourceNote, transpose);
      const writtenVelocity = composition.leadVelocities[step] ?? composition.sound.melodyVelocity;
      const velocity = economyAudio ? Math.min(.12, writtenVelocity * .42) : flow.velocities[phraseIndex] ?? writtenVelocity;
      if (note) {
        const leadVoice = engine.leadVoice(economyAudio ? composition.sound.leadVoice : flow.leadVoice ?? composition.sound.leadVoice, selectedInstrument(composition, 'lead'));
        const writtenDuration = composition.leadDurations[step] || '8n';
        leadVoice.triggerAttackRelease(note, economyAudio ? writtenDuration : flow.noteLength || writtenDuration, safeTriggerTime(leadVoice, time), velocity);
      }
    }
    const firstMalletStep = Math.max(1, Math.round(stepsPerBar * .375));
    const secondMalletStep = Math.max(firstMalletStep + 1, stepsPerBar - 2);
    if (bar % 2 === 1 && (position === firstMalletStep || position === secondMalletStep)) {
      const chord = composition.chords[bar];
      const note = chord[(position === firstMalletStep ? 1 : 2) % chord.length];
      mallet.triggerAttackRelease(note, '8n', safeTriggerTime(mallet, time), economyAudio ? .11 : .16);
    }
    const percussionHit = PERCUSSION_PATTERNS[composition.sound.percussionVoice]
      .some(slot => Math.round(slot / 16 * stepsPerBar) === position);
    if (percussionHit) {
      const percTime = safeTriggerTime(percussion.node, time);
      if (percussion.pitched) {
        const notes = ['C3', 'D3', 'E2', 'G2', 'A2', 'C2', 'E3', 'G3'];
        percussion.node.triggerAttackRelease(notes[composition.sound.percussionVoice], '32n', percTime, .2);
      } else {
        percussion.node.triggerAttackRelease('32n', percTime, .14);
      }
    }
    ToneApi.Draw.schedule(() => {
      state.visualStep = step;
    }, time);
    engine.step = (step + 1) % totalSteps;
  }, '16n').start(0);

  return engine;
}

async function warmEngine(engine) {
  const flow = state.activeFlow;
  const constructors = [
    () => engine.chordVoice(flow?.chordVoice ?? state.composition.sound.chordVoice, selectedInstrument(state.composition, 'harmony')),
    () => engine.bassVoice(flow?.bassVoice ?? state.composition.sound.bassVoice, selectedInstrument(state.composition, 'bass')),
    () => engine.leadVoice(flow?.leadVoice ?? state.composition.sound.leadVoice, selectedInstrument(state.composition, 'lead')),
    () => engine.kickVoice(state.composition.sound.drumKit),
    () => engine.snareVoice(state.composition.sound.drumKit),
    () => engine.hatVoice(state.composition.sound.drumKit),
    () => engine.padVoice(state.composition.sound.padVoice),
    () => engine.arpVoice(state.composition.sound.arpVoice, selectedInstrument(state.composition, 'arp')),
    () => engine.malletVoice(state.composition.sound.malletVoice, selectedInstrument(state.composition, 'mallet')),
    () => engine.percussionVoice(state.composition.sound.percussionVoice),
  ];
  for (const construct of constructors) {
    construct();
    if (economyAudio) await new Promise(resolve => requestAnimationFrame(resolve));
  }
}

async function unlockAudio() {
  const context = ToneApi.getContext();
  const rawContext = context.rawContext;
  const attempts = [ToneApi.start()];
  if (typeof context.resume === 'function') attempts.push(context.resume());
  if (rawContext && rawContext !== context && typeof rawContext.resume === 'function') attempts.push(rawContext.resume());
  await Promise.allSettled(attempts);
  const destination = ToneApi.getDestination();
  destination.mute = false;
  destination.volume.value = 0;
  if (context.state !== 'running' && rawContext?.state !== 'running') {
    throw new Error('Firefox did not allow the audio context to start');
  }
}

async function togglePlayback() {
  try {
    await unlockAudio();
    if (!state.engine) {
      if (economyAudio) {
        const context = ToneApi.getContext();
        context.lookAhead = .28;
        context.updateInterval = .08;
      }
      ui.play.disabled = true;
      ui.play.classList.add('loading');
      ui.play.innerHTML = '<i data-lucide="loader-circle"></i>';
      ui.transport.textContent = 'Preparing the session';
      globalThis.lucide?.createIcons();
      await new Promise(resolve => requestAnimationFrame(resolve));
      state.engine = createEngine();
      await warmEngine(state.engine);
      await Promise.race([
        ToneApi.loaded().catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 4500)),
      ]);
      applyNetworkSound();
      ui.play.disabled = false;
      ui.play.classList.remove('loading');
    }
    const transport = ToneApi.getTransport();
    if (state.playing) {
      transport.pause();
      state.playing = false;
      ui.transport.textContent = 'Paused';
      ui.play.setAttribute('aria-label', 'Play 21FM');
      ui.play.innerHTML = '<i data-lucide="play"></i>';
    } else {
      transport.start();
      state.playing = true;
      ui.transport.textContent = state.replayMode ? 'Block replay' : state.chain.connected ? 'Chain in the groove' : 'Offline groove';
      ui.play.setAttribute('aria-label', 'Pause 21FM');
      ui.play.innerHTML = '<i data-lucide="pause"></i>';
    }
    globalThis.lucide?.createIcons();
  } catch (error) {
    console.error('Could not start 21FM:', error);
    try { ToneApi.getTransport().stop(); } catch {}
    state.engine?.dispose();
    state.engine = null;
    state.soundSignature = '';
    state.playing = false;
    ui.transport.textContent = 'Audio could not start';
    ui.play.disabled = false;
    ui.play.classList.remove('loading');
    ui.play.setAttribute('aria-label', 'Play 21FM');
    ui.play.innerHTML = '<i data-lucide="play"></i>';
    globalThis.lucide?.createIcons();
  }
}

async function recoverAudioScheduler() {
  if (state.schedulerRecovering || !state.playing) return;
  const recoveryComposition = state.pendingComposition
    || (state.composition?.hash !== state.chain.hash ? makeComposition() : null);
  state.schedulerRecovering = true;
  state.playing = false;
  cancelBlockTransition();
  ui.transport.textContent = 'Recovering the audio clock';
  ui.play.disabled = true;
  ui.play.classList.add('loading');
  ui.play.innerHTML = '<i data-lucide="loader-circle"></i>';
  globalThis.lucide?.createIcons();
  try {
    const transport = ToneApi.getTransport();
    try { transport.stop(); } catch {}
    try { state.engine?.dispose(); } catch {}
    try { transport.cancel(0); } catch {}
    state.engine = null;
    state.soundSignature = '';
    if (recoveryComposition) applyComposition(recoveryComposition);
    await unlockAudio();
    state.engine = createEngine();
    await warmEngine(state.engine);
    applyNetworkSound(true);
    transport.start('+0.1');
    state.playing = true;
    ui.transport.textContent = state.replayMode ? 'Block replay' : state.chain.connected ? 'Chain in the groove' : 'Offline groove';
    ui.play.setAttribute('aria-label', 'Pause 21FM');
    ui.play.innerHTML = '<i data-lucide="pause"></i>';
  } catch (error) {
    console.error('Could not recover 21FM:', error);
    state.playing = false;
    ui.transport.textContent = 'Audio stopped · press play to restart';
    ui.play.setAttribute('aria-label', 'Play 21FM');
    ui.play.innerHTML = '<i data-lucide="play"></i>';
  } finally {
    state.schedulerRecovering = false;
    ui.play.disabled = false;
    ui.play.classList.remove('loading');
    globalThis.lucide?.createIcons();
  }
}

function updateChain(patch) {
  if (state.replayMode) return;
  const previousHash = state.chain.hash;
  state.chain = {...state.chain, ...patch};
  renderChain();
  if (patch.hash && patch.hash !== previousHash) {
    state.variation = 0;
    queueComposition(makeComposition());
  } else {
    showComposition(state.composition);
  }
}

async function getJson(url) {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.text()).trim();
}

async function refreshBlockTip() {
  if (state.replayMode) return;
  const [heightText, hash] = await Promise.all([
    getText('https://mempool.space/api/blocks/tip/height'),
    getText('https://mempool.space/api/blocks/tip/hash'),
  ]);
  const height = Number(heightText);
  if (!Number.isInteger(height) || !/^[0-9a-f]{64}$/i.test(hash)) return;
  updateChain({height, hash, connected: true});
}

async function loadSnapshot() {
  if (state.replayMode) return;
  const [blocks, fees, mempool, projected] = await Promise.allSettled([
    getJson('https://mempool.space/api/blocks'),
    getJson('https://mempool.space/api/v1/fees/recommended'),
    getJson('https://mempool.space/api/mempool'),
    getJson('https://mempool.space/api/v1/fees/mempool-blocks'),
  ]);
  const latest = blocks.status === 'fulfilled' ? blocks.value?.[0] : null;
  const feeData = fees.status === 'fulfilled' ? fees.value : null;
  const mempoolData = mempool.status === 'fulfilled' ? mempool.value : null;
  const projectedData = projected.status === 'fulfilled' ? projected.value : null;
  if (!latest && !feeData && !mempoolData) return false;
  updateChain({
    height: latest?.height ?? state.chain.height,
    hash: latest?.id ?? state.chain.hash,
    fee: feeData?.halfHourFee ?? state.chain.fee,
    vsize: mempoolData?.vsize ?? state.chain.vsize,
    count: mempoolData?.count ?? state.chain.count,
    projectedBlocks: Array.isArray(projectedData) ? projectedData.length : state.chain.projectedBlocks,
    connected: true,
  });
  return true;
}

function connectLiveData(delay = 3000) {
  clearTimeout(state.reconnectTimer);
  state.socket?.close();
  try {
    const socket = new WebSocket('wss://mempool.space/api/v1/ws');
    state.socket = socket;
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({action: 'want', data: ['blocks', 'mempool-blocks', 'stats']}));
      socket.send(JSON.stringify({'track-mempool-txids': true}));
      updateChain({connected: true});
      refreshBlockTip().catch(() => {});
    });
    socket.addEventListener('message', event => {
      try {
        const data = JSON.parse(event.data);
        const latest = latestBlockFromFrame(data);
        const mempool = data.mempoolInfo || data.stats;
        const txFlow = data['mempool-txids'];
        if (txFlow?.added?.length) {
          ingestTransactions(txFlow.added, txFlow.sequence);
          sampleTransactionDetails(txFlow.added, txFlow.sequence);
        }
        updateChain({
          height: latest?.height ?? state.chain.height,
          hash: latest?.id ?? latest?.hash ?? state.chain.hash,
          fee: data.fees?.halfHourFee ?? state.chain.fee,
          vsize: mempool?.vsize ?? state.chain.vsize,
          count: mempool?.size ?? mempool?.count ?? state.chain.count,
          projectedBlocks: Array.isArray(data['mempool-blocks']) ? data['mempool-blocks'].length : state.chain.projectedBlocks,
          connected: true,
        });
      } catch { /* Ignore unrelated frames. */ }
    });
    socket.addEventListener('close', () => {
      if (state.socket !== socket) return;
      updateChain({connected: false});
      state.reconnectTimer = setTimeout(() => connectLiveData(Math.min(delay * 1.6, 30000)), delay);
    });
    socket.addEventListener('error', () => socket.close());
  } catch {
    updateChain({connected: false});
    state.reconnectTimer = setTimeout(() => connectLiveData(Math.min(delay * 1.6, 30000)), delay);
  }
}

const TRANSACTION_COLORS = {
  Taproot: '#f2a900',
  SegWit: '#32d583',
  Legacy: '#e45b68',
  Batch: '#4da3ff',
  Consolidation: '#8b7cf6',
  Data: '#e45fb2',
  Mixed: '#f3d36a',
};
const LIVE_TRANSACTION_COLORS = ['#00c2ff', '#2dd4bf', '#84cc16', '#ffd166', '#ff7a59', '#ff5fa2', '#a78bfa', '#5b8cff'];

function transactionColor(transaction) {
  if (transaction.type !== 'Live') return TRANSACTION_COLORS[transaction.type] || TRANSACTION_COLORS.Mixed;
  const seed = Number.parseInt(transaction.txid.slice(0, 8), 16) || 0;
  return LIVE_TRANSACTION_COLORS[seed % LIVE_TRANSACTION_COLORS.length];
}

function drawTransactions(context, width, height, cx, cy, radius, now) {
  state.transactionVisuals = state.transactionVisuals.filter(transaction => {
    const feeMotion = Math.min(1, Math.log2(Math.max(1, transaction.feeRate)) / 9);
    const duration = 5200 - feeMotion * 2400;
    return now - transaction.born < duration + 1100;
  });
  state.transactionVisuals.forEach(transaction => {
    const feeMotion = Math.min(1, Math.log2(Math.max(1, transaction.feeRate)) / 9);
    const duration = 5200 - feeMotion * 2400;
    const elapsed = now - transaction.born;
    if (elapsed < 0) return;
    const progress = Math.min(1, elapsed / duration);
    const entryAngle = transaction.entryAngle ?? transaction.lane * Math.PI * 2;
    const edgeDistance = Math.hypot(width, height) * .72 + 40;
    const targetAngle = transaction.lane * Math.PI * 2;
    const {x, y} = transactionGravityPoint({
      cx, cy, radius, edgeDistance, entryAngle, targetAngle,
      orbit: transaction.orbit,
      bend: transaction.bend,
      feeMotion,
      progress,
      crossesCenter: transaction.crossesCenter,
    });
    const arrival = progress < 1 ? 1 : Math.max(0, 1 - (elapsed - duration) / 1100);
    const particleRadius = Math.min(22, 3 + Math.sqrt(Math.min(100000, transaction.vsize)) / 8);
    const centerDistance = Math.hypot(x - cx, y - cy);
    const whistleRange = Math.max(18, radius * .14);
    if (transaction.crossesCenter && centerDistance <= whistleRange && !transaction.whistled) {
      transaction.whistled = true;
      state.engine?.playWhistle(transaction, Math.max(0, 1 - centerDistance / whistleRange));
    }
    const color = transactionColor(transaction);
    context.save();
    context.globalAlpha = Math.max(.12, arrival * .88);
    context.shadowColor = color;
    context.shadowBlur = visualProfile.shadowBlur;
    context.fillStyle = color;
    context.beginPath();
    if (transaction.hasData) {
      context.rect(x - particleRadius * .72, y - particleRadius * .72, particleRadius * 1.44, particleRadius * 1.44);
    } else {
      context.arc(x, y, particleRadius, 0, Math.PI * 2);
    }
    context.fill();
    if (transaction.rbf) {
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(242,242,237,.8)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, particleRadius + 3, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  });
}

function drawBlockIdentity(context, cx, cy, radius) {
  const hash = String(state.chain.hash || state.composition?.hash || '').replace(/[^0-9a-f]/gi, '').padEnd(64, '0').slice(0, 64).toLowerCase();
  const hashRadius = radius * 1.09;
  const hashSize = Math.max(7, Math.min(11, radius * .055));
  context.save();
  context.fillStyle = 'rgba(205,208,204,.62)';
  context.font = `500 ${hashSize}px "Roboto Mono", monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  [...hash].forEach((character, index) => {
    const angle = -Math.PI / 2 + index / hash.length * Math.PI * 2;
    const role = state.replayMode && state.replayEngine !== 'v1' ? replayHashRoleAt(index) : null;
    context.save();
    context.translate(cx + Math.cos(angle) * hashRadius, cy + Math.sin(angle) * hashRadius);
    context.rotate(angle + Math.PI / 2);
    if (role) {
      context.fillStyle = role.color;
      context.shadowColor = role.color;
      context.shadowBlur = 5;
      context.font = `700 ${hashSize}px "Roboto Mono", monospace`;
    }
    context.fillText(character, 0, 0);
    context.restore();
  });

  const blockHeight = state.chain.height ? Number(state.chain.height).toLocaleString() : state.replayMode ? 'REPLAY' : 'OFFLINE';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'rgba(174,178,176,.72)';
  context.font = `600 ${Math.max(7, Math.min(10, radius * .06))}px "Roboto Mono", monospace`;
  context.fillText('BLOCK', cx, cy - Math.max(10, radius * .075));
  context.fillStyle = '#f2a900';
  context.font = `600 ${Math.max(15, Math.min(25, radius * .14))}px "Roboto Mono", monospace`;
  context.fillText(blockHeight, cx, cy + Math.max(7, radius * .055));
  context.restore();
}

function draw() {
  state.animationFrame = 0;
  if (!state.animationEnabled) return;
  const now = performance.now();
  const hasMovingTransactions = state.transactionVisuals.some(transaction => now - transaction.born < 6500);
  const targetFps = document.hidden ? 2 : state.playing ? visualProfile.activeFps : hasMovingTransactions ? 20 : visualProfile.idleFps;
  if (now - state.lastDrawAt < 1000 / targetFps) {
    state.animationFrame = requestAnimationFrame(draw);
    return;
  }
  state.lastDrawAt = now;
  const canvas = ui.canvas;
  const context = canvas.getContext('2d');
  const ratio = Math.min(globalThis.devicePixelRatio || 1, visualProfile.pixelRatio);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = '#0b0d0e';
  context.fillRect(0, 0, width, height);
  const visual = state.composition?.visual || Array(16).fill(80);
  const time = now / 1000;

  context.strokeStyle = 'rgba(118,124,126,.12)';
  context.lineWidth = 1;
  for (let y = visualProfile.gridStep; y < height; y += visualProfile.gridStep) {
    context.beginPath();
    context.moveTo(0, y + .5);
    context.lineTo(width, y + .5);
    context.stroke();
  }

  const cx = width * 0.55;
  const cy = height * 0.44;
  const radius = Math.min(width, height) * 0.27;
  drawTransactions(context, width, height, cx, cy, radius, now);
  context.save();
  context.translate(cx, cy);
  context.rotate(state.playing ? time * 0.035 : 0);
  context.strokeStyle = '#25292a';
  for (let ring = 0; ring < visualProfile.rings; ring += 1) {
    context.beginPath();
    const ringStep = .66 / Math.max(1, visualProfile.rings - 1);
    context.arc(0, 0, radius * (.35 + ring * ringStep), 0, Math.PI * 2);
    context.stroke();
  }
  visual.forEach((value, index) => {
    const angle = (index / visual.length) * Math.PI * 2;
    context.strokeStyle = index === state.visualStep % visual.length ? '#f2a900' : `rgba(155,160,161,${0.14 + value / 900})`;
    context.lineWidth = index % 3 === 0 ? 2 : 1;
    context.beginPath();
    context.moveTo(Math.cos(angle) * radius * .38, Math.sin(angle) * radius * .38);
    context.lineTo(Math.cos(angle) * radius * (.7 + value / 850), Math.sin(angle) * radius * (.7 + value / 850));
    context.stroke();
  });
  const spectrum = state.engine?.spectrum?.getValue();
  if (spectrum) {
    spectrum.slice(1, 25).forEach((level, index) => {
      const normalized = Math.max(0, Math.min(1, (Number(level) + 96) / 84));
      const angle = index / 24 * Math.PI * 2;
      const inner = radius * .22;
      const outer = inner + normalized * radius * .12;
      context.strokeStyle = `rgba(242,169,0,${.16 + normalized * .42})`;
      context.lineWidth = Math.max(1, radius * .012);
      context.beginPath();
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      context.stroke();
    });
  }
  context.restore();
  drawBlockIdentity(context, cx, cy, radius);

  const waveform = state.engine?.analyser?.getValue();
  if (waveform) {
    context.strokeStyle = 'rgba(242,169,0,.72)';
    context.lineWidth = 1.5;
    context.beginPath();
    waveform.forEach((sample, index) => {
      const x = index / (waveform.length - 1) * width;
      const shapedSample = Math.sign(sample) * Math.sqrt(Math.abs(sample));
      const y = height * .82 + shapedSample * Math.min(110, height * .16);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
  }
  if (state.flowPulse > 0.01) {
    context.strokeStyle = `rgba(134,168,115,${state.flowPulse * .7})`;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, radius * (1.05 + (1 - state.flowPulse) * .22), 0, Math.PI * 2);
    context.stroke();
    state.flowPulse *= 0.965;
  }
  state.animationFrame = requestAnimationFrame(draw);
}

function setAnimationEnabled(enabled, persist = true) {
  state.animationEnabled = Boolean(enabled);
  ui.visualToggle.checked = state.animationEnabled;
  ui.visualStage.classList.toggle('animation-disabled', !state.animationEnabled);
  document.body.classList.toggle('lofi-animation-off', !state.animationEnabled);
  if (state.animationEnabled) {
    state.engine?.enableAnalyser();
    if (!state.animationFrame) state.animationFrame = requestAnimationFrame(draw);
  } else {
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = 0;
    state.transactionVisuals = [];
    state.flowPulse = 0;
    state.engine?.disableAnalyser();
  }
  if (persist) saveSettings();
}

loadSettings();
const initialUrl = new URL(globalThis.location.href);
const requestedReplay = initialUrl.searchParams.get('block');
const initialReplayHash = normalizeReplayHash(requestedReplay);
const initialReplayHeight = normalizeReplayHeight(requestedReplay);
if (initialReplayHash || initialReplayHeight !== null) {
  if (initialReplayHash) {
    enterReplay(initialReplayHash, {updateUrl: false, engine: normalizeReplayEngine(initialUrl.searchParams.get('engine'))});
  } else {
    applyComposition(makeComposition());
    renderChain();
    enterReplay(initialReplayHeight, {updateUrl: true, engine: normalizeReplayEngine(initialUrl.searchParams.get('engine'))});
  }
} else {
  applyComposition(makeComposition());
  renderChain();
  if (requestedReplay) setReplayStatus('The block height or hash in this link is invalid.', true);
}
setAnimationEnabled(state.animationEnabled, false);
if (!state.replayMode && initialReplayHeight === null) loadSnapshot().catch(() => {});
connectLiveData();
state.blockPollTimer = setInterval(() => refreshBlockTip().catch(() => {}), 30000);

ui.play.addEventListener('click', togglePlayback);
ui.replayForm.addEventListener('submit', event => {
  event.preventDefault();
  enterReplay(ui.replayInput.value);
});
ui.returnLive.addEventListener('click', exitReplay);
ui.replayInput.addEventListener('input', () => {
  ui.replayInput.removeAttribute('aria-invalid');
  if (!state.replayMode) ui.replayStatus.textContent = '';
});
ui.volume.addEventListener('input', () => {
  const outputLevel = Math.min(1.25, Number(ui.volume.value) / 100 * (economyAudio ? 1.35 : 1));
  state.engine?.master.gain.rampTo(outputLevel, 0.08);
  saveSettings();
});
ui.visualToggle.addEventListener('change', () => setAnimationEnabled(ui.visualToggle.checked));
ui.helpTrigger?.addEventListener('click', () => {
  ui.helpDialog?.showModal();
  document.body.classList.add('lofi-help-open');
});
ui.helpTabs.forEach(tab => tab.addEventListener('click', () => {
  const activePanel = tab.dataset.helpPanel;
  ui.helpTabs.forEach(candidate => {
    const selected = candidate === tab;
    candidate.classList.toggle('active', selected);
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  });
  ui.helpPanels.forEach(panel => {
    panel.hidden = panel.id !== activePanel;
  });
}));
ui.helpClose?.addEventListener('click', () => ui.helpDialog?.close());
ui.helpDialog?.addEventListener('click', event => {
  if (event.target === ui.helpDialog) ui.helpDialog.close();
});
ui.helpDialog?.addEventListener('close', () => document.body.classList.remove('lofi-help-open'));
ui.helpDialog?.addEventListener('cancel', () => document.body.classList.remove('lofi-help-open'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) ui.transport.textContent = 'Playing in background';
  else if (!document.hidden) refreshBlockTip().catch(() => {});
});
globalThis.addEventListener('error', event => {
  const stack = String(event.error?.stack || '');
  const message = String(event.message || '');
  const toneClockFailure = String(event.filename || '').includes('Tone.js')
    && (stack.includes('getTicksAtTime') || (message.includes('undefined') && message.includes('time')));
  if (!toneClockFailure) return;
  event.preventDefault();
  console.warn('Tone.js audio clock stalled; rebuilding the 21FM scheduler.');
  recoverAudioScheduler();
});
globalThis.addEventListener('beforeunload', () => {
  clearTimeout(state.reconnectTimer);
  clearInterval(state.blockPollTimer);
  clearTimeout(state.detailTimer);
  clearTimeout(state.transitionTimer);
  clearTimeout(state.soundUpdateTimer);
  clearTimeout(state.visualRefreshTimer);
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.socket?.close();
  state.engine?.dispose();
});
globalThis.lucide?.createIcons();
