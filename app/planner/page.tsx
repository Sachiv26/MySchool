'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { EmptyState, ErrorBox, LoadingRows } from '@/components/ui';
import { apiGet, apiSend, fmtDate, fmtDateShort, fmtTime12, fmtMoney, isToday } from '@/lib/client/api';
import { downloadIcs, IcsTask, IcsEvent } from '@/lib/client/ics';

type TaskStatus = 'PENDING' | 'DONE' | 'DISMISSED';

interface Task {
  id: string;
  type: string;
  title: string;
  description: string | null;
  assignee: string | null;
  subject: string | null;
  amount: number | null;
  deadline: string | null;
  status: TaskStatus;
  gradeNames: string[];
  messageTitle: string;
  messageTypeLabel: string;
  messageTypeColor: string | null;
  messageId: string;
}

interface Event {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  endTime: string | null;
  location: string | null;
  isSchoolClosure: boolean;
  registrationRequired: boolean;
  registrationDeadline: string | null;
  gradeNames: string[];
  registered: boolean;
}

type Filter = 'all' | 'todo' | 'overdue' | 'done';

const TASK_TYPE_META: Record<string, { icon: string; label: string }> = {
  PAY: { icon: '💳', label: 'Payment' },
  SIGN: { icon: '✍️', label: 'Sign' },
  BRING: { icon: '🎒', label: 'Bring' },
  REGISTER: { icon: '📋', label: 'Register' },
  REPLY: { icon: '↩️', label: 'Reply' },
  PREPARE: { icon: '📝', label: 'Prepare' },
  COMPLETE: { icon: '📄', label: 'Complete' },
  WEAR: { icon: '👕', label: 'Wear' },
  OTHER: { icon: '📌', label: 'Task' },
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isOverdue(deadline: string | null, status: TaskStatus): boolean {
  if (!deadline || status !== 'PENDING') return false;
  return new Date(deadline) < startOfDay(new Date());
}

export default function PlannerPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [preview, setPreview] = useState<Task | Event | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(() => {
    apiGet<{ ok: true; tasks: Task[]; events: Event[] }>('/api/planner')
      .then((d) => { setTasks(d.tasks); setEvents(d.events); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your planner.'));
  }, []);
  useEffect(() => { load(); }, [load]);
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      if (filter === 'todo') return t.status === 'PENDING' && !isOverdue(t.deadline, t.status);
      if (filter === 'overdue') return isOverdue(t.deadline, t.status);
      if (filter === 'done') return t.status === 'DONE' || t.status === 'DISMISSED';
      return true;
    });
  }, [tasks, filter]);
  const upcomingEvents = useMemo(
    () =>
      events
        .filter((e) => new Date(e.eventDate) >= startOfDay(new Date()))
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [events]
  );
  const counts = useMemo(() => {
    if (!tasks) return { all: 0, todo: 0, overdue: 0, done: 0 };
    return {
      all: tasks.length,
      todo: tasks.filter((t) => t.status === 'PENDING' && !isOverdue(t.deadline, t.status)).length,
      overdue: tasks.filter((t) => isOverdue(t.deadline, t.status)).length,
      done: tasks.filter((t) => t.status === 'DONE' || t.status === 'DISMISSED').length,
    };
  }, [tasks]);
  const toggleStatus = async (task: Task, newStatus: TaskStatus) => {
    setBusyId(task.id);
    const previous = tasks!;
    setTasks(previous.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    try { await apiSend('/api/actions/status', { actionItemId: task.id, status: newStatus }); }
    catch (e) { setTasks(previous); setError(e instanceof Error ? e.message : 'Could not update task.'); }
    finally { setBusyId(null); }
  };
  const handleDownloadCalendar = () => {
    const icsTasks: IcsTask[] = (tasks ?? []).filter((t) => t.status !== 'DISMISSED').map((t) => ({
      id: t.id, title: `${taskTypeIcon(t.type)} ${t.title}`, description: taskDescription(t), deadline: t.deadline, status: t.status,
    }));
    const icsEvents: IcsEvent[] = (events ?? []).map((e) => ({
      id: e.id, title: e.isSchoolClosure ? `🏫 ${e.title}` : `📅 ${e.title}`, description: e.description, eventDate: e.eventDate, endTime: e.endTime, location: e.location,
    }));
    downloadIcs({ tasks: icsTasks, events: icsEvents });
  };
  const pendingCount = counts.todo + counts.overdue;
  return (
    <PageShell title="Planner" back="/">
      {error && <ErrorBox message={error} />}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📋</span>
          <div>
            <p className="text-sm font-bold text-slate-900">{pendingCount > 0 ? `${pendingCount} thing${pendingCount === 1 ? '' : 's'} to do` : 'All caught up 🎉'}</p>
            <p className="text-xs text-slate-500">{upcomingEvents.length} upcoming event{upcomingEvents.length === 1 ? '' : 's'} · {counts.done} completed</p>
          </div>
        </div>
        <button onClick={handleDownloadCalendar} className="btn-outline shrink-0 text-sm">📥 Calendar</button>
      </div>
      <div role="tablist" aria-label="Filter tasks" className="flex gap-2 overflow-x-auto">
        <FilterTab active={filter === 'todo'} onClick={() => setFilter('todo')} label="To Do" count={counts.todo} />
        <FilterTab active={filter === 'overdue'} onClick={() => setFilter('overdue')} label="Overdue" count={counts.overdue} urgent />
        <FilterTab active={filter === 'done'} onClick={() => setFilter('done')} label="Done" count={counts.done} />
        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts.all} />
      </div>
      {!tasks && !error && <LoadingRows rows={4} />}
      {tasks && (
        <>
          <h2 className="px-1 pt-2 text-sm font-bold uppercase tracking-wide text-slate-500">Tasks</h2>
          {filteredTasks.length === 0 ? (
            <EmptyState icon="✅" title="Nothing here" hint="Tasks from published school messages will appear here." />
          ) : (
            <div className="card divide-y divide-slate-100 p-0">
              {filteredTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPreview(t)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <span aria-hidden className="text-lg">
                    {taskTypeIcon(t.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-semibold ${
                        t.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-900'
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {t.deadline ? `Due ${fmtDateShort(t.deadline)}` : 'No due date'} · {t.messageTitle}
                    </span>
                  </span>
                  {t.status !== 'PENDING' && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      {t.status.toLowerCase()}
                    </span>
                  )}
                  <span aria-hidden className="text-slate-300">
                    ›
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <CalendarGrid tasks={filteredTasks} events={events} onItemClick={setPreview} />
      <h2 className="px-1 pt-2 text-sm font-bold uppercase tracking-wide text-slate-500">Upcoming events</h2>
      {upcomingEvents.length === 0 ? (
        <EmptyState icon="📅" title="No upcoming events" hint="Events from published school messages will appear here." />
      ) : (
        <div className="card divide-y divide-slate-100 p-0">
          {upcomingEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => setPreview(e)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-brand-50 px-2 py-1.5 text-brand-700">
                <span className="text-[10px] font-semibold uppercase leading-none">
                  {new Date(e.eventDate).toLocaleDateString(undefined, { month: 'short' })}
                </span>
                <span className="mt-0.5 text-sm font-bold leading-none">{new Date(e.eventDate).getDate()}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {e.isSchoolClosure ? '🏫 ' : '📅 '}
                  {e.title}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {fmtDate(e.eventDate)}
                  {e.location ? ` · ${e.location}` : ''}
                  {e.registrationRequired ? (e.registered ? ' · ✓ Registered' : ' · Registration required') : ''}
                  {e.gradeNames.length > 0 ? ` · ${e.gradeNames.join(', ')}` : ''}
                </span>
              </span>
              <span className="text-slate-300">›</span>
            </button>
          ))}
        </div>
      )}
      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} onToggle={toggleStatus} />}
    </PageShell>
  );
}

function PreviewModal({ item, onClose, onToggle }: { item: Task | Event; onClose: () => void; onToggle: (task: Task, status: TaskStatus) => void }) {
  const isTask = 'type' in item;
  const task = isTask ? (item as Task) : null;
  const event = !isTask ? (item as Event) : null;
  return (
    <div role="dialog" aria-modal="true" aria-label={item.title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex-1 text-lg font-bold text-slate-900">{item.title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        {task && <TaskPreviewBody task={task} />}
        {event && <EventPreviewBody event={event} />}
        <div className="mt-5 flex flex-col gap-2">
          {task && task.status !== 'DISMISSED' && (
            <button onClick={() => { onToggle(task, task.status === 'DONE' ? 'PENDING' : 'DONE'); onClose(); }}
              className={task.status === 'DONE' ? 'btn-outline w-full' : 'btn-primary w-full'}>
              {task.status === 'DONE' ? '↩️ Mark as not done' : '✓ Mark as done'}
            </button>
          )}
          {task && task.status === 'PENDING' && (
            <button onClick={() => { onToggle(task, 'DISMISSED'); onClose(); }} className="btn-outline w-full text-slate-500">Dismiss</button>
          )}
          {task && <Link href={`/messages/${task.messageId}`} onClick={onClose} className="btn-secondary w-full text-center">View source message →</Link>}
          <button onClick={onClose} className="btn-outline w-full">Close</button>
        </div>
      </div>
    </div>
  );
}

function TaskPreviewBody({ task }: { task: Task }) {
  const meta = TASK_TYPE_META[task.type] ?? TASK_TYPE_META.OTHER;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{meta.icon} {meta.label}</span>
        {task.assignee && task.assignee !== 'UNKNOWN' && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            {task.assignee === 'CHILD' ? '👧 For your child' : task.assignee === 'PARENT' ? '👤 For you' : task.assignee}
          </span>
        )}
        {task.gradeNames.length > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{task.gradeNames.join(', ')}</span>}
      </div>
      {task.description && <p className="whitespace-pre-line text-sm text-slate-700">{task.description}</p>}
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1">
        {task.subject && <DetailRow label="Subject" value={task.subject} />}
        {task.deadline && <DetailRow label="Deadline" value={fmtDate(task.deadline)} />}
        {task.amount != null && <DetailRow label="Amount" value={fmtMoney(task.amount)} />}
        <DetailRow label="From" value={task.messageTitle} />
      </dl>
    </div>
  );
}

function EventPreviewBody({ event }: { event: Event }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{event.isSchoolClosure ? '🏫 School closure' : '📅 Event'}</span>
        {event.gradeNames.length > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{event.gradeNames.join(', ')}</span>}
      </div>
      {event.description && <p className="whitespace-pre-line text-sm text-slate-700">{event.description}</p>}
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1">
        <DetailRow label="Date" value={fmtDate(event.eventDate)} />
        {event.endTime && <DetailRow label="Time" value={fmtTime12(event.endTime)} />}
        {event.location && <DetailRow label="Location" value={event.location} />}
        {event.registrationRequired && <DetailRow label="Registration" value={event.registered ? '✓ Registered' : `Required${event.registrationDeadline ? ` (by ${fmtDateShort(event.registrationDeadline)})` : ''}`} />}
      </dl>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function FilterTab({ active, onClick, label, count, urgent }: { active: boolean; onClick: () => void; label: string; count: number; urgent?: boolean }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${active ? (urgent ? 'border-red-500 bg-red-500 text-white' : 'border-brand-600 bg-brand-600 text-white') : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}>
      {label}
      {count > 0 && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${active ? 'bg-white/25' : 'bg-slate-100'}`}>{count}</span>}
    </button>
  );
}

function taskTypeIcon(type: string): string {
  return (TASK_TYPE_META[type] ?? TASK_TYPE_META.OTHER).icon;
}

function taskDescription(t: Task): string {
  const parts: string[] = [];
  if (t.description) parts.push(t.description);
  parts.push(`From: ${t.messageTitle}`);
  if (t.subject) parts.push(`Subject: ${t.subject}`);
  if (t.assignee) parts.push(`Who: ${t.assignee === 'CHILD' ? 'Child' : t.assignee === 'PARENT' ? 'Parent' : t.assignee}`);
  return parts.join('\n');
}

function CalendarGrid({ tasks, events, onItemClick }: { tasks: Task[]; events: Event[]; onItemClick: (item: Task | Event) => void }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; });
  const monthName = new Date(month.year, month.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const startOffset = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const itemsByDay = useMemo(() => {
    const map = new Map<number, { tasks: Task[]; events: Event[] }>();
    for (const t of tasks) { if (!t.deadline) continue; const d = new Date(t.deadline); if (d.getFullYear() !== month.year || d.getMonth() !== month.month) continue; const entry = map.get(d.getDate()) ?? { tasks: [], events: [] }; entry.tasks.push(t); map.set(d.getDate(), entry); }
    for (const e of events) { const d = new Date(e.eventDate); if (d.getFullYear() !== month.year || d.getMonth() !== month.month) continue; const entry = map.get(d.getDate()) ?? { tasks: [], events: [] }; entry.events.push(e); map.set(d.getDate(), entry); }
    return map;
  }, [tasks, events, month.year, month.month]);
  const prev = () => setMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 });
  const next = () => setMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 });
  const goToday = () => { const now = new Date(); setMonth({ year: now.getFullYear(), month: now.getMonth() }); };
  const cells: ({ day: number } | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={prev} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">←</button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">{monthName}</span>
          <button onClick={goToday} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">Today</button>
        </div>
        <button onClick={next} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">→</button>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (<div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">{d}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={idx} className="min-h-[68px] bg-slate-50" />;
          const items = itemsByDay.get(cell.day);
          const hasEvent = items && items.events.length > 0;
          return (
            <div key={idx} className="min-h-[68px] bg-white p-1">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${isToday(new Date(month.year, month.month, cell.day).toISOString()) ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white' : 'text-slate-700'}`}>{cell.day}</span>
                {hasEvent && <span className="text-[9px] leading-none">📅</span>}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {items?.tasks.slice(0, 2).map((t) => (<button key={t.id} onClick={() => onItemClick(t)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${t.status === 'DONE' ? 'bg-emerald-50 text-emerald-700 line-through' : isOverdue(t.deadline, t.status) ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{taskTypeIcon(t.type)} {t.title}</button>))}
                {items?.events.slice(0, 1).map((e) => (<button key={e.id} onClick={() => onItemClick(e)} className="block w-full truncate rounded bg-brand-50 px-1 py-0.5 text-left text-[10px] font-medium text-brand-700">📅 {e.title}</button>))}
                {items && items.tasks.length + items.events.length > 3 && <span className="block text-center text-[9px] text-slate-400">+{items.tasks.length + items.events.length - 3} more</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Task</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Overdue</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-brand-400" /> Event</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Done</span>
      </div>
    </div>
  );
}

