// Service worker: app shell cache + push notifications.
const CACHE = 'claude-note-v43';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/cornell.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && !r.redirected && !/^\/(login|approve)\./.test(url.pathname)) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Claude 筆記', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Claude 筆記', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' }, tag: d.url || undefined, renotify: true,
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  const note = url.searchParams.get('note'), learn = url.searchParams.get('learn'), read = url.searchParams.get('read');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => new URL(c.url).origin === self.location.origin);
    if (w) { if (note) w.postMessage({ openNote: note }); if (learn) w.postMessage({ openLearn: learn }); if (read) w.postMessage({ openRead: read }); return w.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
