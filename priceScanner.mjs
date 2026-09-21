import {fiatToBtc, detectPrices, stableDetections, containedBox, positive, cameraCrop, scannerSettings, hasScannerSettings} from './priceScannerModel.mjs';
import {ScannerRates} from './priceScannerRates.mjs';
import {drawScannerPhoto} from './priceScannerPhoto.mjs';
import './vendor/jsfeat/jsfeat-min.js';
import {PriceTracker} from './priceScannerTracking.mjs';

const $ = id => document.getElementById(id);
const video = $('scanner-video'), stage = $('scanner-stage'), overlays = $('scanner-overlays');
const canvas = document.createElement('canvas'), context = canvas.getContext('2d', {willReadFrequently: true});
const motionCanvas = document.createElement('canvas');
motionCanvas.width = 32; motionCanvas.height = 18;
const motionContext = motionCanvas.getContext('2d', {willReadFrequently: true});
const tracker = new PriceTracker(globalThis.jsfeat);
function syncScannerViewport() {
    const viewport = window.visualViewport;
    if (viewport && viewport.scale !== 1) return;
    const height = Math.min(window.innerHeight, viewport?.height || window.innerHeight);
    document.documentElement.style.setProperty('--scanner-viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--scanner-viewport-top', `${viewport?.offsetTop || 0}px`);
}
syncScannerViewport();
window.addEventListener('resize', syncScannerViewport);
window.addEventListener('pageshow', syncScannerViewport);
window.visualViewport?.addEventListener('resize', syncScannerViewport);
window.visualViewport?.addEventListener('scroll', syncScannerViewport);
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
let detectedAt = 0, animation, lastMotionAt = 0, ocrScript;
let enginePromise, engineGeneration = 0, activeOcrJob, preloadTimer;
let lastVideoTime = -1;
let zoom = settings.zoom, pinch, overlayLifetime = 4000, takingPhoto = false, photoUrl, photoFile, logoReady = false;
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
function clearDetections() { detections = []; previous = []; tracker.reset(); lastVideoTime = -1; overlays.replaceChildren(); $('scanner-count').textContent = ''; $('scanner-capture').disabled = running; }

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
    if (!running || performance.now() - detectedAt > overlayLifetime) { $('scanner-count').textContent = ''; return; }
    const viewport = {width: stage.clientWidth, height: stage.clientHeight};
    const occupied = [];
    for (const detection of detections) {
        const quote = rates.snapshot(detection.currency || currency);
        if (!quote.ready) continue;
        const btc = fiatToBtc(detection.value, quote.usdPerBtc, quote.fiatPerUsd);
        if (!positive(btc)) continue;
        const tracked = tracker.project(detection.anchor);
        if (!tracked) continue;
        const scaleX = viewport.width / tracker.width, scaleY = viewport.height / tracker.height;
        const box = containedBox(detection.anchor.bbox, {width: tracker.width, height: tracker.height}, viewport);
        const label = btcLabel(btc);
        const width = Math.min(viewport.width - 16, Math.max(box.width + 16, label.length * 10 + 24));
        const height = Math.min(viewport.height - 48, Math.max(54, box.height + 12));
        const left = box.left - 8, top = box.top - 6;
        const [a, b, c, d, e, f] = tracked.pose;
        const matrix = [a, b * scaleY / scaleX, c * scaleX / scaleY, d, e * scaleX, f * scaleY];
        const corners = [[left, top], [left + width, top], [left + width, top + height], [left, top + height]].map(([x, y]) => ({x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5]}));
        const bounds = {left: Math.min(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)), right: Math.max(...corners.map(p => p.x)), bottom: Math.max(...corners.map(p => p.y))};
        if (bounds.left < 0 || bounds.top < 0 || bounds.right > viewport.width || bounds.bottom > viewport.height) continue;
        if (occupied.some(old => bounds.left < old.right && bounds.right > old.left && bounds.top < old.bottom && bounds.bottom > old.top)) continue;
        occupied.push(bounds);
        const tag = document.createElement('div');
        tag.className = 'scanner-price';
        const transform = [...matrix.slice(0, 4), matrix[0] * left + matrix[2] * top + matrix[4], matrix[1] * left + matrix[3] * top + matrix[5]];
        Object.assign(tag.style, {left: '0px', top: '0px', width: `${width}px`, height: `${height}px`, transformOrigin: '0 0', transform: `matrix(${transform.join(',')})`});
        tag.dataset.matrix = JSON.stringify(transform);
        const number = document.createElement('strong'), original = document.createElement('small');
        number.textContent = label;
        original.textContent = new Intl.NumberFormat('en', {style: 'currency', currency: detection.currency || currency}).format(detection.value);
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

function updateTracking() {
    if (!running || video.readyState < 2 || video.currentTime === lastVideoTime) return false;
    lastVideoTime = video.currentTime;
    const ratio = stage.clientWidth / stage.clientHeight;
    const width = Math.round(Math.min(480, 480 * ratio)), height = Math.round(width / ratio);
    if (motionCanvas.width !== width || motionCanvas.height !== height) { motionCanvas.width = width; motionCanvas.height = height; }
    drawCamera(motionContext, width, height);
    tracker.update(motionContext.getImageData(0, 0, width, height).data, width, height);
    return true;
}

function watchMotion(now) {
    if (!running) return;
    if (video.readyState >= 2 && now - lastMotionAt > 40) {
        if (updateTracking()) renderOverlays();
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

function disposeOcr() {
    engineGeneration++;
    enginePromise = null;
    const old = worker; worker = null;
    old?.terminate().catch(() => {});
    activeOcrJob = null;
}

function prepareOcr() {
    if (enginePromise) return enginePromise;
    const generation = engineGeneration;
    enginePromise = (async () => {
        await loadOcr();
        if (generation !== engineGeneration) throw new DOMException('Recognition cancelled', 'AbortError');
        const engine = await Tesseract.createWorker('eng', 1, {
            workerPath: new URL('vendor/ocr/worker.min.js', location.href).href,
            corePath: new URL('vendor/ocr/', location.href).href,
            langPath: new URL('vendor/ocr/', location.href).href,
            workerBlobURL: false,
            logger: message => { if (running && generation === engineGeneration && message.status !== 'recognizing text') status(`Loading recognition... ${Math.round((message.progress || 0) * 100)}%`); },
            errorHandler: () => {
                if (generation !== engineGeneration) return;
                disposeOcr();
                if (running) { stopCamera(); showError('Recognition could not load. Check your connection and retry.'); }
            },
        });
        if (generation !== engineGeneration) { await engine.terminate(); throw new DOMException('Recognition cancelled', 'AbortError'); }
        worker = engine;
        await engine.setParameters({tessedit_pageseg_mode: '6'});
        return engine;
    })().catch(error => { if (generation === engineGeneration) disposeOcr(); throw error; });
    return enginePromise;
}

function warmRecognition() {
    clearTimeout(preloadTimer);
    if (!document.hidden && !navigator.connection?.saveData) {
        preloadTimer = setTimeout(() => prepareOcr().catch(() => {}), 0);
    }
}

function normalizedPriceCrop(box) {
    const x = Math.max(0, box.x0 - 3), y = Math.max(0, box.y0 - 3);
    const width = Math.min(canvas.width - x, box.x1 - x + 3), height = Math.min(canvas.height - y, box.y1 - y + 3);
    if (width < 8 || height < 12) return null;
    const pixels = context.getImageData(x, y, width, height).data;
    const runs = [];
    let run;
    // Separate glyph columns, then align smaller cents with the larger whole digits.
    for (let xx = 0; xx < width; xx++) {
        let top = height, bottom = -1;
        for (let yy = 0; yy < height; yy++) {
            const i = (yy * width + xx) * 4;
            if (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114 < 140) {
                top = Math.min(top, yy); bottom = yy;
            }
        }
        if (bottom >= 0) {
            if (!run) { run = {left: xx, right: xx, top, bottom}; runs.push(run); }
            run.right = xx; run.top = Math.min(run.top, top); run.bottom = Math.max(run.bottom, bottom);
        } else run = null;
    }
    if (runs.length < 2 || runs.length > 18) return null;
    const tallest = Math.max(...runs.map(part => part.bottom - part.top + 1));
    const glyphs = runs.filter(part => part.bottom - part.top > tallest * 0.4 && part.right - part.left > tallest * 0.12);
    if (!glyphs.some(part => part.bottom - part.top < tallest * 0.75)) return null;
    const output = document.createElement('canvas');
    const pieces = runs.map(part => {
        const h = part.bottom - part.top + 1, w = part.right - part.left + 1;
        const scale = glyphs.includes(part) ? 64 / h : 64 / tallest;
        return {...part, glyph: glyphs.includes(part), w, h, dw: Math.max(1, Math.round(w * scale)), dh: Math.round(h * scale)};
    });
    output.width = pieces.reduce((total, part) => total + part.dw + 5, 20);
    output.height = 96;
    const target = output.getContext('2d');
    target.fillStyle = 'white'; target.fillRect(0, 0, output.width, output.height);
    let left = 10;
    for (const part of pieces) {
        target.drawImage(canvas, x + part.left, y + part.top, part.w, part.h, left,
            part.glyph ? 76 - part.dh : 12 + part.top * 64 / tallest,
            part.dw, part.dh);
        left += part.dw + 5;
    }
    return output;
}

async function recognize(session) {
    let layout = '6';
    let misses = 0;
    while (running && run === session && worker) {
        if (!video.videoWidth || video.readyState < 2) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
        const aspect = stage.clientWidth / stage.clientHeight;
        const longest = misses >= 2 ? 1280 : 960;
        const width = Math.round(Math.min(longest, longest * aspect)), height = Math.round(width / aspect);
        canvas.width = width; canvas.height = height;
        drawCamera(context, width, height);
        updateTracking();
        const trackingSnapshot = tracker.snapshot();
        if (layout === '6') {
            const image = context.getImageData(0, 0, width, height);
            for (let i = 0; i < image.data.length; i += 4) {
                const value = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114 < 140 ? 0 : 255;
                image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
            }
            context.putImageData(image, 0, 0);
        }
        const started = performance.now(), version = revision, selected = currency;
        try {
            activeOcrJob = worker.recognize(canvas, {}, {blocks: true, text: true});
            const {data} = await activeOcrJob;
            if (!running || session !== run) return;
            if (revision === version && currency === selected) {
                let current = detectPrices(data.blocks, currency);
                const words = (data.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph =>
                    (paragraph.lines || []).flatMap(line => line.words || [])));
                const uncertain = words.filter(word => word.bbox && /\d/.test(word.text) && word.confidence < 80)
                    .sort((a, b) => (b.bbox.y1 - b.bbox.y0) - (a.bbox.y1 - a.bbox.y0))[0];
                const normalized = uncertain && normalizedPriceCrop(uncertain.bbox);
                if (normalized) {
                    await worker.setParameters({tessedit_pageseg_mode: '7'});
                    activeOcrJob = worker.recognize(normalized, {}, {blocks: true, text: true});
                    const retry = await activeOcrJob;
                    if (!running || session !== run) return;
                    await worker.setParameters({tessedit_pageseg_mode: layout});
                    if (revision !== version || currency !== selected) continue;
                    const recovered = detectPrices(retry.data.blocks, currency);
                    if (recovered.length === 1) {
                        const candidate = {...recovered[0], bbox: uncertain.bbox, size: uncertain.bbox.y1 - uncertain.bbox.y0};
                        current = [candidate, ...current.filter(price => price.bbox.x1 < candidate.bbox.x0 || price.bbox.x0 > candidate.bbox.x1 ||
                            price.bbox.y1 < candidate.bbox.y0 || price.bbox.y0 > candidate.bbox.y1)]
                            .sort((a, b) => b.size - a.size || b.confidence - a.confidence).slice(0, 6);
                    }
                }
                if (!current.length) misses++;
                const confirmed = stableDetections(current, previous, width, height, true);
                if (confirmed.length) {
                    detections = confirmed.map(detection => ({...detection, anchor: tracker.anchor(trackingSnapshot, detection.bbox, {width, height})}));
                    detectedAt = performance.now();
                    overlayLifetime = Math.min(10000, Math.max(4000, (detectedAt - started) * 2 + 500));
                }
                previous = current;
                const quote = rates.snapshot(current[0]?.currency || currency);
                status(current.length ? (!quote.ready ? 'Price detected; waiting for exchange rates' : detections.length ? 'Scanning' : 'Confirming price...') : 'No price detected');
                renderOverlays();
                // Alternate layouts even after a partial match: small cents can otherwise
                // trap recognition on a fragment while the larger whole amount is missed.
                const nextLayout = layout === '11' ? '6' : '11';
                if (nextLayout !== layout && worker) {
                    layout = nextLayout;
                    await worker.setParameters({tessedit_pageseg_mode: layout});
                }
            } else clearDetections();
        } catch {
            if (running && run === session) { stopCamera(); disposeOcr(); showError('Text recognition stopped. Start the camera to retry.'); }
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 80));
    }
}

function stopCamera() {
    running = false; run++; revision++;
    cancelAnimationFrame(animation);
    stream?.getTracks().forEach(track => track.stop());
    stream = null; video.srcObject = null;
    clearDetections();
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
    const engineReady = prepareOcr();
    engineReady.catch(() => {});
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
        await engineReady;
        await activeOcrJob?.catch(() => {});
        if (!running || run !== session) return;
        await worker.setParameters({tessedit_pageseg_mode: '6'});
        if (!running || run !== session) return;
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
    revision++; clearDetections();
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
window.addEventListener('pagehide', () => { clearTimeout(preloadTimer); stopCamera(); disposeOcr(); rates.stop(); });
window.addEventListener('pageshow', () => { if (!document.hidden) { rates.start(); warmRecognition(); } });
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(preloadTimer); stopCamera(); disposeOcr(); rates.stop(); } else { rates.start(); warmRecognition(); }
});
window.addEventListener('online', () => { rates.refreshBtc(); rates.refreshFx(); });
window.addEventListener('offline', updateRates);
fetch('currencies.json').then(response => response.json()).then(data => { names = data.currencies; updateRates(); }).catch(() => {});
setZoom(zoom);
icons(); rates.start(); warmRecognition();

function releasePhoto() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    photoFile = null;
    $('scanner-photo-share').disabled = true;
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
    updateTracking(); renderOverlays();
    if ($('scanner-capture').disabled || video.readyState < 2) return;
    takingPhoto = true; $('scanner-capture').disabled = true;
    try {
        const viewport = {width: stage.clientWidth, height: stage.clientHeight};
        const labels = [...overlays.children].map(tag => ({
            left: parseFloat(tag.style.left), top: parseFloat(tag.style.top), width: parseFloat(tag.style.width), height: parseFloat(tag.style.height),
            btc: tag.querySelector('strong').textContent, fiat: tag.querySelector('small').textContent,
            matrix: JSON.parse(tag.dataset.matrix),
        }));
        const photo = document.createElement('canvas');
        drawScannerPhoto(photo, video, cameraCrop(video.videoWidth, video.videoHeight, viewport, zoom), viewport, labels, logo);
        const blob = await new Promise(resolve => photo.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Image export failed');
        releasePhoto(); photoUrl = URL.createObjectURL(blob);
        $('scanner-photo-image').src = photoUrl;
        $('scanner-photo-download').href = photoUrl;
        $('scanner-photo-download').download = `satoshi-si-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        photoFile = new File([blob], $('scanner-photo-download').download, {type: 'image/png'});
        const canShare = Boolean(navigator.share && navigator.canShare?.({files: [photoFile]}));
        $('scanner-photo-share').disabled = !canShare;
        $('scanner-photo-share').title = canShare ? 'Share photo' : 'Photo sharing is unavailable in this browser; use Download';
        $('scanner-share-status').textContent = canShare ? '' : 'Photo sharing is unavailable in this browser. Download is available.';
        if (!document.hidden && !$('scanner-photo').open) $('scanner-photo').showModal();
    } catch { showError('The photo could not be created. Please try again.'); }
    finally { takingPhoto = false; renderOverlays(); }
});
$('scanner-photo-share').addEventListener('click', async () => {
    if (!photoFile) return;
    $('scanner-photo-share').disabled = true;
    $('scanner-share-status').textContent = '';
    try { await navigator.share({files: [photoFile], title: 'Bitcoin prices - satoshi.si'}); }
    catch (error) { if (error.name !== 'AbortError') $('scanner-share-status').textContent = 'Could not share this photo. Download is still available.'; }
    finally { $('scanner-photo-share').disabled = !photoFile; }
});
