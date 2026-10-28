import { currentContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Staff can be limited to some properties (`Membership.propertyIds`, loaded into the request
 * context by the auth guard). These filters are merged into every portfolio query; a record
 * outside the caller's properties behaves exactly like a missing one (404).
 *
 * What a limited caller sees (docs/plans/2026-10-27-phase-2-portfolio.md):
 * - properties in the list, their units, and tenancies on those units;
 * - tenants with any tenancy on those units, plus tenants with no tenancy at all yet;
 * - landlords who own one of those properties.
 */
export function allowedPropertyIds(): readonly string[] | null {
  return currentContext()?.propertyIds ?? null;
}

const inList = (ids: readonly string[]) => ({ in: [...ids] });

export function propertyScope(): Prisma.PropertyWhereInput {
  const ids = allowedPropertyIds();
  return ids ? { id: inList(ids) } : {};
}

export function unitScope(): Prisma.UnitWhereInput {
  const ids = allowedPropertyIds();
  return ids ? { propertyId: inList(ids) } : {};
}

export function tenancyScope(): Prisma.TenancyWhereInput {
  const ids = allowedPropertyIds();
  return ids ? { unit: { propertyId: inList(ids) } } : {};
}

export function tenantScope(): Prisma.TenantWhereInput {
  const ids = allowedPropertyIds();
  return ids
    ? {
        OR: [
          { tenancies: { some: { unit: { propertyId: inList(ids) } } } },
          { tenancies: { none: {} } },
        ],
      }
    : {};
}

export function landlordScope(): Prisma.LandlordWhereInput {
  const ids = allowedPropertyIds();
  return ids ? { properties: { some: { id: inList(ids) } } } : {};
}

/** For actions that only make sense with the whole portfolio in view (adding a property). */
export function requireAllProperties(): void {
  if (allowedPropertyIds()) {
    throw AppError.forbidden(
      'PROPERTY_SCOPE',
      'You can only work with the properties assigned to you',
    );
  }
}
