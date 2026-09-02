/* MySchool Connect service worker — offline app shell + basic routing. */

const CACHE = 'myschool-v2';
const PRECACHE = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Never intercept API, RSC payload, Next data or HMR requests.
  if (
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('_rsc') ||
    url.pathname.startsWith('/_next/data') ||
    url.pathname.startsWith('/_next/webpack-hmr')
  ) {
    return;
  }

  // Immutable build assets + icons: cache-first.
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.status === 200) {
              const clone = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Everything else (pages): network-first, cache as offline fallback.
  // Never serve a cached page while the network is reachable.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Response.error()))
  );
});

// ---------------------------------------------------------------------------
// Web Push (production — the same handlers as sw-push.js)
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = { title: 'MySchool Connect', body: '', url: '/', icon: '/icons/icon-192.png' };
  try {
    const parsed = event.data ? JSON.parse(event.data.text()) : {};
    data = { ...data, ...parsed };
  } catch {
    /* fall back to defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MySchool Connect', {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
            return client.navigate(url).then(() => client.focus());
          }
        }
        return self.clients.openWindow(url);
      })
      .catch(() => self.clients.openWindow(url))
  );
});