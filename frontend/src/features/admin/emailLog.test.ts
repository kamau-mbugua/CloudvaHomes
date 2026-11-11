import { describe, expect, it } from 'vitest';
import { REVEAL_REASON_MIN, revealReasonError } from './emailLog';

describe('revealReasonError', () => {
  it('asks for a reason of at least the minimum length, ignoring spaces', () => {
    expect(REVEAL_REASON_MIN).toBe(10);
    expect(revealReasonError('')).toMatch(/why/i);
    expect(revealReasonError('   short   ')).toMatch(/why/i);
    expect(revealReasonError('Owner says the code never arrived')).toBeNull();
  });
});
