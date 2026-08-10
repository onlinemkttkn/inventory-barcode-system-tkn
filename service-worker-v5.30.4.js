'use strict';

const VERSION = '5.30.4';
const STATIC_CACHE = `tkn-static-${VERSION}`;
const PAGE_CACHE = `tkn-pages-${VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './dashboard.html',
  './pos.html',
  './pos-box-sale.html',
  './scanner.html',
  './mobile-stock-check.html',
  './box-qr-stock.html',
  './stock-intake.html',
  './js/inventory-workspace.js',
  './js/inventory-stock-intake-v5-28-7.js',
  './css/inventory-stock-intake-v5-28-7.css',
  './js/tkn-unified-scanner-v5-29-0.js',
  './css/tkn-unified-scanner-v5-29-0.css',
  './sort-pack-qr.html',
  './print-labels.html',
  './products-admin.html',
  './stock-promotions.html',
  './shopee-import.html',
  './lazada-import.html',
  './manual-product-import.html',
  './reports.html',
  './transactions.html',
  './phase-9-2-bill-search.html',
  './import-export.html',
  './universal-import.html',
  './css/universal-import-v5-28-1.css',
  './js/universal-import-v5-28-2.js',
  './js/universal-receiving-v5-28-1.js',
  './js/manual-product-import-v5-28-1.js',
  './inventory-operations.html',
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
  './css/sort-pack-qr-v5-25-6.css',
  './css/print-labels-v5-25-0.css',
  './css/products-admin-v5-25-0.css',
  './css/stock-promotions-v5-25-0.css',
  './css/box-qr-stock-v5-25-6.css',
  './css/box-history-v5-28-3.css',
  './css/box-lifecycle-v5-28-4.css',
  './css/stock-intake-v5-28-5.css',
  './css/mobile-stock-check.css',
  './css/pos-box-sale-inline-v5-26-2.css',
  './css/marketplace-workflow-v5-27-1.css',
  './js/app-shell-v5-19.js',
  './js/ui-refinement-v5-20-4.js',
  './js/tkn-safe-back.js',
  './js/tkn-product-pattern-v5-25-1.js',
  './js/tkn-category-engine-v5-25-0.js',
  './js/tkn-box-code-v5-25-5.js',
  './js/sort-pack-qr-v5-27-1.js',
  './js/print-labels-v5-25-9.js',
  './js/products-admin-v5-25-9.js',
  './js/stock-promotions-v5-25-0.js',
  './js/scanner-v5-25-1.js',
  './js/mobile-stock-check-v5-26-2.js',
  './js/box-qr-stock-v5-28-3.js',
  './js/box-lifecycle-v5-28-4.js',
  './js/stock-intake-v5-28-5.js',
  './js/pos-box-sale-inline-v5-26-2.js',
  './pos-v5-26-2.js',
  './js/tracking-camera-scanner-v5-20-2.js',
  './js/box-qr-camera-scanner-v5-20-3.js',
  './js/marketplace-sort-source-sync-v5-20-1.js',
  './js/marketplace-workflow-v5-27-1.js',
  './js/tkn-category-th-v5-27-1.js',

  './js/tkn-unified-label-layout-v5-30-4.js',
  './css/tkn-unified-label-layout-v5-30-4.css',
  './js/tkn-print-platform-v5-30-4.js',
  './css/tkn-print-platform-v5-30-4.css',
  './js/print-labels-v5-30-4.js',
  './js/sort-pack-qr-v5-30-4.js',
  './js/box-qr-stock-v5-30-4.js',
  './js/stock-intake-v5-30-3.js',];

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

  if (['script', 'style'].includes(request.destination)) {
    // v5.29.0: code/assets must prefer network so a hotfix cannot stay stuck behind an old cache.
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }

  if (['image', 'font'].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
