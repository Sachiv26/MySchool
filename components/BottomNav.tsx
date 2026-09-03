'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/planner', label: 'Planner', icon: '📋' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/documents', label: 'Documents', icon: '📁' },
  { href: '/messages', label: 'Messages', icon: '💬' },
  { href: '/more', label: 'More', icon: '☰' },
];

/** Mobile-first bottom navigation (parent app shell). */
export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-safe md:hidden">
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span aria-hidden className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
