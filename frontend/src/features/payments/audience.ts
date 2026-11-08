import type { OrgKind } from '../../lib/auth/types';

/**
 * Who pays an organisation, and how their payments are recognised: tenants (with tenant codes and
 * invoice numbers) for landlords and agencies, guests (with booking numbers) for hosts.
 */
export function paymentCopy(kind: OrgKind | null | undefined) {
  if (kind === 'HOST') {
    return {
      emptyChannels:
        'Add each way guests pay you — an M-Pesa paybill or till, a bank account, cash or cheque. Payments are recorded against a channel.',
      mpesaPrompts: 'guests’ phones',
      bankMatching:
        'Deposits whose reference has a booking number like B00012 are recorded against that booking; the rest wait on Reconciliation.',
    };
  }
  return {
    emptyChannels:
      'Add each way tenants pay you — an M-Pesa paybill or till, a bank account, cash or cheque. Payments are recorded against a channel.',
    mpesaPrompts: 'tenants’ phones',
    bankMatching:
      'Tenants found in the narrative — a tenant code like T00001 or an invoice number — are recorded as paid; the rest wait on Reconciliation.',
  };
}

export type OrgSettingsTab = 'details' | 'billing' | 'reminders' | 'late-fees';

const ALL_TABS: { key: OrgSettingsTab; label: string }[] = [
  { key: 'details', label: 'Organisation details' },
  { key: 'billing', label: 'Billing' },
  { key: 'reminders', label: 'Rent reminders' },
  { key: 'late-fees', label: 'Late fees' },
];

/** Settings → Organisation tabs. Invoices, rent reminders and late fees are monthly-rent features. */
export function orgSettingsTabs(kind: OrgKind | null | undefined) {
  return kind === 'HOST' ? ALL_TABS.filter((t) => t.key === 'details') : ALL_TABS;
}
