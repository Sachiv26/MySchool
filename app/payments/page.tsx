'use client';

import { useEffect, useState } from 'react';
import PageShell from '@/components/PageShell';
import { TypeTag, EmptyState, LoadingRows, ErrorBox, SubmitButton } from '@/components/ui';
import { apiGet, apiSend, fmtMoney } from '@/lib/client/api';

interface ChildOpt {
  id: string;
  firstName: string;
  surname: string;
  grade: string;
}

interface PaymentRow {
  id: string;
  title: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [children, setChildren] = useState<ChildOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [childForPay, setChildForPay] = useState<string>('');

  const load = () =>
    Promise.all([
      apiGet<{ ok: true; requests: PaymentRow[] }>('/api/payments'),
      apiGet<{ ok: true; children: ChildOpt[] }>('/api/parents/children'),
    ])
      .then(([p, c]) => { setPayments(p.requests); setChildren(c.children); })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);

  const pay = async (requestId: string) => {
    if (!childForPay) return setError('Choose a child to pay for.');
    setPaying(requestId);
    try {
      await apiSend('/api/payments/mock-pay', { requestId, childId: childForPay });
      await load();
      setChildForPay('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed.');
    } finally {
      setPaying(null);
    }
  };

  if (error) return <PageShell title="Payments"><ErrorBox message={error} /></PageShell>;
  if (!payments || !children) return <PageShell title="Payments" back="/"><LoadingRows rows={3} /></PageShell>;

  const open = payments.filter((p) => p.status !== 'PAID');
  return (
    <PageShell title="Payments" back="/">
      {payments.length === 0 ? (
        <EmptyState icon="💳" title="No payment requests" hint="School payment requests will appear here." />
      ) : (
        <ul className="space-y-4">
          {payments.map((p) => (
            <li key={p.id} className="card flex items-center justify-between">
              <div>
                <p className="font-semibold">{p.title}</p>
                <p className="text-sm text-slate-600">
                  Due {new Date(p.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold">{fmtMoney(p.amount, p.currency)}</p>
                {p.status !== 'PAID' ? (
                  <div className="mt-2 space-y-2">
                    <select
                      value={childForPay}
                      onChange={(e) => setChildForPay(e.target.value)}
                      className="input text-sm"
                      aria-label="Child to pay for"
                    >
                      <option value="" disabled hidden>Pay for child</option>
                      {children.map((c) => (
                        <option key={c.id} value={c.id}>{c.firstName} {c.surname} — {c.grade}</option>
                      ))}
                    </select>
                    <SubmitButton pending={paying === p.id} onClick={() => pay(p.id)}>Confirm pay</SubmitButton>
                  </div>
                ) : (
                  <TypeTag label="Paid" color="#16a34a" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 && <p className="pt-2 text-xs text-red-600">{open.length} payment(s) still due.</p>}
    </PageShell>
  );
}

