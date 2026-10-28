import { AppError } from '../../common/errors/app-error.js';
import type { Db, Tx } from '../../prisma/prisma.module.js';
import { orgContext } from '../auth/decorators.js';
import { normalizeEmail, normalizePhone } from '../auth/identifiers.js';

/** Input clean-up shared by the portfolio services. Field names match the DTO properties. */

export function requiredPhone(field: string, raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw AppError.fieldInvalid(field, 'Enter a valid phone number');
  return phone;
}

/** undefined = leave unchanged; "" or null = clear. */
export function optionalPhone(field: string, raw: string | null | undefined) {
  if (raw === undefined) return undefined;
  return raw?.trim() ? requiredPhone(field, raw) : null;
}

export function optionalEmail(field: string, raw: string | null | undefined) {
  if (raw === undefined) return undefined;
  if (!raw?.trim()) return null;
  const email = normalizeEmail(raw);
  if (!email) throw AppError.fieldInvalid(field, 'Enter a valid email address');
  return email;
}

/** Trimmed text; undefined stays undefined (unchanged), blank becomes null (cleared). */
export function optionalText(raw: string | null | undefined) {
  if (raw === undefined) return undefined;
  return raw?.trim() || null;
}

export function upper(raw: string | null | undefined) {
  const v = optionalText(raw);
  return v ? v.toUpperCase() : v;
}

/** Whether the active organisation is an agency (manages properties for landlords). */
export async function isAgency(db: Db | Tx): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: orgContext().orgId },
    select: { kind: true },
  });
  return org?.kind === 'AGENCY';
}

export async function requireAgency(db: Db | Tx): Promise<void> {
  if (!(await isAgency(db))) {
    throw AppError.forbidden('AGENCY_ONLY', 'Landlords are only used by agencies');
  }
}
