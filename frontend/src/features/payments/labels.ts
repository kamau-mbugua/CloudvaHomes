import type { Label } from '../portfolio/labels';
import type { ChannelKind, DepositKind, PaymentMethod, StatementEntryType } from './types';

/** Words and badge tones for payment states, in one place. */

export const CHANNEL_KIND: Record<ChannelKind, Label> = {
  MPESA_PAYBILL: { label: 'M-Pesa paybill', tone: 'ad__badge--ok' },
  MPESA_TILL: { label: 'M-Pesa till', tone: 'ad__badge--ok' },
  BANK_ACCOUNT: { label: 'Bank account', tone: 'ad__badge--info' },
  CASH: { label: 'Cash', tone: 'ad__badge--off' },
  CHEQUE: { label: 'Cheque', tone: 'ad__badge--warn' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, Label> = {
  ...CHANNEL_KIND,
  DEPOSIT: { label: 'From deposit', tone: 'ad__badge--info' },
};

export const REVERSED: Label = { label: 'Reversed', tone: 'ad__badge--off' };
export const REVERSAL: Label = { label: 'Reversal', tone: 'ad__badge--alert' };

export const STATEMENT_TYPE: Record<StatementEntryType, string> = {
  INVOICE: 'Invoice',
  CREDIT_NOTE: 'Credit note',
  PAYMENT: 'Payment',
  REVERSAL: 'Reversal',
  DEPOSIT_APPLIED: 'Deposit applied',
};

export const DEPOSIT_KIND: Record<DepositKind, string> = {
  OPENING: 'Opening balance',
  RECEIVED: 'Received',
  APPLIED: 'Applied to invoices',
  REFUNDED: 'Refunded',
  REVERSAL: 'Reversal',
};

/** What the reference is called for money that came in by this channel. */
export function referenceLabel(kind: ChannelKind | null | undefined): string {
  switch (kind) {
    case 'MPESA_PAYBILL':
    case 'MPESA_TILL':
      return 'M-Pesa code';
    case 'CHEQUE':
      return 'Cheque no.';
    case 'BANK_ACCOUNT':
      return 'Bank slip no.';
    case 'CASH':
      return 'Cash slip no.';
    default:
      return 'Reference';
  }
}

export function referenceHint(kind: ChannelKind | null | undefined): string {
  switch (kind) {
    case 'MPESA_PAYBILL':
    case 'MPESA_TILL':
      return 'From the M-Pesa message, e.g. SJR4XK2L9P.';
    case 'CHEQUE':
      return 'The number printed on the cheque.';
    case 'BANK_ACCOUNT':
      return 'From the deposit slip or bank statement.';
    case 'CASH':
      return 'A slip or receipt book number, if there is one.';
    default:
      return 'The same reference can’t be entered twice on one channel.';
  }
}
