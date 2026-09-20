export const BTC_MAX_AGE = 120_000;
export const FX_MAX_AGE = 86_400_000;
export const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

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
    if (!input || /[%/:=]|\d\s*[-–]\s*\d/.test(input)) return null;
    const code = input.match(knownCodes)?.[1]?.toUpperCase();
    if (code && code !== currency) return null;
    let marked = explicit || Boolean(code);
    if (code) input = input.replace(knownCodes, '').trim();
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
        if (!marked) return null;
        normalized = input;
    }
    const value = Number(normalized);
    if (!positive(value) || value > 100_000_000 || (fractionDigits === 0 && !Number.isInteger(value))) return null;
    return value;
}

function mergeBox(a, b) {
    return {x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)};
}

export function detectPrices(blocks, currency) {
    const found = [];
    for (const block of blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
        const words = line.words || [];
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word.confidence < 55 || !word.bbox || !/\d/.test(word.text)) continue;
            const prior = words[i - 1], next = words[i + 1];
            const marker = token => token && (/^[€$£¥₹]$/.test(token.text) || /^[A-Z]{3}$/.test(token.text) && knownCodes.test(token.text));
            let text = word.text, box = word.bbox;
            if (marker(prior)) { text = `${prior.text} ${text}`; box = mergeBox(box, prior.bbox); }
            if (marker(next)) { text = `${text} ${next.text}`; box = mergeBox(box, next.bbox); }
            // Superscript cents are common on shelf labels; only join close, smaller digits.
            if (/^\d{1,5}$/.test(word.text) && /^\d{2}$/.test(next?.text || '') && next.confidence >= 55 &&
                next.bbox.y1 - next.bbox.y0 < (word.bbox.y1 - word.bbox.y0) * 0.85 &&
                next.bbox.x0 - word.bbox.x1 < (word.bbox.y1 - word.bbox.y0) * 0.8 &&
                next.bbox.y0 <= word.bbox.y0 + (word.bbox.y1 - word.bbox.y0) * 0.4) {
                text = `${marker(prior) ? prior.text : ''}${word.text}.${next.text}`;
                box = mergeBox(box, next.bbox);
                i++;
            } else if (!marker(prior) && !marker(next) && /^[%]|^(kg|g|mg|ml|cl|l|cm|mm|m|pcs)\b/i.test(next?.text || '')) continue;
            const value = parsePrice(text, currency);
            if (value !== null) found.push({value, bbox: box, confidence: word.confidence});
        }
    }
    return found.sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

export function stableDetections(current, previous, width, height) {
    return current.filter(candidate => previous.some(old => old.value === candidate.value &&
        Math.abs(old.bbox.x0 - candidate.bbox.x0) < width * 0.04 &&
        Math.abs(old.bbox.y0 - candidate.bbox.y0) < height * 0.04));
}

export function containedBox(box, frame, viewport) {
    const scale = Math.min(viewport.width / frame.width, viewport.height / frame.height);
    return {left: (viewport.width - frame.width * scale) / 2 + box.x0 * scale,
        top: (viewport.height - frame.height * scale) / 2 + box.y0 * scale,
        width: (box.x1 - box.x0) * scale, height: (box.y1 - box.y0) * scale};
}
