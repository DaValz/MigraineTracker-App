/* Service worker del Diario Emicrania: rende l'app disponibile offline. */
/* BEGIN GENERATED (tools/build_sw.py) */
const VERSION = 'f2d72be97a';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/analysis.js',
  'js/app.js',
  'js/backup.js',
  'js/boot.js',
  'js/charts.js',
  'js/clinical.js',
  'js/data.js',
  'js/dates.js',
  'js/dom.js',
  'js/env.js',
  'js/exporter.js',
  'js/files.js',
  'js/format.js',
  'js/icons.js',
  'js/lock.js',
  'js/pdfview.js',
  'js/store.js',
  'js/theme.js',
  'js/ui.js',
  'js/views/calendar.js',
  'js/views/care.js',
  'js/views/day.js',
  'js/views/documents.js',
  'js/views/episode.js',
  'js/views/help.js',
  'js/views/history.js',
  'js/views/home.js',
  'js/views/lists.js',
  'js/views/midas.js',
  'js/views/record.js',
  'js/views/relief.js',
  'js/views/report.js',
  'js/views/settings.js',
  'js/views/shared.js',
  'js/views/stats.js',
  'js/views/therapies.js',
  'js/weather.js',
  'js/zip.js',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/pdfjs/pdf.min.js',
  'vendor/pdfjs/pdf.worker.min.js',
  'vendor/pdfjs/wasm/jbig2.wasm',
  'vendor/pdfjs/wasm/openjpeg.wasm',
  'vendor/pdfjs/wasm/qcms_bg.wasm',
];
/* END GENERATED */

const CACHE = `emicrania-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('emicrania-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    try {
      return await fetch(req);
    } catch (e) {
      return new Response('Contenuto non disponibile offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
