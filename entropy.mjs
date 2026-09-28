import {analyzeBits, bip39Shape, bytesToBits, bytesToHex, diceEntropy, guessTime, textEntropy} from './entropyModel.mjs';

const state = {mode: 'secure', target: 128, bits: '', hex: '', flips: '', rolls: [], text: '', environment: {bits: '', hex: '', samples: 0, description: '', mixed: false}};
const grid = document.getElementById('bitGrid');
const meter = document.getElementById('entropyMeter');
const bitCount = document.getElementById('bitCount');
const quality = document.getElementById('qualityLabel');
const visualMode = document.getElementById('visualMode');
const recorded = document.getElementById('recordedStat');
const balance = document.getElementById('balanceStat');
const run = document.getElementById('runStat');
const guessing = document.getElementById('guessStat');
const output = document.getElementById('entropyOutput');
const hexOutput = document.getElementById('hexOutput');
const outputLabel = document.getElementById('outputLabel');
let cameraStream = null;
let audioStream = null;
let audioContext = null;
let audioFrame = 0;
let movementSamples = [];

function secureEntropy() {
  const bytes = new Uint8Array(state.target / 8);
  crypto.getRandomValues(bytes);
  state.bits = bytesToBits(bytes);
  state.hex = bytesToHex(bytes);
  render(true);
}

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {bits: bytesToBits(digest), hex: bytesToHex(digest), bytes: digest};
}

async function setEnvironmentalSample(bytes, description, samples) {
  const digest = await sha256(bytes);
  state.environment = {...digest, description, samples, mixed: false};
  document.getElementById('environmentStatus').textContent = `${description} captured locally. Its fingerprint is stable, but its true entropy is unknown.`;
  document.getElementById('mixEnvironment').disabled = false;
  render(true);
}

function diceTrace() {
  return state.rolls.map(value => (value - 1).toString(2).padStart(3, '0')).join('');
}

function textTrace() {
  return [...new TextEncoder().encode(state.text)].map(byte => byte.toString(2).padStart(8, '0')).join('').slice(0, 256);
}

function current() {
  if (state.mode === 'secure') return {bits: state.bits, credited: state.target, label: 'Cryptographic source', className: 'strong'};
  if (state.mode === 'coin') return {bits: state.flips, credited: state.flips.length, label: state.flips.length >= state.target ? 'Enough flips, if truly fair' : 'Learning source', className: 'learning'};
  if (state.mode === 'dice') return {bits: diceTrace(), credited: diceEntropy(state.rolls.length), label: 'Extraction still required', className: 'learning'};
  if (state.mode === 'text') return {bits: textTrace(), credited: Math.floor(textEntropy(state.text)), label: 'Human input is guessable', className: 'weak'};
  const environment = state.environment;
  return {bits: environment.bits, credited: environment.mixed ? 256 : 0, displayCount: environment.bits ? (environment.mixed ? '256 secure mixed bits' : '256-bit fingerprint · entropy unknown') : 'Waiting for a sample', label: environment.mixed ? 'Securely mixed' : 'Entropy unknown', className: environment.mixed ? 'strong' : 'weak'};
}

function renderBits(bits, fresh, cellCount) {
  const visible = bits.slice(-256);
  const cells = Array.from({length: cellCount}, (_, index) => {
    const cell = document.createElement('span');
    const bit = visible[index];
    cell.className = `entropy-bit${bit === '1' ? ' one' : bit === '0' ? ' zero' : ''}${fresh && bit !== undefined ? ' fresh' : ''}`;
    cell.style.setProperty('--i', index);
    cell.setAttribute('aria-hidden', 'true');
    return cell;
  });
  grid.replaceChildren(...cells);
}

function render(fresh = false) {
  const data = current();
  const analysis = analyzeBits(data.bits);
  const visualTarget = state.mode === 'environment' ? 256 : state.target;
  const credited = Math.min(data.credited, visualTarget);
  renderBits(data.bits, fresh, visualTarget);
  meter.style.width = `${credited / visualTarget * 100}%`;
  bitCount.textContent = data.displayCount || `${data.credited.toLocaleString()} / ${state.target} bits`;
  quality.textContent = data.label;
  quality.className = `quality ${data.className}`;
  visualMode.textContent = {secure: 'Secure device', coin: 'Coin flips', dice: 'Dice rolls', text: 'Typed text', environment: 'Environmental capture'}[state.mode];
  recorded.textContent = state.mode === 'dice' ? `${state.rolls.length} rolls ≈ ${data.credited} bits` : state.mode === 'text' ? `${state.text.length} characters` : state.mode === 'environment' ? (state.environment.description || 'No sample') : `${data.credited} bits`;
  balance.textContent = analysis.length ? `${Math.round(analysis.balance * 100)}% even` : 'Waiting';
  run.textContent = analysis.length ? `${analysis.longestRun} same bits` : 'Waiting';
  guessing.textContent = state.mode === 'environment' && !state.environment.mixed ? 'Cannot be known' : data.credited ? guessTime(data.credited) : 'Immediate';
  output.hidden = !['secure', 'environment'].includes(state.mode) || (state.mode === 'environment' && !state.environment.hex);
  outputLabel.textContent = state.mode === 'environment' ? (state.environment.mixed ? 'Mixed SHA-256 output' : 'Sample SHA-256 fingerprint') : 'Hexadecimal view';
  hexOutput.textContent = state.mode === 'environment' ? state.environment.hex : state.hex;
}

function setMode(mode) {
  if (state.mode === 'environment' && mode !== 'environment') stopSensors();
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.mode === mode)));
  document.querySelectorAll('[data-panel]').forEach(panel => {
    const active = panel.dataset.panel === mode;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  render();
}

function stopCamera() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  const video = document.getElementById('entropyCamera');
  video.srcObject = null;
  video.hidden = true;
  document.getElementById('captureEntropyFrame').hidden = true;
}

function stopSound() {
  cancelAnimationFrame(audioFrame);
  audioStream?.getTracks().forEach(track => track.stop());
  audioStream = null;
  audioContext?.close().catch(() => {});
  audioContext = null;
}

function stopSensors() {
  stopCamera();
  stopSound();
}

async function captureImage(source) {
  const canvas = document.getElementById('entropyImageCanvas');
  const width = source.videoWidth || source.width;
  const height = source.videoHeight || source.height;
  const scale = Math.min(1, 640 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const preview = document.getElementById('entropyImagePreview');
  preview.src = canvas.toDataURL('image/jpeg', .82);
  preview.hidden = false;
  await setEnvironmentalSample(pixels, `${canvas.width}×${canvas.height} image`, pixels.length / 4);
}

document.querySelectorAll('[data-sensor]').forEach(button => button.addEventListener('click', () => {
  const sensor = button.dataset.sensor;
  stopSensors();
  if (sensor === 'movement') resetMovement();
  document.querySelectorAll('[data-sensor]').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('[data-sensor-panel]').forEach(panel => { panel.hidden = panel.dataset.sensorPanel !== sensor; });
}));

document.getElementById('entropyImageInput').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    await captureImage(bitmap);
    bitmap.close();
  } catch {
    document.getElementById('environmentStatus').textContent = 'That image could not be read by this browser.';
  }
});

document.getElementById('startEntropyCamera').addEventListener('click', async () => {
  stopCamera();
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false});
    const video = document.getElementById('entropyCamera');
    video.srcObject = cameraStream;
    video.hidden = false;
    document.getElementById('captureEntropyFrame').hidden = false;
    document.getElementById('environmentStatus').textContent = 'Camera is local. Frame pixels leave memory after their fingerprint is made.';
  } catch {
    document.getElementById('environmentStatus').textContent = 'Camera permission was unavailable. You can upload an image instead.';
  }
});

document.getElementById('captureEntropyFrame').addEventListener('click', async () => {
  const video = document.getElementById('entropyCamera');
  if (video.readyState < 2) return;
  await captureImage(video);
  stopCamera();
});

const movementCanvas = document.getElementById('movementCanvas');
const movementContext = movementCanvas.getContext('2d');
function resetMovement() {
  movementSamples = [];
  movementContext.clearRect(0, 0, movementCanvas.width, movementCanvas.height);
  document.getElementById('movementStatus').textContent = 'Move your pointer inside the field';
  document.getElementById('finishMovement').disabled = true;
}
movementCanvas.addEventListener('pointermove', event => {
  if (movementSamples.length >= 512) return;
  const bounds = movementCanvas.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * movementCanvas.width;
  const y = (event.clientY - bounds.top) / bounds.height * movementCanvas.height;
  const previous = movementSamples.at(-1);
  const sample = {x: Math.round(x * 100), y: Math.round(y * 100), t: Math.round(performance.now() * 1000), p: Math.round((event.pressure || 0) * 1000)};
  movementSamples.push(sample);
  if (previous) {
    movementContext.strokeStyle = `rgba(242,169,0,${Math.min(.9, .22 + movementSamples.length / 700)})`;
    movementContext.lineWidth = 1.5;
    movementContext.beginPath();
    movementContext.moveTo(previous.x / 100, previous.y / 100);
    movementContext.lineTo(x, y);
    movementContext.stroke();
  }
  document.getElementById('movementStatus').textContent = `${movementSamples.length} movement samples`;
  document.getElementById('finishMovement').disabled = movementSamples.length < 24;
});
document.getElementById('finishMovement').addEventListener('click', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(movementSamples));
  await setEnvironmentalSample(bytes, `${movementSamples.length} movement samples`, movementSamples.length);
});

document.getElementById('captureSound').addEventListener('click', async event => {
  stopSound();
  const button = event.currentTarget;
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}, video: false});
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(audioStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = [];
    const waveform = new Uint8Array(analyser.frequencyBinCount);
    const canvas = document.getElementById('soundCanvas');
    const context = canvas.getContext('2d');
    const started = performance.now();
    button.disabled = true;
    document.getElementById('soundStatus').textContent = 'Listening locally…';
    const collect = async () => {
      analyser.getByteTimeDomainData(waveform);
      samples.push(waveform.slice());
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#f2a900';
      context.beginPath();
      waveform.forEach((value, index) => {
        const x = index / (waveform.length - 1) * canvas.width;
        const y = value / 255 * canvas.height;
        if (!index) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.stroke();
      if (performance.now() - started < 3000) { audioFrame = requestAnimationFrame(collect); return; }
      const combined = new Uint8Array(samples.length * waveform.length);
      samples.forEach((sample, index) => combined.set(sample, index * waveform.length));
      stopSound();
      button.disabled = false;
      document.getElementById('soundStatus').textContent = 'Audio discarded; only its SHA-256 fingerprint remains.';
      await setEnvironmentalSample(combined, `${samples.length} sound frames`, samples.length);
    };
    collect();
  } catch {
    button.disabled = false;
    document.getElementById('soundStatus').textContent = 'Microphone permission was unavailable.';
  }
});

document.getElementById('mixEnvironment').addEventListener('click', async () => {
  if (!state.environment.hex) return;
  const sample = Uint8Array.from(state.environment.hex.match(/.{2}/g).map(value => Number.parseInt(value, 16)));
  const secure = crypto.getRandomValues(new Uint8Array(32));
  const combined = new Uint8Array(sample.length + secure.length);
  combined.set(sample);
  combined.set(secure, sample.length);
  const digest = await sha256(combined);
  state.environment = {...state.environment, ...digest, mixed: true, description: `${state.environment.description} + secure device randomness`};
  document.getElementById('environmentStatus').textContent = 'The sample fingerprint was mixed with 256 secure device bits, then hashed. Security comes from the device randomness even if the sample was predictable.';
  render(true);
});

function updateShape() {
  const shape = bip39Shape(state.target);
  document.getElementById('shapeEntropy').textContent = shape.entropy;
  document.getElementById('shapeChecksum').textContent = shape.checksum;
  document.getElementById('shapeWords').textContent = shape.words;
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-bits]').forEach(button => button.addEventListener('click', () => {
  state.target = Number(button.dataset.bits);
  document.querySelectorAll('[data-bits]').forEach(item => item.classList.toggle('active', item === button));
  secureEntropy();
  updateShape();
}));
document.getElementById('generateEntropy').addEventListener('click', secureEntropy);
document.querySelectorAll('[data-flip]').forEach(button => button.addEventListener('click', () => {
  if (state.flips.length < 256) state.flips += button.dataset.flip;
  render(true);
}));
document.querySelectorAll('[data-roll]').forEach(button => button.addEventListener('click', () => {
  if (state.rolls.length < 100) state.rolls.push(Number(button.dataset.roll));
  render(true);
}));
document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.reset === 'coin') state.flips = '';
  if (button.dataset.reset === 'dice') state.rolls = [];
  render();
}));
document.getElementById('entropyText').addEventListener('input', event => {
  state.text = event.target.value;
  render();
});
document.addEventListener('keydown', event => {
  if (state.mode === 'coin' && !event.metaKey && !event.ctrlKey && /^[ht]$/i.test(event.key)) {
    state.flips += event.key.toLowerCase() === 'h' ? '0' : '1';
    state.flips = state.flips.slice(0, 256);
    render(true);
  }
  if (state.mode === 'dice' && /^[1-6]$/.test(event.key)) {
    state.rolls.push(Number(event.key));
    state.rolls = state.rolls.slice(0, 100);
    render(true);
  }
});

const guessSlider = document.getElementById('guessBits');
function renderGuessing() {
  const bits = Number(guessSlider.value);
  document.getElementById('guessBitsOutput').textContent = `${bits} bits`;
  document.getElementById('possibilityCount').textContent = `2^${bits} ≈ 10^${Math.floor(bits * Math.log10(2))}`;
  document.getElementById('guessTime').textContent = guessTime(bits);
}
guessSlider.addEventListener('input', renderGuessing);

secureEntropy();
updateShape();
renderGuessing();
window.lucide?.createIcons();
