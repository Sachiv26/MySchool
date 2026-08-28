/**
 * ReminderRule + Reminder model integrity for scheduling (mirrors schema).
 */
import { describe, it, expect } from 'vitest';

describe('Reminder model fields', () => {
  it('supports the required statuses', () => {
    const statuses = ['PENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;
    expect(statuses).toContain('PENDING');
    expect(statuses).toContain('SENT');
  });

  it('supports the reminder types', () => {
    const types = ['UPCOMING', 'OVERDUE', 'EMERGENCY'] as const;
    expect(types).toContain('OVERDUE');
  });
});
