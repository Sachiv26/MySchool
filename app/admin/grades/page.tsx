'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { SubmitButton, LoadingRows, ErrorBox, EmptyState } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/client/api';

interface Grade {
  id: string;
  name: string;
  order: number;
  childCount: number;
  classes: { id: string; name: string; childCount: number }[];
}

export default function AdminGradesPage() {
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const load = () =>
    apiGet<{ ok: true; grades: Grade[] }>('/api/admin/grades')
      .then((d) => setGrades(d.grades))
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const addGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiSend('/api/admin/grades', { kind: 'grade', name });
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save grade.');
    } finally {
      setSaving(false);
    }
  };

  if (!grades) return <AdminShell title="Grades"><LoadingRows rows={2} />{error && <ErrorBox message={error} />}</AdminShell>;

  return (
    <AdminShell title="Grades & classes">
      {error && <ErrorBox message={error} />}

      <form onSubmit={addGrade} className="card flex items-end gap-3">
        <div className="flex-1">
          <label className="label">New grade name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 8" className="input" />
        </div>
        <SubmitButton type="submit" pending={saving}>Add</SubmitButton>
      </form>

      {grades.length === 0 ? (
        <EmptyState icon="🎓" title="No grades configured" hint="Grades are fully configurable — add one to get started." />
      ) : (
        <div className="space-y-4">
          {grades.map((g) => (
            <div key={g.id} className="card">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{g.name}</h3>
                <span className="text-xs text-slate-500">{g.childCount} child{g.childCount === 1 ? '' : 'ren'}</span>
              </div>
              {g.classes.length > 0 && (
                <ul className="mt-2 grid gap-1 text-sm">
                  {g.classes.map((c) => (
                    <li key={c.id} className="flex justify-between"><span>{c.name}</span><span className="text-slate-400">{c.childCount} students</span></li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
