/**
 * Platform billing shapes from the phase 8 API contract
 * (docs/plans/2026-10-28-phase-8-platform-billing.md). Money is integer minor units (KES
 * cents); days are `YYYY-MM-DD`; periods `YYYY-MM`; timestamps ISO instants.
 *
 * Fields the contract does not spell out are optional here and read defensively.
 */

import type { InvoiceStatus } from '../billing/types';
import type { StkState } from '../mpesa/types';
import type { OrgKind, OrgStatus } from '../../lib/auth/types';

export type { OrgStatus };

export type PlatformPaymentMethod = 'MPESA' | 'BANK' | 'CHEQUE' | 'OTHER';
export type PlatformPaymentSource = 'STK' | 'C2B' | 'MANUAL';

/** The price an organisation pays: its override where set, else its plan's. */
export interface EffectivePrice {
  pricePerUnit: number;
  minimumMonthly: number;
  /** True when either figure is the organisation's own (an override). */
  custom: boolean;
}

export interface PlanRef {
  id?: string;
  name: string;
  pricePerUnit: number;
  minimumMonthly: number;
}

/** The plan as the admin's organisation endpoints name it: no prices (those are on the plan). */
export interface OrgPlanRef {
  id: string;
  name: string;
  pricePerUnit?: number;
  minimumMonthly?: number;
}

// ---------------------------------------------------------------- organisation side

/** `GET /billing`. */
export interface BillingSummary {
  status: OrgStatus;
  plan: PlanRef | null;
  price: EffectivePrice;
  trialEndsAt: string | null;
  noSuspendUntil: string | null;
  billingRef: string;
  /** What is owed on Hodi invoices now. */
  balance: number;
  /** Paid in advance, used by the next invoice. */
  credit: number;
  /** The oldest unpaid overdue amount and the due date it has been owed since. */
  overdue: { amount: number; since: string } | null;
  payTo: { paybill: string; accountRef: string } | null;
  canPayInApp: boolean;
}

export interface PlatformInvoice {
  id: string;
  number: string;
  period: string;
  occupiedUnits: number;
  rate: number;
  minimum: number;
  total: number;
  amountPaid: number;
  balance: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  overdue: boolean;
  voidReason?: string | null;
  orgId?: string;
  createdAt?: string;
  /** Which organisation it bills. */
  organization?: { id: string; name: string; billingRef?: string } | null;
}

export interface PlatformPayment {
  id: string;
  amount: number;
  method: PlatformPaymentMethod;
  /** Absent on the payments listed under an invoice. */
  source?: PlatformPaymentSource;
  reference: string;
  receivedAt: string;
  payerName?: string | null;
  note?: string | null;
  /** Not yet used by an invoice (held as credit). */
  unallocated?: number;
  organization?: { id: string; name: string; billingRef?: string } | null;
}

/** `GET /billing/invoices/:id`: the invoice plus what paid it. */
export interface PlatformInvoiceDetail extends PlatformInvoice {
  payments: PlatformPayment[];
}

/** `POST /billing/pay` (202) and `GET /billing/pay/:id`. Only `id` and `state` are fixed. */
export interface PlatformStk {
  id: string;
  state: StkState;
  amount: number;
  phone: string;
  accountRef?: string | null;
  resultDesc?: string | null;
  mpesaReceipt?: string | null;
  paymentId?: string | null;
  createdAt?: string;
  completedAt?: string | null;
}

// ---------------------------------------------------------------- platform admin

export interface PlatformStats {
  organizations: Record<OrgStatus, number>;
  occupiedUnits: number;
  /** The month `lastMonthBilled` is for, `YYYY-MM`. */
  lastMonth?: string;
  lastMonthBilled: number;
  outstanding: number;
  collectedThisMonth: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  pricePerUnit: number;
  minimumMonthly: number;
  trialDays: number;
  isDefault: boolean;
  active: boolean;
  organizationCount: number;
  createdAt?: string;
}

export interface PlatformOwner {
  id?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** A row of `GET /platform/organizations` and the body of `GET /platform/organizations/:id`. */
export interface PlatformOrganization {
  id: string;
  name: string;
  kind: OrgKind;
  phone?: string | null;
  email?: string | null;
  status: OrgStatus;
  billingRef: string;
  plan: OrgPlanRef | null;
  price: EffectivePrice;
  /** The organisation's own figures; null = the plan's. Derived from `price` if a server leaves them out. */
  priceOverride?: number | null;
  minimumOverride?: number | null;
  trialEndsAt: string | null;
  noSuspendUntil: string | null;
  balance: number;
  overdue?: { amount: number; since: string } | null;
  credit?: number;
  occupiedUnits: number;
  owner: PlatformOwner | null;
  onboardedById?: string | null;
  onboardedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt?: string;
}

export interface PlatformSettings {
  dueDays: number;
  suspendAfterDays: number;
  defaultPlanId: string | null;
  /** Hodi's paybill shortcode. */
  paybill: string | null;
  daraja: {
    configured: boolean;
    environment: 'SANDBOX' | 'PRODUCTION' | null;
    /** Whether the passkey (needed for payment prompts) is saved. */
    passkey?: boolean;
    callbackUrls: { stk: string; c2bConfirm: string; c2bValidate: string } | null;
  };
  requireAdminTwoFactor?: boolean;
  adminTwoFactorChannel?: 'EMAIL' | 'SMS';
  sms?: {
    configured: boolean;
    username: string | null;
    senderId: string | null;
    apiKeySet?: boolean;
    apiKey?: boolean;
    source?: 'database' | 'env' | 'log';
  };
  allowPublicSignup?: boolean;
  minAppVersionCode?: number;
  minAppVersionName?: string;
  appUpdateMessage?: string | null;
  appStoreUrl?: string | null;
  maintenanceMode?: boolean;
  maintenanceMessage?: string | null;
  invoiceInstructions?: string | null;
  receiptInstructions?: string | null;
  updatedAt?: string;
}

export interface PlatformOperator {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'INVITED';
  role: 'SUPERADMIN' | 'SALESPERSON';
  platformRole?: 'SUPERADMIN' | 'SALESPERSON';
  organizationsCount: number;
  activeOrganizationsCount?: number;
  organizationCount?: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UnassignedOrganization {
  id: string;
  name: string;
  billingRef: string;
  status: OrgStatus;
  createdAt: string;
}

export interface PlatformEmailSettings {
  configured?: boolean;
  source: 'database' | 'env' | 'log' | 'environment' | 'none';
  host: string | null;
  port: number;
  username: string | null;
  user?: string | null;
  passwordSet: boolean;
  encryption: 'tls' | 'ssl' | 'none';
  fromEmail: string | null;
  fromName: string | null;
  allowlist: string | null;
  updatedAt?: string;
}

export interface PlatformEmailLog {
  id: string;
  to: string;
  recipient?: string;
  subject: string;
  kind: string | null;
  template?: string | null;
  status: 'SENT' | 'FAILED';
  error: string | null;
  triggeredBy?: { id: string; firstName: string; lastName: string; email: string | null } | null;
  createdAt: string;
}

export interface PlatformEmailTemplateVariable {
  key: string;
  description: string;
  sample: string;
}

export interface PlatformEmailTemplate {
  key: string;
  name: string;
  category: string;
  description: string;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  customized: boolean;
  updatedAt: string | null;
  variables: PlatformEmailTemplateVariable[];
  samplePreview?: {
    subject: string;
    text: string;
    html: string;
  };
}

export interface RateLimitLock {
  key: string;
  count: number;
  windowStart: string;
  expiresAt: string;
}
