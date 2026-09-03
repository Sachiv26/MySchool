'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import BottomNav from './BottomNav';
import UserMenu from './UserMenu';

/**
 * Parent-app page shell: sticky compact header, scrollable content constrained
 * to a phone-like column on desktop, and the bottom navigation on mobile.
 */
export default function PageShell({
  title,
  back,
  action,
  children,
}: {
  title: string;
  back?: string;
  action?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3">
          {back && (
            <Link href={back} aria-label="Back" className="rounded-full p-1 text-xl leading-none text-slate-500 hover:bg-slate-100">
              ←
            </Link>
          )}
          <h1 className="flex-1 truncate text-lg font-bold text-slate-900">{title}</h1>
          {action && (
            <Link href={action.href} className="text-sm font-semibold text-brand-700 hover:underline">
              {action.label}
            </Link>
          )}
          <UserMenu
            links={[
              { href: '/planner', label: 'Planner', icon: '📋' },
              { href: '/documents', label: 'Documents', icon: '📁' },
              { href: '/notifications', label: 'Notifications', icon: '🔔' },
              { href: '/payments', label: 'Payments', icon: '💳' },
              { href: '/calendar', label: 'Calendar', icon: '📅' },
              { href: '/messages', label: 'All messages', icon: '💬' },
              { href: '/absences/new', label: 'Report absence', icon: '🏥' },
              { href: '/children', label: 'My children', icon: '🧒' },
            ]}
          />
        </div>
      </header>
      <main className="flex-1 space-y-4 px-4 pb-24 pt-3">{children}</main>
      <BottomNav />
    </div>
  );
}
