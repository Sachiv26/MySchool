'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSchoolTerm, formatTerm, getTermsForYear, type SchoolTerm } from '@/lib/utils/southAfricanTerms';

interface TermContextValue {
  selectedTerm: SchoolTerm;
  setSelectedTerm: (t: SchoolTerm) => void;
  currentTerm: SchoolTerm;
  formatted: string;
}

const TermContext = createContext<TermContextValue | null>(null);

const STORAGE_KEY = 'myschool.selectedTerm';

// Stable default for SSR/CSR hydration — updated to real value after mount.
const DEFAULT_TERM: SchoolTerm = { term: 3, year: 2026, startDate: new Date(2026, 6, 10), endDate: new Date(2026, 8, 25) };

function loadStoredTerm(): SchoolTerm | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { term: 1 | 2 | 3 | 4; year: number };
    if (parsed && typeof parsed.term === 'number' && typeof parsed.year === 'number') {
      return { term: parsed.term, year: parsed.year, startDate: new Date(), endDate: new Date() };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function TermProvider({ children }: { children: ReactNode }) {
  // Initialize with a stable default to avoid hydration mismatch.
  const [selectedTerm, setSelectedTerm] = useState<SchoolTerm>(DEFAULT_TERM);

  // After mount, resolve the real term (localStorage or computed).
  useEffect(() => {
    const stored = loadStoredTerm();
    if (stored) {
      setSelectedTerm(stored);
    } else {
      setSelectedTerm(getSchoolTerm());
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ term: selectedTerm.term, year: selectedTerm.year })
      );
    } catch {
      /* ignore */
    }
  }, [selectedTerm]);

  return (
    <TermContext.Provider
      value={{
        selectedTerm,
        setSelectedTerm,
        currentTerm: getSchoolTerm(),
        formatted: formatTerm(selectedTerm),
      }}
    >
      {children}
    </TermContext.Provider>
  );
}

export function useTerm(): TermContextValue {
  const ctx = useContext(TermContext);
  if (!ctx) throw new Error('useTerm must be used within a TermProvider');
  return ctx;
}

export { getTermsForYear, formatTerm };
export type { SchoolTerm };
