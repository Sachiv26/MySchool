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
    actionItems: [{ type: 'BRING', title: 'Bring hat' }],
    contactInformation: null,
    registrationRequired: null,
    permissionRequired: null,
    importance: 3,
    shouldGenerateReminders: true,
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
});
