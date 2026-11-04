import { describe, expect, it } from 'vitest';
import { reminderPreview, reminderResult } from './reminderRun';

describe('reminderPreview', () => {
  it('says how many tenants will be texted, split by kind', () => {
    expect(reminderPreview({ sent: 0, due: 2, overdue: 1, dryRun: true }))
      .toEqual({ canSend: true, text: 'This will text 3 tenants (2 due soon, 1 overdue).' });
    expect(reminderPreview({ sent: 0, due: 1, overdue: 0, dryRun: true }))
      .toEqual({ canSend: true, text: 'This will text 1 tenant (1 due soon, 0 overdue).' });
  });

  it('explains when nobody needs a reminder today', () => {
    expect(reminderPreview({ sent: 0, due: 0, overdue: 0, dryRun: true }))
      .toEqual({ canSend: false, text: 'No tenant needs a reminder today — nobody is due in the reminder window or overdue on a reminder day, or they were already texted today.' });
  });

  it('explains when automatic reminders are switched off', () => {
    expect(reminderPreview({ sent: 0, due: 0, overdue: 0, skipped: 'reminders are off', dryRun: true }))
      .toEqual({ canSend: false, text: 'Automatic rent reminders are off for your organisation. Turn them on in Settings → Organisation first.' });
  });
});

describe('reminderResult', () => {
  it('reports what was sent', () => {
    expect(reminderResult({ sent: 3, due: 2, overdue: 1 })).toEqual({ ok: true, text: 'Sent 3 rent reminders (2 due soon, 1 overdue).' });
    expect(reminderResult({ sent: 1, due: 1, overdue: 0 })).toEqual({ ok: true, text: 'Sent 1 rent reminder (1 due soon, 0 overdue).' });
  });

  it('says when some texts failed', () => {
    expect(reminderResult({ sent: 2, due: 2, overdue: 1 }))
      .toEqual({ ok: false, text: 'Sent 2 of 3 rent reminders. 1 failed — see the message log on each tenant’s page.' });
  });

  it('says when nothing was needed or reminders are off', () => {
    expect(reminderResult({ sent: 0, due: 0, overdue: 0 })).toEqual({ ok: true, text: 'No due or overdue reminders were needed right now.' });
    expect(reminderResult({ sent: 0, due: 0, overdue: 0, skipped: 'reminders are off' }).ok).toBe(false);
  });
});
