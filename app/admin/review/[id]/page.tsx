'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { TypeTag, StatusChip, LoadingRows, ErrorBox, SubmitButton } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/client/api';

interface ReviewGrade {
  id: string;
  name: string;
}

interface TypeOption {
  key: string;
  label: string;
  color: string | null;
  priority: number;
}

interface ReviewActionItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  assignee: string | null;
  subject: string | null;
  amount: number | string | null;
  deadline: string | null;
}

interface ReviewMessage {
  id: string;
  title: string | null;
  summary: string | null;
  sourceFilename: string;
  rawContent: string | null;
  extractedText: string | null;
  ocrConfidence: number | null;
  ocrMethod: string | null;
  messageTypeKey: string | null;
  messageTypeOption: TypeOption | null;
  eventDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  deadline: Date | null;
  amount: number | string | null;
  currency: string | null;
  requiredItems: unknown;
  contactInformation: unknown;
  importance: number | null;
  extractedJson: unknown;
  grades: { grade: { id: string; name: string }; gradeId: string }[];
  actionItems: ReviewActionItem[];
}

export default function ReviewMessagePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<ReviewMessage | null>(null);
  const [items, setItems] = useState<ReviewActionItem[]>([]);
  const [grades, setGrades] = useState<ReviewGrade[]>([]);
  const [types, setTypes] = useState<TypeOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'save' | 'publish' | 'reject' | 'reprocess' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      apiGet<{ ok: true; message: ReviewMessage }>(`/api/admin/messages/${params.id}`),
      apiGet<{ ok: true; grades: ReviewGrade[] }>('/api/admin/meta'),
      apiGet<{ ok: true; messageTypes: TypeOption[] }>('/api/admin/meta'),
    ])
      .then(([m, g, t]) => { setMsg(m.message); setItems(m.message.actionItems ?? []); setGrades(g.grades); setTypes(t.messageTypes); })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [params.id]);

  if (!msg || !grades.length || !types.length) {
    return <AdminShell title="Review"><LoadingRows rows={4} />{error && <ErrorBox message={error} />}</AdminShell>;
  }

  const submit = async (action: 'save' | 'publish' | 'reject' | 'reprocess') => {
    if (action === 'reject' && !confirm('Reject this message? It will be hidden from parents.')) return;
    setSaving(action);
    setFlash(null);
    try {
            const form = document.getElementById('review-form') as HTMLFormElement;
      const data = new FormData(form);
      const payload: Record<string, string> = {};
      for (const [k, v] of data.entries()) {
        if (typeof v === 'string') payload[k] = v;
      }
      const out: Record<string, unknown> = {
        action,
        messageId: params.id,
        title: payload.title || undefined,
        summary: payload.summary || undefined,
        messageType: payload.messageType || undefined,
        gradeIds: grades
          .filter((g) => (document.getElementById(`g_${g.id}`) as HTMLInputElement)?.checked)
          .map((g) => g.id),
        eventDate: payload.eventDate ? new Date(payload.eventDate).toISOString() : null,
                startTime: payload.startTime || null,
        endTime: payload.endTime || null,
        location: payload.location || null,
                        deadline: payload.deadline ? new Date(payload.deadline).toISOString() : null,
        amount: payload.amount ? Number(payload.amount) : null,
        currency: payload.currency || null,
        requiredItems: payload.requiredItems ? String(payload.requiredItems).split(',').map((s) => s.trim()).filter(Boolean) : [],
        contactInformation: payload.contactInformation || null,
        importance: payload.importance ? Number(payload.importance) : null,
        actionItems: items
          .filter((a) => a.title.trim().length > 0)
          .map((a) => ({
            type: a.type || 'OTHER',
            title: a.title.trim(),
            description: a.description || null,
            assignee: a.assignee || 'UNKNOWN',
            subject: a.subject || null,
            amount: a.amount != null && a.amount !== '' ? Number(a.amount) : null,
            deadline: a.deadline ? new Date(a.deadline).toISOString() : null,
          })),
      };
      await apiSend<{ ok: true; id: string; published: boolean }>(`/api/admin/messages/${params.id}`, out, 'PUT');
      setFlash(action === 'publish' ? 'Approved and published! ✅' : action === 'reject' ? 'Rejected.' : 'Saved.');
      setTimeout(() => { if (action === 'publish' || action === 'reject') router.push('/admin/messages'); }, 900);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <AdminShell title="Message review">
      {flash && <ErrorBox message={flash} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase text-slate-500">Original message</h3>
          <div className="card max-h-80 overflow-y-auto whitespace-pre-wrap text-sm">{msg.rawContent ?? msg.extractedText ?? '(no source text)'}</div>
          {msg.sourceFilename && <p className="text-xs text-slate-500">File: {msg.sourceFilename} · OCR confidence: {msg.ocrConfidence != null ? `${Math.round(msg.ocrConfidence * 100)}%` : '—'}</p>}
          <TypeTag label={msg.messageTypeOption?.label ?? 'Unclassified'} color={msg.messageTypeOption?.color ?? '#64748b'} />
        </div>

        <form id="review-form" className="card space-y-4">
          <h3 className="text-sm font-bold uppercase text-slate-500">Extracted information — edit before publishing</h3>
          <label className="label">Title</label><input name="title" defaultValue={msg.title ?? ''} className="input" />
          <label className="label">Summary</label><textarea name="summary" rows={2} className="input" defaultValue={msg.summary ?? ''} />
          <label className="label">Message type</label>
          <select name="messageType" className="input">
                        {types.map((t) => <option key={t.key} value={t.key} selected={msg.messageTypeKey === t.key}>{t.label}</option>)}
          </select>

          <label className="label mt-3">Grades {msg.grades.length === 0 && <span className="text-xs text-slate-400">(none = all grades)</span>}</label>
          <div className="flex flex-wrap gap-2">
            {grades.map((g) => (
              <label key={g.id} className="flex items-center gap-2 text-sm">
                <input id={`g_${g.id}`} name="gradeIds" type="checkbox" value={g.id} defaultChecked={msg.grades.some((mg: { gradeId: string }) => mg.gradeId === g.id)} className="h-4 w-4 accent-teal-700" />
                {g.name}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
                        <div>
              <label className="label">Event date</label>
              <input name="eventDate" type="date" className="input" defaultValue={msg.eventDate ? new Date(msg.eventDate).toISOString().slice(0, 10) : ''} />
            </div>
            <div><label className="label">Deadline</label><input name="deadline" type="date" className="input" defaultValue={msg.deadline ? new Date(msg.deadline).toISOString().slice(0, 10) : ''} /></div>
            <div><label className="label">Start time</label><input name="startTime" type="time" className="input" defaultValue={msg.startTime ?? ''} /></div>
            <div><label className="label">End time</label><input name="endTime" type="time" className="input" defaultValue={msg.endTime ?? ''} /></div>
          </div>
          <label className="label">Location</label><input name="location" className="input" defaultValue={msg.location ?? ''} />
                    <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Amount</label><input name="amount" type="number" min="0" step="0.01" className="input" defaultValue={msg.amount != null ? String(msg.amount) : ''} /></div>
            <div><label className="label">Currency</label><input name="currency" className="input" defaultValue={msg.currency ?? 'ZAR'} /></div>
            <div><label className="label">Importance</label><input name="importance" type="number" min={1} max={10} className="input" defaultValue={msg.importance ?? 3} /></div>
          </div>
          <label className="label">Contact (name / phone / email)</label><input name="contactInformation" className="input" defaultValue={msg.contactInformation ? JSON.stringify(msg.contactInformation) : ''} />
          <label className="label">Required items (comma separated)</label><textarea name="requiredItems" rows={2} className="input" defaultValue={Array.isArray(msg.requiredItems) ? (msg.requiredItems as string[]).join(', ') : ''} />

          <label className="label mt-3">Action items — who needs to do what</label>
          <div className="space-y-2">
            {items.length === 0 && <p className="text-xs text-slate-400">None extracted. Add one if the message requires an action.</p>}
            {items.map((a, i) => (
              <div key={a.id || `new-${i}`} className="space-y-2 rounded-lg border border-slate-200 p-2">
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={a.title}
                    placeholder="e.g. Bring an empty cereal box to school"
                    onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, title: e.target.value } : it)))}
                  />
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:underline"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                  >
                    remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <select
                    className="input"
                    value={a.type}
                    onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, type: e.target.value } : it)))}
                  >
                    {['PAY', 'SIGN', 'BRING', 'REGISTER', 'REPLY', 'PREPARE', 'COMPLETE', 'WEAR', 'OTHER'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={a.assignee ?? 'UNKNOWN'}
                    onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, assignee: e.target.value } : it)))}
                  >
                    {['PARENT', 'CHILD', 'TEACHER', 'UNKNOWN'].map((s) => (
                      <option key={s} value={s}>
                        {s === 'PARENT' ? 'Parent' : s === 'CHILD' ? 'Child' : s === 'TEACHER' ? 'Teacher' : 'Unknown'}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    placeholder="Subject (optional)"
                    value={a.subject ?? ''}
                    onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, subject: e.target.value } : it)))}
                  />
                  <input
                    className="input"
                    type="date"
                    value={a.deadline ? String(a.deadline).slice(0, 10) : ''}
                    onChange={(e) => setItems(items.map((it, j) => (j === i ? { ...it, deadline: e.target.value } : it)))}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-sm font-medium text-brand-700 hover:underline"
              onClick={() => setItems([...items, { id: '', type: 'OTHER', title: '', description: null, assignee: 'PARENT', subject: null, amount: null, deadline: null }])}
            >
              + Add action item
            </button>
          </div>

          {msg.extractedJson != null && (
            <details className="mt-3 rounded-lg bg-slate-50 p-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500">AI agent output (full JSON)</summary>
              <pre className="mt-2 max-h-60 overflow-auto text-[11px] leading-4 text-slate-600">
                {JSON.stringify(msg.extractedJson, null, 2)}
              </pre>
            </details>
          )}

          <div className="flex gap-2 pt-2">
            <SubmitButton type="button" onClick={() => submit('publish')} pending={saving === 'publish'}>Approve & publish</SubmitButton>
            <SubmitButton type="button" variant="secondary" onClick={() => submit('save')} pending={saving === 'save'}>Save draft</SubmitButton>
            <SubmitButton type="button" variant="outline" onClick={() => submit('reprocess')} pending={saving === 'reprocess'}>Reprocess</SubmitButton>
            <SubmitButton type="button" variant="danger" onClick={() => submit('reject')} pending={saving === 'reject'}>Reject</SubmitButton>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}

