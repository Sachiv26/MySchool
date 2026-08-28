'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { StatusChip, EmptyState, LoadingRows, ErrorBox } from '@/components/ui';
import { apiGet, fmtDateShort } from '@/lib/client/api';

interface AbsenceRow {
  id: string;
  childName: string;
  gradeName: string;
  date: string;
  reason: string;
  notes: string | null;
  status: string;
  hasAttachment: boolean;
  submittedAt: string;
}

export default function AbsencesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AbsenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: true; absences: AbsenceRow[] }>('/api/absences')
      .then((d) => setRows(d.absences))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <PageShell title="Absences"><ErrorBox message={error} /></PageShell>;
  if (!rows) return <PageShell title="Absences"><LoadingRows rows={3} /></PageShell>;

  return (
    <PageShell
      title="Absences"
      action={{ href: '/absences/new', label: 'Report' }}
      back="/"
    >
      {rows.length === 0 ? (
        <EmptyState icon="✅" title="No absences reported" hint="When your child is away, let the school know." />
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id} className="card flex items-center justify-between">
              <div>
                <p className="font-semibold">{a.childName} <span className="font-normal text-slate-500">· {a.gradeName}</span></p>
                <p className="text-sm text-slate-600">{fmtDateShort(a.date)} · {a.reason.replaceAll('_', ' ').toLowerCase()}</p>
                {a.notes && <p className="mt-1 text-sm text-slate-600">{`\u201C${a.notes}\u201D`}</p>}
                {a.hasAttachment && <span className="text-xs text-slate-500">📎 sick note attached</span>}
              </div>
              <StatusChip status={a.status} />
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => router.push('/absences/new')}
        className="btn-primary mt-4 w-full"
      >
        + Report new absence
      </button>

      <Link href="/more" className="mt-4 block text-center text-sm text-brand-700 hover:underline">← Back to menu</Link>
    </PageShell>
  );
}
