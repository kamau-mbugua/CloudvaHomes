import { paymentReceiptText } from '../notifications/notifications.service.js';
import { balanceText } from './payments.service.js';

describe('receipt wording', () => {
  it('describes what is owed', () => {
    expect(balanceText(120000n)).toBe('Balance KES 1,200.00');
    expect(balanceText(-30000n)).toBe('Credit KES 300.00');
    expect(balanceText(0n)).toBe('Nothing owing');
  });

  it('fits one SMS even with a long organisation name', () => {
    const text = paymentReceiptText({
      amount: '1,234,567.89',
      number: 'RCT-2026-000012',
      balance: 'Balance KES 1,234,567.89',
      organizationName: 'A Very Long Property Management Agency Name Limited of Nairobi',
    });
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.startsWith('Received KES 1,234,567.89 ref RCT-2026-000012.')).toBe(true);
  });
});
