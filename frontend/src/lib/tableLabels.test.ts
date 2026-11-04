import { describe, expect, it } from 'vitest';
import { cellLabels, rowLabels } from './tableLabels';

describe('cellLabels', () => {
  it('expands colSpan and blanks the actions column', () => {
    expect(cellLabels([
      { text: 'Invoice', colSpan: 1 },
      { text: 'Amount', colSpan: 2 },
      { text: '', colSpan: 1 },
    ])).toEqual(['Invoice', 'Amount', 'Amount', '']);
  });

  it('trims header text and treats a missing or bad colSpan as 1', () => {
    expect(cellLabels([
      { text: '  Due date \n', colSpan: 0 },
      { text: 'Status', colSpan: Number.NaN },
    ])).toEqual(['Due date', 'Status']);
  });
});

describe('rowLabels', () => {
  const columns = ['Invoice', 'Tenant', 'Unit', 'Total', ''];

  it('gives each cell its column’s label', () => {
    expect(rowLabels(columns, [1, 1, 1, 1, 1])).toEqual(['Invoice', 'Tenant', 'Unit', 'Total', '']);
  });

  it('labels a cell after a wide cell by its real column (e.g. a totals row)', () => {
    expect(rowLabels(columns, [3, 1, 1])).toEqual(['', 'Total', '']);
  });

  it('gives a cell spanning several columns no label', () => {
    expect(rowLabels(columns, [5])).toEqual(['']);
  });

  it('gives extra cells beyond the header no label', () => {
    expect(rowLabels(['A'], [1, 1])).toEqual(['A', '']);
  });
});
