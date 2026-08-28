'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { EmptyState, ErrorBox, LoadingRows, UrgencyTag, type Urgency } from '@/components/ui';
import { apiGet, fmtDate, fmtTime12, isToday } from '@/lib/client/api';
import type { CalendarItem } from '@/lib/services/parentViews';

const KIND_META: Record<CalendarItem['kind'], { icon: string; label: string }> = {
  EVENT: { icon: '📅', label: 'Event' },
  DEADLINE: { icon: '⏰', label: 'Deadline' },
  PAYMENT: { icon: '💳', label: 'Payment' },
  ABSENCE: { icon: '🚸', label: 'Absence' },
};

interface ChildOption { id: string; firstName: string; surname: string }

export default function CalendarPage() {
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [childId, setChildId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ children: ChildOption[] }>('/api/parents/children')
      .then((j) => setChildren(j.children))
      .catch(() => setChildren([]));
  }, []);

  useEffect(() => {
    const qs = childId ? `?childId=${encodeURIComponent(childId)}` : '';
    setItems(null);
    apiGet<{ items: CalendarItem[] }>(`/api/calendar${qs}`)
      .then((j) => setItems(j.items))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the calendar.'));
  }, [childId]);

  // Group by month for skimmability.
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items ?? []) {
      const key = new Date(item.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <PageShell title="Calendar">
      {children.length > 1 && (
        <div role="group" aria-label="Filter by child" className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={childId === ''} onClick={() => setChildId('')}>All children</FilterChip>
          {children.map((c) => (
            <FilterChip key={c.id} active={childId === c.id} onClick={() => setChildId(c.id)}>
              {c.firstName}
            </FilterChip>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} />}
      {!items && !error && <LoadingRows rows={5} />}

      {items && items.length === 0 && (
        <EmptyState icon="📅" title="Nothing on the calendar yet"
          hint="Events and deadlines appear here once your school publishes messages." />
      )}

      {grouped.map(([month, entries]) => (
        <section key={month} aria-label={month}>
          <h2 className="px-1 pb-1 pt-3 text-sm font-bold uppercase tracking-wide text-slate-500">{month}</h2>
          <div className="space-y-2">
            {entries.map((item) => {
              const meta = KIND_META[item.kind];
              const level: Urgency =
                item.kind === 'ABSENCE' ? 'neutral'
                : isToday(item.date) ? 'urgent'
                : item.urgent ? 'action'
                : 'info';
              return (
                <Link key={`${item.kind}-${item.id}`} href={item.url} className={`card block ${isToday(item.date) ? 'border-brand-300 bg-brand-50/60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-white py-1 shadow-sm ring-1 ring-slate-200">
                      <span aria-hidden>{meta.icon}</span>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {fmtDate(item.date)}
                        {item.time ? ` · ${fmtTime12(item.time)}` : ''}
                        {item.location ? ` · ${item.location}` : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <UrgencyTag level={level}>
                          {item.kind === 'DEADLINE' ? 'Deadline' :
                           item.kind === 'PAYMENT' ? (item.urgent ? 'Payment due' : 'Paid') :
                           item.kind === 'ABSENCE' ? 'Absent' :
                           isToday(item.date) ? 'Today' : 'Upcoming'}
                        </UrgencyTag>
                        {item.labels.slice(0, 2).map((l) => (
                          <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{l}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </PageShell>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${
        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
