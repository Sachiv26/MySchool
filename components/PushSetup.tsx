'use client';

import { useEffect, useState } from 'react';

/**
 * Web Push enrollment card for the notifications screen.
 *
 * - Reads the public VAPID key from /api/push/subscribe (unauthenticated).
 * - In development registers the push-only /sw-push.js worker (the app-shell
 *   /sw.js stays disabled in dev to avoid serving stale chunks); in production
 *   reuses the already-registered /sw.js which includes the same handlers.
 * - Subscribes with the browser and stores the P256DH/AUTH keys server-side.
 */
export default function PushSetup() {
  const [status, setStatus] = useState<'loading' | 'unsupported' | 'off' | 'enabled' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const urlBase64ToUint8Array = (base64url: string): Uint8Array => {
    const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const raw = atob(pad);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  const b64url = (input: ArrayBuffer | null): string => {
    if (!input) return '';
    const bytes = new Uint8Array(input);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  const registerWorker = () => {
    const swUrl = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw-push.js';
    return navigator.serviceWorker.register(swUrl);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/push/subscribe', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok || !j.ok || !j.vapidPublicKey || !supported()) {
          if (!cancelled) setStatus('unsupported');
          return;
        }
        const reg = await registerWorker();
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Re-register the endpoint so the row belongs to the signed-in user.
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: existing.endpoint,
              p256dh: b64url(existing.getKey('p256dh')),
              auth: b64url(existing.getKey('auth')),
            }),
          }).catch(() => undefined);
        }
        if (!cancelled) setStatus(existing ? 'enabled' : 'off');
      } catch {
        if (!cancelled) setStatus('unsupported');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    if (!supported()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/push/subscribe', { cache: 'no-store' });
      const j = await r.json();
      if (!j.vapidPublicKey) {
        setStatus('unsupported');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(j.vapidPublicKey),
        });
      }
      const saved = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: b64url(sub.getKey('p256dh')),
          auth: b64url(sub.getKey('auth')),
        }),
      });
      if (!saved.ok) throw new Error('Could not save your subscription.');
      setStatus('enabled');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Browser permission was denied.');
      setStatus('off');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      if (supported()) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => undefined);
          await sub.unsubscribe().catch(() => undefined);
        }
      }
      setStatus('off');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'unsupported') return null;
  if (status === 'loading') return null;

  return (
    <div className="card flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">🔔 Push alerts</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {status === 'enabled'
            ? 'You will get an OS-level alert for new school messages and reminders, even when the app is closed.'
            : 'Get an OS-level alert on this device for new messages and reminders.'}
        </p>
      </div>
      {status === 'enabled' ? (
        <button type="button" onClick={disable} disabled={busy} className="btn-outline shrink-0 text-sm">
          Disable
        </button>
      ) : (
        <button type="button" onClick={enable} disabled={busy} className="btn-primary shrink-0 text-sm">
          {busy ? 'Enabling…' : 'Enable'}
        </button>
      )}
    </div>
  );
}