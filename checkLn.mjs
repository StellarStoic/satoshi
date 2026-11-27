// Check LN — one field that takes whatever Lightning string the reader copied, and everything that can be
// said about it without trusting it.
//
// The rule this page follows: report what is known, mark what is not, and never dress a guess as a result.
// A BOLT11 signature is therefore shown as present and unverified, a failed fetch says it could not be
// read rather than that the address is bad, and an endpoint that answers without a CORS header is
// reported as unreadable *here* — the address may be perfectly fine for a wallet.

import {
    decodeInvoice,
    describeLnurl,
    detectKind,
    formatAmount,
    lnurlTarget,
} from './lightningCheckModel.mjs';

const state = {busy: false, last: null};

const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
};

const input = () => document.getElementById('ln-input');
const out = () => document.getElementById('ln-output');

function setStatus(text, tone = '') {
    const status = document.getElementById('ln-status');
    if (!status) return;
    status.textContent = text;
    status.className = `ln-status ${tone ? `is-${tone}` : ''}`;
}

function clearOutput() {
    const target = out();
    if (target) target.replaceChildren();
}

function section(title, className) {
    const box = el('section', `ln-block ${className || ''}`.trim());
    box.appendChild(el('h2', 'ln-block__title', title));
    return box;
}

function details(rows) {
    const list = el('dl', 'ln-rows');
    for (const [label, value] of rows) {
        if (value === null || value === undefined || value === '') continue;
        list.appendChild(el('dt', 'ln-rows__label', label));
        list.appendChild(el('dd', 'ln-rows__value', String(value)));
    }
    return list;
}

function problems(list) {
    if (!list || !list.length) return null;
    const box = section('What is wrong', 'ln-block--problems');
    const items = el('ul', 'ln-problems');
    for (const problem of list) {
        const item = el('li', `ln-problems__item is-${problem.level}`);
        item.appendChild(el('span', 'ln-problems__level', problem.level));
        item.appendChild(el('span', 'ln-problems__text', problem.text));
        items.appendChild(item);
    }
    box.appendChild(items);
    return box;
}

function codeBlock(title, text) {
    const box = section(title, 'ln-block--code');
    const pre = el('pre', 'ln-code');
    pre.textContent = text;
    box.appendChild(pre);
    return box;
}

function append(...nodes) {
    const target = out();
    for (const node of nodes) if (node) target.appendChild(node);
}

/* ------------------------------------------------------------------ invoice --------------------------- */

function showInvoice(invoice) {
    const when = new Date(invoice.createdAt);
    const remaining = invoice.secondsRemaining;
    const life = invoice.expired
        ? `expired ${describeSpan(-remaining)} ago`
        : `${describeSpan(remaining)} left`;
    setStatus(
        `BOLT11 invoice · ${invoice.network} · ${formatAmount(invoice.amountMsat)} · ${life}`,
        invoice.expired ? 'bad' : invoice.problems.some(p => p.level === 'error') ? 'warn' : 'ok',
    );

    const rows = [
        ['Network', invoice.network],
        ['Amount', formatAmount(invoice.amountMsat)],
        ['Created', `${when.toISOString()} (${describeSpan(Date.now() / 1000 - when.getTime() / 1000)} ago)`],
        ['Expires', `${invoice.expiresAt} · ${life}`],
        ['Payment hash', invoice.paymentHash],
        ['Payment secret', invoice.paymentSecret],
        ['Description', invoice.description],
        ['Description hash', invoice.descriptionHash],
        ['Payee node', invoice.payeeNodeId],
        ['Min final CLTV', invoice.minFinalCltvExpiry],
        ['Features', invoice.features],
        ['Route hints', invoice.routeHints],
        ['Fallback address', invoice.fallbackAddress],
        ['Signature', `${invoice.signatureBytes} bytes, not verified here (needs secp256k1 ECDSA)`],
        ['Bech32 checksum', invoice.checksumOk ? 'valid' : 'INVALID'],
        ['Fields present', invoice.fieldTags.join(' · ')],
    ];
    const fieldBlock = section('What the invoice says', 'ln-block--fields');
    fieldBlock.appendChild(details(rows));
    append(fieldBlock, problems(invoice.problems), codeBlock('The invoice, decoded', JSON.stringify(invoice, null, 2)));
}

function describeSpan(seconds) {
    const s = Math.max(0, Math.round(Math.abs(seconds)));
    if (s < 90) return `${s} s`;
    const m = Math.round(s / 60);
    if (m < 90) return `${m} min`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h`;
    return `${Math.round(h / 24)} days`;
}

/* ------------------------------------------------------------------ lnurl ----------------------------- */

async function fetchJson(url) {
    const started = performance.now();
    const record = {url, status: null, ms: null, body: '', error: '', contentType: ''};
    try {
        const response = await fetch(url, {cache: 'no-store', headers: {Accept: 'application/json'}});
        record.status = response.status;
        record.contentType = response.headers.get('content-type') || '';
        record.body = (await response.text()).slice(0, 4000);
        record.ms = Math.round(performance.now() - started);
        if (!response.ok) record.error = `the server answered ${response.status}`;
    } catch (error) {
        record.ms = Math.round(performance.now() - started);
        record.error = `${error.message} — the browser could not read the answer at all, which is what a missing CORS header, a blocker or an unreachable host all look like from here`;
    }
    return record;
}

function requestBlock(record) {
    const box = section('The request', 'ln-block--request');
    box.appendChild(details([
        ['Asked for', record.url],
        ['HTTP status', record.status === null ? 'no answer' : record.status],
        ['Content type', record.contentType],
        ['Time', record.ms === null ? '' : `${record.ms} ms`],
        ['Error', record.error],
    ]));
    return box;
}

async function showLnurl(target) {
    setStatus(`Fetching ${target.url} …`);
    clearOutput();
    const record = await fetchJson(target.url);
    state.last = {target, record};

    if (record.error) {
        setStatus(`Could not read the endpoint: ${record.error}`, 'bad');
        append(requestBlock(record), record.body ? codeBlock('What came back, as far as it came', record.body) : null);
        return;
    }

    let payload = null;
    try {
        payload = JSON.parse(record.body);
    } catch (error) {
        setStatus('The endpoint answered, but not with JSON.', 'bad');
        append(requestBlock(record), codeBlock('The answer, as received', record.body || '(empty body)'));
        return;
    }

    const described = describeLnurl(payload, target.url);
    const failing = described.problems.filter(p => p.level === 'error');
    setStatus(
        described.type === 'payRequest'
            ? `pay request · ${formatAmount(described.minSendable)} to ${formatAmount(described.maxSendable)}`
            : `${described.type} · tag ${payload.tag || '(none)'}`,
        failing.length ? 'bad' : 'ok',
    );

    const rows = [
        ['Source', target.source],
        ['Tag', payload.tag],
        ['Callback', described.callback],
        ['Minimum', described.minSats === null ? '' : `${described.minSats} sats (${described.minSendable} msat)`],
        ['Maximum', described.maxSats === null ? '' : `${described.maxSats} sats (${described.maxSendable} msat)`],
        ['Comment allowed', described.commentAllowed ? `${described.commentAllowed} characters` : 'no'],
        ['Description', described.description],
        ['Image', described.hasImage ? 'present in metadata' : ''],
        ['Nostr', described.allowsNostr ? `allows zaps · ${described.nostrPubkey}` : (described.nostrPubkey ? described.nostrPubkey : 'not offered')],
        ['Success action', described.successAction ? `${described.successAction.tag}${described.successAction.url ? ` → ${described.successAction.url}` : ''}` : ''],
        ['Disposable', described.disposable ? 'yes' : ''],
        ['Metadata entries', described.metadata ? described.metadata.map(m => m.type).join(' · ') : ''],
    ];
    const fieldBlock = section('What the endpoint promises', 'ln-block--fields');
    fieldBlock.appendChild(details(rows));
    append(requestBlock(record), fieldBlock, problems(described.problems));
    if (payload.tag === 'payRequest' && payload.callback) {
        append(await invoiceButton(payload));
    }
    append(codeBlock('The answer, exactly as the endpoint sent it', JSON.stringify(payload, null, 2)));
}

/**
 * Ask the callback for an invoice at the minimum amount.
 *
 * This is the only step here that proves the whole path works, and it costs nothing: an invoice is a
 * request, not a payment. Nothing is sent, no wallet is involved, and the invoice is left to expire.
 */
async function invoiceButton(payload) {
    const box = section('Fetch a test invoice', 'ln-block--invoice');
    const note = el('p', 'ln-note',
        'Ask the callback for an invoice at the minimum amount. Nothing is paid; the invoice simply expires.');
    const button = el('button', 'ln-button', `Request an invoice for ${formatAmount(payload.minSendable)}`);
    button.type = 'button';
    const result = el('div', 'ln-invoice-result');
    button.addEventListener('click', async () => {
        button.disabled = true;
        result.replaceChildren(el('p', 'ln-note', 'Asking…'));
        const joiner = payload.callback.includes('?') ? '&' : '?';
        const url = `${payload.callback}${joiner}amount=${encodeURIComponent(payload.minSendable)}`;
        const record = await fetchJson(url);
        result.replaceChildren();
        if (record.error) {
            result.appendChild(el('p', 'ln-error', `The callback refused: ${record.error}`));
            if (record.body) result.appendChild(codeBlock('What the callback said', record.body));
            button.disabled = false;
            return;
        }
        let answer = null;
        try {
            answer = JSON.parse(record.body);
        } catch {
            result.appendChild(el('p', 'ln-error', 'The callback answered with something that is not JSON.'));
            result.appendChild(codeBlock('What the callback said', record.body));
            button.disabled = false;
            return;
        }
        if (answer.status === 'ERROR' || answer.reason || !answer.pr) {
            result.appendChild(el('p', 'ln-error',
                `The callback answered with a refusal: ${answer.reason || answer.error || 'no invoice in the answer'}`));
            result.appendChild(codeBlock('The callback’s answer', JSON.stringify(answer, null, 2)));
            button.disabled = false;
            return;
        }
        let decoded = null;
        try {
            decoded = decodeInvoice(answer.pr);
        } catch (error) {
            result.appendChild(el('p', 'ln-error', `The invoice in the answer could not be decoded: ${error.message}`));
        }
        if (decoded) {
            result.appendChild(details([
                ['Invoice amount', formatAmount(decoded.amountMsat)],
                ['Asked for', formatAmount(payload.minSendable)],
                ['Network', decoded.network],
                ['Expires', `${decoded.expiresAt} (${describeSpan(decoded.secondsRemaining)} left)`],
                ['Payment hash', decoded.paymentHash],
                ['Payee node', decoded.payeeNodeId],
                ['Amount agrees with the request', decoded.amountMsat === Number(payload.minSendable) ? 'yes' : 'NO — the invoice is not for the amount that was asked'],
            ]));
        }
        result.appendChild(codeBlock('The callback’s answer', JSON.stringify(answer, null, 2)));
        button.disabled = false;
    });
    box.appendChild(note);
    box.appendChild(button);
    box.appendChild(result);
    return box;
}

/* ------------------------------------------------------------------ entry point ----------------------- */

async function check() {
    if (state.busy) return;
    const raw = (input()?.value || '').trim();
    clearOutput();
    if (!raw) {
        setStatus('Paste an invoice, an lnurl or a Lightning address.', 'warn');
        return;
    }
    const detected = detectKind(raw);
    state.busy = true;

    try {
        if (detected.kind === 'invoice') {
            let invoice;
            try {
                invoice = decodeInvoice(detected.text);
            } catch (error) {
                setStatus(`That looks like an invoice but cannot be read: ${error.message}`, 'bad');
                return;
            }
            showInvoice(invoice);
            return;
        }
        if (detected.kind === 'lnurl' || detected.kind === 'address' || detected.kind === 'endpoint') {
            let target;
            try {
                target = lnurlTarget(detected);
            } catch (error) {
                setStatus(`Cannot turn this into a request: ${error.message}`, 'bad');
                return;
            }
            await showLnurl(target);
            return;
        }
        if (detected.kind === 'payment-hash') {
            setStatus('That is a payment hash, not something payable. It identifies a payment; it cannot be paid.', 'warn');
            return;
        }
        setStatus('That is not an invoice, an lnurl or a Lightning address.', 'bad');
    } finally {
        state.busy = false;
    }
}

function wire() {
    const field = input();
    const button = document.getElementById('ln-check');
    if (!field || !button) return;
    button.addEventListener('click', check);
    field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            check();
        }
    });
    document.getElementById('ln-clear')?.addEventListener('click', () => {
        field.value = '';
        clearOutput();
        setStatus('');
        field.focus();
    });
    // a value handed over by the URL lets a check be linked to someone
    const shared = new URLSearchParams(location.search).get('q');
    if (shared) {
        field.value = shared;
        check();
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
    else wire();
}
