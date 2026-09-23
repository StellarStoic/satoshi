export const BTC_MAX_AGE = 120_000;
export const FX_MAX_AGE = 86_400_000;
export const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function scannerFrameLimit(misses) {
    return [640, 640, 960, 960, 1280, 1280][misses % 6];
}

export function scannerRegion(width, height) {
    const w = Math.max(1, Math.round(Math.min(width * 0.84, height * 0.9)));
    const h = Math.max(1, Math.round(Math.min(height * 0.28, w * 0.5)));
    return {x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h};
}

export function regionBox(box, region) {
    return {x0: box.x0 + region.x, x1: box.x1 + region.x, y0: box.y0 + region.y, y1: box.y1 + region.y};
}

export function inferSmallCents(text, box, frame) {
    if (!/^\d{3,6}$/.test(text) || !box || !frame?.data || !positive(frame.width) || !positive(frame.height)) return text;
    const left = Math.max(0, Math.floor(box.x0)), top = Math.max(0, Math.floor(box.y0));
    const right = Math.min(frame.width, Math.ceil(box.x1)), bottom = Math.min(frame.height, Math.ceil(box.y1));
    const width = right - left, height = bottom - top;
    if (width < text.length * 2 || height < 6) return text;

    const gray = new Uint8Array(width * height), histogram = new Uint32Array(256);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const source = ((top + y) * frame.width + left + x) * 4;
        const value = Math.round(frame.data[source] * 0.299 + frame.data[source + 1] * 0.587 + frame.data[source + 2] * 0.114);
        gray[y * width + x] = value; histogram[value]++;
    }
    const percentile = fraction => {
        const target = width * height * fraction;
        let total = 0;
        for (let value = 0; value < histogram.length; value++) {
            total += histogram[value];
            if (total >= target) return value;
        }
        return 255;
    };
    const low = percentile(0.01), high = percentile(0.95);
    if (high - low < 45) return text;

    const glyphRuns = (lightInk, threshold) => {
        const columns = [];
        const minimumInk = Math.max(1, Math.floor(height * 0.025));
        for (let x = 0; x < width; x++) {
            let ink = 0, y0 = height, y1 = -1;
            for (let y = 0; y < height; y++) {
                const value = gray[y * width + x];
                if (lightInk ? value >= threshold : value <= threshold) { ink++; y0 = Math.min(y0, y); y1 = y; }
            }
            columns.push(ink >= minimumInk ? {y0, y1} : null);
        }
        const runs = [];
        let run;
        for (let x = 0; x < width; x++) {
            const column = columns[x];
            if (column) {
                if (!run) { run = {x0: x, x1: x, y0: column.y0, y1: column.y1}; runs.push(run); }
                run.x1 = x; run.y0 = Math.min(run.y0, column.y0); run.y1 = Math.max(run.y1, column.y1);
            } else run = null;
        }
        return runs.filter(run => run.x1 - run.x0 + 1 >= Math.max(1, width * 0.025) && run.y1 - run.y0 + 1 >= height * 0.2);
    };
    const range = high - low;
    const masks = [0.12, 0.18, 0.28, 0.38].flatMap(level => [
        glyphRuns(false, low + range * level), glyphRuns(true, high - range * level),
    ]);
    for (const runs of masks) {
        const complete = runs.length === text.length;
        const oneMissingInteger = text.length >= 4 && runs.length === text.length - 1;
        if (!complete && !oneMissingInteger) continue;
        const integer = runs.slice(0, -2), cents = runs.slice(-2);
        const heights = runs.map(run => run.y1 - run.y0 + 1);
        const integerHeights = heights.slice(0, -2), centHeights = heights.slice(-2);
        const mainMin = Math.min(...integerHeights), mainMax = Math.max(...integerHeights);
        const centMin = Math.min(...centHeights), centMax = Math.max(...centHeights);
        if (mainMin < mainMax * 0.72 || centMin < centMax * 0.65 || centMax > mainMin * 0.78) continue;
        const mainTop = Math.min(...integer.map(run => run.y0)), mainBottom = Math.max(...integer.map(run => run.y1));
        const centTop = Math.min(...cents.map(run => run.y0)), centBottom = Math.max(...cents.map(run => run.y1));
        const topAligned = Math.abs(centTop - mainTop) <= mainMax * 0.3 && mainBottom - centBottom >= mainMax * 0.15;
        const bottomAligned = Math.abs(centBottom - mainBottom) <= mainMax * 0.3 && centTop - mainTop >= mainMax * 0.15;
        if (topAligned || bottomAligned) return `${text.slice(0, -2)}.${text.slice(-2)}`;
    }
    return text;
}

export function needsPriceDetail(word, frameLimit) {
    return frameLimit < 1280 && /^\d{3,6}$/.test(word?.text || '') && word?.bbox && word.bbox.y1 - word.bbox.y0 < 24;
}

export function hasScannerSettings(storage) {
    try {
        const saved = JSON.parse(storage?.getItem('priceScannerSettings'));
        const currency = storage?.getItem('priceScannerCurrency');
        return Boolean(saved && ['BTC', 'sats'].includes(saved.unit) && positive(saved.zoom) &&
            saved.zoom >= 1 && saved.zoom <= 4 && /^[A-Z]{3}$/.test(currency) && currency !== 'BTC');
    } catch { return false; }
}

export function scannerSettings(storage) {
    let saved = {};
    try { saved = JSON.parse(storage?.getItem('priceScannerSettings')) || {}; } catch {}
    return {
        unit: saved.unit === 'sats' ? 'sats' : 'BTC',
        zoom: positive(saved.zoom) ? Math.max(1, Math.min(4, saved.zoom)) : 1,
    };
}

export function fiatToBtc(amount, usdPerBtc, fiatPerUsd) {
    if (![amount, usdPerBtc, fiatPerUsd].every(positive)) return null;
    return amount / fiatPerUsd / usdPerBtc;
}

export function freshTimestamp(timestamp, maxAge, now = Date.now()) {
    return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maxAge;
}

export function readSharedRates(storage, now = Date.now()) {
    try {
        const expiry = Number(storage.getItem('exchangeRatesCacheExpiry'));
        const rates = JSON.parse(storage.getItem('exchangeRatesCache'));
        if (!rates || !Number.isFinite(expiry) || expiry <= now || expiry > now + FX_MAX_AGE || (rates.USD !== undefined && rates.USD !== 1)) return null;
        const clean = Object.fromEntries(Object.entries(rates).filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && code !== 'BTC' && positive(rate)));
        return {rates: {...clean, USD: 1}, expiresAt: expiry, source: 'Converter cache'};
    } catch { return null; }
}

export function parseFxResponse(rows, now = Date.now()) {
    if (!Array.isArray(rows)) throw new Error('Invalid currency response');
    const rates = {USD: 1}, dates = {};
    for (const row of rows) {
        const date = Date.parse(`${row.date}T00:00:00Z`);
        if (row.base !== 'USD' || !/^[A-Z]{3}$/.test(row.quote) || !positive(row.rate) ||
            !freshTimestamp(date, 7 * FX_MAX_AGE, now)) continue;
        rates[row.quote] = row.rate;
        dates[row.quote] = row.date;
    }
    if (Object.keys(rates).length < 2) throw new Error('Currency rates are stale');
    return {rates, dates, expiresAt: now + FX_MAX_AGE, source: 'Frankfurter'};
}

const symbolCurrencies = {'€': ['EUR'], '$': ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MXN', 'ARS', 'CLP', 'COP', 'TWD'], '£': ['GBP'], '¥': ['JPY', 'CNY'], '₹': ['INR']};
const knownCodes = /\b(USD|EUR|GBP|CAD|AUD|CHF|JPY|CNY|INR|PLN|CZK|SEK|NOK|DKK|HUF|RON|BRL|MXN|NZD|ZAR|TRY)\b/i;

export function parsePrice(text, currency = 'EUR', explicit = false) {
    let input = text.trim().replace(/\u00a0|\u202f/g, ' ').replace(/[’‘]/g, "'");
    input = input.replace(/([A-Za-z])(?=\d)|(?<=\d)([A-Za-z])/g, '$1 $2');
    input = input.replace(/\s*([.,])\s*/g, '$1');
    if (!input || /[%/:=]|\d\s*[-–]\s*\d/.test(input)) return null;
    const selectedCode = new RegExp(`\\b${currency}\\b`, 'i');
    const code = input.match(knownCodes)?.[1]?.toUpperCase() || input.match(selectedCode)?.[0]?.toUpperCase();
    if (code && code !== currency) return null;
    let marked = explicit || Boolean(code);
    if (code) input = input.replace(new RegExp(`\\b${code}\\b`, 'i'), '').trim();
    for (const [symbol, currencies] of Object.entries(symbolCurrencies)) {
        if (input.includes(symbol)) {
            if (!currencies.includes(currency)) return null;
            input = input.replaceAll(symbol, '').trim();
            marked = true;
        }
    }
    if (!/^\d[\d.,' ]*(?:[.,][-–])?$/.test(input)) return null;
    if (/[.,][-–]$/.test(input)) { input = input.slice(0, -2); marked = true; }
    if (/[ ']/.test(input)) {
        if (!/^\d{1,3}(?:[ ']\d{3})+(?:[.,]\d{1,3})?$/.test(input)) return null;
        input = input.replace(/[ ']/g, '');
    }
    const fractionDigits = new Intl.NumberFormat('en', {style: 'currency', currency}).resolvedOptions().maximumFractionDigits;
    const lastDot = input.lastIndexOf('.'), lastComma = input.lastIndexOf(',');
    const separator = lastDot > lastComma ? '.' : ',';
    const position = Math.max(lastDot, lastComma);
    let normalized;
    if (position >= 0) {
        const decimals = input.length - position - 1;
        const groupSeparator = separator === '.' ? ',' : '.';
        const decimalPrice = decimals > 0 && decimals <= Math.max(fractionDigits, 2) && decimals !== 3;
        const threeDecimals = fractionDigits === 3 && decimals === 3;
        if (decimalPrice || threeDecimals) {
            const integer = input.slice(0, position);
            if (integer.includes(separator) || (integer.includes(groupSeparator) && !new RegExp(`^\\d{1,3}(?:\\${groupSeparator}\\d{3})+$`).test(integer))) return null;
            normalized = integer.replaceAll(groupSeparator, '') + '.' + input.slice(position + 1);
        } else if (marked && /^\d{1,3}(?:[.,]\d{3})+$/.test(input) && !(lastDot >= 0 && lastComma >= 0)) {
            normalized = input.replace(/[.,]/g, '');
        } else return null;
    } else {
        if (!marked && input.length > 6) return null;
        normalized = input;
    }
    const value = Number(normalized);
    if (!positive(value) || value > 100_000_000 || (fractionDigits === 0 && !Number.isInteger(value))) return null;
    return value;
}

function mergeBox(a, b) {
    return {x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)};
}

function priceCurrency(text, selected) {
    text = text.replace(/([A-Za-z])(?=\d)|(?<=\d)([A-Za-z])/g, '$1 $2');
    const code = text.match(knownCodes)?.[1]?.toUpperCase();
    if (code) return code;
    for (const [symbol, currencies] of Object.entries(symbolCurrencies)) {
        if (text.includes(symbol)) return currencies.includes(selected) ? selected : currencies[0];
    }
    return selected;
}

export function detectPrices(blocks, currency) {
    // OCR often puts smaller cents and currency symbols on separate text lines.
    const tokens = (blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph =>
        (paragraph.lines || []).flatMap(line => line.words || [])))
        .filter(word => word.bbox && word.text?.trim()).map(word => ({...word, text: word.text.trim()}));
    const used = new Set();
    const found = [];
    const height = word => word.bbox.y1 - word.bbox.y0;
    const marker = word => word && (/^[€$£¥₹]$/.test(word.text) ||
        /^[A-Z]{3}$/i.test(word.text) && (knownCodes.test(word.text) || word.text.toUpperCase() === currency));
    const near = (a, b) => b.bbox.x0 >= a.bbox.x1 - 2 &&
        b.bbox.x0 - a.bbox.x1 < Math.max(height(a), height(b)) * 0.85 &&
        Math.min(a.bbox.y1, b.bbox.y1) > Math.max(a.bbox.y0, b.bbox.y0);
    const right = word => tokens.filter(other => other !== word && !used.has(other) && near(word, other))
        .sort((a, b) => a.bbox.x0 - b.bbox.x0)[0];
    for (const word of [...tokens].sort((a, b) => height(b) - height(a) || a.bbox.x0 - b.bbox.x0)) {
        if (used.has(word) || word.confidence < 40 || !/\d/.test(word.text)) continue;
        const prior = tokens.filter(other => marker(other) && near(other, word)).sort((a, b) => b.bbox.x1 - a.bbox.x1)[0];
        const joined = [word];
        let text = word.text, next = right(word);
        const mainDigits = text.match(/^(?:[€$£¥₹]|[A-Z]{3})?\s*(\d{1,6}[.,]?)$/i)?.[1];
        if (mainDigits) {
            let fraction = next, separator = /[.,]$/.test(text);
            if (/^[.,]$/.test(next?.text || '')) { fraction = right(next); separator = true; }
            const split = /^[.,]\d{1,2}$/.test(fraction?.text || '');
            const smallCents = /^\d{2}$/.test(fraction?.text || '') && height(fraction) < height(word) * 0.85;
            if (fraction && fraction.confidence >= 40 && (split || (separator && /^\d{1,2}$/.test(fraction.text)) || smallCents)) {
                text = text.replace(/[.,]$/, '') + '.' + fraction.text.replace(/^[.,]/, '');
                if (next !== fraction) joined.push(next);
                joined.push(fraction);
                next = right({...word, bbox: mergeBox(word.bbox, fraction.bbox)});
            }
        }
        if (!marker(prior) && !marker(next) && /^(%|kg\b|g\b|mg\b|ml\b|cl\b|l\b|cm\b|mm\b|m\b|pcs\b)/i.test(next?.text || '')) {
            joined.forEach(token => used.add(token));
            continue;
        }
        if (marker(prior)) { text = prior.text + ' ' + text; joined.push(prior); }
        if (marker(next)) { text += ' ' + next.text; joined.push(next); }
        const detectedCurrency = priceCurrency(text, currency);
        const value = parsePrice(text, detectedCurrency);
        joined.forEach(token => used.add(token));
        if (value !== null) found.push({value, currency: detectedCurrency,
            bbox: joined.reduce((box, token) => mergeBox(box, token.bbox), word.bbox),
            confidence: Math.min(...joined.filter(token => /\d/.test(token.text)).map(token => token.confidence)),
            size: height(word)});
    }
    return found.sort((a, b) => b.size - a.size || b.confidence - a.confidence).slice(0, 6);
}

export function stableDetections(current, previous, width, height, allowConfident = false) {
    return current.filter(candidate => (allowConfident && candidate.confidence >= 80) || previous.some(old => old.value === candidate.value && old.currency === candidate.currency &&
        Math.abs(old.bbox.x0 - candidate.bbox.x0) < width * 0.04 &&
        Math.abs(old.bbox.y0 - candidate.bbox.y0) < height * 0.04));
}

// Crop the same source rectangle used by object-fit: cover and centered digital zoom.
export function cameraCrop(width, height, viewport, zoom = 1) {
    const scale = Math.max(viewport.width / width, viewport.height / height) * zoom;
    const cropWidth = viewport.width / scale, cropHeight = viewport.height / scale;
    return {x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight};
}

export function frameDifference(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let difference = 0;
    for (let i = 0; i < a.length; i += 4) difference += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    return difference / (a.length / 4 * 3);
}

export function containedBox(box, frame, viewport) {
    const scale = Math.min(viewport.width / frame.width, viewport.height / frame.height);
    return {left: (viewport.width - frame.width * scale) / 2 + box.x0 * scale,
        top: (viewport.height - frame.height * scale) / 2 + box.y0 * scale,
        width: (box.x1 - box.x0) * scale, height: (box.y1 - box.y0) * scale};
}
