'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

/** Visual urgency levels used across parent and admin surfaces. */
export type Urgency = 'info' | 'action' | 'urgent' | 'overdue' | 'done' | 'neutral';

const URGENCY_STYLES: Record<Urgency, string> = {
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  action: 'bg-amber-50 text-amber-900 border-amber-300',
  urgent: 'bg-red-50 text-red-800 border-red-300',
  overdue: 'bg-red-100 text-red-900 border-red-400',
  done: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200',
};

export function UrgencyTag({ level, children }: { level: Urgency; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${URGENCY_STYLES[level]}`}>
      {children}
    </span>
  );
}

export function TypeTag({ label, color }: { label: string; color?: string | null }) {
  return (
    <span
      className="tag"
      style={{ backgroundColor: `${color ?? '#64748b'}18`, color: color ?? '#334155' }}
    >
      {label}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, Urgency> = {
    PAID: 'done', DONE: 'done', APPROVED: 'done', PROCESSED: 'done',
    PENDING: 'action', NEEDS_REVIEW: 'action', SUBMITTED: 'action',
    FAILED: 'overdue', REJECTED: 'overdue', CANCELLED: 'neutral',
  };
  const labels: Record<string, string> = {
    NEEDS_REVIEW: 'Needs review', PAID: 'Paid', NOT_REQUIRED: 'Not required',
  };
  return <UrgencyTag level={map[status] ?? 'neutral'}>{labels[status] ?? status.replaceAll('_', ' ').toLowerCase()}</UrgencyTag>;
}

export function EmptyState({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 py-10 text-center">
      <div aria-hidden className="text-3xl">{icon}</div>
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card">
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton mt-2 h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between px-1 pt-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{children}</h2>
      {action && (
        <Link href={action.href} className="text-sm font-semibold text-brand-700 hover:underline">
          {action.label} →
        </Link>
      )}
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}

/** Simple call-to-action button with pending state; used by forms client-wide. */
export function SubmitButton({
  pending, children, variant = 'primary', onClick, type = 'button', disabled,
}: {
  pending?: boolean;
  children: ReactNode;
  variant?: 'primary' | 'outline' | 'danger' | 'secondary';
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const cls =
    variant === 'primary' ? 'btn-primary' :
    variant === 'danger' ? 'btn-danger' :
    variant === 'secondary' ? 'btn-secondary' : 'btn-outline';
  return (
    <button type={type} onClick={onClick} disabled={pending || disabled} className={`${cls} w-full sm:w-auto`}>
      {pending ? 'Working…' : children}
    </button>
  );
}
