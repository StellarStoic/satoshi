import {fiatToBtc, detectPrices, stableDetections, containedBox, positive, cameraCrop, frameDifference, scannerSettings, hasScannerSettings} from './priceScannerModel.mjs';
import {ScannerRates} from './priceScannerRates.mjs';
import {drawScannerPhoto} from './priceScannerPhoto.mjs';

const $ = id => document.getElementById(id);
const video = $('scanner-video'), stage = $('scanner-stage'), overlays = $('scanner-overlays');
const canvas = document.createElement('canvas'), context = canvas.getContext('2d', {willReadFrequently: true});
const motionCanvas = document.createElement('canvas');
motionCanvas.width = 32; motionCanvas.height = 18;
const motionContext = motionCanvas.getContext('2d', {willReadFrequently: true});
let storage;
try { storage = localStorage; } catch {}
let currency = 'EUR';
try {
    const saved = storage?.getItem('priceScannerCurrency');
    if (/^[A-Z]{3}$/.test(saved) && saved !== 'BTC') currency = saved;
} catch {}
const settings = scannerSettings(storage);
let configured = hasScannerSettings(storage);
let unit = settings.unit, names = {}, worker, stream, running = false, run = 0, revision = 0;
let torch = false, detections = [], previous = [];
let detectedAt = 0, frame = {width: 1, height: 1}, motionFrame, animation, lastMotionAt = 0, ocrScript;
let zoom = settings.zoom, pinch, overlayLifetime = 4000, takingPhoto = false, photoUrl, logoReady = false;
const pointers = new Map();
const logo = new Image();
logo.onload = () => { logoReady = true; renderOverlays(); };
logo.src = 'android-chrome-192x192.png';
function saveSettings() {
    if (!configured) return;
    try {
        storage?.setItem('priceScannerCurrency', currency);
        storage?.setItem('priceScannerSettings', JSON.stringify({unit, zoom}));
    } catch {}
}

function icons() { globalThis.lucide?.createIcons(); }
function status(text) { $('scanner-status').textContent = text; }
function showError(text) { $('scanner-error').textContent = text; $('scanner-error').hidden = !text; }
function clearDetections() { detections = []; previous = []; overlays.replaceChildren(); $('scanner-count').textContent = ''; $('scanner-capture').disabled = running; }

const rates = new ScannerRates(updateRates, storage);
function updateRates() {
    const selected = currency;
    const supported = new Set(['EUR', 'USD', ...Object.keys(rates.fx?.rates || {}).filter(code => names[code] && !['BTC', 'XAU', 'XAG', 'XPD', 'XPT', 'XDR'].includes(code))]);
    supported.add(selected);
    const values = [...supported].sort();
    const signature = values.join(',') + Boolean(Object.keys(names).length);
    if ($('scanner-currency').dataset.options !== signature) {
        $('scanner-currencies').replaceChildren(...values.map(code => new Option(names[code] ? `${code} - ${names[code]}` : code, code)));
        if (document.activeElement !== $('scanner-currency')) $('scanner-currency').value = selected;
        $('scanner-currency').dataset.options = signature;
    }
    const quote = rates.snapshot(currency);
    if (!quote.usdPerBtc) $('scanner-rate').textContent = 'Waiting for a fresh BTC price from Sintra...';
    else if (!quote.fiatPerUsd) $('scanner-rate').textContent = `${currency} exchange rate unavailable. Refresh rates or choose another currency.`;
    else {
        const value = new Intl.NumberFormat('en', {style: 'currency', currency, maximumFractionDigits: 2}).format(quote.usdPerBtc * quote.fiatPerUsd);
        const age = quote.live && navigator.onLine !== false ? 'Live' : `Cached ${quote.age}s ago`;
        const fx = currency === 'USD' ? '' : ` · FX ${quote.fxDate || quote.fxSource || 'cached'}`;
        $('scanner-rate').textContent = `1 BTC = ${value} · ${age}${fx}`;
    }
    renderOverlays();
}

function btcLabel(value) {
    if (unit === 'sats') return value * 1e8 < 1 ? '<1 sat' : `${Math.round(value * 1e8).toLocaleString('en')} sats`;
    return value < 1e-8 ? '<0.00000001 BTC' : `${value.toLocaleString('en', {minimumFractionDigits: 8, maximumFractionDigits: 8})} BTC`;
}

function renderOverlays() {
    overlays.replaceChildren();
    $('scanner-capture').disabled = running;
    const quote = rates.snapshot(currency);
    if (!running || !quote.ready || performance.now() - detectedAt > overlayLifetime) { $('scanner-count').textContent = ''; return; }
    const viewport = {width: stage.clientWidth, height: stage.clientHeight};
    const occupied = [];
    for (const detection of detections) {
        const btc = fiatToBtc(detection.value, quote.usdPerBtc, quote.fiatPerUsd);
        if (!positive(btc)) continue;
        const box = containedBox(detection.bbox, frame, viewport);
        const label = btcLabel(btc);
        const width = Math.min(viewport.width - 16, Math.max(box.width + 16, label.length * 10 + 24));
        const height = Math.min(viewport.height - 48, Math.max(54, box.height + 12));
        const left = Math.max(8, Math.min(viewport.width - width - 8, box.left - 8));
        const top = Math.max(4, Math.min(viewport.height - height - 150, box.top - 6));
        if (occupied.some(old => left < old.left + old.width && left + width > old.left && top < old.top + old.height && top + height > old.top)) continue;
        occupied.push({left, top, width, height});
        const tag = document.createElement('div');
        tag.className = 'scanner-price';
        Object.assign(tag.style, {left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`});
        const number = document.createElement('strong'), original = document.createElement('small');
        number.textContent = label;
        original.textContent = new Intl.NumberFormat('en', {style: 'currency', currency}).format(detection.value);
        tag.append(number, original);
        overlays.append(tag);
    }
    $('scanner-count').textContent = occupied.length ? `${occupied.length} ${occupied.length === 1 ? 'price' : 'prices'}` : '';
    $('scanner-capture').disabled = !occupied.length || !logoReady || takingPhoto;
}

function drawCamera(target, width, height) {
    const crop = cameraCrop(video.videoWidth, video.videoHeight, {width: stage.clientWidth, height: stage.clientHeight}, zoom);
    target.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
}

function watchMotion(now) {
    if (!running) return;
    if (video.readyState >= 2 && now - lastMotionAt > 120) {
        drawCamera(motionContext, 32, 18);
        const pixels = motionContext.getImageData(0, 0, 32, 18).data;
        if (motionFrame) {
            if (frameDifference(pixels, motionFrame) > 32) { revision++; clearDetections(); }
        }
        motionFrame = pixels;
        lastMotionAt = now;
        if (now - detectedAt > overlayLifetime) { overlays.replaceChildren(); $('scanner-count').textContent = ''; $('scanner-capture').disabled = true; }
    }
    animation = requestAnimationFrame(watchMotion);
}

async function loadOcr() {
    if (!ocrScript) ocrScript = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/ocr/tesseract.min.js';
        script.onload = resolve;
        script.onerror = () => { script.remove(); ocrScript = null; reject(new Error('OCR download failed')); };
        document.head.append(script);
    });
    await ocrScript;
}

async function recognize(session) {
    let layout = '11';
    while (running && run === session && worker) {
        if (!video.videoWidth || video.readyState < 2) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
        const aspect = stage.clientWidth / stage.clientHeight;
        const width = Math.round(Math.min(1280, 1280 * aspect)), height = Math.round(width / aspect);
        canvas.width = width; canvas.height = height;
        drawCamera(context, width, height);
        if (layout === '6') {
            const image = context.getImageData(0, 0, width, height);
            for (let i = 0; i < image.data.length; i += 4) {
                const value = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114 < 140 ? 0 : 255;
                image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
            }
            context.putImageData(image, 0, 0);
        }
        const started = performance.now(), version = revision, selected = currency;
        const capturedMotion = motionFrame;
        try {
            const {data} = await worker.recognize(canvas, {}, {blocks: true, text: true});
            if (!running || session !== run) return;
            if (revision === version && currency === selected && frameDifference(capturedMotion, motionFrame) < 32) {
                const current = detectPrices(data.blocks, currency);
                detections = stableDetections(current, previous, width, height, true);
                previous = current;
                frame = {width, height};
                detectedAt = performance.now();
                overlayLifetime = Math.min(10000, Math.max(4000, (detectedAt - started) * 2 + 500));
                const quote = rates.snapshot(currency);
                status(current.length ? (!quote.ready ? 'Price detected; waiting for exchange rates' : detections.length ? 'Scanning' : 'Confirming price...') : 'No price detected');
                renderOverlays();
                // Retry a high-contrast block when sparse text misses an isolated price.
                const nextLayout = current.length ? layout : layout === '11' ? '6' : '11';
                if (nextLayout !== layout && worker) {
                    layout = nextLayout;
                    await worker.setParameters({tessedit_pageseg_mode: layout});
                }
            } else clearDetections();
        } catch {
            if (running && run === session) { stopCamera(); showError('Text recognition stopped. Start the camera to retry.'); }
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 180));
    }
}

function stopCamera() {
    running = false; run++; revision++;
    cancelAnimationFrame(animation);
    stream?.getTracks().forEach(track => track.stop());
    stream = null; video.srcObject = null;
    const oldWorker = worker; worker = null;
    oldWorker?.terminate().catch(() => {});
    motionFrame = null; clearDetections();
    $('scanner-idle').hidden = false;
    $('scanner-capture').setAttribute('aria-label', 'Start camera');
    $('scanner-capture').title = 'Start camera';
    $('scanner-torch').disabled = true;
    $('scanner-torch').setAttribute('aria-pressed', 'false');
    $('scanner-zoom-reset').disabled = true;
    $('scanner-stop').disabled = true;
    stage.classList.remove('is-running');
    pointers.clear(); pinch = null;
    torch = false;
    status('Camera off'); icons();
}

async function startCamera() {
    if (running) return;
    showError('');
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) { showError('Camera access requires HTTPS or localhost and a supported browser.'); return; }
    running = true;
    $('scanner-settings').close();
    $('scanner-stop').disabled = false;
    const session = ++run;
    $('scanner-capture').disabled = true;
    $('scanner-capture').setAttribute('aria-label', 'Take photo with Bitcoin prices');
    $('scanner-capture').title = 'Take photo with Bitcoin prices';
    icons(); status('Requesting camera...');
    try {
        const camera = await navigator.mediaDevices.getUserMedia({audio: false, video: {
            facingMode: {ideal: 'environment'},
            width: {ideal: 1280}, height: {ideal: 720}, frameRate: {ideal: 24, max: 30},
        }});
        if (!running || run !== session) { camera.getTracks().forEach(track => track.stop()); return; }
        stream = camera; video.srcObject = camera;
        await video.play();
        if (!running || run !== session) return;
        const track = camera.getVideoTracks()[0];
        track.addEventListener('ended', () => { if (run === session) { stopCamera(); showError('Camera disconnected.'); } });
        const capabilities = track.getCapabilities?.() || {};
        $('scanner-idle').hidden = true;
        $('scanner-torch').disabled = !capabilities.torch;
        stage.classList.add('is-running');
        $('scanner-zoom-reset').disabled = false;
        setZoom(zoom);
        animation = requestAnimationFrame(watchMotion);
        status('Loading recognition...');
        await loadOcr();
        if (!running || run !== session) return;
        const engine = await Tesseract.createWorker('eng', 1, {
            workerPath: new URL('vendor/ocr/worker.min.js', location.href).href,
            corePath: new URL('vendor/ocr/', location.href).href,
            langPath: new URL('vendor/ocr/', location.href).href,
            workerBlobURL: false,
            logger: message => { if (running && run === session && message.status !== 'recognizing text') status(`Loading recognition... ${Math.round((message.progress || 0) * 100)}%`); },
            errorHandler: () => { if (running && run === session) { stopCamera(); showError('Recognition could not load. Check your connection and retry.'); } },
        });
        if (!running || run !== session) { await engine.terminate(); return; }
        worker = engine;
        await worker.setParameters({tessedit_pageseg_mode: '11'});
        status('Scanning');
        recognize(session);
    } catch (error) {
        if (run !== session) return;
        stopCamera();
        const messages = {NotAllowedError: 'Camera permission was denied. Allow camera access in your browser settings.',
            NotFoundError: 'No camera was found on this device.', NotReadableError: 'The camera is busy or could not be opened.',
            OverconstrainedError: 'The selected camera is unavailable. Try starting again.'};
        showError(messages[error.name] || 'The scanner could not start. Check your connection and camera, then retry.');
    }
}

$('scanner-start').addEventListener('click', () => {
    selectCurrency();
    configured = true; saveSettings();
    $('scanner-settings-notice').hidden = true;
    $('scanner-settings').close();
    if (!running) status('Camera off');
});
$('scanner-stop').addEventListener('click', stopCamera);
$('scanner-settings-open').addEventListener('click', () => $('scanner-settings').showModal());
function selectCurrency() {
    const value = $('scanner-currency').value.trim().toUpperCase();
    const code = [...$('scanner-currencies').options].find(option => option.value === value || option.label.toUpperCase() === value || names[option.value]?.toUpperCase() === value)?.value;
    if (!code) return;
    currency = code;
    $('scanner-currency').value = code;
    try { storage?.setItem('priceScannerCurrency', currency); } catch {}
    saveSettings();
    revision++; clearDetections();
    if (!rates.snapshot(currency).fiatPerUsd) rates.refreshFx(true);
    updateRates();
}
$('scanner-currency').addEventListener('input', selectCurrency);
$('scanner-currency').addEventListener('change', selectCurrency);
$('scanner-currency').addEventListener('blur', () => { $('scanner-currency').value = currency; });
document.querySelectorAll('[name=scanner-unit]').forEach(input => {
    input.checked = input.value === unit;
    input.addEventListener('change', () => { unit = input.value; saveSettings(); renderOverlays(); });
});
$('scanner-refresh').addEventListener('click', () => { rates.refreshBtc(); rates.refreshFx(true); });
$('scanner-torch').addEventListener('click', async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({advanced: [{torch: !torch}]}); torch = !torch; $('scanner-torch').setAttribute('aria-pressed', String(torch)); }
    catch { showError('The camera could not change its torch setting.'); }
});
function setZoom(value) {
    zoom = Math.max(1, Math.min(4, value));
    video.style.transform = `scale(${zoom})`;
    $('scanner-zoom-reset').textContent = `${zoom.toFixed(1)}x`;
    saveSettings();
    revision++; clearDetections(); motionFrame = null;
}
const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};
stage.addEventListener('pointerdown', event => {
    if (!running || event.target.closest('button') || event.pointerType === 'mouse') return;
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.size === 2) pinch = {distance: distance(), zoom};
});
stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (pointers.size === 2 && pinch?.distance) setZoom(pinch.zoom * distance() / pinch.distance);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(name, event => {
    pointers.delete(event.pointerId); pinch = null;
});
$('scanner-zoom-reset').addEventListener('click', () => setZoom(1));
stage.addEventListener('keydown', event => {
    if (!running || !['+', '-', '=', '0'].includes(event.key)) return;
    event.preventDefault(); setZoom(event.key === '0' ? 1 : zoom + (event.key === '-' ? -0.25 : 0.25));
});
new ResizeObserver(() => { revision++; clearDetections(); }).observe(stage);
window.addEventListener('pagehide', () => { stopCamera(); rates.stop(); });
window.addEventListener('pageshow', () => { if (!document.hidden) rates.start(); });
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopCamera(); rates.stop(); } else rates.start();
});
window.addEventListener('online', () => { rates.refreshBtc(); rates.refreshFx(); });
window.addEventListener('offline', updateRates);
fetch('currencies.json').then(response => response.json()).then(data => { names = data.currencies; updateRates(); }).catch(() => {});
setZoom(zoom);
icons(); rates.start();

function releasePhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    $('scanner-photo-image').removeAttribute('src');
    $('scanner-photo-download').removeAttribute('href');
}
$('scanner-photo').addEventListener('close', releasePhoto);
$('scanner-capture').addEventListener('click', async () => {
    if (!running) {
        if (!configured) {
            $('scanner-settings-notice').hidden = false;
            $('scanner-settings').showModal();
            return;
        }
        startCamera();
        return;
    }
    renderOverlays();
    if ($('scanner-capture').disabled || video.readyState < 2) return;
    takingPhoto = true; $('scanner-capture').disabled = true;
    try {
        const viewport = {width: stage.clientWidth, height: stage.clientHeight};
        const labels = [...overlays.children].map(tag => ({
            left: parseFloat(tag.style.left), top: parseFloat(tag.style.top), width: parseFloat(tag.style.width), height: parseFloat(tag.style.height),
            btc: tag.querySelector('strong').textContent, fiat: tag.querySelector('small').textContent,
        }));
        const photo = document.createElement('canvas');
        drawScannerPhoto(photo, video, cameraCrop(video.videoWidth, video.videoHeight, viewport, zoom), viewport, labels, logo);
        const blob = await new Promise(resolve => photo.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Image export failed');
        releasePhoto(); photoUrl = URL.createObjectURL(blob);
        $('scanner-photo-image').src = photoUrl;
        $('scanner-photo-download').href = photoUrl;
        $('scanner-photo-download').download = `satoshi-si-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        if (!document.hidden && !$('scanner-photo').open) $('scanner-photo').showModal();
    } catch { showError('The photo could not be created. Please try again.'); }
    finally { takingPhoto = false; renderOverlays(); }
});
