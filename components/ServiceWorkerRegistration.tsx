'use client';

import { useEffect } from 'react';

/**
 * PWA service worker lifecycle.
 *
 * - Production: registers /sw.js for offline support.
 * - Development: proactively unregisters any service worker and clears its
 *   caches. Dev-mode output must never be served from a SW cache (stale
 *   chunks make the app appear to hang), so we self-heal if a worker was
 *   ever registered on this origin.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // Kill only the caching app-shell worker; a separate push-only worker
      // (/sw-push.js) is registered by PushSetup so dev push still works.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          const active = r.active ?? r.waiting ?? r.installing;
          const path = active ? new URL(active.scriptURL).pathname : new URL(r.scope).pathname;
          if (path.endsWith('/sw.js')) void r.unregister();
        });
      });
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration is non-critical; ignore failures.
    });
  }, []);
  return null;
}