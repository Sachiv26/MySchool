/* MySchool Connect — Push Notification service worker.
   Lightweight: NO fetch interception, NO caching. Used in development so Web
   Push still works while the app-shell cache worker is disabled there. */
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