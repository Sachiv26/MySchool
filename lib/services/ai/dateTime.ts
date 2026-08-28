import dayjs from 'dayjs';

/** Parse a human date phrase from school messages into YYYY-MM-DD (local). */
export function parseDatePhrase(phrase: string, today: Date = new Date()): string | null {
  const p = phrase.trim();
  if (!p) return null;

  // ISO / slash / dash numeric
  const numeric = p.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slash = p.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) {
    const [, y, mo, d] = numeric;
    return validDate(+y, +mo, +d);
  }
  if (slash) {
    const [, d, mo, y] = slash;
    return validDate(+y, +mo, +d);
  }

  const now = dayjs(today).startOf('day');
  const low = p.toLowerCase();

  if (low === 'today') return now.format('YYYY-MM-DD');
  if (low === 'tomorrow') return now.add(1, 'day').format('YYYY-MM-DD');
  if (low === 'day after tomorrow' || low === 'the day after tomorrow')
    return now.add(2, 'day').format('YYYY-MM-DD');

  // "12 May 2024" / "12th May" / "the 12th of May"
  const named = p.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3,9})\b(?:\s+(\d{4}))?/i);
  if (named) {
    const [, dStr, monStr, yStr] = named;
    const day = parseInt(dStr, 10);
    const month = monthNumber(monStr);
    const year = yStr ? parseInt(yStr, 10) : now.year();
    if (month) return validDate(year, month, day);
  }

  // Weekday names with optional "this/next"
  const weekdayMatch = p.match(/(?:(this|next|coming)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (weekdayMatch) {
    const [, modifier, dayName] = weekdayMatch;
    const targetDow = weekdayIndex(dayName);
    if (targetDow !== undefined) {
      const baseDow = now.day();
      let diff = (targetDow - baseDow + 7) % 7;
      if (/next|coming/i.test(modifier ?? '')) diff += 7;
      if (!modifier && diff === 0) diff = 7; // bare "Friday" when today is Friday => next Friday
      return now.add(diff, 'day').format('YYYY-MM-DD');
    }
  }

  return null;
}

/** Parse a time phrase ("09:00", "at 9am", "3pm", "15:30") into HH:MM. */
export function parseTimePhrase(phrase: string): string | null {
  const p = phrase.trim().toLowerCase();
  const military = p.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (military) {
    return `${pad(+military[1])}:${pad(+military[2])}`;
  }
  const twelve = p.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/);
  if (twelve) {
    let h = parseInt(twelve[1], 10);
    const m = twelve[2] ? +twelve[2] : 0;
    const meridiem = twelve[3];
    if (meridiem === 'pm' && h !== 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    return `${pad(h)}:${pad(m)}`;
  }
  return null;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function weekdayIndex(name: string): number | undefined {
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[name];
}

function monthNumber(name: string): number | undefined {
  const months = [
    'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april',
    'may', 'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep',
    'september', 'oct', 'october', 'nov', 'november', 'dec', 'december',
  ];
  const idx = months.indexOf(name);
  if (idx === -1) return undefined;
  return Math.floor(idx / 2) + 1;
}

function validDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = dayjs(new Date(y, mo - 1, d));
  if (dt.year() !== y || dt.month() !== mo - 1 || dt.date() !== d) return null; // e.g. Feb 30
  return dt.format('YYYY-MM-DD');
}