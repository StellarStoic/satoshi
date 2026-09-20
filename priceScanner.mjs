import {fiatToBtc, detectPrices, stableDetections, containedBox, positive} from './priceScannerModel.mjs';
import {ScannerRates} from './priceScannerRates.mjs';

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
let unit = 'BTC', names = {}, worker, stream, running = false, run = 0, revision = 0;
let facing = 'environment', deviceId, devices = [], torch = false, detections = [], previous = [];
let detectedAt = 0, frame = {width: 1, height: 1}, motionFrame, animation, lastMotionAt = 0, ocrScript;

function icons() { globalThis.lucide?.createIcons(); }
function status(text) { $('scanner-status').textContent = text; }
function showError(text) { $('scanner-error').textContent = text; $('scanner-error').hidden = !text; }
function clearDetections() { detections = []; previous = []; overlays.replaceChildren(); $('scanner-count').textContent = ''; }

const rates = new ScannerRates(updateRates, storage);
function updateRates() {
    const selected = currency;
    const supported = new Set(['EUR', 'USD', ...Object.keys(rates.fx?.rates || {}).filter(code => names[code] && !['BTC', 'XAU', 'XAG', 'XPD', 'XPT', 'XDR'].includes(code))]);
    supported.add(selected);
    const values = [...supported].sort();
    const signature = values.join(',') + Boolean(Object.keys(names).length);
    if ($('scanner-currency').dataset.options !== signature) {
        $('scanner-currency').replaceChildren(...values.map(code => new Option(names[code] ? `${code} - ${names[code]}` : code, code)));
        $('scanner-currency').value = selected;
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
    const quote = rates.snapshot(currency);
    if (!running || !quote.ready || performance.now() - detectedAt > 1500) { $('scanner-count').textContent = ''; return; }
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
        const top = Math.max(4, Math.min(viewport.height - height - 44, box.top - 6));
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
}

function watchMotion(now) {
    if (!running) return;
    if (video.readyState >= 2 && now - lastMotionAt > 120) {
        motionContext.drawImage(video, 0, 0, 32, 18);
        const pixels = motionContext.getImageData(0, 0, 32, 18).data;
        if (motionFrame) {
            let difference = 0;
            for (let i = 0; i < pixels.length; i += 4) difference += Math.abs(pixels[i] - motionFrame[i]) + Math.abs(pixels[i + 1] - motionFrame[i + 1]) + Math.abs(pixels[i + 2] - motionFrame[i + 2]);
            if (difference / (32 * 18 * 3) > 10) { revision++; clearDetections(); }
        }
        motionFrame = pixels;
        lastMotionAt = now;
        if (now - detectedAt > 1500) { overlays.replaceChildren(); $('scanner-count').textContent = ''; }
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
    while (running && run === session && worker) {
        if (!video.videoWidth || video.readyState < 2) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
        const width = Math.min(video.videoWidth, 1280), height = Math.round(video.videoHeight * width / video.videoWidth);
        canvas.width = width; canvas.height = height;
        context.drawImage(video, 0, 0, width, height);
        const started = performance.now(), version = revision, selected = currency;
        try {
            const {data} = await worker.recognize(canvas, {}, {blocks: true, text: true});
            if (!running || session !== run) return;
            if (revision === version && currency === selected && performance.now() - started < 2500) {
                const current = detectPrices(data.blocks, currency);
                detections = stableDetections(current, previous, width, height);
                previous = current;
                frame = {width, height};
                detectedAt = performance.now();
                status(current.length ? 'Scanning' : 'No price detected');
                renderOverlays();
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
    $('scanner-start').innerHTML = '<i data-lucide="camera" aria-hidden="true"></i><span>Start camera</span>';
    $('scanner-flip').disabled = true;
    $('scanner-torch').disabled = true;
    $('scanner-torch').setAttribute('aria-pressed', 'false');
    $('scanner-zoom-control').hidden = true;
    torch = false;
    status('Camera off'); icons();
}

async function startCamera() {
    if (running) return;
    showError('');
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) { showError('Camera access requires HTTPS or localhost and a supported browser.'); return; }
    running = true;
    const session = ++run;
    $('scanner-start').innerHTML = '<i data-lucide="square" aria-hidden="true"></i><span>Stop camera</span>';
    icons(); status('Requesting camera...');
    try {
        const camera = await navigator.mediaDevices.getUserMedia({audio: false, video: {
            ...(deviceId ? {deviceId: {exact: deviceId}} : {facingMode: {ideal: facing}}),
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
        if (capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min) {
            const slider = $('scanner-zoom');
            slider.min = capabilities.zoom.min; slider.max = capabilities.zoom.max;
            slider.step = capabilities.zoom.step || 0.1; slider.value = track.getSettings().zoom || capabilities.zoom.min;
            $('scanner-zoom-control').hidden = false;
        }
        devices = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(device => device.kind === 'videoinput');
        if (!running || run !== session) return;
        $('scanner-flip').disabled = devices.length < 2;
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
        deviceId = undefined;
        showError(messages[error.name] || 'The scanner could not start. Check your connection and camera, then retry.');
    }
}

$('scanner-start').addEventListener('click', () => running ? stopCamera() : startCamera());
$('scanner-currency').addEventListener('change', () => {
    currency = $('scanner-currency').value;
    try { storage?.setItem('priceScannerCurrency', currency); } catch {}
    revision++; clearDetections();
    if (!rates.snapshot(currency).fiatPerUsd) rates.refreshFx(true);
    updateRates();
});
document.querySelectorAll('[name=scanner-unit]').forEach(input => input.addEventListener('change', () => { unit = input.value; renderOverlays(); }));
$('scanner-refresh').addEventListener('click', () => { rates.refreshBtc(); rates.refreshFx(true); });
$('scanner-flip').addEventListener('click', () => {
    const current = stream?.getVideoTracks()[0]?.getSettings().deviceId;
    deviceId = devices[(devices.findIndex(device => device.deviceId === current) + 1) % devices.length]?.deviceId;
    facing = facing === 'environment' ? 'user' : 'environment';
    stopCamera(); startCamera();
});
$('scanner-torch').addEventListener('click', async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({advanced: [{torch: !torch}]}); torch = !torch; $('scanner-torch').setAttribute('aria-pressed', String(torch)); }
    catch { showError('The camera could not change its torch setting.'); }
});
$('scanner-zoom').addEventListener('input', async () => {
    try { await stream?.getVideoTracks()[0]?.applyConstraints({advanced: [{zoom: Number($('scanner-zoom').value)}]}); revision++; clearDetections(); }
    catch { showError('The camera could not change its zoom setting.'); }
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
icons(); rates.start();
