'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend } from '@/lib/client/api';
import { ErrorBox, SubmitButton } from '@/components/ui';

interface School {
  id: string;
  name: string;
  grades: { id: string; name: string; order: number }[];
}

export default function RegisterPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState({ name: '', surname: '', email: '', mobile: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    apiGet<{ schools: School[] }>('/api/schools')
      .then((j) => setSchools(j.schools))
      .catch(() => setSchools([]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiSend('/api/auth/register', form);
      router.replace('/login?registered=1');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-slate-900">Create a parent account</h1>
        <p className="mt-1 text-sm text-slate-500">
          After registering you can add your children and pick their grades.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4" aria-label="Parent registration">
        {error && <ErrorBox message={error} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="name" className="label">Name</label>
            <input id="name" required autoComplete="given-name" className="input"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="surname" className="label">Surname</label>
            <input id="surname" required autoComplete="family-name" className="input"
              value={form.surname} onChange={(e) => setForm({ ...form, surname: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="mobile" className="label">Mobile number <span className="text-slate-400">(optional)</span></label>
          <input id="mobile" type="tel" autoComplete="tel" className="input"
            value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            placeholder="082 000 0000" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" required minLength={8}
            autoComplete="new-password" className="input"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 8 characters" />
        </div>
        <SubmitButton type="submit" pending={pending}>Create account</SubmitButton>
        <p className="text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
        </p>
      </form>

      {schools.length === 0 && (
        <p className="mt-4 text-center text-xs text-slate-400">
          No schools have been configured yet — ask your school administrator to seed their school first.
        </p>
      )}
    </div>
  );
}
