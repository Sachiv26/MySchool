'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import { ErrorBox, EmptyState, SubmitButton } from '@/components/ui';
import { apiGet, apiUpload } from '@/lib/client/api';

interface ChildOpt {
  id: string;
  firstName: string;
  surname: string;
  grade: string;
}

const REASONS: { value: string; label: string }[] = [
  { value: 'SICK', label: 'Sick' },
  { value: 'MEDICAL_APPOINTMENT', label: 'Medical appointment' },
  { value: 'FAMILY_MATTER', label: 'Family matter' },
  { value: 'OTHER', label: 'Other (see notes)' },
];

export default function ReportAbsencePage() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: true; children: ChildOpt[] }>('/api/parents/children')
      .then((d) => setChildren(d.children))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageShell title="Report absence" back="/absences"><EmptyState icon="⏳" title="Loading…" /></PageShell>;
  if (!children.length && !error)
    return <PageShell title="Report absence" back="/absences"><EmptyState icon="🧒" title="No children on record" hint="Add a child first from the Children screen." /></PageShell>;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setFlash(null);
    try {
      await apiUpload<{ ok: true; absenceId: string }>(form.action, data);
      setFlash('Absence reported ✔');
      setTimeout(() => router.replace('/absences'), 800);
    } catch (err) {
      setFlash(err instanceof Error ? err.message : 'Failed to report absence.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="Report absence" back="/absences">
      {error && <ErrorBox message={error} />}
      <form action="/api/absences" method="post" encType="multipart/form-data" onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label block">Child</label>
          <select name="childId" required className="input" defaultValue="">
            <option value="" disabled hidden>Select a child</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.surname} — {c.grade}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label block">Date</label>
          <input name="date" type="date" required className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>

        <div>
          <label className="label block">Reason</label>
          <select name="reason" required className="input" defaultValue="SICK">
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label block">Notes (optional)</label>
          <textarea name="notes" rows={3} className="input" placeholder="Any extra detail for the school…" />
        </div>

        <div>
          <label className="label block">Sick note / attachment (optional)</label>
          <input name="file" type="file" accept=".jpg,.jpeg,.png,.pdf" className="file-input" />
          <p className="mt-1 text-xs text-slate-500">Allowed: JPG, PNG, PDF — max 10 MB.</p>
        </div>

        <SubmitButton type="submit" pending={submitting}>Save absence</SubmitButton>
      </form>
      {flash && <ErrorBox message={flash} />}
    </PageShell>
  );
}
