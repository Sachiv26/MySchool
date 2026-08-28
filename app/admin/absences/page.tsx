'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { StatusChip, EmptyState, LoadingRows, ErrorBox } from '@/components/ui';
import { apiGet, apiSend, fmtDateShort } from '@/lib/client/api';

interface AbsenceRow {
  id: string;
  childName: string;
  gradeName: string;
  date: string;
  reason: string;
  status: string;
  submittedBy: string | null;
}

export default function AdminAbsencesPage() {
  const [rows, setRows] = useState<AbsenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    apiGet<{ ok: true; absences: AbsenceRow[] }>('/api/admin/absences?scope=all')
      .then((d) => setRows(d.absences))
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const update = async (id: string, status: string) => {
    try {
      await apiSend(`/api/admin/absences?id=${id}`, { status }, 'PATCH');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    }
  };

  if (!rows) return <AdminShell title="Absences"><LoadingRows rows={3} />{error && <ErrorBox message={error} />}</AdminShell>;

  return (
    <AdminShell title="Absences">
      {error && <ErrorBox message={error} />}
      {rows.length === 0 ? (
        <EmptyState icon="🏥" title="No absences recorded" hint="Parents report absences that will appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Child</th><th className="px-3 py-2">Grade</th><th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Reason</th><th className="px-3 py-2">Reported by</th><th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{a.childName}</td>
                  <td className="px-3 py-2 text-slate-600">{a.gradeName}</td>
                  <td className="px-3 py-2">{fmtDateShort(a.date)}</td>
                  <td className="px-3 py-2">{a.reason.replaceAll('_', ' ').toLowerCase()}</td>
                  <td className="px-3 py-2 text-slate-600">{a.submittedBy ?? '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      value={a.status}
                      onChange={(e) => update(a.id, e.target.value)}
                      className="text-xs"
                    >
                      <option value="SUBMITTED">Submitted</option>
                      <option value="APPROVED">Approved</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
