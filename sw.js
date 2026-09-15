const CACHE = 'satoshi-static-v8';
const CORE = [
    '/', '/offline.html', '/styles.css', '/theme.css', '/pwa.js',
    '/coockieConsent.js', '/copyonclick.js', '/mempoolWebSocket.js',
    '/text.js', '/contact.js', '/index.js', '/burgerMenu.js', '/nameForm.js',
    '/android-chrome-192x192.png', '/android-chrome-512x512.png',
    '/isBip39.html', '/isBip39.css', '/isBip39.js', '/bip39Lab.css',
    '/bip39Lab.mjs', '/bip39LabModel.mjs', '/bip39Glossary.mjs', '/vendor/bip39.mjs',
    '/img/grain.png', '/siteEffects.js', '/siteEffects.css'
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
    const asset = ['style', 'script', 'image', 'font'].includes(request.destination);
    if ((!navigation && !asset) || url.search) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
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
