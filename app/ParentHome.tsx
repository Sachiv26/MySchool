'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { SectionTitle, EmptyState, ErrorBox, LoadingRows, UrgencyTag, type Urgency } from '@/components/ui';
import { apiGet, fmtDate, fmtDateShort, fmtMoney, fmtTime12, isToday } from '@/lib/client/api';

export interface DashboardChild {
  id: string;
  firstName: string;
  surname: string;
  grade: { name: string };
}
export interface DashboardActionItem {
  id: string; type: string; title: string; amount: number | null;
  deadline: string | null; status: string; grades: string[]; allGrades: boolean;
}
export interface DashboardData {
  children: DashboardChild[];
  events: {
    id: string; title: string; eventDate: string; startTime: string | null;
    location: string | null; grades: string[]; registered: boolean; registrationRequired: boolean;
  }[];
  actionItems: DashboardActionItem[];
  notifications: { id: string; title: string; body: string | null; url: string | null; readAt: string | null; createdAt: string }[];
  stats: { children: number; messages: number; events: number; unreadNotifications: number };
}

const TYPE_ICON: Record<string, string> = {
  PAY: '💳', SIGN: '✍️', BRING: '🎒', REGISTER: '📝', REPLY: '💬', OTHER: '📋',
};

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const json = await apiGet<{ dashboard: DashboardData }>('/api/dashboard');
      setData(json.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
    }
  }
  useEffect(() => { void load(); }, []);

  async function markDone(id: string) {
    setBusyId(id);
    try {
      await fetch('/api/actions/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionItemId: id, status: 'DONE' }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const todayEvents = (data?.events ?? []).filter((e) => isToday(e.eventDate));
  const upcoming = (data?.events ?? []).filter((e) => !isToday(e.eventDate)).slice(0, 4);
  const pendingActions = (data?.actionItems ?? []).filter((a) => a.status === 'PENDING');
  const recentNotifications = data?.notifications.slice(0, 3) ?? [];

  return (
    <PageShell title="MySchool Connect" action={{ href: '/notifications', label: '🔔' }}>
      {error && <ErrorBox message={error} />}
      {!data && !error && <LoadingRows rows={4} />}
      {data && (
        <ChildrenStrip data={data} todayEvents={todayEvents} upcoming={upcoming}
          pendingActions={pendingActions} recentNotifications={recentNotifications}
          busyId={busyId} markDone={markDone} />
      )}
    </PageShell>
  );
}

function ChildrenStrip({
  data, todayEvents, upcoming, pendingActions, recentNotifications, busyId, markDone,
}: {
  data: DashboardData;
  todayEvents: DashboardData['events'];
  upcoming: DashboardData['events'];
  pendingActions: DashboardActionItem[];
  recentNotifications: DashboardData['notifications'];
  busyId: string | null;
  markDone: (id: string) => void;
}) {
  return (
    <>
      <section aria-label="Your children">
        {data.children.length === 0 ? (
          <div className="card border-brand-200 bg-brand-50">
            <p className="font-semibold text-brand-900">Welcome! Add your first child</p>
            <p className="mt-1 text-sm text-brand-800">
              We use their grade to show you the right school messages.
            </p>
            <Link href="/children" className="btn-primary mt-3">Add a child</Link>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.children.map((c) => (
              <div key={c.id} className="card flex min-w-36 shrink-0 flex-col items-center py-3">
                <span aria-hidden className="text-2xl">🎓</span>
                <span className="mt-1 text-sm font-semibold text-slate-900">{c.firstName}</span>
                <span className="text-xs font-medium text-brand-700">{c.grade.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <SectionTitle>Today</SectionTitle>
      {todayEvents.length === 0 && pendingActions.length === 0 ? (
        <EmptyState icon="☀️" title="Nothing needs attention today" hint="Enjoy the calm — we'll flag anything urgent here." />
      ) : (
        <>
          {todayEvents.map((e) => (
            <EventRow key={e.id} event={e} today />
          ))}
          {(data.actionItems ?? [])
            .filter((a) => a.status !== 'DONE' && a.deadline && isToday(a.deadline))
            .map((a) => (
              <ActionCard key={a.id} item={a} busy={busyId === a.id} onDone={() => markDone(a.id)} />
            ))}
        </>
      )}

      <SectionTitle action={{ href: '/messages', label: 'All messages' }}>Action required</SectionTitle>
      {pendingActions.length === 0 ? (
        <EmptyState icon="✅" title="You're all caught up" hint="New actions appear when the school publishes messages." />
      ) : (
        pendingActions.map((a) => (
          <ActionCard key={a.id} item={a} busy={busyId === a.id} onDone={() => markDone(a.id)} />
        ))
      )}

      <SectionTitle action={{ href: '/calendar', label: 'Calendar' }}>Upcoming</SectionTitle>
      {upcoming.length === 0 ? (
        <EmptyState icon="📅" title="No upcoming events yet" />
      ) : (
        upcoming.map((e) => <EventRow key={e.id} event={e} />)
      )}

      <SectionTitle action={{ href: '/notifications', label: 'See all' }}>Notifications</SectionTitle>
      {recentNotifications.length === 0 ? (
        <EmptyState icon="🔔" title="No notifications yet" />
      ) : (
        recentNotifications.map((n) => (
          <Link key={n.id} href={n.url ?? '/notifications'}
            className={`card block ${n.readAt ? '' : 'border-l-4 border-l-brand-600'}`}>
            <p className="text-sm font-semibold text-slate-900">{n.title}</p>
            {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{n.body}</p>}
          </Link>
        ))
      )}
    </>
  );
}

function EventRow({ event: e, today }: { event: DashboardData['events'][number]; today?: boolean }) {
  return (
    <Link href={`/events/${e.id}`} className={`card block ${today ? 'border-sky-200 bg-sky-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-semibold ${today ? 'text-sky-900' : 'text-slate-900'}`}>{e.title}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {fmtDate(e.eventDate)}
            {e.startTime ? ` · ${fmtTime12(e.startTime)}` : ''}
            {e.location ? ` · ${e.location}` : ''}
          </p>
        </div>
        {today && <UrgencyTag level="info">Today</UrgencyTag>}
        {!today && e.registrationRequired && (e.registered
          ? <UrgencyTag level="done">Registered</UrgencyTag>
          : <UrgencyTag level="action">Register</UrgencyTag>)}
      </div>
    </Link>
  );
}

function ActionCard({
  item,
  busy,
  onDone,
}: {
  item: DashboardActionItem;
  busy?: boolean;
  onDone?: () => void;
}) {
  const overdue = item.deadline ? new Date(item.deadline).getTime() < Date.now() : false;
  const level: Urgency = item.status === 'DONE' ? 'done' : overdue ? 'overdue' : 'action';
  return (
    <div className={`card ${item.status === 'DONE' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            <span aria-hidden className="mr-1">{TYPE_ICON[item.type] ?? '📋'}</span>
            {item.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {item.grades.length > 0 ? item.grades.join(', ') : 'All grades'}
            {item.amount != null && <> · {fmtMoney(item.amount)}</>}
            {item.deadline && <> · due {fmtDateShort(item.deadline)}</>}
          </p>
        </div>
        <UrgencyTag level={level}>
          {item.status === 'DONE' ? 'Done' : overdue ? 'Overdue' : 'To do'}
        </UrgencyTag>
      </div>
      {item.status !== 'DONE' && onDone && (
        <button onClick={onDone} disabled={busy} className="btn-secondary mt-3 w-full text-sm">
          {busy ? 'Saving…' : 'Mark as done'}
        </button>
      )}
    </div>
  );
}


