import { Inject, Injectable } from '@nestjs/common';
import { currentContext, withoutOrgScope } from '../../common/context/request-context.js';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { formatDateOnlyOrNull, parseDateOnly } from '../../common/dates/date-only.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Organization, Plan, Prisma, User } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/crypto.js';
import { authContext } from '../auth/decorators.js';
import { normalizeEmail, normalizePhone, passwordProblem } from '../auth/identifiers.js';
import { todayInNairobi } from '../billing/billing-math.js';
import {
  DEFAULT_EMAIL_TEMPLATES,
  type EmailTemplateKey,
  interpolateTemplate,
  isEmailTemplateKey,
  parseStoredEmailTemplates,
  renderBrandedEmailHtml,
  type ResolvedEmailTemplate,
  resolveAllEmailTemplates,
  resolveEmailTemplate,
} from '../notifications/email-templates.js';
import { NotificationsService, SMTP_PASS_CONTEXT } from '../notifications/notifications.service.js';
import { PlatformBillingService } from './platform-billing.service.js';
import type {
  AssignOrganizationsDto,
  CreateOperatorDto,
  CreatePlanDto,
  ListEmailLogsQueryDto,
  ListOrgsQueryDto,
  SendBroadcastEmailDto,
  SendTestEmailTemplateDto,
  UpdateEmailSettingsDto,
  UpdateEmailTemplateDto,
  UpdateOperatorDto,
  UpdateOrgBillingDto,
  UpdatePlanDto,
} from './platform.dto.js';

/** Plans, organisations, operators, email and security managed by platform admins. */
@Injectable()
export class PlatformAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly cipher: FieldCipher,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly billing: PlatformBillingService,
  ) {}

  // ── Plans ──

  private async toPlan(p: Plan) {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      pricePerUnit: p.pricePerUnit,
      minimumMonthly: p.minimumMonthly,
      trialDays: p.trialDays,
      isDefault: p.isDefault,
      active: p.active,
      organizationCount: await this.db.organization.count({ where: { planId: p.id } }),
      createdAt: p.createdAt,
    };
  }

  async plans() {
    const rows = await this.db.plan.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return Promise.all(rows.map((p) => this.toPlan(p)));
  }

  createPlan(dto: CreatePlanDto) {
    return withoutOrgScope(() =>
      this.savePlan(null, {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        pricePerUnit: BigInt(dto.pricePerUnit),
        minimumMonthly: BigInt(dto.minimumMonthly ?? 0),
        trialDays: dto.trialDays ?? 30,
        isDefault: dto.isDefault ?? false,
      }),
    );
  }

  updatePlan(id: string, dto: UpdatePlanDto) {
    return withoutOrgScope(async () => {
      const plan = await this.db.plan.findUnique({ where: { id } });
      if (!plan) throw AppError.notFound('Plan');
      if (dto.active === false && (dto.isDefault ?? plan.isDefault)) {
        throw AppError.fieldInvalid(
          'active',
          'Choose another default plan before switching this one off',
        );
      }
      return this.savePlan(id, {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.pricePerUnit !== undefined ? { pricePerUnit: BigInt(dto.pricePerUnit) } : {}),
        ...(dto.minimumMonthly !== undefined ? { minimumMonthly: BigInt(dto.minimumMonthly) } : {}),
        ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      });
    });
  }

  private async savePlan(
    id: string | null,
    data: Prisma.PlanUncheckedCreateInput | Prisma.PlanUncheckedUpdateInput,
  ) {
    try {
      const plan = await this.db.$transaction(async (tx) => {
        // One default at a time; it is also the one new organisations get.
        if (data.isDefault === true) {
          await tx.plan.updateMany({
            where: { isDefault: true, ...(id ? { id: { not: id } } : {}) },
            data: { isDefault: false },
          });
        }
        const before = id ? await tx.plan.findUniqueOrThrow({ where: { id } }) : null;
        const row = id
          ? await tx.plan.update({ where: { id }, data: data as Prisma.PlanUncheckedUpdateInput })
          : await tx.plan.create({ data: data as Prisma.PlanUncheckedCreateInput });
        if (data.isDefault === true) {
          await tx.platformSettings.upsert({
            where: { id: 1 },
            create: { id: 1, defaultPlanId: row.id },
            update: { defaultPlanId: row.id },
          });
        } else if (before?.isDefault && data.isDefault === false) {
          await tx.platformSettings.updateMany({
            where: { id: 1, defaultPlanId: row.id },
            data: { defaultPlanId: null },
          });
        }
        await this.audit.record(
          {
            action: id ? 'plan.update' : 'plan.create',
            entity: 'plan',
            entityId: row.id,
            orgId: null,
            before: before ?? undefined,
            after: row,
          },
          tx,
        );
        return row;
      });
      return this.toPlan(plan);
    } catch (e) {
      if (violatesUnique(e, 'name'))
        throw AppError.fieldInvalid('name', 'A plan with this name exists');
      throw e;
    }
  }

  deletePlan(id: string) {
    return withoutOrgScope(async () => {
      const plan = await this.db.plan.findUnique({ where: { id } });
      if (!plan) throw AppError.notFound('Plan');
      const settings = await this.billing.settings();
      if (
        (await this.db.organization.count({ where: { planId: id } })) ||
        plan.isDefault ||
        settings.defaultPlanId === id
      ) {
        throw AppError.conflict(
          'Organisations use this plan. Switch it off instead.',
          'PLAN_IN_USE',
        );
      }
      await this.db.$transaction(async (tx) => {
        await tx.plan.delete({ where: { id } });
        await this.audit.record(
          { action: 'plan.delete', entity: 'plan', entityId: id, orgId: null, before: plan },
          tx,
        );
      });
    });
  }

  // ── Organisations ──

  private async toOrg(o: Organization, plans: Map<string, Plan>) {
    const plan = o.planId ? (plans.get(o.planId) ?? null) : null;
    const today = parseDateOnly(todayInNairobi());
    const [owner, onboardedBy, balance, occupiedUnits] = await Promise.all([
      this.db.membership.findFirst({
        where: { orgId: o.id, role: { systemKey: 'OWNER' } },
        orderBy: { createdAt: 'asc' },
        select: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      }),
      o.onboardedById
        ? this.db.user.findUnique({
            where: { id: o.onboardedById },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          })
        : Promise.resolve(null),
      this.billing.balance(o.id),
      this.billing.occupiedUnits(this.db, o.id, today),
    ]);
    return {
      id: o.id,
      name: o.name,
      kind: o.kind,
      phone: o.phone,
      email: o.email,
      status: o.status,
      billingRef: o.billingRef,
      plan: plan ? { id: plan.id, name: plan.name } : null,
      price: this.billing.price(o, plan),
      priceOverride: o.priceOverride,
      minimumOverride: o.minimumOverride,
      trialEndsAt: formatDateOnlyOrNull(o.trialEndsAt),
      noSuspendUntil: formatDateOnlyOrNull(o.noSuspendUntil),
      balance: balance.balance,
      overdue: balance.overdue,
      credit: o.platformCredit,
      occupiedUnits,
      owner: owner?.user ?? null,
      onboardedById: o.onboardedById,
      onboardedBy,
      createdAt: o.createdAt,
    };
  }

  private async planMap() {
    return new Map((await this.db.plan.findMany()).map((p) => [p.id, p]));
  }

  organizations(q: ListOrgsQueryDto) {
    const ctx = currentContext();
    const salespersonFilter =
      ctx?.platformRole === 'SALESPERSON' && ctx.userId ? { onboardedById: ctx.userId } : {};
    return withoutOrgScope(async () => {
      const term = q.q?.trim();
      const where: Prisma.OrganizationWhereInput = {
        ...salespersonFilter,
        ...(q.status ? { status: q.status } : {}),
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { billingRef: { contains: term.toUpperCase() } },
              ],
            }
          : {}),
      };
      const [rows, total, plans] = await Promise.all([
        this.db.organization.findMany({ where, orderBy: { name: 'asc' }, ...toSkipTake(q) }),
        this.db.organization.count({ where }),
        this.planMap(),
      ]);
      return paginated(await Promise.all(rows.map((o) => this.toOrg(o, plans))), total, q);
    });
  }

  organization(id: string) {
    const ctx = currentContext();
    const salespersonId = ctx?.platformRole === 'SALESPERSON' ? ctx.userId : null;
    return withoutOrgScope(async () => {
      const o = await this.db.organization.findUnique({ where: { id } });
      if (!o || (salespersonId && o.onboardedById !== salespersonId)) {
        throw AppError.notFound('Organisation');
      }
      return this.toOrg(o, await this.planMap());
    });
  }

  updateOrganization(id: string, dto: UpdateOrgBillingDto) {
    return withoutOrgScope(async () => {
      const before = await this.db.organization.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('Organisation');
      if (dto.planId) {
        const plan = await this.db.plan.findUnique({ where: { id: dto.planId } });
        if (!plan?.active) throw AppError.fieldInvalid('planId', 'Choose an active plan');
      }
      if (dto.onboardedById) {
        const op = await this.db.user.findUnique({ where: { id: dto.onboardedById } });
        if (!op || (!op.isPlatformAdmin && !op.platformRole)) {
          throw AppError.fieldInvalid('onboardedById', 'Choose a valid platform operator');
        }
      }
      const date = (v: string | null) => (v === null ? null : parseDateOnly(v));
      const data: Prisma.OrganizationUncheckedUpdateInput = {
        ...(dto.planId !== undefined ? { planId: dto.planId } : {}),
        ...(dto.priceOverride !== undefined
          ? { priceOverride: dto.priceOverride === null ? null : BigInt(dto.priceOverride) }
          : {}),
        ...(dto.minimumOverride !== undefined
          ? { minimumOverride: dto.minimumOverride === null ? null : BigInt(dto.minimumOverride) }
          : {}),
        ...(dto.trialEndsAt !== undefined ? { trialEndsAt: date(dto.trialEndsAt) } : {}),
        ...(dto.noSuspendUntil !== undefined ? { noSuspendUntil: date(dto.noSuspendUntil) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.onboardedById !== undefined ? { onboardedById: dto.onboardedById } : {}),
      };
      const terms = (o: Organization) => ({
        planId: o.planId,
        priceOverride: o.priceOverride,
        minimumOverride: o.minimumOverride,
        trialEndsAt: formatDateOnlyOrNull(o.trialEndsAt),
        noSuspendUntil: formatDateOnlyOrNull(o.noSuspendUntil),
        status: o.status,
        onboardedById: o.onboardedById,
      });
      await this.db.$transaction(async (tx) => {
        const after = await tx.organization.update({ where: { id }, data });
        await this.audit.record(
          {
            action: 'organization.billing_update',
            entity: 'organization',
            entityId: id,
            orgId: id,
            before: terms(before),
            after: terms(after),
          },
          tx,
        );
      });
      // Reopening, a new trial end or a no-suspension date can change the status at once.
      if (dto.status !== 'CLOSED') await this.billing.refreshStatus(id);
      return this.organization(id);
    });
  }

  // ── Platform Operators (Superadmins & Salespeople) ──

  private async toOperator(u: User) {
    const role = u.platformRole ?? (u.isPlatformAdmin ? 'SUPERADMIN' : 'SALESPERSON');
    const [organizationsCount, activeOrganizationsCount] = await Promise.all([
      this.db.organization.count({ where: { onboardedById: u.id } }),
      this.db.organization.count({
        where: { onboardedById: u.id, status: { in: ['TRIAL', 'ACTIVE', 'GRACE'] } },
      }),
    ]);
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      status: u.status,
      role,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      organizationsCount,
      activeOrganizationsCount,
    };
  }

  operators() {
    return withoutOrgScope(async () => {
      const [users, unassignedOrganizationsCount] = await Promise.all([
        this.db.user.findMany({
          where: { OR: [{ isPlatformAdmin: true }, { platformRole: { not: null } }] },
          orderBy: [{ createdAt: 'asc' }],
        }),
        this.db.organization.count({ where: { onboardedById: null } }),
      ]);
      return {
        operators: await Promise.all(users.map((u) => this.toOperator(u))),
        unassignedOrganizationsCount,
      };
    });
  }

  createOperator(dto: CreateOperatorDto) {
    return withoutOrgScope(async () => {
      const email = dto.email ? normalizeEmail(dto.email) : null;
      const phone = dto.phone ? normalizePhone(dto.phone) : null;
      if (dto.email && !email) {
        throw AppError.fieldInvalid('email', 'Enter a valid email address');
      }
      if (dto.phone && !phone) {
        throw AppError.fieldInvalid('phone', 'Enter a valid phone number, e.g. 0712 345 678');
      }
      if (!email && !phone) {
        throw AppError.fieldInvalid('email', 'Enter an email address or a phone number');
      }
      if (dto.password) {
        const problem = passwordProblem(dto.password, [email, phone]);
        if (problem) throw AppError.fieldInvalid('password', problem);
      }

      const passwordHash = dto.password ? await hashPassword(dto.password) : undefined;
      const existingByEmail = email ? await this.db.user.findUnique({ where: { email } }) : null;
      const existingByPhone = phone ? await this.db.user.findUnique({ where: { phone } }) : null;
      if (existingByEmail && existingByPhone && existingByEmail.id !== existingByPhone.id) {
        throw AppError.conflict(
          'That email and phone belong to two different accounts',
          'CONFLICT',
        );
      }
      const existing = existingByEmail ?? existingByPhone;

      const user = await this.db.$transaction(async (tx) => {
        const row = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: {
                firstName: dto.firstName.trim(),
                lastName: dto.lastName.trim(),
                ...(email && !existing.email ? { email } : {}),
                ...(phone && !existing.phone ? { phone } : {}),
                ...(passwordHash ? { passwordHash } : {}),
                platformRole: dto.role,
                isPlatformAdmin: dto.role === 'SUPERADMIN',
                status: 'ACTIVE',
              },
            })
          : await tx.user.create({
              data: {
                firstName: dto.firstName.trim(),
                lastName: dto.lastName.trim(),
                email,
                phone,
                passwordHash: passwordHash ?? null,
                platformRole: dto.role,
                isPlatformAdmin: dto.role === 'SUPERADMIN',
                status: 'ACTIVE',
              },
            });
        await this.audit.record(
          {
            action: existing ? 'platform.operator_promote' : 'platform.operator_create',
            entity: 'user',
            entityId: row.id,
            orgId: null,
            after: {
              email: row.email,
              phone: row.phone,
              role: dto.role,
            },
          },
          tx,
        );
        return row;
      });
      return this.toOperator(user);
    });
  }

  updateOperator(id: string, dto: UpdateOperatorDto) {
    const ctx = authContext();
    return withoutOrgScope(async () => {
      const before = await this.db.user.findUnique({ where: { id } });
      if (!before || (!before.isPlatformAdmin && !before.platformRole)) {
        throw AppError.notFound('Operator');
      }
      if (
        id === ctx.userId &&
        ((dto.role !== undefined && dto.role !== 'SUPERADMIN') || dto.status === 'DISABLED')
      ) {
        throw AppError.conflict(
          'You cannot remove or disable your own superadmin access',
          'CANNOT_DEMOTE_SELF',
        );
      }
      const wasSuperadmin =
        (before.platformRole ?? (before.isPlatformAdmin ? 'SUPERADMIN' : null)) === 'SUPERADMIN';
      const nextRole =
        dto.role !== undefined
          ? dto.role
          : (before.platformRole ?? (before.isPlatformAdmin ? 'SUPERADMIN' : null));
      const nextStatus = dto.status ?? before.status;
      if (wasSuperadmin && (nextRole !== 'SUPERADMIN' || nextStatus !== 'ACTIVE')) {
        const remaining = await this.db.user.count({
          where: {
            id: { not: id },
            status: 'ACTIVE',
            OR: [{ platformRole: 'SUPERADMIN' }, { platformRole: null, isPlatformAdmin: true }],
          },
        });
        if (remaining === 0) {
          throw AppError.conflict('At least one active superadmin is required', 'LAST_SUPERADMIN');
        }
      }

      const after = await this.db.$transaction(async (tx) => {
        const row = await tx.user.update({
          where: { id },
          data: {
            ...(dto.role !== undefined
              ? { platformRole: dto.role, isPlatformAdmin: dto.role === 'SUPERADMIN' }
              : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
          },
        });
        await this.audit.record(
          {
            action: 'platform.operator_update',
            entity: 'user',
            entityId: id,
            orgId: null,
            before: {
              role: before.platformRole ?? (before.isPlatformAdmin ? 'SUPERADMIN' : null),
              status: before.status,
            },
            after: {
              role: row.platformRole,
              status: row.status,
            },
          },
          tx,
        );
        return row;
      });
      return this.toOperator(after);
    });
  }

  unassignedOrganizations() {
    return withoutOrgScope(async () => {
      const rows = await this.db.organization.findMany({
        where: { onboardedById: null },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
          billingRef: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      });
      return rows;
    });
  }

  assignOrganizations(operatorId: string, dto: AssignOrganizationsDto) {
    return withoutOrgScope(async () => {
      const op = await this.db.user.findUnique({ where: { id: operatorId } });
      if (!op || (!op.isPlatformAdmin && !op.platformRole)) {
        throw AppError.notFound('Operator');
      }
      const { count } = await this.db.$transaction(async (tx) => {
        const res = await tx.organization.updateMany({
          where: { id: { in: dto.organizationIds } },
          data: { onboardedById: operatorId },
        });
        await this.audit.record(
          {
            action: 'platform.organizations_assign',
            entity: 'user',
            entityId: operatorId,
            orgId: null,
            after: { organizationIds: dto.organizationIds, count: res.count },
          },
          tx,
        );
        return res;
      });
      return { assigned: count };
    });
  }

  // ── Email SMTP, Broadcast & Logs ──

  async getEmailSettings() {
    const s = await this.billing.settings();
    const dbConfigured = Boolean(s.smtpHost);
    const rawFrom = s.smtpFromEmail ?? this.env.EMAIL_FROM ?? null;
    const match = rawFrom
      ? /^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/.exec(rawFrom.trim())
      : null;
    const parsedEmail = match ? match[2]!.trim() : rawFrom;
    const parsedName = match?.[1]?.trim() || null;
    return {
      host:
        s.smtpHost ?? (this.env.EMAIL_PROVIDER === 'smtp' ? (this.env.SMTP_HOST ?? null) : null),
      port: s.smtpPort ?? (this.env.EMAIL_PROVIDER === 'smtp' ? (this.env.SMTP_PORT ?? 587) : 587),
      username:
        s.smtpUser ?? (this.env.EMAIL_PROVIDER === 'smtp' ? (this.env.SMTP_USER ?? null) : null),
      encryption: (s.smtpEncryption ?? 'tls') as 'tls' | 'ssl' | 'none',
      passwordSet: Boolean(s.smtpPassEnc),
      fromEmail: parsedEmail,
      fromName: s.smtpFromName ?? parsedName ?? 'KodiHub',
      allowlist: s.smtpAllowlist ?? '',
      source: dbConfigured
        ? ('database' as const)
        : this.env.EMAIL_PROVIDER === 'smtp'
          ? ('env' as const)
          : ('log' as const),
      updatedAt: s.updatedAt,
    };
  }

  updateEmailSettings(dto: UpdateEmailSettingsDto) {
    return withoutOrgScope(async () => {
      const before = await this.getEmailSettings();
      const data: Prisma.PlatformSettingsUpdateInput = {
        ...(dto.host !== undefined ? { smtpHost: dto.host?.trim() || null } : {}),
        ...(dto.port !== undefined ? { smtpPort: dto.port } : {}),
        ...(dto.username !== undefined ? { smtpUser: dto.username?.trim() || null } : {}),
        ...(dto.encryption !== undefined ? { smtpEncryption: dto.encryption } : {}),
        ...(dto.fromEmail !== undefined ? { smtpFromEmail: dto.fromEmail?.trim() || null } : {}),
        ...(dto.fromName !== undefined ? { smtpFromName: dto.fromName?.trim() || null } : {}),
        ...(dto.allowlist !== undefined ? { smtpAllowlist: dto.allowlist?.trim() || null } : {}),
      };
      if (dto.clearPassword) {
        data.smtpPassEnc = null;
      } else if (dto.password?.trim()) {
        data.smtpPassEnc = this.cipher.encrypt(dto.password.trim(), SMTP_PASS_CONTEXT);
      }
      await this.db.$transaction(async (tx) => {
        await tx.platformSettings.upsert({
          where: { id: 1 },
          create: { id: 1, ...(data as Prisma.PlatformSettingsCreateInput) },
          update: data,
        });
        await this.audit.record(
          {
            action: 'platform.email_settings_update',
            entity: 'platform_settings',
            entityId: '1',
            orgId: null,
            before,
            after: {
              host: dto.host ?? before.host,
              port: dto.port ?? before.port,
              username: dto.username ?? before.username,
              encryption: dto.encryption ?? before.encryption,
              fromEmail: dto.fromEmail ?? before.fromEmail,
              fromName: dto.fromName ?? before.fromName,
              passwordChanged: Boolean(dto.password?.trim() || dto.clearPassword),
            },
          },
          tx,
        );
      });
      return this.getEmailSettings();
    });
  }

  async sendTestEmail(to: string) {
    const email = normalizeEmail(to);
    if (!email) throw AppError.fieldInvalid('to', 'Enter a valid email address');
    try {
      await this.notifications.sendRawEmail({
        to: email,
        subject: 'KodiHub test email',
        text: `This is a test email from KodiHub platform administration.\n\nSent at: ${new Date().toISOString()}`,
        kind: 'test',
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      const reason = e instanceof Error ? e.message : String(e);
      throw new AppError(422, 'SMTP_DELIVERY_FAILED', `Could not send test email: ${reason}`);
    }
    return { sent: true, to: email };
  }

  sendBroadcastEmail(dto: SendBroadcastEmailDto) {
    return withoutOrgScope(async () => {
      const owners = await this.db.membership.findMany({
        where: {
          status: 'ACTIVE',
          role: { systemKey: 'OWNER' },
          organization: { status: { in: ['TRIAL', 'ACTIVE', 'GRACE'] } },
          user: { status: 'ACTIVE', email: { not: null } },
        },
        select: { user: { select: { email: true } } },
      });
      const recipients = [
        ...new Set(owners.map((m) => m.user.email).filter((e): e is string => Boolean(e))),
      ];
      let sent = 0;
      let failed = 0;
      for (const to of recipients) {
        try {
          await this.notifications.sendRawEmail({
            to,
            subject: dto.subject.trim(),
            text: dto.body.trim(),
            kind: 'broadcast',
          });
          sent++;
        } catch {
          failed++;
        }
      }
      await this.audit.record({
        action: 'platform.email_broadcast',
        entity: 'platform_email_log',
        entityId: null,
        orgId: null,
        after: { subject: dto.subject.trim(), total: recipients.length, sent, failed },
      });
      return { total: recipients.length, sent, failed };
    });
  }

  private withSamplePreview(tpl: ResolvedEmailTemplate, brandName?: string | null) {
    const sampleVars = Object.fromEntries(tpl.variables.map((v) => [v.key, v.sample]));
    const subject = interpolateTemplate(tpl.subject, sampleVars).trim();
    const text = interpolateTemplate(tpl.body, sampleVars).trimEnd();
    const html = renderBrandedEmailHtml({
      subject,
      text,
      brandName: brandName || 'KodiHub',
    });
    return {
      ...tpl,
      samplePreview: { subject, text, html },
    };
  }

  getEmailTemplates() {
    return withoutOrgScope(async () => {
      const settings = await this.db.platformSettings.findUnique({ where: { id: 1 } });
      return resolveAllEmailTemplates(settings?.emailTemplates).map((tpl) =>
        this.withSamplePreview(tpl, settings?.smtpFromName),
      );
    });
  }

  updateEmailTemplate(rawKey: string, dto: UpdateEmailTemplateDto) {
    if (!isEmailTemplateKey(rawKey)) {
      throw AppError.notFound('Email template');
    }
    const key: EmailTemplateKey = rawKey;
    return withoutOrgScope(async () => {
      const settings = await this.db.platformSettings.findUnique({ where: { id: 1 } });
      const stored = parseStoredEmailTemplates(settings?.emailTemplates);
      const before = resolveEmailTemplate(key, stored);
      const def = DEFAULT_EMAIL_TEMPLATES[key];

      if (dto.reset) {
        delete stored[key];
      } else {
        const nextSubject = dto.subject?.trim() ?? before.subject;
        const nextBody = dto.body?.trim() ?? before.body;
        if (nextSubject === def.defaultSubject && nextBody === def.defaultBody) {
          delete stored[key];
        } else {
          stored[key] = {
            subject: nextSubject,
            body: nextBody,
            updatedAt: new Date().toISOString(),
          };
        }
      }

      const existingRaw =
        settings?.emailTemplates &&
        typeof settings.emailTemplates === 'object' &&
        !Array.isArray(settings.emailTemplates)
          ? (settings.emailTemplates as Record<string, unknown>)
          : {};
      const jsonPayload = {
        ...existingRaw,
        ...stored,
      } as unknown as Prisma.InputJsonValue;
      if (dto.reset && !(key in stored)) {
        delete (jsonPayload as Record<string, unknown>)[key];
      }
      await this.db.$transaction(async (tx) => {
        await tx.platformSettings.upsert({
          where: { id: 1 },
          create: { id: 1, emailTemplates: jsonPayload },
          update: { emailTemplates: jsonPayload },
        });
        const after = resolveEmailTemplate(key, stored);
        await this.audit.record(
          {
            action: dto.reset ? 'platform.email_template_reset' : 'platform.email_template_update',
            entity: 'email_template',
            entityId: key,
            orgId: null,
            before: { subject: before.subject, body: before.body, customized: before.customized },
            after: { subject: after.subject, body: after.body, customized: after.customized },
          },
          tx,
        );
      });

      const resolved = resolveEmailTemplate(key, stored);
      return this.withSamplePreview(resolved, settings?.smtpFromName);
    });
  }

  async sendTestEmailTemplate(rawKey: string, dto: SendTestEmailTemplateDto) {
    if (!isEmailTemplateKey(rawKey)) {
      throw AppError.notFound('Email template');
    }
    const email = normalizeEmail(dto.to);
    if (!email) throw AppError.fieldInvalid('to', 'Enter a valid email address');

    const settings = await withoutOrgScope(() =>
      this.db.platformSettings.findUnique({ where: { id: 1 } }),
    );
    const resolved = resolveEmailTemplate(rawKey, settings?.emailTemplates);
    const sampleVars = Object.fromEntries(resolved.variables.map((v) => [v.key, v.sample]));
    const rawSubject = dto.subject?.trim() || resolved.subject;
    const rawBody = dto.body?.trim() || resolved.body;
    const subject = `[Test] ${interpolateTemplate(rawSubject, sampleVars).trim()}`;
    const text = interpolateTemplate(rawBody, sampleVars).trimEnd();

    try {
      await this.notifications.sendRawEmail({
        to: email,
        subject,
        text,
        kind: `template_test:${rawKey}`,
      });
    } catch (e) {
      if (e instanceof AppError) throw e;
      const reason = e instanceof Error ? e.message : String(e);
      throw new AppError(422, 'SMTP_DELIVERY_FAILED', `Could not send test email: ${reason}`);
    }
    return { sent: true, to: email, templateKey: rawKey, subject };
  }

  emailLogs(q: ListEmailLogsQueryDto) {
    return withoutOrgScope(async () => {
      const term = q.q?.trim();
      const where: Prisma.PlatformEmailLogWhereInput = {
        ...(q.status ? { status: q.status } : {}),
        ...(term
          ? {
              OR: [
                { to: { contains: term, mode: 'insensitive' } },
                { subject: { contains: term, mode: 'insensitive' } },
                { kind: { contains: term, mode: 'insensitive' } },
                { error: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        this.db.platformEmailLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          ...toSkipTake(q),
        }),
        this.db.platformEmailLog.count({ where }),
      ]);
      const actorIds = [
        ...new Set(rows.map((r) => r.triggeredById).filter((id): id is string => Boolean(id))),
      ];
      const actors = actorIds.length
        ? await this.db.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
      const actorById = new Map(actors.map((a) => [a.id, a]));
      return paginated(
        rows.map((r) => ({
          id: r.id,
          to: r.to,
          subject: r.subject,
          kind: r.kind,
          status: r.status,
          error: r.error,
          triggeredBy: r.triggeredById ? (actorById.get(r.triggeredById) ?? null) : null,
          createdAt: r.createdAt,
        })),
        total,
        q,
      );
    });
  }

  // ── Security / Rate-Limit Locks ──

  locks() {
    return withoutOrgScope(async () => {
      const rows = await this.db.rateLimitBucket.findMany({
        where: { expiresAt: { gt: new Date() } },
        orderBy: { windowStart: 'desc' },
        take: 100,
      });
      return rows;
    });
  }

  clearLocks(key?: string) {
    return withoutOrgScope(async () => {
      const trimmed = key?.trim();
      const { count } = await this.db.rateLimitBucket.deleteMany({
        where: trimmed ? { key: { contains: trimmed } } : {},
      });
      await this.audit.record({
        action: 'platform.locks_clear',
        entity: 'rate_limit_bucket',
        entityId: trimmed ?? null,
        orgId: null,
        after: { key: trimmed ?? 'ALL', cleared: count },
      });
      return { cleared: count };
    });
  }
}
