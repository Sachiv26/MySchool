'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { EmptyState, ErrorBox, LoadingRows, DetailRow, TypeTag } from '@/components/ui';
import { apiGet, fmtDate, fmtDateShort, fmtMoney, fmtTime12 } from '@/lib/client/api';

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
  actionItems: { type: string; title: string; amount: number | null; deadline: string | null }[];
  paymentRequest: { id: string; title: string; amount: number; currency: string; dueDate: string | null } | null;
  reminders: { id: string; reminderType: string; scheduledFor: string; status: string }[];
}

export default function MessageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [message, setMessage] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

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
                <p className="mt-0.5 text-xs text-slate-500">
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
          <div className="card divide-y divide-slate-100 p-0">
            {message.reminders.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{fmtDateShort(r.scheduledFor)} · {fmtTime12(r.scheduledFor.slice(11, 16))}</span>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{r.status.toLowerCase()}</span>
              </div>
            ))}
          </div>
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
