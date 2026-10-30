/**
 * Portfolio shapes from the phase 2 API contract (docs/plans/2026-10-27-phase-2-portfolio.md).
 * Money fields are integer minor units (KES cents); `…Date` fields are `YYYY-MM-DD` days.
 */

export type RecordStatus = 'ACTIVE' | 'INACTIVE';
export type LandlordKind = 'INDIVIDUAL' | 'COMPANY';
export type Occupancy = 'OCCUPIED' | 'NOTICE' | 'VACANT';
export type TenancyStatus = 'ACTIVE' | 'NOTICE' | 'ENDED';
export type TenantStatus = 'CURRENT' | 'PAST' | 'PROSPECT';

export interface Ref {
  id: string;
  name: string;
}

export interface CodedRef extends Ref {
  code: string;
}

export interface Landlord {
  id: string;
  code: string;
  name: string;
  kind: LandlordKind;
  phone: string;
  email: string | null;
  kraPin: string | null;
  /** "•••••678", or null when no ID number is on file. */
  idNumberMasked: string | null;
  status: RecordStatus;
  propertyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  code: string;
  name: string;
  location: string | null;
  county: string | null;
  floors: number | null;
  status: RecordStatus;
  /** Always set in an agency, always null in a landlord organisation. */
  landlord: CodedRef | null;
  unitCount: number;
  occupiedCount: number;
  noticeCount: number;
  vacantCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A unit type, category or feature — the three share one shape. */
export interface CatalogueItem {
  id: string;
  name: string;
  description: string | null;
  unitCount: number;
}

export interface TenantRef {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface Unit {
  id: string;
  number: string;
  floor: number | null;
  sizeSqft: number | null;
  rentAmount: number;
  description: string | null;
  status: RecordStatus;
  property: CodedRef;
  unitType: Ref | null;
  category: Ref | null;
  features: Ref[];
  occupancy: Occupancy;
  currentTenancy: {
    id: string;
    status: TenancyStatus;
    startDate: string;
    endDate: string | null;
    hasSignedLease?: boolean;
    tenant: TenantRef;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  idNumberMasked: string | null;
  kraPin: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  status: TenantStatus;
  currentUnits: { tenancyId: string; unitId: string; unitNumber: string; propertyName: string }[];
  /** Phase 4: what they owe now (negative = in credit), and their unused credit. Optional for older servers. */
  balance?: number | null;
  creditBalance?: number | null;
  /** Phase 7: tenant-portal access. Optional for older servers. */
  portal?: { hasAccess: boolean; invitedAt: string | null } | null;
  /** Phase 7: true when the tenant asked not to get automatic reminders. */
  remindersOff?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tenancy {
  id: string;
  status: TenancyStatus;
  rentAmount: number;
  billingDay: number;
  startDate: string;
  endDate: string | null;
  noticeGivenAt: string | null;
  depositHeld: number;
  moveOutReason: string | null;
  hasSignedLease?: boolean;
  tenant: TenantRef;
  unit: { id: string; number: string; property: CodedRef };
  createdAt: string;
  updatedAt: string;
}
