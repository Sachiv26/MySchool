'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiSend } from '@/lib/client/api';
import { ErrorBox, SubmitButton } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiSend('/api/auth/login', { email, password });
      // Land on the right experience for the role.
      const me = await fetch('/api/me', { cache: 'no-store' }).then((r) => r.json());
      const isAdmin = me?.schools?.some((s: { role: string }) => s.role === 'ADMIN');
      router.replace(params.get('next') ?? (isAdmin ? '/admin' : '/'));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mb-2 text-4xl" aria-hidden>🎒</div>
        <h1 className="text-2xl font-extrabold text-slate-900">MySchool Connect</h1>
        <p className="mt-1 text-sm text-slate-500">School news, events & reminders — all in one place.</p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4" aria-label="Sign in">
        {error && <ErrorBox message={error} />}
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email" type="email" required autoComplete="email"
            className="input" value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password" type="password" required autoComplete="current-password"
            className="input" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <SubmitButton type="submit" pending={pending}>Sign in</SubmitButton>
        <p className="text-center text-sm text-slate-500">
          New here?{' '}
          <Link href="/register" className="font-semibold text-brand-700 hover:underline">
            Create a parent account
          </Link>
        </p>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        School administrator? Sign in with your school email to open the admin dashboard.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6 text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
