import { Prisma } from '../generated/prisma/client.js';
import { currentContext } from '../common/context/request-context.js';

/**
 * Models whose rows belong to one organisation. Add every new org-owned model here — the
 * cross-org e2e suite exists to catch the ones that are forgotten.
 */
export const ORG_SCOPED_MODELS = new Set<string>([
  'Membership',
  'Role',
  'Invitation',
  'AuditLog',
  'OrgCounter',
  'Landlord',
  'Property',
  'UnitType',
  'UnitCategory',
  'UnitFeature',
  'Unit',
  'Tenant',
  'Tenancy',
  'ChargeType',
  'MoveInCharge',
  'ChargeEntry',
  'Meter',
  'MeterReading',
  'Invoice',
  'InvoiceLine',
  'CreditNote',
  'PaymentChannel',
  'Payment',
  'PaymentAllocation',
  'DepositTransaction',
  'InboundTransaction',
  'StkRequest',
  'Upload',
  'RecurringExpense',
  'Expense',
  'ManagementAgreement',
  'LandlordLedgerEntry',
  'Remittance',
  'Message',
  'StatementImport',
  'PayoutAccount',
  'Payout',
]);

const WHERE_AND = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);
// Operations taking a unique `where`; Prisma accepts extra non-unique filters alongside it.
const WHERE_UNIQUE = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);

export class OrgScopeViolation extends Error {
  constructor(model: string, given: unknown, active: string) {
    super(`Refusing to write ${model} for organisation ${String(given)} while acting in ${active}`);
    this.name = 'OrgScopeViolation';
  }
}

function stampOrg(model: string, data: Record<string, unknown>, orgId: string) {
  if (data.orgId !== undefined && data.orgId !== orgId) {
    throw new OrgScopeViolation(model, data.orgId, orgId);
  }
  return { ...data, orgId };
}

/**
 * When the request has an active organisation, every query on an org-scoped model is limited
 * to it: reads and bulk writes get `AND orgId = …`, unique lookups get `orgId` added to the
 * unique filter (so another org's id behaves exactly like a missing one — 404, never 403), and
 * creates are stamped with it. Nested relation writes are not rewritten; create org-owned
 * children with top-level calls.
 *
 * With no active organisation (sign-in, platform admin, scripts) nothing is added — those code
 * paths must filter explicitly.
 */
export const orgScopeExtension = Prisma.defineExtension({
  name: 'org-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const orgId = currentContext()?.orgId;
        if (!orgId || !ORG_SCOPED_MODELS.has(model)) return query(args);

        const a = { ...(args as Record<string, unknown>) };
        if (WHERE_AND.has(operation)) {
          a.where = a.where ? { AND: [a.where, { orgId }] } : { orgId };
        } else if (WHERE_UNIQUE.has(operation)) {
          a.where = { ...(a.where as object), orgId };
        }
        if (operation === 'create') {
          a.data = stampOrg(model, a.data as Record<string, unknown>, orgId);
        } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
          const rows = Array.isArray(a.data) ? a.data : [a.data];
          a.data = rows.map((r) => stampOrg(model, r as Record<string, unknown>, orgId));
        } else if (operation === 'upsert') {
          a.create = stampOrg(model, a.create as Record<string, unknown>, orgId);
        }
        return query(a as typeof args);
      },
    },
  },
});
