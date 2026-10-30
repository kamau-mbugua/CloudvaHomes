import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error.js';
import { parseCsv, toCsv } from '../../../common/http/csv.js';
import { toSkipTake } from '../../../common/http/pagination.js';
import { paginated } from '../../../common/http/response.js';
import type { Prisma, Tenant } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db, type Tx } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { normalizeEmail, normalizePhone } from '../../auth/identifiers.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { KRA_PIN } from '../../organizations/organizations.dto.js';
import { nextCode } from '../codes.js';
import { optionalEmail, optionalPhone, optionalText, requiredPhone, upper } from '../fields.js';
import { IdNumbers } from '../id-numbers.js';
import { tenantScope } from '../property-scope.js';
import { CURRENT } from '../units/units.service.js';
import type {
  CreateTenantDto,
  ImportTenantsCsvDto,
  ListTenantsQueryDto,
  TenantStatus,
  UpdateTenantDto,
} from './tenants.dto.js';

const INCLUDE = {
  tenancies: {
    select: {
      id: true,
      status: true,
      unit: { select: { id: true, number: true, property: { select: { name: true } } } },
    },
    orderBy: { startDate: 'desc' },
  },
} satisfies Prisma.TenantInclude;

type TenantRow = Prisma.TenantGetPayload<{ include: typeof INCLUDE }>;

const STATUS_FILTER: Record<TenantStatus, Prisma.TenantWhereInput> = {
  CURRENT: { tenancies: { some: { status: { in: [...CURRENT] } } } },
  PAST: { tenancies: { some: {}, none: { status: { in: [...CURRENT] } } } },
  PROSPECT: { tenancies: { none: {} } },
};

function snapshot(t: Tenant) {
  return {
    code: t.code,
    firstName: t.firstName,
    lastName: t.lastName,
    phone: t.phone,
    email: t.email,
    kraPin: t.kraPin,
    idNumberHint: t.idNumberHint,
    emergencyContactName: t.emergencyContactName,
    emergencyContactPhone: t.emergencyContactPhone,
    notes: t.notes,
  };
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly ids: IdNumbers,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Checks across the entire platform (unscoped) whether a User or Tenant with this
   * phone or email already exists before creating a new tenant record.
   */
  async personAlreadyExists(phone: string, email: string | null): Promise<boolean> {
    if (!this.prisma) return false;
    const orFilters: { phone?: string; email?: { equals: string; mode: 'insensitive' } }[] = [
      { phone },
    ];
    if (email) {
      orFilters.push({ email: { equals: email, mode: 'insensitive' } });
    }
    const [userCount, tenantCount] = await Promise.all([
      this.prisma.user.count({ where: { OR: orFilters } }),
      this.prisma.tenant.count({ where: { OR: orFilters } }),
    ]);
    return userCount > 0 || tenantCount > 0;
  }

  /** Owed per tenant: invoiced − credited − paid (negative = in credit). Void invoices skipped. */
  private async balances(ids: string[]): Promise<Map<string, bigint>> {
    if (!ids.length) return new Map();
    const [inv, paid] = await Promise.all([
      this.db.invoice.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: ids }, status: { not: 'VOID' } },
        _sum: { total: true, creditedAmount: true },
      }),
      this.db.payment.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: ids } },
        _sum: { amount: true },
      }),
    ]);
    const out = new Map<string, bigint>(ids.map((id) => [id, 0n]));
    for (const r of inv) {
      out.set(
        r.tenantId,
        (out.get(r.tenantId) ?? 0n) + (r._sum.total ?? 0n) - (r._sum.creditedAmount ?? 0n),
      );
    }
    for (const r of paid) out.set(r.tenantId, (out.get(r.tenantId) ?? 0n) - (r._sum.amount ?? 0n));
    return out;
  }

  private toTenant(t: TenantRow, balance = 0n) {
    const current = t.tenancies.filter((x) => (CURRENT as readonly string[]).includes(x.status));
    return {
      id: t.id,
      code: t.code,
      firstName: t.firstName,
      lastName: t.lastName,
      phone: t.phone,
      email: t.email,
      idNumberMasked: this.ids.masked(t.idNumberHint),
      kraPin: t.kraPin,
      emergencyContactName: t.emergencyContactName,
      emergencyContactPhone: t.emergencyContactPhone,
      notes: t.notes,
      balance,
      creditBalance: t.creditBalance,
      portal: { hasAccess: !!t.userId, invitedAt: t.portalInvitedAt },
      remindersOff: t.remindersOff,
      status: (current.length
        ? 'CURRENT'
        : t.tenancies.length
          ? 'PAST'
          : 'PROSPECT') as TenantStatus,
      currentUnits: current.map((x) => ({
        tenancyId: x.id,
        unitId: x.unit.id,
        unitNumber: x.unit.number,
        propertyName: x.unit.property.name,
      })),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async list(q: ListTenantsQueryDto) {
    const term = q.q?.trim();
    const where: Prisma.TenantWhereInput = {
      AND: [
        tenantScope(),
        q.status ? STATUS_FILTER[q.status] : {},
        q.propertyId ? { tenancies: { some: { unit: { propertyId: q.propertyId } } } } : {},
        term
          ? {
              OR: [
                { firstName: { contains: term, mode: 'insensitive' } },
                { lastName: { contains: term, mode: 'insensitive' } },
                { code: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term.replace(/\s/g, '') } },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.db.tenant.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        ...toSkipTake(q),
      }),
      this.db.tenant.count({ where }),
    ]);
    const balances = await this.balances(rows.map((r) => r.id));
    return paginated(
      rows.map((r) => this.toTenant(r, balances.get(r.id))),
      total,
      q,
    );
  }

  async get(id: string) {
    const t = await this.find(id);
    return this.toTenant(t, (await this.balances([id])).get(id));
  }

  async revealIdNumber(id: string) {
    const { orgId } = orgContext();
    const t = await this.find(id);
    await this.audit.record({ action: 'tenant.reveal_id', entity: 'tenant', entityId: id });
    return { idNumber: this.ids.reveal(t.idNumberEnc, orgId, 'tenant') };
  }

  async create(dto: CreateTenantDto) {
    const { orgId } = orgContext();
    const phone = requiredPhone('phone', dto.phone);
    const email = optionalEmail('email', dto.email) ?? null;
    const alreadyExisted = await this.personAlreadyExists(phone, email);
    const id = await this.write((tx) => this.createInTx(tx, dto));
    const created = await this.get(id);

    if (created.email && this.notifications) {
      try {
        const org = await this.db.organization.findUnique({
          where: { id: orgId },
          select: { name: true },
        });
        const orgName = org?.name ?? 'KodiHub';
        if (!alreadyExisted) {
          await this.notifications.sendTenantWelcome(
            { email: created.email, phone: created.phone },
            {
              firstName: created.firstName,
              lastName: created.lastName,
              organizationName: orgName,
              tenantCode: created.code,
            },
          );
        } else {
          await this.notifications.sendTenantAddedToOrg(
            { email: created.email, phone: created.phone },
            {
              firstName: created.firstName,
              lastName: created.lastName,
              organizationName: orgName,
              tenantCode: created.code,
            },
          );
        }
      } catch (err) {
        this.logger.warn({ err, tenantId: created.id }, 'Could not send tenant onboarding email');
      }
    }

    return created;
  }

  /**
   * Used during move-in (`POST /tenancies`) when inline `tenant` details are provided:
   * - If a tenant with this phone already exists in the organisation (e.g. occupying a
   *   second unit in the same property or another property), reuses that tenant record!
   * - Otherwise creates the tenant and reports whether they were a brand-new person on KodiHub.
   */
  async resolveOrCreateForMoveInInTx(
    tx: Tx,
    dto: CreateTenantDto,
  ): Promise<{ tenantId: string; wasBrandNewPerson: boolean }> {
    const phone = requiredPhone('phone', dto.phone);
    const email = optionalEmail('email', dto.email) ?? null;
    const existingInOrg = await tx.tenant.findFirst({
      where: { phone },
      select: {
        id: true,
        email: true,
        kraPin: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        notes: true,
      },
    });
    if (existingInOrg) {
      const patch: Prisma.TenantUpdateInput = {};
      if (!existingInOrg.email && email) patch.email = email;
      const kraPin = upper(dto.kraPin);
      if (!existingInOrg.kraPin && kraPin) patch.kraPin = kraPin;
      const emergencyContactName = optionalText(dto.emergencyContactName);
      if (!existingInOrg.emergencyContactName && emergencyContactName) {
        patch.emergencyContactName = emergencyContactName;
      }
      const emergencyContactPhone = optionalPhone(
        'emergencyContactPhone',
        dto.emergencyContactPhone,
      );
      if (!existingInOrg.emergencyContactPhone && emergencyContactPhone) {
        patch.emergencyContactPhone = emergencyContactPhone;
      }
      const notes = optionalText(dto.notes);
      if (!existingInOrg.notes && notes) patch.notes = notes;
      if (Object.keys(patch).length > 0) {
        const patched = await tx.tenant.update({
          where: { id: existingInOrg.id },
          data: patch,
        });
        await this.ensurePortalUserInTx(tx, patched);
      }
      return { tenantId: existingInOrg.id, wasBrandNewPerson: false };
    }
    const alreadyExisted = await this.personAlreadyExists(phone, email);
    const tenantId = await this.createInTx(tx, dto);
    return { tenantId, wasBrandNewPerson: !alreadyExisted };
  }

  /** Creates a tenant inside the caller's transaction (also used by move-in). Returns its id. */
  async createInTx(tx: Tx, dto: CreateTenantDto): Promise<string> {
    const { orgId } = orgContext();
    const phone = requiredPhone('phone', dto.phone);
    const idNumber = this.ids.normalize(dto.idNumber);
    await this.assertUnique(tx, phone, idNumber);
    const created = await tx.tenant.create({
      data: {
        orgId,
        code: await nextCode(tx, orgId, 'tenant', 'T', 5),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email: optionalEmail('email', dto.email) ?? null,
        kraPin: upper(dto.kraPin) ?? null,
        emergencyContactName: optionalText(dto.emergencyContactName) ?? null,
        emergencyContactPhone:
          optionalPhone('emergencyContactPhone', dto.emergencyContactPhone) ?? null,
        notes: optionalText(dto.notes) ?? null,
        ...this.ids.seal(idNumber, orgId, 'tenant'),
      },
    });
    await this.ensurePortalUserInTx(tx, created);
    await this.audit.record(
      { action: 'tenant.create', entity: 'tenant', entityId: created.id, after: snapshot(created) },
      tx,
    );
    return created.id;
  }

  /**
   * When a tenant has an email address, automatically provision or link their global `User`
   * record so they can immediately set/reset their password or sign in by email/phone code
   * using the link in their welcome email.
   */
  private async ensurePortalUserInTx(
    tx: Tx,
    t: {
      id: string;
      phone: string;
      email: string | null;
      firstName: string;
      lastName: string;
      userId?: string | null;
    },
  ): Promise<void> {
    if (!t.email) return;
    const email = t.email.trim().toLowerCase();
    const phone = t.phone;
    let user = await tx.user.findFirst({
      where: {
        OR: [{ phone }, { email: { equals: email, mode: 'insensitive' } }],
      },
    });
    if (!user) {
      user = await tx.user.create({
        data: {
          phone,
          email,
          firstName: t.firstName,
          lastName: t.lastName,
        },
      });
    } else if (!user.email) {
      const emailTaken = await tx.user.count({
        where: { email: { equals: email, mode: 'insensitive' }, id: { not: user.id } },
      });
      if (!emailTaken) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { email },
        });
      }
    }
    if (t.userId !== user.id) {
      await tx.tenant.update({
        where: { id: t.id },
        data: { userId: user.id, portalInvitedAt: new Date() },
      });
    }
  }

  async update(id: string, dto: UpdateTenantDto) {
    const { orgId } = orgContext();
    const before = await this.find(id);
    const phone = dto.phone !== undefined ? requiredPhone('phone', dto.phone) : undefined;
    const idNumber = dto.idNumber !== undefined ? this.ids.normalize(dto.idNumber) : undefined;
    await this.write(async (tx) => {
      await this.assertUnique(tx, phone, idNumber ?? null, id);
      const updated = await tx.tenant.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(dto.email !== undefined ? { email: optionalEmail('email', dto.email) } : {}),
          ...(dto.kraPin !== undefined ? { kraPin: upper(dto.kraPin) } : {}),
          ...(idNumber !== undefined ? this.ids.seal(idNumber, orgId, 'tenant') : {}),
          ...(dto.emergencyContactName !== undefined
            ? { emergencyContactName: optionalText(dto.emergencyContactName) }
            : {}),
          ...(dto.emergencyContactPhone !== undefined
            ? {
                emergencyContactPhone: optionalPhone(
                  'emergencyContactPhone',
                  dto.emergencyContactPhone,
                ),
              }
            : {}),
          ...(dto.notes !== undefined ? { notes: optionalText(dto.notes) } : {}),
          ...(dto.remindersOff !== undefined ? { remindersOff: dto.remindersOff } : {}),
        },
      });
      await this.ensurePortalUserInTx(tx, updated);
      await this.audit.record(
        {
          action: 'tenant.update',
          entity: 'tenant',
          entityId: id,
          before: snapshot(before),
          after: snapshot(updated),
        },
        tx,
      );
    });
    return this.get(id);
  }

  async remove(id: string) {
    const t = await this.find(id);
    if (t.tenancies.length) {
      throw AppError.conflict(
        'This tenant has tenancy history, which is kept for the records.',
        'TENANT_HAS_HISTORY',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.tenant.delete({ where: { id } });
      await this.audit.record(
        { action: 'tenant.delete', entity: 'tenant', entityId: id, before: snapshot(t) },
        tx,
      );
    });
  }

  importTemplate(): string {
    return toCsv(
      [
        'firstName',
        'lastName',
        'phone',
        'email',
        'idNumber',
        'kraPin',
        'emergencyContactName',
        'emergencyContactPhone',
        'notes',
      ],
      [
        [
          'Jane',
          'Wanjiku',
          '0712345678',
          'jane@example.com',
          '12345678',
          'A123456789Z',
          'John Kamau',
          '0722000111',
          'Preferred contact via SMS',
        ],
      ],
    );
  }

  async importCsv(dto: ImportTenantsCsvDto) {
    const { orgId } = orgContext();
    const dryRun = Boolean(dto.dryRun);
    const { rows } = parseCsv(dto.csv);
    if (rows.length === 0) {
      return {
        dryRun,
        created: 0,
        validCount: 0,
        totalRows: 0,
        rows: [],
        errors: [{ rowNumber: 1, field: 'csv', message: 'CSV has no data rows' }],
      };
    }
    if (rows.length > 500) {
      return {
        dryRun,
        created: 0,
        validCount: 0,
        totalRows: rows.length,
        rows: [],
        errors: [
          {
            rowNumber: 1,
            field: 'csv',
            message: 'At most 500 tenants can be imported at once',
          },
        ],
      };
    }

    const existingTenants = await this.db.tenant.findMany({
      select: { code: true, phone: true, idNumberIndex: true },
    });
    const phoneToCode = new Map(existingTenants.map((t) => [t.phone, t.code]));
    const idIndexToCode = new Map(
      existingTenants
        .filter((t): t is typeof t & { idNumberIndex: string } => Boolean(t.idNumberIndex))
        .map((t) => [t.idNumberIndex, t.code]),
    );

    const seenPhones = new Set<string>();
    const seenIdIndexes = new Set<string>();
    const errors: { rowNumber: number; field: string; message: string }[] = [];
    const validDtos: CreateTenantDto[] = [];
    const previewRows: {
      rowNumber: number;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      kraPin: string | null;
      valid: boolean;
    }[] = [];

    for (const r of rows) {
      const rowErrors: { rowNumber: number; field: string; message: string }[] = [];
      const firstName = (r.values.firstname || r.values.first || '').trim();
      const lastName = (r.values.lastname || r.values.last || r.values.surname || '').trim();

      if (!firstName || firstName.length > 80) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'firstName',
          message: 'firstName is required (1–80 characters)',
        });
      }
      if (!lastName || lastName.length > 80) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'lastName',
          message: 'lastName is required (1–80 characters)',
        });
      }

      const rawPhone = (r.values.phone || r.values.phonenumber || r.values.tel || '').trim();
      const phone = normalizePhone(rawPhone);
      if (!phone) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'phone',
          message: 'Enter a valid Kenyan phone number (e.g. 0712345678)',
        });
      } else if (seenPhones.has(phone)) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'phone',
          message: `Phone ${rawPhone} is listed more than once in this CSV`,
        });
      } else if (phoneToCode.has(phone)) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'phone',
          message: `Tenant ${phoneToCode.get(phone)} already uses phone ${rawPhone}`,
        });
      } else {
        seenPhones.add(phone);
      }

      const rawEmail = (r.values.email || '').trim();
      let email: string | undefined;
      if (rawEmail) {
        const normEmail = normalizeEmail(rawEmail);
        if (!normEmail) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'email',
            message: `Invalid email "${rawEmail}"`,
          });
        } else {
          email = normEmail;
        }
      }

      const rawId = (r.values.idnumber || r.values.nationalid || r.values.id || '').trim();
      let idNumber: string | undefined;
      if (rawId) {
        const normId = this.ids.normalize(rawId);
        if (!normId || normId.length > 30) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'idNumber',
            message: 'idNumber must be 4–30 characters',
          });
        } else {
          const idx = this.ids.index(normId, orgId, 'tenant');
          if (seenIdIndexes.has(idx)) {
            rowErrors.push({
              rowNumber: r.rowNumber,
              field: 'idNumber',
              message: 'This ID number is listed more than once in the CSV',
            });
          } else if (idIndexToCode.has(idx)) {
            rowErrors.push({
              rowNumber: r.rowNumber,
              field: 'idNumber',
              message: `Tenant ${idIndexToCode.get(idx)} already has this ID number`,
            });
          } else {
            seenIdIndexes.add(idx);
            idNumber = normId;
          }
        }
      }

      const rawKra = (r.values.krapin || r.values.kra || '').trim().toUpperCase();
      if (rawKra && !KRA_PIN.test(rawKra)) {
        rowErrors.push({
          rowNumber: r.rowNumber,
          field: 'kraPin',
          message: 'kraPin must look like A123456789Z',
        });
      }

      const rawEmPhone = (r.values.emergencycontactphone || r.values.emergencyphone || '').trim();
      let emergencyContactPhone: string | undefined;
      if (rawEmPhone) {
        const normEm = normalizePhone(rawEmPhone);
        if (!normEm) {
          rowErrors.push({
            rowNumber: r.rowNumber,
            field: 'emergencyContactPhone',
            message: 'Enter a valid emergency contact phone number',
          });
        } else {
          emergencyContactPhone = normEm;
        }
      }

      const emergencyContactName =
        (r.values.emergencycontactname || r.values.emergencyname || '').trim().slice(0, 120) ||
        undefined;
      const notes = (r.values.notes || '').trim().slice(0, 1000) || undefined;

      errors.push(...rowErrors);
      const valid = rowErrors.length === 0;
      previewRows.push({
        rowNumber: r.rowNumber,
        firstName,
        lastName,
        phone: phone ?? rawPhone,
        email: email ?? (rawEmail || null),
        kraPin: rawKra || null,
        valid,
      });

      if (valid && phone) {
        validDtos.push({
          firstName,
          lastName,
          phone,
          email,
          idNumber,
          kraPin: rawKra || undefined,
          emergencyContactName,
          emergencyContactPhone,
          notes,
        });
      }
    }

    if (dryRun || errors.length > 0) {
      return {
        dryRun,
        created: 0,
        validCount: validDtos.length,
        totalRows: rows.length,
        rows: previewRows,
        errors,
      };
    }

    const createdIds = await this.write(async (tx) => {
      const ids: string[] = [];
      for (const rowDto of validDtos) {
        ids.push(await this.createInTx(tx, rowDto));
      }
      return ids;
    });

    return {
      dryRun: false,
      created: createdIds.length,
      validCount: validDtos.length,
      totalRows: rows.length,
      rows: previewRows,
      errors: [],
    };
  }

  /** A tenant the caller may see, or 404. */
  async find(id: string): Promise<TenantRow> {
    const t = await this.db.tenant.findFirst({
      where: { AND: [{ id }, tenantScope()] },
      include: INCLUDE,
    });
    if (!t) throw AppError.notFound('Tenant');
    return t;
  }

  /**
   * Friendly 409s for the common case; the unique indexes (mapped in `write`) catch races.
   * Checks the whole organisation, not just the caller's properties: a phone belongs to one
   * tenant record per organisation.
   */
  private async assertUnique(
    tx: Tx,
    phone: string | undefined,
    idNumber: string | null,
    exceptId?: string,
  ) {
    const notMe = exceptId ? { id: { not: exceptId } } : {};
    if (phone) {
      const clash = await tx.tenant.findFirst({
        where: { phone, ...notMe },
        select: { code: true },
      });
      if (clash) throw phoneTaken(clash.code);
    }
    if (idNumber) {
      const index = this.ids.index(idNumber, orgContext().orgId, 'tenant');
      const clash = await tx.tenant.findFirst({
        where: { idNumberIndex: index, ...notMe },
        select: { code: true },
      });
      if (clash) throw idTaken(clash.code);
    }
  }

  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.db.$transaction(fn);
    } catch (e) {
      throw mapTenantConflict(e);
    }
  }
}

function phoneTaken(code?: string) {
  return AppError.conflict(
    code ? `Tenant ${code} already has this phone number` : 'Another tenant has this phone number',
    'PHONE_TAKEN',
  );
}

function idTaken(code?: string) {
  return AppError.conflict(
    code ? `Tenant ${code} already has this ID number` : 'Another tenant has this ID number',
    'ID_NUMBER_TAKEN',
  );
}

/** Unique-index violations on tenants → the matching 409; anything else is rethrown as is. */
export function mapTenantConflict(e: unknown): unknown {
  if (violatesUnique(e, 'phone')) return phoneTaken();
  if (violatesUnique(e, 'idNumberIndex')) return idTaken();
  return e;
}
