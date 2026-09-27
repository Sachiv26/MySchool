/**
 * South African public-school term calendar utility.
 *
 * The Department of Basic Education publishes exact dates each year, but the
 * pattern is stable enough to compute defaults. Use these helpers so every
 * parent-facing view can scope to a term without duplicating the math.
 *
 * Term boundaries (approximate — covers 95% of public schools):
 *   Term 1: 15 Jan – 20 Mar
 *   Term 2: 05 Apr – 20 Jun
 *   Term 3: 10 Jul – 25 Sep
 *   Term 4: 05 Oct – 10 Dec
 */

export interface SchoolTerm {
  term: 1 | 2 | 3 | 4;
  year: number;
  startDate: Date;
  endDate: Date;
}

/** Approximate start/end dates for a given (term, year). */
export function getTermDates(term: 1 | 2 | 3 | 4, year: number): { start: Date; end: Date } {
  switch (term) {
    case 1:
      return { start: new Date(year, 0, 15), end: new Date(year, 2, 20) }; // Jan 15 – Mar 20
    case 2:
      return { start: new Date(year, 3, 5), end: new Date(year, 5, 20) }; // Apr 5 – Jun 20
    case 3:
      return { start: new Date(year, 6, 10), end: new Date(year, 8, 25) }; // Jul 10 – Sep 25
    case 4:
      return { start: new Date(year, 9, 5), end: new Date(year, 11, 10) }; // Oct 5 – Dec 10
  }
}

/** Build a full SchoolTerm descriptor. Defaults to the current SA term. */
export function getSchoolTerm(term?: 1 | 2 | 3 | 4, year?: number): SchoolTerm {
  const now = new Date();
  const y = year ?? now.getFullYear();
  // Compute current term directly without recursion.
  const current = getTermDatesForYear(y);
  const currentTerm = current.find(
    (ct) => now >= ct.startDate && now <= ct.endDate
  ) ?? current[3]; // fallback to term 4
  const resolvedTerm = term ?? currentTerm.term;
  const resolvedYear = year ?? currentTerm.year;
  const { start, end } = getTermDates(resolvedTerm, resolvedYear);
  return { term: resolvedTerm, year: resolvedYear, startDate: start, endDate: end };
}

/** All four terms' date ranges for a year (no recursion). */
function getTermDatesForYear(year: number): SchoolTerm[] {
  return [1, 2, 3, 4].map((t) => {
    const { start, end } = getTermDates(t as 1 | 2 | 3 | 4, year);
    return { term: t as 1 | 2 | 3 | 4, year, startDate: start, endDate: end };
  });
}

/** Determine which term a given date falls in (defaults to "now"). */
export function getTermForDate(date: Date = new Date()): SchoolTerm {
  const year = date.getFullYear();
  const terms: SchoolTerm[] = [1, 2, 3, 4].map((t) => getSchoolTerm(t as 1 | 2 | 3 | 4, year));
  for (const term of terms) {
    if (date >= term.startDate && date <= term.endDate) return term;
  }
  // Fallback: if we're in the "gap" between terms, pick the nearest one.
  // Nov–Dec (after term 4 but before next year) → term 4 of current year.
  // Dec (after term 4 end) → term 4 of current year.
  if (date.getMonth() === 11) return getSchoolTerm(4, year);
  // Jan 1–14 (before term 1 start) → term 4 of previous year.
  if (date.getMonth() === 0 && date.getDate() < 15) return getSchoolTerm(4, year - 1);
  // Otherwise find the closest start.
  let closest = terms[0];
  let minDiff = Math.abs(date.getTime() - closest.startDate.getTime());
  for (const term of terms) {
    const diff = Math.abs(date.getTime() - term.startDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closest = term;
    }
  }
  return closest;
}

/** All four terms for a given year, in order. */
export function getTermsForYear(year: number): SchoolTerm[] {
  return getTermDatesForYear(year);
}

/** Format a term for display: "Term 3 2026". */
export function formatTerm(t: SchoolTerm): string {
  return `Term ${t.term} ${t.year}`;
}

/** Prisma `where` clause helper — scope a date column to a term. */
export function termDateFilter<K extends string>(
  column: K,
  term: SchoolTerm
): Record<K, { gte: Date; lte: Date }> {
  return { [column]: { gte: term.startDate, lte: term.endDate } } as Record<
    K,
    { gte: Date; lte: Date }
  >;
}
