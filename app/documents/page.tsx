'use client';

import { useEffect, useState, useCallback } from 'react';
import PageShell from '@/components/PageShell';
import { EmptyState, ErrorBox, LoadingRows } from '@/components/ui';
import { apiGet, apiSend } from '@/lib/client/api';
import { getSchoolTerm, formatTerm, type SchoolTerm } from '@/lib/utils/southAfricanTerms';
import TermSelector from './TermSelector';
import DocumentCard from './DocumentCard';
import UploadForm from './UploadForm';

interface Document {
  id: string;
  term: number;
  year: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  description: string | null;
  category: string;
  storedPath: string;
  createdAt: string;
  child?: { firstName: string; surname: string } | null;
}

interface Child { id: string; firstName: string; surname: string }

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<SchoolTerm>(() => getSchoolTerm());
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(() => {
    const qs = `?term=${selectedTerm.term}&year=${selectedTerm.year}`;
    Promise.all([
      apiGet<{ ok: true; documents: Document[] }>(`/api/documents${qs}`),
      apiGet<{ children: Child[] }>('/api/parents/children'),
    ])
      .then(([d, c]) => { setDocuments(d.documents); setChildren(c.children); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load documents.'));
  }, [selectedTerm]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      await apiSend(`/api/documents/${id}`, null, 'DELETE');
      setDocuments(prev => prev ? prev.filter(d => d.id !== id) : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete document.');
    }
  };

  const grouped = (documents ?? []).reduce((acc, doc) => {
    const key = `${doc.year}-${doc.term}`;
    if (!acc[key]) acc[key] = { term: doc.term, year: doc.year, docs: [] };
    acc[key].docs.push(doc);
    return acc;
  }, {} as Record<string, { term: number; year: number; docs: Document[] }>);

  const sortedGroups = Object.values(grouped).sort((a, b) => b.year - a.year || b.term - a.term);

  return (
    <PageShell title="Documents" back="/">
      {error && <ErrorBox message={error} />}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">📁 School Documents</p>
          <p className="text-xs text-slate-500">
            {documents ? `${documents.length} document${documents.length === 1 ? '' : 's'}` : 'Loading…'} · Showing {formatTerm(selectedTerm)}
          </p>
        </div>
        <button onClick={() => setShowUpload(!showUpload)} className="btn-primary shrink-0 text-sm">
          {showUpload ? '✕ Cancel' : '⬆️ Upload'}
        </button>
      </div>
      <TermSelector selected={selectedTerm} onChange={setSelectedTerm} />
      {showUpload && <UploadForm term={selectedTerm} children={children} onDone={() => { setShowUpload(false); load(); }} onError={setError} />}
      {!documents && !error && <LoadingRows rows={4} />}
      {documents && documents.length === 0 && (
        <EmptyState icon="📁" title="No documents this term" hint="Upload report cards, permission slips, forms and more." />
      )}
      {sortedGroups.map(group => (
        <section key={`${group.year}-${group.term}`}>
          <h2 className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Term {group.term} {group.year}</h2>
          <div className="space-y-2">
            {group.docs.map(doc => <DocumentCard key={doc.id} doc={doc} onDelete={handleDelete} />)}
          </div>
        </section>
      ))}
    </PageShell>
  );
}