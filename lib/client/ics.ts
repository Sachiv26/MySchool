/**
 * Minimal iCalendar (ICS) generator — client-side, zero dependencies.
 *
 * Produces a standards-compliant VCALENDAR with one VTODO per task and one
 * VEVENT for each item that has a concrete date. Parents can import the
 * downloaded file into Google Calendar, Apple Calendar, Outlook, etc.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a Date as a UTC ICS timestamp: 20260902T120000Z */
function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Format a date-only value for ICS: 20260920 */
function toIcsDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** Escape per RFC 5545: backslash, comma, semicolon, newline. */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

export interface IcsTask {
  id: string;
  title: string;
  description?: string | null;
  deadline?: string | null; // ISO date-time
  status?: 'PENDING' | 'DONE' | 'DISMISSED';
}

export interface IcsEvent {
  id: string;
  title: string;
  description?: string | null;
  eventDate?: string | null; // ISO date-time
  endTime?: string | null;
  location?: string | null;
}

export interface IcsInput {
  tasks?: IcsTask[];
  events?: IcsEvent[];
  productName?: string;
}

/** Build the full ICS file content as a string. */
export function buildIcs(input: IcsInput): string {
  const now = toIcsUtc(new Date());
  const product = input.productName ?? 'MySchool Connect';
  const tasks = input.tasks ?? [];
  const events = input.events ?? [];

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${product}//Planner//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${product} Planner`,
    `X-WR-TIMEZONE:${Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}`,
  ];

  for (const t of tasks) {
    lines.push('BEGIN:VTODO');
    lines.push(`DTSTAMP:${now}`);
    lines.push(`UID:task-${t.id}@myschool`);
    lines.push(`SUMMARY:${esc(t.title)}`);
    if (t.description) lines.push(`DESCRIPTION:${esc(t.description)}`);
    if (t.deadline) {
      const dateStr = toIcsDate(t.deadline);
      if (dateStr) lines.push(`DUE;VALUE=DATE:${dateStr}`);
    }
    lines.push(
      t.status === 'DONE'
        ? 'STATUS:COMPLETED'
        : t.status === 'DISMISSED'
        ? 'STATUS:CANCELLED'
        : 'STATUS:NEEDS-ACTION'
    );
    lines.push('END:VTODO');
  }

  for (const e of events) {
    if (!e.eventDate) continue; // events without a date can't go on a calendar
    const start = toIcsDate(e.eventDate);
    if (!start) continue;
    const endRaw = e.endTime ? new Date(e.endTime) : new Date(new Date(e.eventDate).getTime() + 60 * 60 * 1000);
    const end = e.endTime ? toIcsDate(e.endTime) : toIcsDate(endRaw);
    lines.push('BEGIN:VEVENT');
    lines.push(`DTSTAMP:${now}`);
    lines.push(`UID:event-${e.id}@myschool`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end || start}`);
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Build an ICS blob and trigger a browser download.
 * Call this from a client component onClick handler.
 */
export function downloadIcs(input: IcsInput, filename = 'myschool-planner.ics'): void {
  const content = buildIcs(input);
  // Prepend UTF-8 BOM so some clients (e.g. Excel/Outlook) render accents correctly.
  const blob = new Blob(['﻿' + content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
