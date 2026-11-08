import type { SmsWarning } from './sms-types.js';

/** Owner warning wording (spec §6), shared by in-app notices and emails. */
export function smsWarningCopy(
  warn: SmsWarning,
  d: { balance: number | null; reason: string | null },
): { kind: string; title: string; body: string } {
  switch (warn) {
    case 'LOW':
      return {
        kind: 'sms_low',
        title: 'SMS units running low',
        body: `${d.balance ?? 0} SMS units left. Buy more so messages to your tenants and guests keep going.`,
      };
    case 'EMPTY':
      return {
        kind: 'sms_empty',
        title: 'Out of SMS units',
        body: 'Messages to your tenants and guests are not being sent. Buy SMS units to start again.',
      };
    case 'FAILING':
      return {
        kind: 'sms_failing',
        title: 'Your SMS account isn’t sending',
        body: `${(d.reason ?? 'Your SMS provider refused the message').replace(/\.?$/, '.')} Messages to your tenants and guests are failing. Check your SMS account, or buy KodiHub SMS units.`,
      };
  }
}
