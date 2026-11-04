import { describe, expect, it } from 'vitest';
import { balanceCell } from './balance';

describe('balanceCell', () => {
  it('shows money owed', () => {
    expect(balanceCell(900_000)).toEqual({ tone: 'owed', text: 'KES 9,000.00' });
  });

  it('shows a negative balance as credit', () => {
    expect(balanceCell(-593_950)).toEqual({ tone: 'credit', text: 'KES 5,939.50 credit' });
  });

  it('shows nothing owed as a dash', () => {
    expect(balanceCell(0)).toEqual({ tone: 'none', text: '—' });
    expect(balanceCell(null)).toEqual({ tone: 'none', text: '—' });
    expect(balanceCell(undefined)).toEqual({ tone: 'none', text: '—' });
  });
});
