'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { EmptyState, ErrorBox, LoadingRows, TypeTag } from '@/components/ui';
import { apiGet, fmtDateShort } from '@/lib/client/api';

interface MessageListItem {
  id: string;
  title: string;
  summary: string | null;
  typeKey: string;
  typeLabel: string;
  typeColor: string | null;
  eventDate: string | null;
  deadline: string | null;
  amount: number | null;
  currency: string | null;
  grades: string[];
  allGrades: boolean;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<MessageListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ messages: MessageListItem[] }>('/api/messages')
      .then((j) => setMessages(j.messages))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load messages.'));
  }, []);

  return (
    <PageShell title="Messages">
      {error && <ErrorBox message={error} />}
      {!messages && !error && <LoadingRows rows={5} />}
      {messages && messages.length === 0 && (
        <EmptyState icon="💬" title="No messages yet"
          hint="When the school publishes a message for your children's grades it appears here." />
      )}
      {messages?.map((m) => (
        <Link key={m.id} href={`/messages/${m.id}`} className="card block">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{m.title}</p>
              {m.summary && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{m.summary}</p>}
              <p className="mt-1 text-xs font-medium text-slate-500">
                {m.allGrades ? 'All grades' : m.grades.join(', ')}
                {m.eventDate && <> · 📅 {fmtDateShort(m.eventDate)}</>}
                {m.deadline && <> · ⏰ due {fmtDateShort(m.deadline)}</>}
                {m.amount != null && <> · R{m.amount}</>}
              </p>
            </div>
            <TypeTag label={m.typeLabel} color={m.typeColor} />
          </div>
        </Link>
      ))}
    </PageShell>
  );
}
