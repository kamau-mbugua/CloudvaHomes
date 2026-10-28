import { checkStkAmount, checkStkPhone } from '../mpesa/rules';
import type { HowToPay, PortalTenancy, PropertyLike, UnitLike } from './types';

/**
 * Pure tenant-portal rules: naming a home, the rent day, how-to-pay wording and checking
 * the "Pay now" form. No React, money only as integer cents, so each is tested on its own.
 */

function unitName(unit: UnitLike): string {
  return typeof unit === 'string' ? unit : unit?.number ?? '';
}

function propertyName(property: PropertyLike): string {
  return typeof property === 'string' ? property : property?.name ?? '';
}

/** "A1, Sunrise Court". */
export function homeText(tenancy: Pick<PortalTenancy, 'unit' | 'property'>): string {
  return [unitName(tenancy.unit), propertyName(tenancy.property)].filter(Boolean).join(', ');
}

/** Tenancies they still live in (or are leaving), newest first. */
export function currentTenancies<T extends Pick<PortalTenancy, 'status' | 'startDate'>>(tenancies: readonly T[]): T[] {
  return tenancies.filter((t) => t.status !== 'ENDED').sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** What the number is called on the M-Pesa menu: "Paybill number", "Till number". */
export function shortcodeLabel(kind: HowToPay['kind']): string {
  return kind === 'MPESA_TILL' ? 'Till number' : kind === 'MPESA_PAYBILL' ? 'Paybill number' : 'Account number';
}

/** The number to copy for a way to pay: the shortcode for M-Pesa, the account number for a bank. */
export function payNumber(way: Pick<HowToPay, 'kind' | 'shortcode' | 'accountNumber'>): string | null {
  if (way.kind === 'MPESA_PAYBILL' || way.kind === 'MPESA_TILL') return way.shortcode || null;
  return way.accountNumber || null;
}

/** The M-Pesa menu path, so a tenant who has never paid a paybill can follow it. */
export function howToPaySteps(way: Pick<HowToPay, 'kind' | 'shortcode' | 'accountRef' | 'bankName' | 'accountNumber'>): string[] {
  if (way.kind === 'MPESA_TILL') {
    return ['M-Pesa → Lipa na M-Pesa → Buy Goods and Services', `Till number: ${way.shortcode ?? ''}`, 'Enter the amount and your PIN'];
  }
  if (way.kind === 'MPESA_PAYBILL') {
    return [
      'M-Pesa → Lipa na M-Pesa → Pay Bill',
      `Business number: ${way.shortcode ?? ''}`,
      ...(way.accountRef ? [`Account number: ${way.accountRef}`] : []),
      'Enter the amount and your PIN',
    ];
  }
  if (way.kind === 'BANK_ACCOUNT') {
    return [
      `Bank: ${way.bankName ?? ''}`.trim(),
      ...(way.accountNumber ? [`Account number: ${way.accountNumber}`] : []),
      ...(way.accountRef ? [`Reference: ${way.accountRef}`] : []),
    ];
  }
  return [];
}

export interface PayDraft {
  amount: string;
  phone: string;
}

export type CheckedPay =
  | { ok: true; body: { amount: number; phone?: string } }
  | { ok: false; errors: Partial<Record<keyof PayDraft, string>> };

/**
 * The "Pay now" form: whole shillings above zero, and a Kenyan mobile number. A blank
 * phone is left out, and the server prompts the number on their account.
 */
export function checkPay(draft: PayDraft): CheckedPay {
  const errors: Partial<Record<keyof PayDraft, string>> = {};
  const amount = checkStkAmount(draft.amount);
  if (!amount.ok) errors.amount = amount.error;
  let phone: string | undefined;
  if (draft.phone.trim()) {
    const checked = checkStkPhone(draft.phone);
    if (checked.ok) phone = checked.phone;
    else errors.phone = checked.error;
  }
  if (!amount.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: phone ? { amount: amount.minor, phone } : { amount: amount.minor } };
}

/** `?account=` to keep in links while someone with several tenant accounts browses one. */
export function accountSearch(count: number, tenantId: string): string {
  return count > 1 ? `?account=${encodeURIComponent(tenantId)}` : '';
}
