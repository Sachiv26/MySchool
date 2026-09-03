'use client';
import { getTermsForYear, getSchoolTerm, type SchoolTerm } from '@/lib/utils/southAfricanTerms';

export default function TermSelector({ selected, onChange }: { selected: SchoolTerm; onChange: (t: SchoolTerm) => void }) {
  const current = getSchoolTerm();
  const years = [current.year, current.year - 1, current.year + 1];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {years.map(y => (
        <div key={y} className="flex gap-1 rounded-full border border-slate-200 bg-white p-0.5">
          {getTermsForYear(y).map(t => (
            <button key={`${t.year}-${t.term}`} onClick={() => onChange(t)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${selected.term === t.term && selected.year === t.year ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              T{t.term}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
