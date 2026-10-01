import {compositionFromBlock, fallbackChainState, flowFromTransactions, foldTransactionIds, latestBlockFromFrame, mempoolToSound, summarizeTransactions} from './lofiModel.mjs';

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
  latestType: document.getElementById('latestTxType'),
  latestDetail: document.getElementById('latestTxDetail'),
  harmony: document.getElementById('harmonyVoice'),
  lead: document.getElementById('leadVoice'),
  bass: document.getElementById('bassVoice'),
  drums: document.getElementById('drumVoice'),
  effects: document.getElementById('effectVoice'),
  transition: document.getElementById('blockTransition'),
  canvas: document.getElementById('lofiCanvas'),
  visualStage: document.getElementById('visualStage'),
  visualToggle: document.getElementById('visualToggle'),
};

const STORE_KEY = 'blockLofiSettings';
const SETTINGS_VERSION = 2;
const ADJECTIVES = ['Dusty', 'Patient', 'Quiet', 'Amber', 'Late', 'Soft', 'Hidden', 'Slow'];
const NOUNS = ['Nonce', 'Window', 'Ledger', 'Signal', 'Coffee', 'Halving', 'Mempool', 'Lantern'];
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
};

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

function titleFor(composition) {
  const bytes = composition.visual;
  return `${ADJECTIVES[bytes[0] % ADJECTIVES.length]} ${NOUNS[bytes[1] % NOUNS.length]}`;
}

function makeComposition() {
  return compositionFromBlock(state.chain.hash, state.chain.height);
}

function showComposition(composition) {
  ui.track.textContent = titleFor(composition);
  ui.key.textContent = `${composition.session} · ${composition.texture} · ${composition.key}`;
  ui.height.textContent = state.chain.height ? state.chain.height.toLocaleString() : 'offline';
  ui.hash.textContent = `${state.chain.hash.slice(0, 6)}…${state.chain.hash.slice(-6)}`;
  if (ui.harmony) ui.harmony.textContent = economyAudio ? 'dusty electric keys' : composition.sound.chordName;
  if (ui.lead) ui.lead.textContent = economyAudio ? 'occasional soft accent' : composition.sound.leadName;
  if (ui.bass) ui.bass.textContent = economyAudio ? 'round bass' : composition.sound.bassName;
  if (ui.drums) ui.drums.textContent = economyAudio ? 'soft boom-bap kit' : composition.sound.drumName;
  if (ui.effects) ui.effects.textContent = economyAudio ? 'tape-dark mix' : `${composition.sound.space} + ${composition.sound.motion}`;
  applyNetworkSound();
}

function applyComposition(composition) {
  state.composition = composition;
  state.pendingComposition = null;
  state.flowSeed = composition.hash;
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
    prepareVoices(composition, flowFromTransactions(composition.hash, composition, state.transactionSummary));
    state.pendingComposition = composition;
    ui.transport.textContent = 'New block approaching';
    ui.transition?.classList.add('waiting');
  } else {
    applyComposition(composition);
  }
}

function prepareVoices(composition, flow) {
  if (!state.engine || !composition) return;
  state.engine.chordVoice(economyAudio ? composition.sound.chordVoice : flow?.chordVoice ?? composition.sound.chordVoice);
  state.engine.bassVoice(economyAudio ? composition.sound.bassVoice : flow?.bassVoice ?? composition.sound.bassVoice);
  state.engine.leadVoice(economyAudio ? composition.sound.leadVoice : flow?.leadVoice ?? composition.sound.leadVoice);
  state.engine.kickVoice(composition.sound.drumKit);
  state.engine.snareVoice(composition.sound.drumKit);
  state.engine.hatVoice(composition.sound.drumKit);
}

function beginBlockTransition(nextComposition) {
  if (!state.engine || state.transitioning || !nextComposition) return;
  state.transitioning = true;
  state.pendingComposition = null;
  const barSeconds = Math.max(2.8, 240 / Math.max(56, ToneApi.getTransport().bpm.value));
  const fadeOutSeconds = economyAudio ? .7 : barSeconds;
  const fadeInSeconds = economyAudio ? 1.4 : barSeconds * 2;
  const transitionFloor = economyAudio ? .58 : .12;
  const bus = state.engine.musicBus.gain;
  ui.transport.textContent = 'Blending into the new block';
  ui.transition?.classList.remove('waiting');
  ui.transition?.classList.add('active');
  ui.transition?.style.setProperty('--handover-time', `${fadeOutSeconds + fadeInSeconds}s`);
  bus.rampTo(transitionFloor, fadeOutSeconds);
  state.engine.filter.frequency.rampTo(720, fadeOutSeconds * .85);
  clearTimeout(state.transitionTimer);
  state.transitionTimer = setTimeout(() => {
    applyComposition(nextComposition);
    state.engine.step = 0;
    bus.rampTo(.82, fadeInSeconds);
    applyNetworkSound();
    state.transitionTimer = setTimeout(() => {
      state.transitioning = false;
      ui.transition?.classList.remove('active');
      ui.transport.textContent = state.chain.connected ? 'New block in the groove' : 'Offline groove';
      if (!economyAudio) state.engine.releaseUnusedVoices(state.composition, state.activeFlow);
    }, fadeInSeconds * 1000);
  }, fadeOutSeconds * 1000);
}

function formatWeight(vsize) {
  if (!vsize) return 'quiet';
  return `${(vsize / 1_000_000).toFixed(vsize >= 100_000_000 ? 0 : 1)} MvB`;
}

function renderChain() {
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
  ui.connection.classList.toggle('live', state.chain.connected);
  ui.connection.querySelector('span').textContent = state.chain.connected ? 'Live from mempool.space' : 'Offline composition';
}

function addTransactionVisuals(items) {
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
    });
  });
  state.transactionVisuals = state.transactionVisuals.slice(-visualProfile.maxParticles);
}

function ingestTransactions(txids, sequence = 0, summary = null) {
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
    const latest = summary.items[summary.items.length - 1];
    ui.latestType.textContent = `${latest.type}${latest.rbf ? ' · RBF' : ''}`;
    ui.latestDetail.textContent = `${Math.round(latest.vsize).toLocaleString()} vB · ${latest.feeRate.toFixed(latest.feeRate >= 10 ? 0 : 1)} sat/vB · ${latest.inputs} in → ${latest.outputs} out · ${formatBitcoinValue(latest.value)}`;
  } else if (state.animationEnabled) {
    addTransactionVisuals(valid.map(txid => ({
      txid,
      vsize: 180,
      feeRate: Math.max(1, state.chain.fee),
      type: 'Mixed',
      rbf: false,
      hasData: false,
    })));
  }
  state.pendingFlow = flowFromTransactions(state.flowSeed, state.pendingComposition || state.composition, summary || state.transactionSummary);
  prepareVoices(state.pendingComposition || state.composition, state.pendingFlow);
  state.transactionsSeen += incomingCount;
  state.flowPulse = Math.min(1, state.flowPulse + incomingCount / 24);
  state.flowWindow.push({time: Date.now(), count: incomingCount});
  if (state.playing) ui.transport.textContent = `${incomingCount.toLocaleString()} new transactions shaping the next bar`;
  renderChain();
}

function applyTransactionDetails(transactions) {
  const valid = Array.isArray(transactions) ? transactions.filter(transaction => /^[0-9a-f]{64}$/i.test(transaction?.txid)) : [];
  if (!valid.length) return;
  const summary = summarizeTransactions(valid);
  state.transactionSummary = summary;
  addTransactionVisuals(summary.items);
  const latest = summary.items[summary.items.length - 1];
  ui.latestType.textContent = `${latest.type}${latest.rbf ? ' · RBF' : ''}`;
  ui.latestDetail.textContent = `${Math.round(latest.vsize).toLocaleString()} vB · ${latest.feeRate.toFixed(latest.feeRate >= 10 ? 0 : 1)} sat/vB · ${latest.inputs} in → ${latest.outputs} out · ${formatBitcoinValue(latest.value)}`;
  state.pendingFlow = flowFromTransactions(state.flowSeed, state.pendingComposition || state.composition, summary);
  prepareVoices(state.pendingComposition || state.composition, state.pendingFlow);
  renderChain();
}

function drainTransactionDetails() {
  if (state.detailBusy || !state.detailQueue.length) return;
  const sampleInterval = economyAudio ? 10000 : 1800;
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

function formatBitcoinValue(sats) {
  if (!sats) return '0 sats';
  if (sats < 100000) return `${Math.round(sats).toLocaleString()} sats`;
  return `${(sats / 100000000).toFixed(sats >= 10000000 ? 2 : 4)} BTC`;
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
  const mapped = mempoolToSound(state.chain);
  const influence = 1;
  const bpm = state.composition.bpm + mapped.tempoLift * influence;
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
  ToneApi.getTransport().bpm.rampTo(bpm, 2);
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
  const phaser = economyAudio ? bypass(reverb, ['wet']) : new ToneApi.Phaser({frequency: .08, octaves: 2, baseFrequency: 420, wet: 0}).connect(reverb);
  const tremolo = economyAudio ? bypass(phaser, ['wet']) : new ToneApi.Tremolo({frequency: 1.6, depth: .28, wet: 0}).connect(phaser).start();
  const distortion = economyAudio ? bypass(tremolo, ['wet']) : new ToneApi.Distortion({distortion: .12, oversample: '2x', wet: .04}).connect(tremolo);
  const filter = new ToneApi.Filter(economyAudio ? 1250 : 1800, 'lowpass').connect(distortion);
  if (economyAudio) {
    filter.channelCount = 2;
    filter.channelCountMode = 'explicit';
  }
  const musicBus = new ToneApi.Gain(0.82).connect(filter);
  const analyser = state.animationEnabled ? new ToneApi.Analyser('waveform', lowPower ? 64 : 128) : null;
  if (analyser) musicBus.connect(analyser);

  const harmonyGain = new ToneApi.Gain(economyAudio ? .56 : 1).connect(musicBus);
  const bassGain = new ToneApi.Gain(economyAudio ? 1.35 : 1).connect(musicBus);
  const melodyGain = new ToneApi.Gain(economyAudio ? .18 : 1).connect(musicBus);
  const drumsGain = new ToneApi.Gain(economyAudio ? 1.55 : 1).connect(musicBus);
  const dustGain = new ToneApi.Gain(ToneApi.dbToGain(economyAudio ? -52 : -39)).connect(musicBus);
  const delay = new ToneApi.FeedbackDelay('8n.', economyAudio ? .1 : .23).connect(melodyGain);
  delay.wet.value = economyAudio ? .035 : .12;
  const chorus = economyAudio ? bypass(harmonyGain) : new ToneApi.Chorus(1.2, 2.6, 0.18).connect(harmonyGain).start();
  if (economyAudio) chorus.depth = 0;

  const makeChordVoice = index => {
    if (economyAudio) {
      return new ToneApi.PolySynth(ToneApi.Synth, {
        maxPolyphony: 4,
        oscillator: {type: 'triangle8'},
        envelope: {attack: .045, decay: .72, sustain: .045, release: .65},
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
    ];
    return new ToneApi.PolySynth(...profiles[index]).connect(chorus);
  };
  const makeBassVoice = index => {
    if (economyAudio) {
      return new ToneApi.Synth({
        oscillator: {type: 'sine2'},
        envelope: {attack: .025, decay: .3, sustain: .48, release: .58},
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
    ];
    return factories[index]().connect(bassGain);
  };
  const makeLeadVoice = index => {
    if (economyAudio) {
      return new ToneApi.Synth({
        oscillator: {type: 'sine'},
        envelope: {attack: .14, decay: .42, sustain: .05, release: .9},
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
    ];
    return factories[index]().connect(delay);
  };
  const makeKickVoice = index => [
    {pitchDecay: .06, octaves: 5, envelope: {attack: .002, decay: .34, sustain: 0, release: .32}, volume: -11},
    {pitchDecay: .025, octaves: 3, envelope: {attack: .001, decay: .13, sustain: 0, release: .16}, volume: -9},
    {pitchDecay: .08, octaves: 2.5, envelope: {attack: .008, decay: .25, sustain: 0, release: .42}, volume: -14},
    {pitchDecay: .045, octaves: 3.6, envelope: {attack: .006, decay: .22, sustain: 0, release: .26}, volume: -13},
    {pitchDecay: .018, octaves: 6, envelope: {attack: .001, decay: .11, sustain: 0, release: .12}, volume: -15},
  ][index];
  const makeSnareVoice = index => [
    {noise: {type: 'pink'}, envelope: {attack: .003, decay: .13, sustain: 0}, volume: -18},
    {noise: {type: 'white'}, envelope: {attack: .001, decay: .075, sustain: 0}, volume: -23},
    {noise: {type: 'brown'}, envelope: {attack: .008, decay: .19, sustain: 0}, volume: -16},
    {noise: {type: 'pink'}, envelope: {attack: .012, decay: .27, sustain: 0}, volume: -22},
    {noise: {type: 'white'}, envelope: {attack: .001, decay: .045, sustain: 0}, volume: -25},
  ][index];
  const makeHatVoice = index => [
    {frequency: 190, envelope: {attack: .001, decay: .045, release: .02}, harmonicity: 4.8, modulationIndex: 18, resonance: 2800, octaves: 1.2, volume: -28},
    {frequency: 135, envelope: {attack: .002, decay: .075, release: .025}, harmonicity: 3.1, modulationIndex: 10, resonance: 1900, octaves: .7, volume: -30},
    {frequency: 245, envelope: {attack: .001, decay: .028, release: .012}, harmonicity: 5.4, modulationIndex: 24, resonance: 3900, octaves: 1.5, volume: -31},
    {frequency: 110, envelope: {attack: .006, decay: .12, release: .04}, harmonicity: 2.1, modulationIndex: 7, resonance: 1500, octaves: .6, volume: -31},
    {frequency: 310, envelope: {attack: .001, decay: .022, release: .01}, harmonicity: 6.2, modulationIndex: 28, resonance: 4600, octaves: 1.8, volume: -34},
  ][index];
  const dustFilter = economyAudio ? null : new ToneApi.Filter(1250, 'lowpass').connect(dustGain);
  const dust = economyAudio ? new ToneApi.Noise('pink').connect(dustGain).start() : new ToneApi.Noise('pink').connect(dustFilter).start();
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
    master, filter, musicBus, analyser, delay, compressor, widener, reverb, phaser, tremolo, distortion,
    chordVoices: Array(6),
    bassVoices: Array(6),
    leadVoices: Array(8),
    kickVoices: Array(5),
    snareVoices: Array(5),
    hatVoices: Array(5),
    chorus, dust, dustFilter,
    dustGain,
    layerGains: {harmony: harmonyGain, bass: bassGain, melody: melodyGain, drums: drumsGain, dust: dustGain},
    step: 0,
    percussionChance: 0.1,
    enableAnalyser() {
      if (this.analyser) return;
      this.analyser = new ToneApi.Analyser('waveform', lowPower ? 64 : 128);
      this.musicBus.connect(this.analyser);
    },
    disableAnalyser() {
      if (!this.analyser) return;
      this.analyser.dispose();
      this.analyser = null;
    },
    chordVoice(index) { return this.chordVoices[index] ||= makeChordVoice(index); },
    bassVoice(index) { return this.bassVoices[index] ||= makeBassVoice(index); },
    leadVoice(index) { return this.leadVoices[index] ||= makeLeadVoice(index); },
    kickVoice(index) {
      return this.kickVoices[index] ||= new ToneApi.MembraneSynth(economyAudio
        ? {pitchDecay: .055, octaves: 2.5, envelope: {attack: .004, decay: .3, sustain: 0, release: .27}, volume: -4}
        : makeKickVoice(index)).connect(drumsGain);
    },
    snareVoice(index) {
      return this.snareVoices[index] ||= new ToneApi.NoiseSynth(economyAudio
        ? {noise: {type: 'pink'}, envelope: {attack: .008, decay: .16, sustain: 0}, volume: -13}
        : makeSnareVoice(index)).connect(drumsGain);
    },
    hatVoice(index) {
      return this.hatVoices[index] ||= economyAudio
        ? new ToneApi.NoiseSynth({noise: {type: 'brown'}, envelope: {attack: .004, decay: .035, sustain: 0}, volume: -24}).connect(drumsGain)
        : new ToneApi.MetalSynth(makeHatVoice(index)).connect(drumsGain);
    },
    releaseUnusedVoices(composition, flow) {
      const keep = {
        chord: economyAudio ? composition.sound.chordVoice : flow?.chordVoice ?? composition.sound.chordVoice,
        bass: economyAudio ? composition.sound.bassVoice : flow?.bassVoice ?? composition.sound.bassVoice,
        lead: economyAudio ? composition.sound.leadVoice : flow?.leadVoice ?? composition.sound.leadVoice,
        drums: composition.sound.drumKit,
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
    },
    dispose() {
      this.loop?.dispose();
      [...this.chordVoices, ...this.bassVoices, ...this.leadVoices, ...this.kickVoices, ...this.snareVoices, ...this.hatVoices]
        .filter(Boolean).forEach(voice => voice.dispose());
      [this.dust, this.dustFilter, this.delay, this.chorus, this.filter, this.distortion, this.tremolo, this.phaser, this.reverb, this.widener, this.compressor, this.limiter, this.analyser, this.musicBus, bassGain]
        .filter(Boolean).forEach(node => { try { node.dispose(); } catch {} });
    },
  };

  engine.loop = new ToneApi.Loop(time => {
    if (!state.composition) return;
    let step = engine.step % 64;
    let sixteenth = step % 16;
    let bar = Math.floor(step / 16);
    if (sixteenth === 0 && state.pendingComposition && !state.transitioning) {
      const nextComposition = state.pendingComposition;
      ToneApi.Draw.schedule(() => beginBlockTransition(nextComposition), time);
    }
    if (sixteenth === 0 && state.pendingFlow) {
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
    if (arrangement.harmony && rhythm.chord[step]) {
      const chord = economyAudio
        ? composition.chords[bar].slice(0, 3).map((note, index) => transposeNote(note, index === 0 ? -12 : 0))
        : invertChord(composition.chords[bar], flow.chordInversions[bar]);
      const chordVoice = engine.chordVoice(economyAudio ? composition.sound.chordVoice : flow.chordVoice ?? composition.sound.chordVoice);
      const chordVelocity = Math.min(.72, composition.sound.chordVelocity * (flow.chordWeight || 1));
      chordVoice.triggerAttackRelease(chord, economyAudio ? '4n' : rhythm.chordDuration, safeTriggerTime(chordVoice, time), economyAudio ? chordVelocity * .82 : chordVelocity);
    }
    if (arrangement.bass && (rhythm.bass[step] || (sixteenth === 14 && flow.bassPickup))) {
      const bassBar = sixteenth === 14 ? (bar + 1) % 4 : bar;
      const bassVoice = engine.bassVoice(economyAudio ? composition.sound.bassVoice : flow.bassVoice ?? composition.sound.bassVoice);
      bassVoice.triggerAttackRelease(composition.bass[bassBar], sixteenth % 4 === 0 ? '4n' : '8n', safeTriggerTime(bassVoice, time), sixteenth === 14 ? .3 : .54);
    }
    const drumsActive = economyAudio || arrangement.drums;
    const transactionKick = !economyAudio && flow.rhythmicDetail > .32 && flow.extraKicks.includes(sixteenth);
    const transactionSnare = !economyAudio && flow.rhythmicDetail > .58 && flow.extraSnares.includes(sixteenth);
    if (drumsActive && (rhythm.kick[step] || transactionKick)) kick.triggerAttackRelease(economyAudio ? 'C1' : composition.sound.kickNote, '8n', safeTriggerTime(kick, time), transactionKick ? .34 : flow.kickVelocity || 0.68);
    if (drumsActive && (rhythm.snare[step] || transactionSnare)) snare.triggerAttackRelease(transactionSnare ? '32n' : '16n', safeTriggerTime(snare, time), transactionSnare ? .15 : economyAudio ? .68 : sixteenth === 12 ? 0.42 : 0.5);
    if (drumsActive && !economyAudio && !rhythm.snare[step] && !transactionSnare && sixteenth % 4 === 3 && flow.rhythmicDetail > .72) snare.triggerAttackRelease('32n', safeTriggerTime(snare, time), 0.12);
    const hatOffset = economyAudio ? 0 : flow.hatOffset;
    const hatHit = rhythm.hat[(step + hatOffset) % 64];
    if (hatHit) {
      const hatVelocity = economyAudio ? (sixteenth % 4 === 2 ? .28 : .2) : .1;
      hat.triggerAttackRelease('32n', safeTriggerTime(hat, time), hatVelocity);
    }
    if (!economyAudio && !hatHit && flow.rhythmicDetail > .48 && sixteenth % 4 === 3) hat.triggerAttackRelease('32n', safeTriggerTime(hat, time), 0.055 + flow.rhythmicDetail * .04);
    const accentStep = 48 + (composition.visual[3] % 12);
    const melodyHit = economyAudio ? step === accentStep : rhythm.melody[step];
    if ((economyAudio || arrangement.melody) && melodyHit) {
      const phraseIndex = step % flow.phrase.length;
      const baseNote = composition.melody[step % composition.melody.length];
      const sourceNote = economyAudio ? composition.palette[7 + (composition.visual[4] % 7)] : bar % 3 === 0 ? baseNote : flow.phrase[phraseIndex];
      const transpose = economyAudio ? -12 : flow.melodyTranspose;
      const note = transposeNote(sourceNote, transpose);
      const velocity = economyAudio ? .075 : flow.velocities[phraseIndex] ?? composition.sound.melodyVelocity;
      if (note) {
        const leadVoice = engine.leadVoice(economyAudio ? composition.sound.leadVoice : flow.leadVoice ?? composition.sound.leadVoice);
        leadVoice.triggerAttackRelease(note, economyAudio ? '8n' : flow.noteLength || (sixteenth % 4 ? '16n' : '8n'), safeTriggerTime(leadVoice, time), velocity);
      }
    }
    ToneApi.Draw.schedule(() => {
      state.visualStep = step;
    }, time);
    engine.step = (step + 1) % 64;
  }, '16n').start(0);

  return engine;
}

async function warmEngine(engine) {
  const flow = state.activeFlow;
  const constructors = [
    () => engine.chordVoice(flow?.chordVoice ?? state.composition.sound.chordVoice),
    () => engine.bassVoice(flow?.bassVoice ?? state.composition.sound.bassVoice),
    () => engine.leadVoice(flow?.leadVoice ?? state.composition.sound.leadVoice),
    () => engine.kickVoice(state.composition.sound.drumKit),
    () => engine.snareVoice(state.composition.sound.drumKit),
    () => engine.hatVoice(state.composition.sound.drumKit),
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
      applyNetworkSound();
      ui.play.disabled = false;
      ui.play.classList.remove('loading');
    }
    const transport = ToneApi.getTransport();
    if (state.playing) {
      transport.pause();
      state.playing = false;
      ui.transport.textContent = 'Paused';
      ui.play.setAttribute('aria-label', 'Play Block Lo-Fi');
      ui.play.innerHTML = '<i data-lucide="play"></i>';
    } else {
      transport.start();
      state.playing = true;
      ui.transport.textContent = state.chain.connected ? 'Chain in the groove' : 'Offline groove';
      ui.play.setAttribute('aria-label', 'Pause Block Lo-Fi');
      ui.play.innerHTML = '<i data-lucide="pause"></i>';
    }
    globalThis.lucide?.createIcons();
  } catch (error) {
    console.error('Could not start Block Lo-Fi:', error);
    try { ToneApi.getTransport().stop(); } catch {}
    state.engine?.dispose();
    state.engine = null;
    state.playing = false;
    ui.transport.textContent = 'Audio could not start';
    ui.play.disabled = false;
    ui.play.classList.remove('loading');
    ui.play.setAttribute('aria-label', 'Play Block Lo-Fi');
    ui.play.innerHTML = '<i data-lucide="play"></i>';
    globalThis.lucide?.createIcons();
  }
}

function updateChain(patch) {
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
  const [heightText, hash] = await Promise.all([
    getText('https://mempool.space/api/blocks/tip/height'),
    getText('https://mempool.space/api/blocks/tip/hash'),
  ]);
  const height = Number(heightText);
  if (!Number.isInteger(height) || !/^[0-9a-f]{64}$/i.test(hash)) return;
  updateChain({height, hash, connected: true});
}

async function loadSnapshot() {
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
  if (!latest && !feeData && !mempoolData) return;
  updateChain({
    height: latest?.height ?? state.chain.height,
    hash: latest?.id ?? state.chain.hash,
    fee: feeData?.halfHourFee ?? state.chain.fee,
    vsize: mempoolData?.vsize ?? state.chain.vsize,
    count: mempoolData?.count ?? state.chain.count,
    projectedBlocks: Array.isArray(projectedData) ? projectedData.length : state.chain.projectedBlocks,
    connected: true,
  });
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
    const eased = 1 - Math.pow(1 - progress, 2.4);
    const entryAngle = transaction.entryAngle ?? transaction.lane * Math.PI * 2;
    const edgeDistance = Math.hypot(width, height) * .72 + 40;
    const startX = cx + Math.cos(entryAngle) * edgeDistance;
    const startY = cy + Math.sin(entryAngle) * edgeDistance;
    const targetAngle = transaction.lane * Math.PI * 2;
    const targetX = cx + Math.cos(targetAngle) * radius * .78;
    const targetY = cy + Math.sin(targetAngle) * radius * .78;
    const curveDistance = Math.min(width, height) * (.18 + Math.abs(transaction.bend) * .13);
    const controlAngle = entryAngle + (transaction.orbit || 1) * (Math.PI * .48 + transaction.bend * .34);
    const controlX = cx + Math.cos(controlAngle) * (radius + curveDistance);
    const controlY = cy + Math.sin(controlAngle) * (radius + curveDistance);
    const inverse = 1 - eased;
    const x = inverse * inverse * startX + 2 * inverse * eased * controlX + eased * eased * targetX;
    const y = inverse * inverse * startY + 2 * inverse * eased * controlY + eased * eased * targetY;
    const arrival = progress < 1 ? 1 : Math.max(0, 1 - (elapsed - duration) / 1100);
    const particleRadius = Math.min(22, 3 + Math.sqrt(Math.min(100000, transaction.vsize)) / 8);
    const color = TRANSACTION_COLORS[transaction.type] || TRANSACTION_COLORS.Mixed;
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
  context.fillStyle = '#f2a900';
  context.beginPath();
  context.arc(0, 0, Math.max(5, radius * .035), 0, Math.PI * 2);
  context.fill();
  context.restore();

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
applyComposition(makeComposition());
renderChain();
setAnimationEnabled(state.animationEnabled, false);
loadSnapshot().catch(() => {});
connectLiveData();
state.blockPollTimer = setInterval(() => refreshBlockTip().catch(() => {}), 30000);

ui.play.addEventListener('click', togglePlayback);
ui.volume.addEventListener('input', () => {
  const outputLevel = Math.min(1.25, Number(ui.volume.value) / 100 * (economyAudio ? 1.35 : 1));
  state.engine?.master.gain.rampTo(outputLevel, 0.08);
  saveSettings();
});
ui.visualToggle.addEventListener('change', () => setAnimationEnabled(ui.visualToggle.checked));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) ui.transport.textContent = 'Playing in background';
  else if (!document.hidden) refreshBlockTip().catch(() => {});
});
globalThis.addEventListener('beforeunload', () => {
  clearTimeout(state.reconnectTimer);
  clearInterval(state.blockPollTimer);
  clearTimeout(state.detailTimer);
  clearTimeout(state.transitionTimer);
  clearTimeout(state.soundUpdateTimer);
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.socket?.close();
  state.engine?.dispose();
});
globalThis.lucide?.createIcons();
