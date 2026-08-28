/**
 * Reminder rule scheduling math — verifies the configurable ReminderRule offset
 * model produces the expected set of reminder dates for an event type.
 */
import { describe, it, expect } from 'vitest';

// Mirrors the ReminderRule model semantics: offsetDays is negative when "before".
function schedule(ruleOffsets: { offsetDays: number; timeOfDay: string }[], anchor: Date) {
  return ruleOffsets.map((r) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + r.offsetDays);
    const [h, m] = r.timeOfDay.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  });
}

describe('Reminder rule calculation', () => {
  it('produces 7/3/1-day-before + morning-of reminders for EVENT', () => {
    const eventDate = new Date('2026-09-12T00:00:00');
    const scheduled = schedule(
      [
        { offsetDays: -7, timeOfDay: '08:00' },
        { offsetDays: -3, timeOfDay: '08:00' },
        { offsetDays: -1, timeOfDay: '08:00' },
        { offsetDays: 0, timeOfDay: '07:00' },
      ],
      eventDate
    );
    expect(scheduled[0].toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(scheduled[2].toISOString().slice(0, 10)).toBe('2026-09-11');
    expect(scheduled[3].toISOString().slice(0, 10)).toBe('2026-09-12');
    expect(scheduled[3].getHours()).toBe(7);
  });

  it('overdue reminder for payments is day of deadline minus one day', () => {
    const deadline = new Date('2026-08-28T00:00:00');
    const scheduled = schedule([{ offsetDays: -1, timeOfDay: '08:00' }], deadline);
    expect(scheduled[0].toISOString().slice(0, 10)).toBe('2026-08-27');
  });
});
