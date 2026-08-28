/**
 * Tests for the rule-based AI extractor: type classification, grade detection,
 * and the contract that missing fields must remain null (never invented).
 */
import { describe, it, expect } from 'vitest';
import { RuleBasedAiExtractionService } from '@/lib/services/ai/ruleBasedAi';
import { validateExtraction } from '@/lib/services/ai/aiSchemas';

const svc = new RuleBasedAiExtractionService();

describe('RuleBasedAiExtractionService', () => {
  it('classifies a grade-sports message and extracts the date', async () => {
    const out = await svc.extract(
      'Grade 4 parents: Sports Day is on Friday September 12 2026. Bring your child\'s hat.',
      { gradeNames: ['Grade 4', 'Grade 5'] }
    );
    validateExtraction(out);
    expect(out.messageType).toBe('SPORTS');
    expect(out.grades).toContain('Grade 4');
    expect(out.allGrades).toBe(false);
    expect(out.requiredItems).toContainEqual(expect.stringContaining('hat'));
  });

  it('does NOT invent a time/location when the message omits them', async () => {
    const out = await svc.extract(
      'Grade R parents please note Sports Day is on Friday 4 September 2026. Bring red t-shirt.',
      { gradeNames: ['Grade R'] }
    );
    validateExtraction(out);
    expect(out.startTime).toBeNull();
    expect(out.location).toBeNull();
    expect(out.amount).toBeNull();
    expect(out.deadline).toBeNull();
  });

  it('detects a multi-grade message', async () => {
    const out = await svc.extract(
      'Grades 4 and 5 please note the camp payment of R250 is due 28 August 2026.',
      { gradeNames: ['Grade 4', 'Grade 5', 'Grade 6'] }
    );
    validateExtraction(out);
    expect(out.grades).toEqual(expect.arrayContaining(['Grade 4', 'Grade 5']));
    expect(out.amount).toBe(250);
  });

  it('marks ambiguous grade for review and does not fabricate', async () => {
    const out = await svc.extract(
      'All parents: please remember library books are due Friday.',
      { gradeNames: ['Grade 1', 'Grade 2'] }
    );
    validateExtraction(out);
    expect(out.allGrades).toBe(true);
    expect(out.grades).toEqual([]);
    // No amount / no invented date boundary.
    expect(out.amount).toBeNull();
  });
});
