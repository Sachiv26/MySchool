'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiGet, apiSend } from '@/lib/client/api';

interface MeUser {
  id: string;
  name: string;
  email: string;
  role: string;
}
interface MeResponse {
  ok: boolean;
  user: MeUser;
  parent: { id: string; name: string; surname: string } | null;
  schools: { id: string; name: string; role: string }[];
}

const ROLE_LABEL: Record<string, string> = {
  PARENT: 'Parent',
  ADMIN: 'School administrator',
  TEACHER: 'Teacher',
};

/**
 * Avatar + dropdown identity menu shared by the parent app and the admin
 * dashboard. Shows who is signed in and the sign-out action. Fully keyboard
 * accessible (Escape closes, click-outside closes, closes on navigation).
 */
export default function UserMenu({ links = [] }: { links?: { href: string; label: string; icon: string }[] }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    apiGet<MeResponse>('/api/me').then(setMe).catch(() => setMe(null));
  }, []);

  // Close on navigation and on outside click / Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!me) return null; // unauthenticated or still loading — stay invisible

  const initials = me.user.name
    .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  const roleLabel = ROLE_LABEL[me.user.role] ?? me.user.role;
  const schoolName = me.schools[0]?.name ?? null;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await apiSend('/api/auth/logout', {});
    } finally {
      window.location.href = '/login';
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white ring-2 ring-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <span aria-hidden>{initials}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{me.user.name}</p>
            <p className="truncate text-xs text-slate-500">{me.user.email}</p>
            <p className="mt-1 text-xs font-medium text-brand-700">{roleLabel}</p>
            {schoolName && <p className="truncate text-xs text-slate-500">{schoolName}</p>}
          </div>

          {links.length > 0 && (
            <div className="py-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span aria-hidden>{l.icon}</span> {l.label}
                </Link>
              ))}
            </div>
          )}

          <div className="border-t border-slate-100 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <span aria-hidden>🚪</span> {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
