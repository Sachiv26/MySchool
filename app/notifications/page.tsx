'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { UrgencyTag, LoadingRows, ErrorBox, EmptyState } from '@/components/ui';
import PushSetup from '@/components/PushSetup';
import TermSelector from '@/components/TermSelector';
import { useTerm } from '@/components/TermContext';
import { apiGet, apiSend, fmtDateShort } from '@/lib/client/api';
import { getSchoolTerm, formatTerm } from '@/lib/utils/southAfricanTerms';

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { selectedTerm } = useTerm();

  const load = () =>
    apiGet<{ ok: true; unread: number; notifications: NotificationItem[] }>('/api/notifications')
      .then((d) => setItems(d.notifications))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const markOne = async (id: string) => {
    await apiSend('/api/notifications', { id }).catch(() => undefined);
    load();
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await apiSend('/api/notifications', {});
      await load();
    } finally {
      setBusy(false);
    }
  };

  // Group notifications by term (1-4) and filter to selected term.
  const grouped = useMemo(() => {
    if (!items) return [];
    const termStart = new Date(selectedTerm.startDate);
    const termEnd = new Date(selectedTerm.endDate);
    return items
      .filter((n) => {
        const d = new Date(n.createdAt);
        return d >= termStart && d <= termEnd;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, selectedTerm]);

  const unreadCount = items?.filter((n) => !n.readAt).length ?? 0;

  return (
    <PageShell title="Notifications" back="/">
      {error && <ErrorBox message={error} />}

      <div className="flex items-center justify-between gap-3">
        <PushSetup />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{formatTerm(selectedTerm)}</p>
        <TermSelector />
      </div>

      {items && items.length > 0 && unreadCount > 0 && (
        <button onClick={markAll} disabled={busy} className="btn-secondary w-full">
          Mark all as read ({unreadCount})
        </button>
      )}

      {!items && !error && <LoadingRows rows={4} />}

      {items && grouped.length === 0 && (
        <EmptyState icon="🔔" title={`No notifications for ${formatTerm(selectedTerm)}`} hint="Reminders and important school updates will appear here." />
      )}

      <ul className="space-y-3">
        {grouped.map((n) => (
          <li key={n.id}>
            <div className={`card flex gap-3 ${n.readAt ? 'opacity-70' : ''}`}>
              <span aria-hidden className="mt-0.5 text-lg">{n.readAt ? '📬' : '🔔'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-slate-900">{n.title}</p>
                  {!n.readAt && <UrgencyTag level="action">New</UrgencyTag>}
                </div>
                {n.body && <p className="mt-1 text-sm text-slate-600">{n.body}</p>}
                <p className="mt-1 text-xs text-slate-400">{fmtDateShort(n.createdAt)}</p>
                <div className="mt-2 flex gap-3 text-sm font-semibold text-brand-700">
                  {n.url && <Link href={n.url}>View →</Link>}
                  {!n.readAt && (
                    <button onClick={() => markOne(n.id)} className="text-slate-500 hover:text-slate-700">
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
