'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageShell from '@/components/PageShell';
import { TypeTag, UrgencyTag, LoadingRows, ErrorBox, SubmitButton } from '@/components/ui';
import { apiGet, apiSend, fmtDate, fmtMoney, fmtTime12 } from '@/lib/client/api';

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  isSchoolClosure: boolean;
  registrationRequired: boolean;
  registrationDeadline: string | null;
  typeLabel: string;
  typeColor: string;
  grades: string[];
  allGrades: boolean;
  requiredItems: string[];
  payment: { id: string; amount: number; currency: string; dueDate: string; status: string } | null;
  children: { id: string; name: string; gradeName: string; registered: boolean }[];
}

/** Build an RFC5545 .ics file so parents can save the event to their calendar. */
function buildIcs(e: EventDetail): string {
  const day = e.eventDate.slice(0, 10).replace(/-/g, '');
  const start = `${day}T${(e.startTime ?? '08:00').replace(':', '')}00`;
  const end = `${day}T${(e.endTime ?? '09:00').replace(':', '')}00`;
    return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MySchool Connect//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@myschool`,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${e.title}`,
    `LOCATION:${e.location ?? ''}`,
    `DESCRIPTION:${(e.description ?? '').replace(/\n/g, '\\n')}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: true; event: EventDetail }>(`/api/events/${params.id}`)
      .then((d) => setEvent(d.event))
      .catch((e) => setError(e.message));
  }, [params.id]);

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const register = async () => {
    const childIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (childIds.length === 0) return setFlash('Select at least one child.');
    setSaving(true);
    try {
      await apiSend('/api/events/register', { eventId: params.id, childIds });
      setFlash('Registered! 🎉');
      const d = await apiGet<{ ok: true; event: EventDetail }>(`/api/events/${params.id}`);
      setEvent(d.event);
      setSelected({});
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Registration failed.');
    } finally {
      setSaving(false);
    }
  };

  const icsHref = useMemo(() => {
    if (!event) return '';
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(event))}`;
  }, [event]);

  if (error) return <PageShell title="Event"><ErrorBox message={error} /></PageShell>;
  if (!event) return <PageShell title="Event" back="/calendar"><LoadingRows rows={3} /></PageShell>;

  return (
    <PageShell title="Event" back="/calendar">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeTag label={event.typeLabel} color={event.typeColor} />
          {event.isSchoolClosure && <UrgencyTag level="urgent">School closed</UrgencyTag>}
          {(event.grades.length > 0 ? event.grades : ['All grades']).map((g) => (
            <span key={g} className="tag bg-slate-100 text-slate-600">{g}</span>
          ))}
        </div>
        <h2 className="text-xl font-bold leading-tight">{event.title}</h2>
        <dl>
          <div className="flex justify-between gap-4 py-1"><dt className="text-sm text-slate-500">Date</dt><dd className="text-sm font-medium">{fmtDate(event.eventDate)}</dd></div>
          {(event.startTime || event.endTime) && (
            <div className="flex justify-between gap-4 py-1"><dt className="text-sm text-slate-500">Time</dt><dd className="text-sm font-medium">{fmtTime12(event.startTime)}{event.endTime ? ` – ${fmtTime12(event.endTime)}` : ''}</dd></div>
          )}
          {event.location && (
            <div className="flex justify-between gap-4 py-1"><dt className="text-sm text-slate-500">Where</dt><dd className="text-right text-sm font-medium">{event.location}</dd></div>
          )}
          {event.registrationRequired && (
            <div className="flex justify-between gap-4 py-1"><dt className="text-sm text-slate-500">Register by</dt><dd className="text-sm font-medium">{fmtDate(event.registrationDeadline)}</dd></div>
          )}
        </dl>
        {event.description && <p className="whitespace-pre-line pt-2 text-sm text-slate-700">{event.description}</p>}
      </div>

      {event.requiredItems.length > 0 && (
        <div className="card border-amber-300 bg-amber-50">
          <h3 className="text-sm font-bold text-amber-900">Bring along</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900">
            {event.requiredItems.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </div>
      )}

      {event.payment && event.payment.status !== 'PAID' && (
        <Link href="/payments" className="card flex items-center justify-between border-red-200 hover:bg-red-50">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Payment required</p>
            <p className="font-semibold">{fmtMoney(event.payment.amount, event.payment.currency)} · due {fmtDate(event.payment.dueDate)}</p>
          </div>
          <UrgencyTag level="overdue">Pay now →</UrgencyTag>
        </Link>
      )}

      <div className="card space-y-3">
        <a href={icsHref} download={`${event.title.replace(/[^a-z0-9]+/gi, '-')}.ics`} className="btn-outline w-full">📅 Add to calendar</a>

        {event.registrationRequired && (
          <>
            <p className="px-1 pt-1 text-sm font-semibold text-slate-700">Register my child:</p>
            {event.children.map((c) => (
              <label key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                <span className="text-sm"><strong>{c.name}</strong> · {c.gradeName}</span>
                {c.registered
                  ? <UrgencyTag level="done">Registered</UrgencyTag>
                  : <input type="checkbox" checked={Boolean(selected[c.id])} onChange={() => toggle(c.id)} className="h-5 w-5 accent-teal-700" aria-label={`Register ${c.name}`} />}
              </label>
            ))}
            <SubmitButton pending={saving} onClick={register}>Register</SubmitButton>
          </>
        )}
      </div>

            {flash && <ErrorBox message={flash} />}
    </PageShell>
  );
}

