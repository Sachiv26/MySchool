'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';

const ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/messages', label: 'Messages', icon: '📨' },
  { href: '/admin/absences', label: 'Absences', icon: '🏥' },
  { href: '/admin/grades', label: 'Grades', icon: '🎓' },
  { href: '/admin/parents', label: 'Parents', icon: '👪' },
];

/** Admin (school administrator) page shell with a lightweight top nav.
 *  Authorization is enforced on every admin API route — these links are a
 *  convenience surface only. */
export default function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (pathname === href || pathname.startsWith(href + '/'));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">🛡️ Admin</h1>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex flex-wrap gap-1">
            {ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  active(it.href)
                    ? 'bg-brand-700 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {it.icon} {it.label}
              </Link>
            ))}
          </nav>
          <UserMenu />
        </div>
      </header>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {pathname !== '/admin' && (
          <Link href="/admin" className="text-sm font-semibold text-brand-700 hover:underline">
            ← back
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
