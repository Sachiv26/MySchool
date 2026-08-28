import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import ParentHome from './ParentHome';

export const dynamic = 'force-dynamic';

/**
 * Role-aware entry point: administrators go to their dashboard,
 * unauthenticated visitors go to sign-in, teachers see a placeholder
 * (teacher accounts are behind a feature flag for the MVP), and
 * parents get the mobile-first home screen.
 */
export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'ADMIN') redirect('/admin');
  if (session.role !== 'PARENT') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 text-4xl" aria-hidden>🧑‍🏫</div>
        <h1 className="text-xl font-bold text-slate-900">Teacher accounts coming soon</h1>
        <p className="mt-2 text-sm text-slate-500">
          Teacher tools are not part of the MVP yet. Sign in with a parent or administrator account.
        </p>
      </div>
    );
  }
  return <ParentHome />;
}
