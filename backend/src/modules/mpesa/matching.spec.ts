import { guessesFor, unitSplits } from './matching.js';

describe('account reference matching', () => {
  it('guesses tenant codes, invoice numbers and unit references', () => {
    expect(guessesFor(' t00042 ')).toEqual([
      { kind: 'tenant', code: 'T00042' },
      { kind: 'unit', ref: 'T00042' },
    ]);
    expect(guessesFor('inv-2026-000123')[0]).toEqual({
      kind: 'invoice',
      number: 'INV-2026-000123',
    });
    expect(guessesFor('KLC-A4')).toEqual([{ kind: 'unit', ref: 'KLCA4' }]);
    expect(guessesFor('')).toEqual([]);
    expect(guessesFor(null)).toEqual([]);
  });

  it('splits unit references on known property codes, longest first', () => {
    expect(unitSplits('KLCA4', ['KL', 'KLC', 'RKG'])).toEqual([
      { code: 'KLC', number: 'A4' },
      { code: 'KL', number: 'CA4' },
    ]);
    expect(unitSplits('KLC', ['KLC'])).toEqual([]);
  });
});
