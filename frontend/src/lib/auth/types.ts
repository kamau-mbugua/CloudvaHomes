/**
 * Identity shapes from the phase 1 API contract (docs/plans/2026-10-27-phase-1-identity.md).
 */

export type PlatformRole = 'SUPERADMIN' | 'SALESPERSON';

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isPlatformAdmin: boolean;
  platformRole?: PlatformRole | null;
}

export interface AdminTwoFactorChallenge {
  requiresTwoFactor: true;
  challengeToken: string;
  expiresAt: string;
  channel: 'EMAIL' | 'SMS';
  destinationMasked: string;
}

export type OrgKind = 'LANDLORD' | 'AGENCY';

export interface OrganizationMembership {
  id: string;
  name: string;
  kind: OrgKind;
  roleName: string;
  isOwner: boolean;
}

/**
 * Where an organisation stands with its Hodi bill (phase 8). GRACE: overdue, nothing is
 * blocked yet. SUSPENDED: read-only for staff until paid (tenants can still pay rent).
 * CLOSED: closed by Hodi.
 */
export type OrgStatus = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'CLOSED';

export interface ActiveOrganization {
  id: string;
  name: string;
  kind: OrgKind;
  /** Phase 8, for the billing banner. Absent from older servers; read as ACTIVE. */
  status?: OrgStatus;
}

/**
 * A landlord profile the signed-in person owns (phase 6b): they can open the read-only
 * owner portal (`/owner`) for it. One person may be a landlord of several agencies, and
 * may also be staff somewhere.
 */
export interface OwnerOf {
  landlordId: string;
  name: string;
  organization: { id: string; name: string };
}

/**
 * A tenant record the signed-in person is linked to (phase 7): they can open the tenant
 * portal (`/tenant`) for it. One person may rent from several organisations, and may also
 * be staff or a landlord somewhere.
 */
export interface TenantOf {
  tenantId: string;
  name: string;
  organization: { id: string; name: string };
}

/** The session object as the API returns it (login, OTP verify, refresh, switch-org, …). */
export interface SessionPayload {
  accessToken?: string;
  accessTokenExpiresAt?: string;
  /** Only for `client: "mobile"`; the web never asks for it. */
  refreshToken?: string;
  user: SessionUser;
  organizations: OrganizationMembership[];
  activeOrganization: ActiveOrganization | null;
  permissions: string[];
  /** Phase 6b. Absent from older servers; read as none. */
  ownerOf?: OwnerOf[];
  /** Phase 7. Absent from older servers; read as none. */
  tenantOf?: TenantOf[];
}

/** What the app keeps in state: the session minus its credentials (those stay in the client). */
export interface Session {
  user: SessionUser;
  organizations: OrganizationMembership[];
  activeOrganization: ActiveOrganization | null;
  permissions: string[];
  ownerOf: OwnerOf[];
  tenantOf: TenantOf[];
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
}

// ---------------------------------------------------------------- settings resources

export type MemberStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE';

export interface Member {
  userId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: MemberStatus;
  role: { id: string; name: string };
  propertyIds: string[];
  lastLoginAt: string | null;
  invitedAt: string | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  systemKey: 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'CARETAKER' | null;
  permissions: string[];
  memberCount: number;
}

export interface PermissionGroup {
  group: string;
  label: string;
  permissions: { key: string; label: string }[];
}

export interface Organization {
  id: string;
  name: string;
  kind: OrgKind;
  phone: string | null;
  email: string | null;
  kraPin: string | null;
  status: string;
  settings: Record<string, unknown>;
  /** Days from issue to due date on new invoices, 0–60 (phase 3; default 7). */
  invoiceDueDays?: number;
  /** Organisation-level instructions printed on tenant invoice PDFs. */
  invoiceInstructions?: string | null;
  /** Organisation-level instructions printed on tenant payment receipt PDFs. */
  receiptInstructions?: string | null;
  /** Phase 7: SMS rent reminders. Absent from older servers; read as the defaults (off). */
  reminders?: ReminderSettings;
}

/** `Organization.reminders` (phase 7). */
export interface ReminderSettings {
  enabled: boolean;
  /** Days before the due date to remind, 0–14; 0 = no "due soon" reminder. */
  daysBefore: number;
  /** Days after the due date to remind, up to 5 values of 1–90. */
  overdueDays: number[];
}

export interface InvitationPreview {
  organizationName: string;
  inviterName: string | null;
  firstName: string | null;
  email: string | null;
  phone: string | null;
  hasPassword: boolean;
}

/**
 * The contract names the query (`entity, actorId, from, to`) but not the row; this follows
 * the AuditLog model in docs/specs §5.5, with an optional resolved `actor`.
 */
export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  actor?: { id: string; firstName?: string; lastName?: string; name?: string } | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}
