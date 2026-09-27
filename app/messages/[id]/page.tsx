'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { EmptyState, ErrorBox, LoadingRows, DetailRow, TypeTag } from '@/components/ui';
import { apiGet, apiSend, fmtDate, fmtDateShort, fmtMoney, fmtTime12 } from '@/lib/client/api';

interface Detail {
  id: string;
  title: string;
  summary: string | null;
  typeKey: string;
  typeLabel: string;
  typeColor: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  deadline: string | null;
  amount: number | null;
  currency: string | null;
  requiredItems: string[];
  grades: string[];
  allGrades: boolean;
  rawText: string | null;
  actionItems: { type: string; title: string; description: string | null; assignee: string | null; amount: number | null; deadline: string | null }[];
  paymentRequest: { id: string; title: string; amount: number; currency: string; dueDate: string | null } | null;
  reminders: { id: string; reminderType: string; scheduledFor: string; status: string }[];
}

/** Local-time YYYY-MM-DD + HH:MM parts for <input type="date">/<input type="time">. */
function toLocalInput(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Local HH:MM (24h) for the 12-hour display formatter. */
function localHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Parent-friendly status label — a cancelled reminder reads as "off". */
function reminderStatusLabel(status: string): string {
  return status === 'CANCELLED' ? 'off' : status.toLowerCase();
}

export default function MessageDetailPage({ params }: { params: { id: string } }) {
  const [message, setMessage] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const id = params.id;

  const startEditReminder = (r: Detail['reminders'][number]) => {
    const parts = toLocalInput(r.scheduledFor);
    setEditingReminderId(r.id);
    setEditDate(parts.date);
    setEditTime(parts.time);
    setReminderError(null);
  };

  const cancelEditReminder = () => {
    setEditingReminderId(null);
    setReminderError(null);
  };

  const saveReminder = async (reminder: Detail['reminders'][number]) => {
    if (!editDate || !editTime) {
      setReminderError('Choose both a date and a time.');
      return;
    }
    setBusyReminderId(reminder.id);
    setReminderError(null);
    try {
      const scheduledFor = new Date(`${editDate}T${editTime}`).toISOString();
      // Re-enabling a turned-off reminder needs enabled:true alongside the new time.
      const body = reminder.status === 'CANCELLED' ? { enabled: true, scheduledFor } : { scheduledFor };
      const res = await apiSend<{ ok: true; reminder: Detail['reminders'][number] }>(
        `/api/reminders/${reminder.id}`,
        body,
        'PATCH'
      );
      setMessage((m) =>
        m
          ? {
              ...m,
              reminders: m.reminders
                .map((r) => (r.id === reminder.id ? res.reminder : r))
                .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
            }
          : m
      );
      setEditingReminderId(null);
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : 'Could not update the reminder.');
    } finally {
      setBusyReminderId(null);
    }
  };

  const turnOffReminder = async (reminderId: string) => {
    setBusyReminderId(reminderId);
    setReminderError(null);
    try {
      const res = await apiSend<{ ok: true; reminder: Detail['reminders'][number] }>(
        `/api/reminders/${reminderId}`,
        { enabled: false },
        'PATCH'
      );
      setMessage((m) =>
        m ? { ...m, reminders: m.reminders.map((r) => (r.id === reminderId ? res.reminder : r)) } : m
      );
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : 'Could not turn off the reminder.');
    } finally {
      setBusyReminderId(null);
    }
  };

  useEffect(() => {
    if (!id) return;
    apiGet<{ message: Detail }>(`/api/messages/${id}`)
      .then((j) => setMessage(j.message))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this message.'));
  }, [id]);

  if (error) {
    return (
      <PageShell title="Message" back="/messages">
        <ErrorBox message={error} />
        <Link href="/messages" className="btn-outline w-full">Back to messages</Link>
      </PageShell>
    );
  }
  if (!message) {
    return (
      <PageShell title="Message" back="/messages">
        <LoadingRows rows={4} />
      </PageShell>
    );
  }

  return (
    <PageShell title={message.title} back="/messages">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <TypeTag label={message.typeLabel} color={message.typeColor} />
          <span className="text-xs font-medium text-slate-500">
            {message.allGrades ? 'All grades' : message.grades.join(', ')}
          </span>
        </div>
        {message.summary && <p className="whitespace-pre-line text-sm text-slate-700">{message.summary}</p>}

        {(message.eventDate || message.startTime || message.location || message.deadline || message.amount != null) && (
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1">
            {message.eventDate && (
              <DetailRow label="Date" value={`${fmtDate(message.eventDate)}${message.startTime ? ` · ${fmtTime12(message.startTime)}${message.endTime ? `–${fmtTime12(message.endTime)}` : ''}` : ''}`} />
            )}
            {message.location && <DetailRow label="Where" value={message.location} />}
            {message.amount != null && <DetailRow label="Amount" value={fmtMoney(message.amount, message.currency ?? 'ZAR')} />}
            {message.deadline && <DetailRow label="Deadline" value={fmtDateShort(message.deadline)} />}
          </dl>
        )}

        {message.requiredItems.length > 0 && (
          <div>
            <h2 className="mb-1 text-sm font-semibold text-slate-700">Please bring</h2>
            <ul className="list-inside list-disc text-sm text-slate-600">
              {message.requiredItems.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>

      {message.actionItems.length > 0 && (
        <>
          <h2 className="px-1 pt-2 text-sm font-bold uppercase tracking-wide text-slate-500">Action required</h2>
          {message.actionItems.map((a, i) => (
            <div key={i} className="card flex items-start justify-between gap-3 border-amber-200 bg-amber-50">
              <div>
                <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                {a.description && <p className="mt-0.5 text-xs text-slate-600">{a.description}</p>}
                <p className="mt-0.5 text-xs text-slate-500">
                  {a.assignee && a.assignee !== 'UNKNOWN' && (
                    <span className="mr-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                      {a.assignee === 'CHILD' ? 'For your child' : a.assignee === 'PARENT' ? 'For you' : a.assignee}
                    </span>
                  )}
                  {a.amount != null ? `${fmtMoney(a.amount)} · ` : ''}
                  {a.deadline ? `due ${fmtDateShort(a.deadline)}` : 'no deadline'}
                </p>
              </div>
            </div>
          ))}
          {message.paymentRequest && (
            <Link href="/payments" className="btn-primary w-full">
              Pay {fmtMoney(message.paymentRequest.amount, message.paymentRequest.currency)}
            </Link>
          )}
        </>
      )}

      {message.reminders.length > 0 && (
        <>
          <h2 className="px-1 pt-2 text-sm font-bold uppercase tracking-wide text-slate-500">Your reminders</h2>
          {reminderError && <ErrorBox message={reminderError} />}
          <div className="card divide-y divide-slate-100 p-0">
            {message.reminders.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm">
                {editingReminderId === r.id ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
                      />
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    {r.status === 'CANCELLED' && (
                      <p className="text-[11px] text-slate-500">Saving turns this reminder back on.</p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveReminder(r)}
                        disabled={busyReminderId === r.id}
                        className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        {busyReminderId === r.id ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={cancelEditReminder} className="btn-outline px-3 py-1.5 text-xs">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span>
                      {fmtDateShort(r.scheduledFor)} · {fmtTime12(localHm(r.scheduledFor))}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        {reminderStatusLabel(r.status)}
                      </span>
                      {r.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => startEditReminder(r)}
                            className="text-xs font-semibold text-brand-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => turnOffReminder(r.id)}
                            disabled={busyReminderId === r.id}
                            className="text-xs font-semibold text-slate-500 hover:text-red-600 hover:underline disabled:opacity-50"
                          >
                            {busyReminderId === r.id ? 'Turning off…' : 'Turn off'}
                          </button>
                        </>
                      )}
                      {r.status === 'CANCELLED' && (
                        <button
                          onClick={() => startEditReminder(r)}
                          className="text-xs font-semibold text-brand-700 hover:underline"
                        >
                          Turn on
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="px-1 text-[11px] text-slate-400">
            Tap Edit to choose when a pending reminder reaches you — or turn it off.
          </p>
        </>
      )}

      {message.rawText && (
        <>
          <h2 className="px-1 pt-2 text-sm font-bold uppercase tracking-wide text-slate-500">Original message</h2>
          <pre className="card overflow-x-auto whitespace-pre-wrap break-words font-sans text-sm text-slate-600">
            {message.rawText}
          </pre>
        </>
      )}

      {!message.rawText && !message.summary && (
        <EmptyState icon="💬" title="No content extracted" hint="The school's original file may need reprocessing." />
      )}
    </PageShell>
  );
}
