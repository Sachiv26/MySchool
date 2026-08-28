'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import { EmptyState, LoadingRows, ErrorBox, SubmitButton } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/client/api';

interface ChildRow {
  id: string;
  firstName: string;
  surname: string;
  grade: string;
  school: string;
  relationship: string;
}

interface SchoolOpt {
  id: string;
  name: string;
  grades: { id: string; name: string }[];
}

export default function ChildrenPage() {
  const [children, setChildren] = useState<ChildRow[] | null>(null);
  const [schools, setSchools] = useState<SchoolOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [schoolId, setSchoolId] = useState('');
  const [gradeId, setGradeId] = useState('');

  const load = () =>
    Promise.all([
      apiGet<{ ok: true; children: ChildRow[] }>('/api/parents/children'),
      apiGet<{ ok: true; schools: SchoolOpt[] }>('/api/schools'),
    ])
      .then(([c, s]) => { setChildren(c.children); setSchools(s.schools); })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  if (error) return <PageShell title="Children"><ErrorBox message={error} /></PageShell>;
  if (!children || !schools) return <PageShell title="Children" back="/"><LoadingRows rows={2} /></PageShell>;

  const addChild = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setAdding(true);
    try {
      await apiSend('/api/parents/children', {
        ...data,
        schoolId,
        gradeId,
        classId: data.classId || undefined,
      });
      form.reset();
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add child.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <PageShell title="Children" back="/">
      {children.length === 0 ? (
        <EmptyState icon="🧒" title="No children yet" hint="Add your child to see grade-specific messages." />
      ) : (
        <ul className="space-y-3">
          {children.map((c) => (
            <li key={c.id} className="card flex justify-between">
              <div>
                <p className="font-semibold">{c.firstName || c.surname}</p>
                <p className="text-sm text-slate-600">{c.grade} · {c.school} ({c.relationship})</p>
              </div>
              <span className="self-start text-xs text-slate-400">{c.id.slice(0, 8)}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setShowAdd((v) => !v)}
        className="btn-outline mt-4 w-full"
      >
        {showAdd ? 'Cancel' : '+ Add child'}
      </button>

      {showAdd && (
        <form onSubmit={addChild} className="card space-y-4">
          <div>
            <label className="label">School</label>
            <select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setGradeId(''); }} required className="input">
              <option value="" disabled hidden>Select a school</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Grade</label>
            <select
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              required
              disabled={!schoolId}
              className="input"
            >
              <option value="" disabled hidden>Select a grade</option>
              {schools.find((s) => s.id === schoolId)?.grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">First name</label><input name="firstName" required className="input" /></div>
            <div><label className="label">Surname</label><input name="surname" required className="input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Relationship</label>
              <select name="relationship" defaultValue="GUARDIAN" className="input">
                <option value="MOTHER">Mother</option>
                <option value="FATHER">Father</option>
                <option value="GUARDIAN">Guardian</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div><label className="label">Student number</label><input name="studentNumber" className="input" placeholder="optional" /></div>
          </div>
          <SubmitButton type="submit" pending={adding}>Add child</SubmitButton>
        </form>
      )}
    </PageShell>
  );
}
