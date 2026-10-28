import type { Label } from '../portfolio/labels';
import type {
  CollectionMode, CommissionBasis, CommissionableLine, LedgerBucket, LedgerKind, PayoutMethod, RemittanceDirection,
  RemittanceStatus,
} from './types';

/** Words and badge tones for agency accounting, in one place. */

export const COMMISSION_BASIS: Record<CommissionBasis, string> = {
  PERCENT_OF_COLLECTED: '% of money collected',
  PERCENT_OF_INVOICED: '% of amounts invoiced',
  FIXED_MONTHLY: 'Fixed fee per month',
};

export const COLLECTION_MODE: Record<CollectionMode, string> = {
  AGENCY_COLLECTS: 'Agency collects rent',
  LANDLORD_COLLECTS: 'Landlord collects rent',
};

export const COMMISSIONABLE_LINE: Record<CommissionableLine, string> = {
  RENT: 'Rent',
  CHARGE: 'Charges (water, service…)',
  MOVE_IN: 'Move-in fees',
  ADJUSTMENT: 'Adjustments',
};

export const LEDGER_BUCKET: Record<LedgerBucket, string> = {
  PAYABLE: 'Payable to landlord',
  DEPOSIT_HELD: 'Deposits held',
};

export const LEDGER_KIND: Record<LedgerKind, string> = {
  COLLECTION: 'Collection',
  COMMISSION: 'Commission',
  EXPENSE: 'Expense',
  DEPOSIT: 'Deposit',
  REMITTANCE: 'Payout',
  ADJUSTMENT: 'Adjustment',
  REVERSAL: 'Reversal',
};

export const REMITTANCE_STATUS: Record<RemittanceStatus, Label> = {
  DRAFT: { label: 'Draft', tone: 'ad__badge--info' },
  APPROVED: { label: 'Approved', tone: 'ad__badge--warn' },
  PAID: { label: 'Paid', tone: 'ad__badge--ok' },
  CANCELLED: { label: 'Cancelled', tone: 'ad__badge--off' },
};

export const REMITTANCE_DIRECTION: Record<RemittanceDirection, string> = {
  TO_LANDLORD: 'Agency pays landlord',
  FROM_LANDLORD: 'Landlord pays agency',
};

export const PAYOUT_METHOD: Record<PayoutMethod, string> = {
  BANK: 'Bank transfer',
  MPESA: 'M-Pesa',
  CHEQUE: 'Cheque',
};

export const AGREEMENT_STATE: Record<'ACTIVE' | 'UPCOMING' | 'ENDED', Label> = {
  ACTIVE: { label: 'Active', tone: 'ad__badge--ok' },
  UPCOMING: { label: 'Not started', tone: 'ad__badge--info' },
  ENDED: { label: 'Ended', tone: 'ad__badge--off' },
};
