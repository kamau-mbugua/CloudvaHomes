import { describe, expect, it } from 'vitest';
import { nextSort, parseSort } from './sort';

describe('parseSort', () => {
  it('reads a descending field', () => {
    expect(parseSort('-balance', ['name', 'balance'], 'name')).toEqual({ field: 'balance', desc: true });
  });

  it('reads an ascending field', () => {
    expect(parseSort('name', ['name', 'balance'], '-balance')).toEqual({ field: 'name', desc: false });
  });

  it('falls back on missing or unknown values', () => {
    expect(parseSort(null, ['name', 'balance'], 'name')).toEqual({ field: 'name', desc: false });
    expect(parseSort('-bogus', ['name', 'balance'], '-issueDate')).toEqual({ field: 'issueDate', desc: true });
  });
});

describe('nextSort', () => {
  it('flips the direction of the column already sorted', () => {
    expect(nextSort('balance', 'balance')).toBe('-balance');
    expect(nextSort('-balance', 'balance')).toBe('balance');
    expect(nextSort('-name', 'name')).toBe('name');
  });

  it('starts money columns descending (largest first) and others ascending', () => {
    expect(nextSort('name', 'balance')).toBe('-balance');
    expect(nextSort('-issueDate', 'total')).toBe('-total');
    expect(nextSort('-balance', 'name')).toBe('name');
  });
});
