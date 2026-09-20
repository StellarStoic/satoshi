import {BTC_MAX_AGE, FX_MAX_AGE, positive, freshTimestamp, readSharedRates, parseFxResponse} from './priceScannerModel.mjs';

export const SINTRA_HTTP = 'https://api.sintra.fi/v1/prices/btcusd';
export const SINTRA_WS = 'wss://api.sintra.fi/ws';
export const FX_URL = 'https://api.frankfurter.dev/v2/rates?base=USD';

export class ScannerRates {
    constructor(onChange, storage) {
        this.onChange = onChange;
        this.storage = storage;
        this.stopped = true;
        this.retryDelay = 1000;
        this.btc = null;
        this.fx = null;
        this.controllers = new Set();
    }
    read(key) { try { return JSON.parse(this.storage?.getItem(key)); } catch { return null; } }
    write(key, value) { try { this.storage?.setItem(key, JSON.stringify(value)); } catch {} }
    async request(url) {
        const controller = new AbortController();
        this.controllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(url, {signal: controller.signal, cache: 'no-store', credentials: 'omit'});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally { clearTimeout(timeout); this.controllers.delete(controller); }
    }
    start() {
        if (!this.stopped) return;
        this.stopped = false;
        const now = Date.now();
        const own = this.read('priceScannerBtcCache');
        const shared = this.read('exchangeRatesCache');
        const sharedAt = Number(this.read('btcCacheTimestamp'));
        const candidates = [own, positive(shared?.BTC) ? {usd: 1 / shared.BTC, at: sharedAt} : null];
        this.btc = candidates.filter(value => positive(value?.usd) && freshTimestamp(value.at, BTC_MAX_AGE, now)).sort((a, b) => b.at - a.at)[0] || null;
        this.cached = Boolean(this.btc);
        const cachedFx = this.read('priceScannerFxCache');
        this.fx = readSharedRates(this.storage, now) || (cachedFx?.rates?.USD === 1 && cachedFx.expiresAt > now && cachedFx.expiresAt <= now + FX_MAX_AGE ? cachedFx : null);
        this.connect();
        this.refreshBtc();
        this.refreshFx();
        this.timer = setInterval(() => {
            if (!this.btc || Date.now() - this.btc.at > 20_000) this.refreshBtc();
            if (!this.fx || this.fx.expiresAt <= Date.now()) this.refreshFx();
            this.onChange();
        }, 5000);
        this.onChange();
    }
    accept(usd) {
        if (!positive(usd) || this.stopped) return;
        this.btc = {usd, at: Date.now()};
        this.cached = false;
        this.write('priceScannerBtcCache', this.btc);
        this.onChange();
    }
    connect() {
        if (this.stopped) return;
        try {
            const socket = new WebSocket(SINTRA_WS);
            this.socket = socket;
            socket.onmessage = event => {
                if (this.socket !== socket || this.stopped) return;
                try {
                    const message = JSON.parse(event.data);
                    if (message.event === 'data' && positive(message.data?.prices?.usd)) {
                        this.retryDelay = 1000;
                        this.accept(message.data.prices.usd);
                    }
                } catch {}
            };
            socket.onerror = () => socket.close();
            socket.onclose = () => { if (!this.stopped && this.socket === socket) this.reconnect(); };
        } catch { this.reconnect(); }
    }
    reconnect() {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), this.retryDelay);
        this.retryDelay = Math.min(30_000, this.retryDelay * 2);
    }
    async refreshBtc() {
        if (this.btcPending || this.stopped) return;
        this.btcPending = true;
        try { this.accept((await this.request(SINTRA_HTTP)).usd); } catch {} finally { this.btcPending = false; this.onChange(); }
    }
    async refreshFx(force = false) {
        if (this.fxPending || this.stopped || (!force && this.fx?.expiresAt > Date.now())) return;
        this.fxPending = true;
        try {
            const fx = parseFxResponse(await this.request(FX_URL));
            if (!this.stopped) { this.fx = fx; this.write('priceScannerFxCache', fx); }
        } catch {} finally { this.fxPending = false; this.onChange(); }
    }
    snapshot(currency, now = Date.now()) {
        const usdPerBtc = positive(this.btc?.usd) && freshTimestamp(this.btc.at, BTC_MAX_AGE, now) ? this.btc.usd : null;
        const fiatPerUsd = currency === 'USD' ? 1 : this.fx?.expiresAt > now && positive(this.fx.rates?.[currency]) ? this.fx.rates[currency] : null;
        return {usdPerBtc, fiatPerUsd, ready: Boolean(usdPerBtc && fiatPerUsd),
            age: this.btc ? Math.floor((now - this.btc.at) / 1000) : null,
            live: Boolean(usdPerBtc && !this.cached && now - this.btc.at < 30_000),
            fxSource: this.fx?.source, fxDate: this.fx?.dates?.[currency]};
    }
    stop() {
        this.stopped = true;
        clearInterval(this.timer);
        clearTimeout(this.reconnectTimer);
        this.socket?.close();
        for (const controller of this.controllers) controller.abort();
    }
}
