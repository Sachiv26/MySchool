'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { EmptyState, LoadingRows, ErrorBox } from '@/components/ui';
import { apiGet } from '@/lib/client/api';

interface ParentRow {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  joinedAt: string;
  unreadNotifications: number;
  children: { id: string; name: string; gradeName: string; relationship: string }[];
}

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: true; parents: ParentRow[] }>('/api/admin/parents?view=parents')
      .then((d) => setParents(d.parents))
      .catch((e) => setError(e.message));
  }, []);

  if (!parents) return <AdminShell title="Parents"><LoadingRows rows={3} />{error && <ErrorBox message={error} />}</AdminShell>;

  return (
    <AdminShell title="Parents">
      {error && <ErrorBox message={error} />}
      {parents.length === 0 ? (
        <EmptyState icon="👪" title="No registered parents" hint="Parents register from the parent portal." />
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="px-3 py-2">Parent</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Children</th><th className="px-3 py-2">Joined</th></tr></thead>
          <tbody>
            {parents.map((p) => (
              <tr key={p.id} className="border-t border-slate-200">
                <td className="px-3 py-2">{p.name}{p.unreadNotifications > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{p.unreadNotifications}</span>}</td>
                <td className="px-3 py-2 text-slate-600">{p.email}{p.mobile && ` · ${p.mobile}`}</td>
                <td className="px-3 py-2">{p.children.map((c) => `${c.name} (${c.gradeName})`).join(', ')}</td>
                <td className="px-3 py-2 text-slate-600">{new Date(p.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
