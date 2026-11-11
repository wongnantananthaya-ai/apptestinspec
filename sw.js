// Offline support: keeps every file the app needs on the phone.
// Online: always fetch the newest file (and refresh the stored copy); slow or no network: use the stored copy.
// Add any new file the app loads to FILES, and bump CACHE when the list changes.
const CACHE = 'insp-v2';
const FILES = [
  './', 'index.html', 'manifest.json', 'murata_logo.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'print/layout.js', ...['AHU', 'BP', 'CFP', 'EF', 'HEX', 'PCAC', 'SF', 'VF', 'VP', 'WP'].map(id => `print/${id}.jpg`),
  ...['bp_points', 'cfp_piping', 'fan_points', 'hex_plates', 'hex_rods', 'vp_points', 'wp_alignment', 'wp_points'].map(n => `img/${n}.png`),
];
const WAIT_MS = 3000;   // field networks can hang; after this the stored copy answers

// Store each file on its own: one file missing on the server must not leave the phone with nothing.
const fillGaps = () => caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.match(f).then(hit => hit || c.add(f)))));

self.addEventListener('install', (e) => {
  e.waitUntil(fillGaps().then(() => self.skipWaiting()));
});

// The page says 'warm' each time it opens online: whatever an earlier visit missed gets stored now
self.addEventListener('message', (e) => {
  if (e.data === 'warm') e.waitUntil(fillGaps());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const stored = () => caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('./') : undefined));
  const fresh = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fallback = () => stored().then(r => { if (r && !done) { done = true; resolve(r); } else if (!r) fresh.then(resolve, () => resolve(Response.error())); });
    const timer = setTimeout(fallback, WAIT_MS);
    fresh.then(res => { clearTimeout(timer); if (!done) { done = true; resolve(res); } }, () => { clearTimeout(timer); fallback(); });
  }));
});
