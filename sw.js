const CACHE = 'satoshi-static-v34';
const CORE = [
    '/', '/offline.html', '/styles.css', '/theme.css', '/pwa.js',
    '/coockieConsent.js', '/copyonclick.js', '/mempoolWebSocket.js',
    '/text.js', '/contact.js', '/index.js', '/burgerMenu.js', '/nameForm.js',
    '/android-chrome-192x192.png', '/android-chrome-512x512.png',
    '/isBip39.html', '/isBip39.css', '/isBip39.js', '/bip39Lab.css',
    '/bip39Lab.mjs', '/bip39LabModel.mjs', '/bip39Glossary.mjs', '/vendor/bip39.mjs',
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
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
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
    const asset = ['style', 'script', 'worker', 'image', 'font'].includes(request.destination);
    const livingData = url.pathname === '/historical_data/generated/living-EU-observed.json';
    const scannerAsset = url.pathname === '/currencies.json' || url.pathname.startsWith('/vendor/paddle/');
    if ((!navigation && !asset && !livingData && !scannerAsset) || url.search) return;
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
