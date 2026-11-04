import type { TenancyStatus, TenantStatus } from '../portfolio/types';

/**
 * Which tenancy actions are buttons and which go in the "More" menu. At most two buttons —
 * the next step in the tenancy's life — so the row stays readable; everything else, and
 * delete last, lives in the menu.
 */

export type TenancyAction =
  | 'notice'
  | 'changeNotice'
  | 'withdrawNotice'
  | 'moveOut'
  | 'leasePdf'
  | 'attachLease'
  | 'moveInInvoice'
  | 'inspectIn'
  | 'inspectOut'
  | 'renew'
  | 'rentChange'
  | 'delete';

export interface ActionPermissions {
  view: boolean;
  update: boolean;
  delete: boolean;
  invoice: boolean;
}

export function tenancyActionLayout(
  status: TenancyStatus,
  can: ActionPermissions,
  opts: { hasSignedLease?: boolean; pendingRentChanges?: number } = {},
): { buttons: TenancyAction[]; menu: TenancyAction[] } {
  const live = status === 'ACTIVE' || status === 'NOTICE';
  const buttons: TenancyAction[] = [];
  const menu: TenancyAction[] = [];

  if (can.update && status === 'ACTIVE') buttons.push('notice', 'moveOut');
  if (can.update && status === 'NOTICE') {
    buttons.push('moveOut', 'changeNotice');
    menu.push('withdrawNotice');
  }
  if (can.view) menu.push('leasePdf');
  if (can.update || (can.view && opts.hasSignedLease)) menu.push('attachLease');
  // Inspections: move-in any time; move-out once the tenant is leaving or has left.
  if (can.view) menu.push('inspectIn');
  if (can.view && status !== 'ACTIVE') menu.push('inspectOut');
  // Renewing or re-pricing is for tenants who are staying; under notice, only to cancel a
  // change scheduled earlier.
  if (can.update && status === 'ACTIVE') menu.push('renew', 'rentChange');
  if (can.update && status === 'NOTICE' && (opts.pendingRentChanges ?? 0) > 0) menu.push('rentChange');
  if (can.invoice && live) menu.push('moveInInvoice');
  if (can.delete) menu.push('delete');

  return { buttons, menu };
}

/** The main button on a tenant's page: take their money if they live here, else move them in. */
export function tenantPrimaryAction(status: TenantStatus): 'recordPayment' | 'moveIn' {
  return status === 'CURRENT' ? 'recordPayment' : 'moveIn';
}
