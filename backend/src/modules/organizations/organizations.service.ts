import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { withoutOrgScope } from '../../common/context/request-context.js';
import type { Organization, Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { authContext, orgContext } from '../auth/decorators.js';
import { normalizeEmail, normalizePhone } from '../auth/identifiers.js';
import { RolesService } from '../roles/roles.service.js';
import { readReminders } from '../tenant-portal/reminders.js';
import { InvitationsService } from '../users/invitations.service.js';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './organizations.dto.js';

function toOrg(o: Organization) {
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    phone: o.phone,
    email: o.email,
    kraPin: o.kraPin,
    status: o.status,
    settings: o.settings,
    invoiceDueDays: o.invoiceDueDays,
    reminders: readReminders(o.settings),
    createdAt: o.createdAt,
  };
}

function requirePhone(input: string, field: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw AppError.fieldInvalid(field, 'Enter a valid phone number, e.g. 0712 345 678');
  return phone;
}

function requireEmail(input: string, field: string): string {
  const email = normalizeEmail(input);
  if (!email) throw AppError.fieldInvalid(field, 'Enter a valid email address');
  return email;
}

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  async current() {
    const { orgId } = orgContext();
    return toOrg(await this.db.organization.findUniqueOrThrow({ where: { id: orgId } }));
  }

  async updateCurrent(dto: UpdateOrganizationDto) {
    const { orgId } = orgContext();
    const data: Prisma.OrganizationUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: requirePhone(dto.phone, 'phone') } : {}),
      ...(dto.email !== undefined ? { email: requireEmail(dto.email, 'email') } : {}),
      ...(dto.kraPin !== undefined ? { kraPin: dto.kraPin ? dto.kraPin.toUpperCase() : null } : {}),
      ...(dto.invoiceDueDays !== undefined ? { invoiceDueDays: dto.invoiceDueDays } : {}),
    };
    return this.db.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      if (dto.reminders) {
        const overdueDays = [...new Set(dto.reminders.overdueDays)].sort((a, b) => a - b);
        data.settings = {
          ...(before.settings as Prisma.JsonObject | null),
          reminders: {
            enabled: dto.reminders.enabled,
            daysBefore: dto.reminders.daysBefore,
            overdueDays,
          },
        };
      }
      const after = await tx.organization.update({ where: { id: orgId }, data });
      await this.audit.record(
        {
          action: 'organization.update',
          entity: 'organization',
          entityId: orgId,
          before: toOrg(before),
          after: toOrg(after),
        },
        tx,
      );
      return toOrg(after);
    });
  }

  // ── Platform admin ──

  /** Creates an organisation with its system roles and invites its owner (design: Hodi onboards customers). */
  async create(dto: CreateOrganizationDto) {
    const ctx = authContext();
    const phone = requirePhone(dto.phone, 'phone');
    const email = requireEmail(dto.email, 'email');
    const ownerEmail = dto.owner.email ? requireEmail(dto.owner.email, 'owner.email') : null;
    const ownerPhone = dto.owner.phone ? requirePhone(dto.owner.phone, 'owner.phone') : null;

    // Platform work spans organisations: org scoping off, everything filtered explicitly.
    return withoutOrgScope(async () => {
      const { org, membershipId, token } = await this.db.$transaction(async (tx) => {
        // Hodi billing (phase 8): account number, default plan and its free trial.
        const [{ n }] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval('"billing_ref_seq"') AS n`;
        const settings = await tx.platformSettings.findUnique({ where: { id: 1 } });
        const plan =
          (settings?.defaultPlanId
            ? await tx.plan.findFirst({ where: { id: settings.defaultPlanId, active: true } })
            : null) ?? (await tx.plan.findFirst({ where: { isDefault: true, active: true } }));
        const trialEndsAt = plan ? new Date(Date.now() + plan.trialDays * 86_400_000) : null;
        const org = await tx.organization.create({
          data: {
            name: dto.name.trim(),
            kind: dto.kind,
            phone,
            email,
            kraPin: dto.kraPin?.toUpperCase() ?? null,
            billingRef: `H${String(n).padStart(5, '0')}`,
            planId: plan?.id ?? null,
            trialEndsAt: trialEndsAt ? new Date(trialEndsAt.toISOString().slice(0, 10)) : null,
          },
        });
        const roles = await RolesService.seedSystemRoles(tx, org.id);
        const invite = await this.invitations.createInTx(tx, {
          orgId: org.id,
          roleId: roles.OWNER,
          propertyIds: [],
          invitee: {
            firstName: dto.owner.firstName.trim(),
            lastName: dto.owner.lastName.trim(),
            email: ownerEmail,
            phone: ownerPhone,
          },
          invitedById: ctx.userId,
        });
        await this.audit.record(
          {
            action: 'organization.create',
            entity: 'organization',
            entityId: org.id,
            orgId: org.id,
            after: toOrg(org),
          },
          tx,
        );
        return { org, membershipId: invite.membershipId, token: invite.token };
      });
      const invitationDelivered = await this.invitations.deliver(membershipId, token);
      return { ...toOrg(org), invitationDelivered };
    });
  }
}
