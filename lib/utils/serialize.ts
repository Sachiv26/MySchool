import { Prisma } from '@prisma/client';

/** Convert a Prisma Decimal (or number/null) to a plain number for serialization. */
export function decimalToNumber(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return null;
}

/** ISO date string (YYYY-MM-DD) for a Date, independent of display timezone quirks. */
export function isoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Full ISO timestamp string or null. */
export function isoDateTime(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
