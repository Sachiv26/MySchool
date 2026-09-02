/**
 * Validates that the Zod extraction schema enforces its contract — the
 * guard against the AI inventing information that doesn't exist.
 */
import { describe, it, expect } from 'vitest';
import { tryValidateExtraction } from '@/lib/services/ai/aiSchemas';

describe('Extraction schema contract', () => {
  const valid = {
    messageType: 'EVENT',
    grades: ['Grade 4'],
    allGrades: false,
    title: 'Sports Day',
    summary: 'Annual sports day.',
    eventDate: '2026-09-12',
    startTime: '09:00',
    endTime: '12:00',
    location: null,
    deadline: null,
    amount: null,
    currency: null,
    requiredItems: ['hat'],
    actionItems: [{ type: 'BRING', title: 'Bring hat', assignee: 'CHILD' }],
    contactInformation: null,
    registrationRequired: null,
    permissionRequired: null,
    importance: 3,
    shouldGenerateReminders: true,
    categories: ['EVENT'],
    classes: ['4B'],
    projects: [
      {
        title: 'Solar system model',
        subject: 'Natural Science',
        description: null,
        assignedDate: null,
        dueDate: '2026-09-18',
        tasks: [{ title: 'Build the model', description: null, dueDate: '2026-09-16' }],
      },
    ],
    detectedDates: [{ date: '2026-09-12', isDeadline: false, context: 'Sports day', notes: null }],
    people: [{ name: 'Mrs Petersen', role: 'Teacher' }],
    dateNotes: null,
    needsReview: false,
    confidence: {
      overall: 0.9,
      grade: 0.85,
      eventDate: 0.9,
      deadline: 0.5,
      amount: 0.5,
    },
  };

  it('accepts a well-formed, conservative extraction', () => {
    const res = tryValidateExtraction(valid);
    expect(res.ok).toBe(true);
  });

  it('rejects out-of-range confidence values (never trust the model blindly)', () => {
    const bad = tryValidateExtraction({ ...valid, confidence: { ...valid.confidence!, amount: 1.5 } });
    expect(bad.ok).toBe(false);
  });

  it('requires messageType to be one of the configured set', () => {
    const bad = tryValidateExtraction({ ...valid, messageType: 'BOGUS' });
    expect(bad.ok).toBe(false);
  });

  it('rejects malformed dates', () => {
    const bad = tryValidateExtraction({ ...valid, eventDate: 'not-a-date' });
    expect(bad.ok).toBe(false);
  });

  // --- School Communication Intelligence Agent extensions ---

  it('defaults the extended agent fields when the model omits them', () => {
    const res = tryValidateExtraction({
      ...valid,
      categories: undefined,
      classes: undefined,
      projects: undefined,
      detectedDates: undefined,
      people: undefined,
      actionItems: [{ type: 'BRING', title: 'Bring hat' }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.categories).toEqual([]);
      expect(res.data.classes).toEqual([]);
      expect(res.data.projects).toEqual([]);
      expect(res.data.detectedDates).toEqual([]);
      expect(res.data.people).toEqual([]);
      expect(res.data.dateNotes).toBeNull();
      expect(res.data.actionItems[0].assignee).toBe('UNKNOWN');
    }
  });

  it('keeps parent/child assignees and ambiguous-date notes (never invent dates)', () => {
    const res = tryValidateExtraction({
      ...valid,
      actionItems: [{ type: 'BRING', title: 'Bring paper', assignee: 'CHILD' }],
      detectedDates: [
        { date: null, isDeadline: false, context: 'sometime next week', notes: 'Ambiguous: "next week" has no weekday' },
      ],
      dateNotes: 'One relative date left null because it is ambiguous.',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.actionItems[0].assignee).toBe('CHILD');
      expect(res.data.detectedDates[0].date).toBeNull();
      expect(res.data.detectedDates[0].notes).toContain('Ambiguous');
      expect(res.data.dateNotes).toContain('ambiguous');
    }
  });

  it('rejects an assignee outside the allowed set', () => {
    const bad = tryValidateExtraction({
      ...valid,
      actionItems: [{ type: 'BRING', title: 'Bring paper', assignee: 'SCHOOL' }],
    });
    expect(bad.ok).toBe(false);
  });

  it('rejects action item deadlines that are not ISO YYYY-MM-DD dates', () => {
    const bad = tryValidateExtraction({
      ...valid,
      actionItems: [{ type: 'PAY', title: 'Pay R250', deadline: 'soon' }],
    });
    expect(bad.ok).toBe(false);
  });

  it('accepts a project broken into actionable tasks (rule 6)', () => {
    const res = tryValidateExtraction({ ...valid, messageType: 'PROJECT', categories: ['PROJECT', 'HOMEWORK'] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.projects[0].tasks).toHaveLength(1);
      expect(res.data.projects[0].tasks[0].title).toBe('Build the model');
      expect(res.data.categories).toEqual(['PROJECT', 'HOMEWORK']);
    }
  });
});
