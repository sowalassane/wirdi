const CACHE = 'wirdi-v33';
// Textes du Coran, traduction et translittération : cache à part, conservé quand CACHE change de version
const DATA = 'wirdi-data';
// Pages du mushaf (images) : cache à part aussi, rempli page par page ou par le bouton « Télécharger »
const MUSHAF = 'wirdi-mushaf';
const DATA_FILES = ['/quran-uthmani.txt', '/fr.hamidullah.txt', '/en.transliteration.txt'];
const ASSETS = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png', './icon-32.png', './maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith(CACHE.replace(/\d+$/, ''))).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Réseau d'abord pour la page (mises à jour), cache en secours hors-ligne
    if (url.pathname.endsWith('/app.js')) {
      e.respondWith(fetch(req, {cache: 'no-cache'}).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); return r; }).catch(() => caches.match(req)));
      return;
    }
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req, {cache: 'no-cache'}).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
      return;
    }
    if (/\/mushaf\/\d{3}\.png$/.test(url.pathname)) {
      e.respondWith(caches.open(MUSHAF).then(c => c.match(req, {ignoreSearch: true}).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
      return;
    }
    if (DATA_FILES.some(p => url.pathname.endsWith(p))) {
      e.respondWith(caches.open(DATA).then(c => c.match(req, {ignoreSearch: true}).then(hit => hit || caches.match(req).then(old => { if (old) { c.put(req, old.clone()); return old; } return fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }); }))));
      return;
    }
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); } return res; })));
    return;
  }
  // Polices Google : cache puis mise à jour en arrière-plan
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
