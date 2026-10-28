import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext, requireStepUp } from '../auth/decorators.js';
import { normalizeEmail, normalizePhone } from '../auth/identifiers.js';
import type { InviteUserDto, ListUsersQueryDto, UpdateMemberDto } from './users.dto.js';
import { InvitationsService } from './invitations.service.js';

const MEMBER_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      lastLoginAt: true,
    },
  },
  role: { select: { id: true, name: true, systemKey: true } },
} satisfies Prisma.MembershipInclude;

type MemberRow = Prisma.MembershipGetPayload<{ include: typeof MEMBER_INCLUDE }>;

function toMember(m: MemberRow) {
  return {
    userId: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    phone: m.user.phone,
    status: m.status,
    role: { id: m.role.id, name: m.role.name, isOwner: m.role.systemKey === 'OWNER' },
    propertyIds: m.propertyIds,
    lastLoginAt: m.user.lastLoginAt,
    invitedAt: m.invitedAt,
    joinedAt: m.joinedAt,
  };
}

/** Staff of the active organisation. All queries go through the org-scoped `db`. */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly invitations: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListUsersQueryDto) {
    const term = q.q?.trim();
    const where: Prisma.MembershipWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.roleId ? { roleId: q.roleId } : {}),
      ...(term
        ? {
            user: {
              OR: [
                { firstName: { contains: term, mode: 'insensitive' } },
                { lastName: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term.replace(/\s/g, '') } },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.membership.findMany({
        where,
        include: MEMBER_INCLUDE,
        orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }],
        ...toSkipTake(q),
      }),
      this.db.membership.count({ where }),
    ]);
    return paginated(rows.map(toMember), total, q);
  }

  async invite(dto: InviteUserDto) {
    const ctx = orgContext();
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.email && !email) throw AppError.fieldInvalid('email', 'Enter a valid email address');
    if (dto.phone && !phone) throw AppError.fieldInvalid('phone', 'Enter a valid phone number');
    const role = await this.db.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw AppError.fieldInvalid('roleId', 'Choose a role');
    if (role.systemKey === 'OWNER') requireStepUp(); // making someone an owner is as sensitive as it gets
    const propertyIds = await this.checkProperties(dto.propertyIds ?? []);

    const { membershipId, token } = await this.db.$transaction(async (tx) => {
      const created = await this.invitations.createInTx(tx, {
        orgId: ctx.orgId,
        roleId: role.id,
        propertyIds,
        invitee: { firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), email, phone },
        invitedById: ctx.userId,
      });
      await this.audit.record(
        {
          action: 'user.invite',
          entity: 'membership',
          entityId: created.membershipId,
          after: { userId: created.userId, roleId: role.id, roleName: role.name, email, phone },
        },
        tx,
      );
      return created;
    });
    const delivered = await this.invitations.deliver(membershipId, token);
    return { ...(await this.get(membershipId)), invitationDelivered: delivered };
  }

  async resendInvitation(userId: string) {
    const ctx = orgContext();
    const m = await this.findMember(userId);
    if (m.status !== 'INVITED')
      throw AppError.conflict('This person has already joined', 'NOT_INVITED');
    const token = await this.db.$transaction(async (tx) => {
      const t = await this.invitations.reissueInTx(tx, ctx.orgId, m.id, ctx.userId);
      await this.audit.record(
        { action: 'user.invitation_resend', entity: 'membership', entityId: m.id },
        tx,
      );
      return t;
    });
    return { invitationDelivered: await this.invitations.deliver(m.id, token) };
  }

  async update(userId: string, dto: UpdateMemberDto) {
    const ctx = orgContext();
    const m = await this.findMember(userId);
    const changingRole = dto.roleId !== undefined && dto.roleId !== m.roleId;
    const changingStatus = dto.status !== undefined && dto.status !== m.status;
    if (userId === ctx.userId && (changingRole || changingStatus)) {
      throw AppError.forbidden('CANNOT_CHANGE_SELF', "You can't change your own role or status");
    }
    if (changingStatus && m.status === 'INVITED') {
      throw AppError.conflict('Resend or remove the invitation instead', 'NOT_JOINED');
    }

    const propertyIds = dto.propertyIds ? await this.checkProperties(dto.propertyIds) : undefined;
    let role = m.role;
    if (changingRole) {
      requireStepUp();
      const next = await this.db.role.findUnique({ where: { id: dto.roleId! } });
      if (!next) throw AppError.fieldInvalid('roleId', 'Choose a role');
      role = next;
    }

    const updated = await this.db.$transaction(async (tx) => {
      const losingOwner =
        m.role.systemKey === 'OWNER' &&
        m.status === 'ACTIVE' &&
        ((changingRole && role.systemKey !== 'OWNER') ||
          (changingStatus && dto.status !== 'ACTIVE'));
      if (losingOwner) await this.assertAnotherOwner(tx, m.id);
      const row = await tx.membership.update({
        where: { id: m.id },
        data: {
          ...(changingRole ? { roleId: role.id } : {}),
          ...(changingStatus ? { status: dto.status } : {}),
          ...(propertyIds ? { propertyIds } : {}),
        },
        include: MEMBER_INCLUDE,
      });
      await this.audit.record(
        {
          action: 'user.update',
          entity: 'membership',
          entityId: m.id,
          before: {
            roleId: m.roleId,
            roleName: m.role.name,
            status: m.status,
            propertyIds: m.propertyIds,
          },
          after: {
            roleId: row.roleId,
            roleName: row.role.name,
            status: row.status,
            propertyIds: row.propertyIds,
          },
        },
        tx,
      );
      return row;
    });
    return toMember(updated);
  }

  async remove(userId: string) {
    const ctx = orgContext();
    if (userId === ctx.userId)
      throw AppError.forbidden('CANNOT_CHANGE_SELF', "You can't remove yourself");
    requireStepUp();
    const m = await this.findMember(userId);
    await this.db.$transaction(async (tx) => {
      if (m.role.systemKey === 'OWNER' && m.status === 'ACTIVE')
        await this.assertAnotherOwner(tx, m.id);
      await tx.membership.delete({ where: { id: m.id } });
      await this.audit.record(
        {
          action: 'user.remove',
          entity: 'membership',
          entityId: m.id,
          before: { userId, roleName: m.role.name, status: m.status },
        },
        tx,
      );
    });
  }

  private async get(membershipId: string) {
    const m = await this.db.membership.findUniqueOrThrow({
      where: { id: membershipId },
      include: MEMBER_INCLUDE,
    });
    return toMember(m);
  }

  private async findMember(userId: string) {
    const m = await this.db.membership.findFirst({ where: { userId }, include: { role: true } });
    if (!m) throw AppError.notFound('User');
    return m;
  }

  /**
   * Every organisation keeps at least one active Owner. Locking the organisation row makes
   * owner changes in one organisation run one at a time, so two owners demoting each other
   * simultaneously can't both pass the check.
   */
  /** De-duplicated property ids, all belonging to this organisation (else 422). */
  private async checkProperties(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return unique;
    const found = await this.db.property.count({ where: { id: { in: unique } } });
    if (found !== unique.length) {
      throw AppError.fieldInvalid('propertyIds', 'Choose properties from this organisation');
    }
    return unique;
  }

  private async assertAnotherOwner(tx: Tx, exceptMembershipId: string) {
    const { orgId } = orgContext();
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`;
    const others = await tx.membership.count({
      where: { id: { not: exceptMembershipId }, status: 'ACTIVE', role: { systemKey: 'OWNER' } },
    });
    if (others === 0) {
      throw AppError.conflict('An organisation needs at least one active owner', 'LAST_OWNER');
    }
  }
}
