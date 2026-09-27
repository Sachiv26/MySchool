'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import { StatusChip, EmptyState, LoadingRows, ErrorBox } from '@/components/ui';
import { apiGet, fmtDateShort } from '@/lib/client/api';

interface AdminMessage {
  id: string;
  title: string;
  sourceFilename: string;
  sourceType: string;
  typeLabel: string | null;
  grades: string[];
  status: string;
  needsReview: boolean;
  published: boolean;
  rejected: boolean;
  importedAt: string;
  processingError: string | null;
  reminderCount: number;
}

interface AdminDashboard {
  messages: { total: number; pendingReview: number; failed: number; published: number };
  eventsUpcoming: { id: string; title: string; eventDate: string; registrations: number }[];
  absencesToday: { id: string; childName: string; gradeName: string; reason: string }[];
  parents: { count: number; children: number };
  reminders: { pending: number };
  audit: { id: string; action: string; createdAt: string; actorName: string | null }[];
}

export default function AdminMessagesPage() {
  const [filter, setFilter] = useState<'review' | 'failed' | 'published' | 'all'>('review');
  const [source, setSource] = useState<'all' | 'whatsapp' | 'file'>('all');
  const [rows, setRows] = useState<AdminMessage[] | null>(null);
  const [dash, setDash] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      apiGet<{ ok: true; messages: AdminMessage[] }>(
        `/api/admin/messages?status=${filter}&source=${source}`
      ),
      apiGet<{ ok: true; dashboard: AdminDashboard }>('/api/admin/dashboard'),
    ])
      .then(([m, d]) => { setRows(m.messages); setDash(d.dashboard); })
      .catch((e) => setError(e.message));

  // On mount, honour deep links such as /admin/messages?source=whatsapp&status=all
  // before the first fetch, so we don't issue a request for the default tab first.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('source');
    const st = params.get('status');
    const nextSource = s === 'whatsapp' || s === 'file' ? s : 'all';
    const nextFilter = st === 'failed' || st === 'published' || st === 'all' ? st : 'review';
    if (nextSource !== source || nextFilter !== filter) {
      setSource(nextSource);
      setFilter(nextFilter);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, source]);

  if (error) return <AdminShell title="Messages"><ErrorBox message={error} /></AdminShell>;
  if (!rows || !dash) return <AdminShell title="Messages"><LoadingRows rows={3} /></AdminShell>;

  const tabs: { key: typeof filter; label: string }[] = [
    { key: 'review', label: `Needs review (${dash.messages.pendingReview})` },
    { key: 'failed', label: `Failed (${dash.messages.failed})` },
    { key: 'published', label: `Published (${dash.messages.published})` },
    { key: 'all', label: 'All' },
  ];

  const sourceTabs: { key: typeof source; label: string }[] = [
    { key: 'all', label: '📥 All sources' },
    { key: 'whatsapp', label: '💬 WhatsApp' },
    { key: 'file', label: '📄 Scanned files' },
  ];

  return (
    <AdminShell title="Messages">
      <p className="text-sm text-slate-500">{dash.messages.total} messages · {dash.parents.count} parents · {dash.parents.children} children · {dash.reminders.pending} pending reminders</p>

      <div className="flex flex-wrap items-center gap-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              filter === t.key ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-semibold uppercase">Source</span>
        {sourceTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSource(t.key)}
            className={`rounded-full px-3 py-1 font-medium ${
              source === t.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 border border-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filter === 'review' && dash && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Pending review" value={dash.messages.pendingReview} />
          <StatCard label="Upcoming events" value={dash.eventsUpcoming.length} />
          <StatCard label="Absent today" value={dash.absencesToday.length} />
          <StatCard label="Pending reminders" value={dash.reminders.pending} />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="📭"
          title="No messages match this filter."
          hint={
            source === 'whatsapp'
              ? 'WhatsApp messages arrive through the webhook. Check the number linked on the WhatsApp page.'
              : 'Scan the incoming folder to import messages.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Title</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Type / Grades</th>
                <th className="px-3 py-2">Status</th><th className="px-3 py-2">Imported</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-slate-200">
                  <td className="px-3 py-2 font-medium">{m.title}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {m.sourceType === 'whatsapp' ? (
                      <span title={m.sourceFilename}>
                        💬 {senderLabel(m.sourceFilename)}
                      </span>
                    ) : (
                      <span title={m.sourceFilename} className="text-xs">📄 {m.sourceFilename}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-slate-600">{m.typeLabel ?? '—'}</span>
                      <span className="text-xs text-slate-500">{m.grades.join(', ') || 'All grades'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip status={m.status} />
                    {m.needsReview && <span className="ml-1 text-xs text-amber-600">AI review</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{fmtDateShort(m.importedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/admin/review/${m.id}`} className="font-semibold text-brand-700 hover:underline">Review →</Link>
                    {m.processingError && <span className="block text-xs text-red-600">{m.processingError.slice(0, 40)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filter === 'review' && (
        <Link href="/admin/whatsapp" className="btn-primary w-auto">💬 WhatsApp inbox</Link>
      )}
    </AdminShell>
  );
}

/**
 * WhatsApp messages are stored with a synthetic filename of
 * `whatsapp:<from-number>:<wamid>`, so pull out the sender for display.
 */
function senderLabel(sourceFilename: string): string {
  const parts = sourceFilename.split(':');
  return parts.length >= 2 ? `+${parts[1]}` : sourceFilename;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <p className="text-3xl font-bold text-brand-700">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

