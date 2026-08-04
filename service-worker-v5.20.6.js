'use strict';

const VERSION = '5.22.11';
const STATIC_CACHE = `tkn-static-${VERSION}`;
const PAGE_CACHE = `tkn-pages-${VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './pos.html',
  './mobile-stock-check.html',
  './box-qr-stock.html',
  './sort-pack-qr.html',
  './shopee-import.html',
  './lazada-import.html',
  './reports.html',
  './transactions.html',
  './phase-9-2-bill-search.html',
  './import-export.html',
  './inventory-operations.html',
  './print-labels.html',
  './products-admin.html',
  './sales-history.html',
  './offline.html',
  './manifest.webmanifest',
  './favicon.svg',
  './assets/tkn-company-logo.png',
  './assets/icons/tkn-app-192.png',
  './assets/icons/tkn-app-512.png',
  './assets/icons/tkn-app-maskable-512.png',
  './css/global-font.css',
  './css/theme-red-yellow-black.css',
  './css/ui-modern-v5-19.css',
  './css/app-shell-v5-19.css',
  './css/ui-refinement-v5-20-4.css',
  './css/sort-pack-qr-v5-20-2.css',
  './css/box-qr-stock-v5-20-3.css',
  './css/box-qr-preview-v5-20-6.css',
  './js/app-shell-v5-19.js',
  './js/ui-refinement-v5-20-4.js',
  './js/tkn-safe-back.js',
  './js/tkn-category-engine-v5-20-1.js',
  './js/sort-pack-qr-v5-20-2.js',
  './js/tracking-camera-scanner-v5-20-2.js',
  './js/box-qr-camera-scanner-v5-20-3.js',
  './js/box-qr-stock-v5-20-6.js',
  './js/marketplace-sort-source-sync-v5-20-1.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('tkn-') && ![STATIC_CACHE, PAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.hostname.includes('supabase')
    || url.pathname.includes('/rest/v1/')
    || url.pathname.includes('/auth/v1/')
    || url.pathname.includes('/storage/v1/')
    || url.pathname.includes('/functions/v1/');
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) return caches.match(fallbackUrl);
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const update = fetch(request)
    .then(async (response) => {
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || update;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGE_CACHE, './offline.html'));
    return;
  }

  if (['style', 'script', 'image', 'font'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
