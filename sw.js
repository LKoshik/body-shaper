// Body Shaper service worker: caches every file so the app works offline.
// When you change any file, bump VERSION so phones fetch the new files.
const VERSION = 'v1';
const CACHE = 'body-shaper-' + VERSION;
const FILES = [
  "./",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "index.html",
  "limbs.css",
  "manifest.webmanifest",
  "src/bones.js",
  "src/bulge.js",
  "src/export.js",
  "src/history.js",
  "src/landmarks.js",
  "src/limits.js",
  "src/main.js",
  "src/mesh.js",
  "src/overlays.js",
  "src/parts.js",
  "src/presets.js",
  "src/renderer.js",
  "src/sliders.js",
  "src/state.js",
  "src/tutorial.js",
  "src/ui.js",
  "src/upload.js",
  "src/warp.js",
  "src/zones.js",
  "style.css",
  "vendor/three.LICENSE.txt",
  "vendor/three.module.js"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('body-shaper-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
