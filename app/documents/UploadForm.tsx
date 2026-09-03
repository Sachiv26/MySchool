'use client';
import { useRef } from 'react';
import { apiSend } from '@/lib/client/api';
import { formatTerm, type SchoolTerm } from '@/lib/utils/southAfricanTerms';

interface Child { id: string; firstName: string; surname: string }

const CATEGORIES = [
  { value: 'REPORT_CARD', label: 'Report Card', icon: '📊' },
  { value: 'FORM', label: 'Form / Letter', icon: '📝' },
  { value: 'PHOTO', label: 'Photo', icon: '📸' },
  { value: 'PERMISSION', label: 'Permission Slip', icon: '✅' },
  { value: 'OTHER', label: 'Other', icon: '📎' },
];

export default function UploadForm({
  term, children, onDone, onError,
}: { term: SchoolTerm; children: Child[]; onDone: () => void; onError: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    if (!fileInput.files?.length) { onError('Choose a file first.'); return; }
    try {
      const data = new FormData();
      data.set('file', fileInput.files[0]);
      data.set('term', String(term.term));
      data.set('year', String(term.year));
      const childSelect = form.elements.namedItem('childId') as HTMLSelectElement;
      const catSelect = form.elements.namedItem('category') as HTMLSelectElement;
      const descInput = form.elements.namedItem('description') as HTMLTextAreaElement;
      if (childSelect.value) data.set('childId', childSelect.value);
      data.set('category', catSelect.value);
      data.set('description', descInput.value);
      await apiSend('/api/documents', data);
      if (fileRef.current) fileRef.current.value = '';
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  return (
    <form onSubmit={handleUpload} className="card space-y-3 p-4">
      <h3 className="text-sm font-bold text-slate-900">Upload a document</h3>
      <p className="text-xs text-slate-500">Uploading for <strong>{formatTerm(term)}</strong>. Max 10 MB.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Child (optional)</span>
          <select name="childId" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">General / all children</option>
            {children.map(c => <option key={c.id} value={c.id}>{c.firstName} {c.surname}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Category</span>
          <select name="category" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Description (optional)</span>
        <textarea name="description" rows={2} maxLength={500} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. 3rd term report card" />
      </label>
      <input ref={fileRef} name="file" type="file" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100" />
      <button type="submit" className="btn-primary w-full sm:w-auto">Upload document</button>
    </form>
  );
}
