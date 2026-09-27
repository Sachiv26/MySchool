'use client';

import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { apiSend } from '@/lib/client/api';

const MENU_ITEMS = [
  { href: '/documents', label: 'Documents', icon: '📁' },
  { href: '/children', label: 'My children', icon: '🧒' },
  { href: '/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/absences', label: 'Report an absence', icon: '🏠' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/messages', label: 'All messages', icon: '💬' },
];

export default function MorePage() {
  return (
    <PageShell title="More" back="/" action={undefined}>
      <nav className="grid grid-cols-2 gap-3">
        {MENU_ITEMS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="card flex items-center gap-3 hover:bg-slate-50"
          >
            <span className="text-2xl">{m.icon}</span>
            <span className="font-medium text-slate-800">{m.label}</span>
          </Link>
        ))}
      </nav>

            <div className="mt-8 space-y-2">
        <form action="/api/auth/logout" method="post" onSubmit={async (e) => { e.preventDefault(); await apiSend('/api/auth/logout', {}); if (typeof window !== 'undefined') window.location.href = '/login'; }} className="block text-center text-sm text-slate-600 hover:text-slate-900">
          <button type="submit" className="w-full text-sm text-slate-600 hover:text-slate-900">Sign out</button>
        </form>
        <p className="text-center text-xs text-slate-400">MySchool Connect — MVP v0.1</p>
      </div>
    </PageShell>
  );
}

