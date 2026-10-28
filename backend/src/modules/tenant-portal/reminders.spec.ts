import { planReminders, reminderText, shortDate } from './reminders.js';

const s = { enabled: true, daysBefore: 3, overdueDays: [3, 10] };

describe('reminder plan', () => {
  it('reminds 3 days before the due date', () => {
    const plan = planReminders(
      [{ tenantId: 't', dueDate: '2026-11-05', balance: 2050000n }],
      s,
      '2026-11-02',
    );
    expect(plan.get('t')).toEqual({ kind: 'REMINDER_DUE', amount: 2050000n, due: '2026-11-05' });
    expect(
      planReminders([{ tenantId: 't', dueDate: '2026-11-05', balance: 1n }], s, '2026-11-01').size,
    ).toBe(0);
  });

  it('chases overdue on the chosen days, covering everything overdue, and only once a day', () => {
    const inv = [
      { tenantId: 't', dueDate: '2026-10-05', balance: 1000n },
      { tenantId: 't', dueDate: '2026-11-05', balance: 2000n },
      { tenantId: 't', dueDate: '2026-11-11', balance: 4000n }, // due in 3 days too
    ];
    expect(planReminders(inv, s, '2026-11-08').get('t')).toEqual({
      kind: 'REMINDER_OVERDUE',
      amount: 3000n,
      since: '2026-10-05',
    });
    expect(planReminders(inv, s, '2026-11-09').get('t')).toBeUndefined(); // 4 and 35 days late: not a chosen day
  });

  it('ignores paid invoices and a zero "days before"', () => {
    expect(
      planReminders([{ tenantId: 't', dueDate: '2026-11-05', balance: 0n }], s, '2026-11-02').size,
    ).toBe(0);
    expect(
      planReminders(
        [{ tenantId: 't', dueDate: '2026-11-05', balance: 5n }],
        { ...s, daysBefore: 0 },
        '2026-11-05',
      ).size,
    ).toBe(0);
  });
});

describe('reminder wording', () => {
  it('fits one SMS with the paybill and account', () => {
    const text = reminderText(
      {
        firstName: 'Tom',
        code: 'T00001',
        orgName: 'Prime Agency',
        pay: { kind: 'MPESA_PAYBILL', shortcode: '522522' },
      },
      { kind: 'REMINDER_DUE', amount: 2050000n, due: '2026-11-05' },
    );
    expect(text).toBe(
      'Hi Tom, KES 20,500.00 is due on 5 Nov 2026. Pay to paybill 522522, account T00001. Prime Agency',
    );
    const long = reminderText(
      {
        firstName: 'Bartholomew',
        code: 'T00001',
        orgName: 'X'.repeat(200),
        pay: { kind: 'MPESA_PAYBILL', shortcode: '522522' },
      },
      { kind: 'REMINDER_OVERDUE', amount: 123456789n, since: '2026-10-05' },
    );
    expect(long.length).toBeLessThanOrEqual(160);
    expect(shortDate('2026-01-09')).toBe('9 Jan 2026');
  });
});
