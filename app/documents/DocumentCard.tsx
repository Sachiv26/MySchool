'use client';
import { fmtDate, fmtBytes } from '@/lib/client/api';

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

const CATEGORIES = [
  { value: 'REPORT_CARD', label: 'Report Card', icon: '📊' },
  { value: 'FORM', label: 'Form / Letter', icon: '📝' },
  { value: 'PHOTO', label: 'Photo', icon: '📸' },
  { value: 'PERMISSION', label: 'Permission Slip', icon: '✅' },
  { value: 'OTHER', label: 'Other', icon: '📎' },
];

function categoryMeta(cat: string) {
  return CATEGORIES.find((c) => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1];
}

export default function DocumentCard({ doc, onDelete }: { doc: Document; onDelete: (id: string) => void }) {
  return (
    <div className="card flex items-start gap-3 p-3">
      <span className="text-2xl">{categoryMeta(doc.category).icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{doc.fileName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {categoryMeta(doc.category).label}
          {doc.child ? ` · ${doc.child.firstName} ${doc.child.surname}` : ''}
          · {fmtBytes(doc.fileSize)} · {fmtDate(doc.createdAt)}
        </p>
        {doc.description && <p className="mt-1 text-xs text-slate-600">{doc.description}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <a href={`/api/documents/${doc.id}/download`} className="btn-outline px-2 py-1 text-xs">Download</a>
        <button onClick={() => onDelete(doc.id)} className="btn-outline px-2 py-1 text-xs text-red-600 hover:border-red-300">Delete</button>
      </div>
    </div>
  );
}
