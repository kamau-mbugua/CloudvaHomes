import { describe, expect, it } from 'vitest';
import { readSort, sortValues } from './sort.js';

describe('sortValues', () => {
  it('allows each field ascending and, with a leading minus, descending', () => {
    expect(sortValues(['name', 'balance'])).toEqual(['name', '-name', 'balance', '-balance']);
  });
});

describe('readSort', () => {
  it('reads a descending field', () => {
    expect(readSort('-balance', '-issueDate')).toEqual({ field: 'balance', desc: true });
  });

  it('reads an ascending field', () => {
    expect(readSort('total', '-issueDate')).toEqual({ field: 'total', desc: false });
  });

  it('falls back when no sort is given', () => {
    expect(readSort(undefined, '-issueDate')).toEqual({ field: 'issueDate', desc: true });
    expect(readSort('', 'name')).toEqual({ field: 'name', desc: false });
  });
});
