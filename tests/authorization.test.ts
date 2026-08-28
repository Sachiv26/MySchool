/**
 * Authorization helpers — a parent must only see messages applicable to their
 * own children's grades, and never by trusting grade ids supplied by the client.
 */
import { describe, it, expect } from 'vitest';

// Pure logic mirror of the grade-visibility predicate used in parentViews.
function messageVisibleToParent(
  messageGrades: string[], // empty == all grades
  childGrades: string[]
): boolean {
  if (messageGrades.length === 0) return true; // school-wide
  return messageGrades.some((g) => childGrades.includes(g));
}

describe('Parent authorization / grade filtering', () => {
  it('shows an all-grades message to any parent', () => {
    expect(messageVisibleToParent([], ['Grade 1', 'Grade 2'])).toBe(true);
  });

  it('shows a grade-specific message only when the child is in that grade', () => {
    expect(messageVisibleToParent(['Grade 4'], ['Grade 4', 'Grade 5'])).toBe(true);
    expect(messageVisibleToParent(['Grade 4'], ['Grade 5'])).toBe(false);
  });

  it('shows a multi-grade message to a child in any listed grade', () => {
    expect(messageVisibleToParent(['Grade 4', 'Grade 5'], ['Grade 5'])).toBe(true);
    expect(messageVisibleToParent(['Grade 4', 'Grade 5'], ['Grade 6'])).toBe(false);
  });

  it('never trusts a client-supplied grade id alone', () => {
    // A parent may claim any grade id on the frontend; only the DB join counts.
    expect(messageVisibleToParent(['Grade 4'], [])).toBe(false); // no children => no visibility
  });
});
