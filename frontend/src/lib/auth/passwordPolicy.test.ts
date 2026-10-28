import { describe, expect, it } from 'vitest';
import { isOtpCode, newPasswordErrors, passwordProblem } from './passwordPolicy';

describe('passwordProblem', () => {
  it('requires at least 10 characters', () => {
    expect(passwordProblem('')).toMatch(/10 characters/);
    expect(passwordProblem('abc123xyz')).toMatch(/10 characters/);
    expect(passwordProblem('abc123xyz!')).toBeNull();
  });

  it('rejects passwords made only of digits', () => {
    expect(passwordProblem('0712345678')).toMatch(/letters or symbols/);
    expect(passwordProblem('07123456789')).toMatch(/letters or symbols/);
    expect(passwordProblem('0712345678a')).toBeNull();
    expect(passwordProblem('0712 345 678')).toBeNull();
  });
});

describe('newPasswordErrors', () => {
  it('reports the policy and a mismatch per field', () => {
    expect(newPasswordErrors('short', 'other')).toEqual({
      password: expect.stringMatching(/10 characters/),
      confirm: 'The two passwords do not match.',
    });
    expect(newPasswordErrors('long enough pass', 'long enough pass')).toEqual({});
  });
});

describe('isOtpCode', () => {
  it('accepts exactly six digits, ignoring spaces', () => {
    expect(isOtpCode('123456')).toBe(true);
    expect(isOtpCode('123 456')).toBe(true);
    expect(isOtpCode('12345')).toBe(false);
    expect(isOtpCode('12345a')).toBe(false);
  });
});
