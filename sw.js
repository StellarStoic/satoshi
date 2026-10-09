const CACHE = 'satoshi-static-v231';   // v231: stable varied pin positions across sticky notes
const CACHE_METADATA_URL = '/__satoshi_pwa_metadata__';
const CORE = [
    '/', '/offline.html', '/styles.css', '/theme.css', '/pwa.js', '/paymentService.mjs', '/siteHelp.css', '/siteHelp.mjs', '/seo.mjs', '/siteFooter.mjs', '/analytics.css', '/analytics.mjs', '/satoshiChat.css', '/satoshiChat.mjs', '/satoshiContext.mjs', '/AI_CONTEXT.md', '/nip05store.html', '/nip05store.mjs', '/copyonclick.js',
    '/pollinationsAuth.mjs', '/ai-callback.html', '/aiCallback.css', '/aiCallback.mjs',
    '/settings.html', '/settings.css', '/settings.js',
    '/selfCustody.html', '/selfCustody.css', '/selfCustody.js',
    '/barkTxCost.html', '/barkTxCostModel.mjs', '/bark-pricing.json',
    '/bitcoinTxCost.html', '/bitcoinTxCost.css', '/bitcoinTxCost.mjs', '/bitcoinTxCostModel.mjs', '/txCostRouteModel.mjs',
    '/wallet.html', '/wallet.css', '/wallet.mjs', '/walletModel.mjs', '/walletSecurity.mjs', '/qrCodeGenerator_1_4_4.js', '/vendor/jsqr/jsQR.js',
    '/vendor/bark/bark_ffi_wasm.js', '/vendor/bark/bark_ffi_wasm_bg.wasm',
    '/news.html', '/news.css', '/news.mjs', '/newsModel.mjs', '/news-data.json',
    '/stickyNotes.html', '/stickyNotes.css', '/stickyNotes.mjs', '/stickyNotesModel.mjs', '/nostrSession.mjs', '/img/cork-board.png', '/img/pin_red.png', '/img/pin_blue.png', '/img/pin_yellow.png', '/img/pin_green.png', '/img/pin_white.png', '/img/pin_purple.png', '/img/pin_magenta.png', '/img/pin_black.png',
    '/vendor/maplibre/maplibre-gl.js', '/vendor/maplibre/maplibre-gl.css',
    '/offers.html', '/offers.css', '/offers.js', '/offers-data.json',
    '/coockieConsent.js', '/copyonclick.js', '/mempoolWebSocket.js',
    '/text.js', '/contact.js', '/index.js', '/burgerMenu.js', '/nameForm.js', '/MoscowTime.js', '/MoscowTimeModel.mjs',
    '/android-chrome-192x192.png', '/android-chrome-512x512.png',
    '/isBip39.html', '/isBip39.css', '/isBip39.js', '/bip39Lookup.mjs', '/vendor/bip39.mjs',
    '/entropy.html', '/entropy.css', '/entropy.mjs', '/entropyModel.mjs',
    '/21fm.html', '/lofi.css', '/lofi.mjs', '/lofiModel.mjs', '/lofiInstruments.mjs', '/lofiRealSounds.mjs', '/vendor/tone/Tone.js', '/vendor/tone/Tone.js.map',
    '/stego.html', '/stego.css', '/stego/emojiConfetti.css', '/stego/foundSecrets.css',
    '/stego/emojiDecoder.js', '/stego/emojiConfetti.js', '/stego/foundSecrets.js', '/stego/threeZeroWidthCharactersDecoder.js',
    '/stego/textTransformer.js', '/stego/decipher.js', '/stego/text-stego.js', '/stego/file-stego.js', '/stego/truncate.js',
    '/stego/nostrStegoFetch.js', '/stego/nostr-recipient.js', '/stego/loader.js', '/stego/clickToCopy.js', '/stego/vendor/bech32.js', '/stego/vendor/crypto-js.min.js',
    '/stego/vendor/nostr-tools.bundle.js', '/stego/vendor/nostr-bunker.bundle.js',
    '/img/grain.png', '/siteEffects.js', '/siteEffects.css',
    '/living.html', '/living.css', '/living.mjs', '/livingModel.mjs',
    '/historical_data/generated/living-EU-observed.json',
    '/img/living/fuel.jpg', '/img/living/electricity.jpg',
    '/priceScanner.html', '/priceScanner.css', '/priceScanner.mjs',
    '/priceScannerOcr.mjs', '/priceScannerOcrWorker.mjs',
    '/priceScannerModel.mjs', '/priceScannerRates.mjs', '/priceScannerPhoto.mjs', '/priceScannerTracking.mjs', '/vendor/jsfeat/jsfeat-min.js', '/currencies.json',
    '/vendor/lucide/lucide.min.js'
];
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // Per file, not cache.addAll(CORE): addAll rejects as a unit, so a single 404 or a
        // dropped connection used to abort the whole install before the metadata below was
        // written — and Settings, which reads only that metadata, lost its "updated ..." line
        // until some later install happened to succeed.
        const failed = [];
        await Promise.all(CORE.map(async path => {
            try {
                const response = await fetch(path, {cache: 'reload'});
                if (response.ok) await cache.put(path, response);
                else failed.push(`${path} (${response.status})`);
            } catch (error) {
                failed.push(`${path} (${error && error.message})`);
            }
        }));
        if (failed.length) console.warn('sw: cached everything but', failed.length, 'of', CORE.length, failed.join(', '));
        await cache.put(CACHE_METADATA_URL, new Response(JSON.stringify({
            version: CACHE.slice(CACHE.lastIndexOf('v')),
            updatedAt: new Date().toISOString()
        }), {headers: {'content-type': 'application/json'}}));
        await self.skipWaiting();
    })());
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('satoshi-static-') && key !== CACHE).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    // Cache public static resources only; live data and user inputs are excluded.
    const navigation = request.mode === 'navigate';
    const asset = ['style', 'script', 'worker', 'image', 'font', 'audio'].includes(request.destination);
    const livingData = url.pathname === '/historical_data/generated/living-EU-observed.json';
    const newsData = url.pathname === '/news-data.json';
    const offersData = url.pathname === '/offers-data.json';
    const aiContext = url.pathname === '/AI_CONTEXT.md';
    const barkPricing = url.pathname === '/bark-pricing.json';
    const lofiAudio = url.pathname.startsWith('/audio/lofi/');
    const scannerAsset = url.pathname === '/currencies.json' || url.pathname.startsWith('/vendor/paddle/');
    const walletAsset = url.pathname.startsWith('/vendor/bark/');
    if ((!navigation && !asset && !livingData && !newsData && !offersData && !aiContext && !barkPricing && !lofiAudio && !scannerAsset && !walletAsset) || url.search) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        // Versioned, self-hosted OCR assets are large and immutable within a release.
        if (url.pathname.startsWith('/vendor/paddle/')) {
            const cached = await cache.match(request);
            if (cached) return cached;
        }
        try {
            const response = await fetch(request);
            if (response.ok && response.type === 'basic') {
                await cache.put(request, response.clone()).catch(() => {});
            }
            return response;
        } catch {
            const cached = await cache.match(request);
            if (cached) return cached;
            if (navigation) return cache.match('/offline.html');
            return Response.error();
        }
    })());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || '/wallet.html', self.location.origin).href;
    event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(windows => {
        const walletWindow = windows.find(client => new URL(client.url).pathname.endsWith('/wallet.html'));
        if (walletWindow) return walletWindow.navigate(target).then(client => client?.focus());
        return self.clients.openWindow(target);
    }));
});

self.addEventListener('push', event => {
    let message = {};
    try { message = event.data?.json?.() || {}; } catch { /* Use the private fallback below. */ }
    const title = message.title || 'Bitcoin received';
    event.waitUntil(self.registration.showNotification(title, {
        body: message.body || 'Open your Satoshi.si wallet to view the payment.',
        icon: '/android-chrome-192x192.png',
        badge: '/favicon-32x32.png',
        tag: message.tag || 'bark-mailbox',
        renotify: true,
        data: {url: message.url || '/wallet.html'},
    }));
});
