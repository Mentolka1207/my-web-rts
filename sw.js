// =============================================================================
// sw.js — Service Worker для оффлайн-работы и PWA кэширования
// =============================================================================

const CACHE_NAME = 'minimal-web-rts-v2';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './libs/three.min.js',
    './main.js',
    './js/config.js',
    './js/i18n.js',
    './js/storage.js',
    './js/maps.js',
    './js/prng.js',
    './js/audio.js',
    './js/grid.js',
    './js/spatialhash.js',
    './js/formations.js',
    './js/flowfield.js',
    './js/simulation.js',
    './js/scene.js',
    './js/terrain.js',
    './js/healthbar.js',
    './js/models.js',
    './js/instancing.js',
    './js/effects.js',
    './js/units.js',
    './js/resources.js',
    './js/economy.js',
    './js/ui.js',
    './js/ai.js',
    './js/minimap.js',
    './js/benchmark.js',
    './js/input.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Работа по стратегии Cache First с обновлением из сети
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // Если оффлайн и запрос страницы
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
