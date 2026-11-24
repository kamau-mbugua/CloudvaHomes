import { Inject, Injectable } from '@nestjs/common';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Prisma, User } from '../../generated/prisma/client.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import {
  AccountDeletionService,
  DELETED_ACCOUNT_GRACE_DAYS,
} from '../auth/account-deletion.service.js';
import { hashPassword } from '../auth/crypto.js';
import { authContext, requireStepUp } from '../auth/decorators.js';
import { normalizePhone } from '../auth/identifiers.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InvitationsService } from '../users/invitations.service.js';
import { PlatformAdminService } from './platform-admin.service.js';
import type {
  ListPlatformUsersQueryDto,
  UpdatePlatformUserDto,
  UserFilter,
} from './platform.dto.js';

const DAY_MS = 24 * 3600 * 1000;

/** Customers only: KodiHQ's own team is managed on the operators page. */
const CUSTOMER: Prisma.UserWhereInput = { isPlatformAdmin: false, platformRole: null };

const LIST_MEMBERSHIPS = {
  where: { status: { not: 'INACTIVE' } },
  orderBy: { createdAt: 'asc' },
  select: {
    status: true,
    organization: { select: { id: true, name: true } },
    role: { select: { name: true } },
  },
} satisfies Prisma.User$membershipsArgs;

type ListedUser = Prisma.UserGetPayload<{ include: { memberships: typeof LIST_MEMBERSHIPS } }>;

/**
 * KodiHQ support managing customers' accounts (business staff, tenants, landlords with owner
 * portal access) and each organisation's team.
 *
 * Superadmins see everyone. A salesperson sees people linked to the organisations they look
 * after, and may change someone only when every organisation that person belongs to is theirs
 * (otherwise their change would reach a business they don't support). Closing, restoring and
 * erasing accounts is for superadmins. Every change is audited.
 */
@Injectable()
export class PlatformUsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly deletion: AccountDeletionService,
    private readonly invitations: InvitationsService,
    private readonly notifications: NotificationsService,
    private readonly admin: PlatformAdminService,
  ) {}

  // ── People ──

  list(q: ListPlatformUsersQueryDto) {
    const filter: UserFilter = q.filter ?? 'all';
    const salesperson = this.salesperson();
    if (filter === 'deleted' && salesperson) throw AppError.forbidden();
    return withoutOrgScope(async () => {
      const book = salesperson ? await this.bookOrgIds(salesperson) : null;
      const and: Prisma.UserWhereInput[] = [CUSTOMER];
      and.push(filter === 'deleted' ? { deletedAt: { not: null } } : { deletedAt: null });
      if (filter === 'business') {
        and.push({
          memberships: {
            some: {
              status: { in: ['INVITED', 'ACTIVE'] },
              ...(book ? { orgId: { in: book } } : {}),
            },
          },
        });
      }
      if (filter === 'tenants') and.push({ id: { in: await this.tenantUserIds(book) } });
      if (filter === 'owners') and.push({ id: { in: await this.landlordUserIds(book) } });
      if (filter === 'disabled') and.push({ status: 'DISABLED' });
      if (book) {
        const linked = [...(await this.tenantUserIds(book)), ...(await this.landlordUserIds(book))];
        and.push({
          OR: [{ memberships: { some: { orgId: { in: book } } } }, { id: { in: linked } }],
        });
      }
      const search = this.searchWhere(q.q, filter === 'deleted');
      if (search) and.push(search);

      const where: Prisma.UserWhereInput = { AND: and };
      const [rows, total] = await Promise.all([
        this.db.user.findMany({
          where,
          include: { memberships: LIST_MEMBERSHIPS },
          orderBy: filter === 'deleted' ? { deletedAt: 'desc' } : { createdAt: 'desc' },
          ...toSkipTake(q),
        }),
        this.db.user.count({ where }),
      ]);
      const ids = rows.map((r) => r.id);
      const [tenants, landlords] = await Promise.all([
        this.db.tenant.findMany({
          where: { userId: { in: ids } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.db.landlord.findMany({
          where: { userId: { in: ids } },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);
      const isTenant = new Set(tenants.map((t) => t.userId));
      const isOwner = new Set(landlords.map((l) => l.userId));
      return paginated(
        rows.map((u) => this.toRow(u, isTenant.has(u.id), isOwner.has(u.id))),
        total,
        q,
      );
    });
  }

  get(id: string) {
    return withoutOrgScope(async () => {
      const { user, canManage } = await this.target(id);
      const [memberships, tenants, landlords, activeSessions] = await Promise.all([
        this.db.membership.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            invitedAt: true,
            joinedAt: true,
            role: { select: { name: true, systemKey: true } },
            organization: { select: { id: true, name: true, kind: true, status: true } },
          },
        }),
        this.db.tenant.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            organization: { select: { id: true, name: true } },
          },
        }),
        this.db.landlord.findMany({
          where: { userId: id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, organization: { select: { id: true, name: true } } },
        }),
        this.db.refreshToken.count({
          where: { userId: id, revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
        }),
      ]);
      return {
        ...this.toRow(user, tenants.length > 0, landlords.length > 0),
        canManage,
        activeSessions,
        memberships: memberships.map((m) => ({
          id: m.id,
          status: m.status,
          invitedAt: m.invitedAt,
          joinedAt: m.joinedAt,
          role: { name: m.role.name, isOwner: m.role.systemKey === 'OWNER' },
          organization: m.organization,
        })),
        tenants: tenants.map((t) => ({
          id: t.id,
          code: t.code,
          name: `${t.firstName} ${t.lastName}`.trim(),
          organization: t.organization,
        })),
        landlords: landlords.map((l) => ({ id: l.id, name: l.name, organization: l.organization })),
      };
    });
  }

  update(id: string, dto: UpdatePlatformUserDto) {
    const ctx = authContext();
    return withoutOrgScope(async () => {
      const { user } = await this.target(id, { manage: true, live: true });
      const changes = await this.admin.contactChanges(user, dto);
      const signInChanged = changes.email !== undefined || changes.phone !== undefined;
      if (signInChanged) requireStepUp();
      if (Object.keys(changes).length === 0) return this.get(id);
      await this.db.$transaction(async (tx) => {
        const row = await tx.user.update({ where: { id }, data: changes });
        // A new sign-in email or phone ends the sessions started with the old one.
        if (signInChanged) await this.endSessions(tx, id);
        await this.audit.record(
          {
            action: 'platform.user_update',
            entity: 'user',
            entityId: id,
            actorId: ctx.userId,
            orgId: null,
            before: this.contact(user),
            after: this.contact(row),
          },
          tx,
        );
      });
      return this.get(id);
    });
  }

  setStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    const ctx = authContext();
    return withoutOrgScope(async () => {
      const { user } = await this.target(id, { manage: true, live: true });
      if (user.status !== status) {
        await this.db.$transaction(async (tx) => {
          await tx.user.update({ where: { id }, data: { status } });
          if (status === 'DISABLED') await this.endSessions(tx, id);
          await this.audit.record(
            {
              action: status === 'DISABLED' ? 'platform.user_disable' : 'platform.user_enable',
              entity: 'user',
              entityId: id,
              actorId: ctx.userId,
              orgId: null,
              before: { status: user.status },
              after: { status },
            },
            tx,
          );
        });
      }
      return this.get(id);
    });
  }

  signOutEverywhere(id: string) {
    const ctx = authContext();
    return withoutOrgScope(async () => {
      await this.target(id, { manage: true, live: true });
      const ended = await this.db.$transaction(async (tx) => {
        const n = await this.endSessions(tx, id);
        await this.audit.record(
          {
            action: 'platform.user_sign_out',
            entity: 'user',
            entityId: id,
            actorId: ctx.userId,
            orgId: null,
            after: { sessionsEnded: n },
          },
          tx,
        );
        return n;
      });
      return { sessionsEnded: ended };
    });
  }

  /** A temporary password to their email and phone; they choose their own at the next sign-in. */
  resetPassword(id: string) {
    const ctx = authContext();
    requireStepUp();
    return withoutOrgScope(async () => {
      const { user } = await this.target(id, { manage: true, live: true });
      if (!user.email && !user.phone) {
        throw AppError.conflict('This account has no email or phone to send it to', 'NO_CONTACT');
      }
      const temporaryPassword = this.admin.generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await this.db.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
        await this.endSessions(tx, id);
        await this.audit.record(
          {
            action: 'platform.user_password_reset',
            entity: 'user',
            entityId: id,
            actorId: ctx.userId,
            orgId: null,
          },
          tx,
        );
      });
      const delivered = await this.notifications.sendSupportPasswordReset(
        { email: user.email, phone: user.phone },
        { firstName: user.firstName, temporaryPassword },
      );
      return { delivered, sentTo: { email: user.email, phone: user.phone } };
    });
  }

  // ── Deleted accounts (superadmins) ──

  async closeAccount(id: string, reason?: string) {
    const ctx = authContext();
    requireStepUp();
    await withoutOrgScope(() => this.target(id, { manage: true, live: true }));
    await this.deletion.closeAccount(id, { reason, actorId: ctx.userId });
    return this.get(id);
  }

  async restore(id: string) {
    const ctx = authContext();
    await withoutOrgScope(() => this.target(id));
    await this.deletion.restore(id, ctx.userId);
    return this.get(id);
  }

  async purge(id: string) {
    const ctx = authContext();
    requireStepUp();
    await withoutOrgScope(() => this.target(id));
    await this.deletion.purgeNow(id, ctx.userId);
    return this.get(id);
  }

  // ── An organisation's team ──

  async members(orgId: string) {
    await this.admin.organization(orgId); // 404 outside a salesperson's book
    return withoutOrgScope(async () => {
      const rows = await this.db.membership.findMany({
        where: { orgId },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          status: true,
          invitedAt: true,
          joinedAt: true,
          role: { select: { name: true, systemKey: true } },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
              lastLoginAt: true,
              deletedAt: true,
            },
          },
        },
      });
      return rows.map((m) => ({
        id: m.id,
        status: m.status,
        invitedAt: m.invitedAt,
        joinedAt: m.joinedAt,
        role: { name: m.role.name, isOwner: m.role.systemKey === 'OWNER' },
        user: { ...m.user, deleted: m.user.deletedAt !== null },
      }));
    });
  }

  async resendInvitation(orgId: string, membershipId: string) {
    const ctx = authContext();
    await this.admin.organization(orgId);
    return withoutOrgScope(async () => {
      const m = await this.member(orgId, membershipId);
      if (m.status !== 'INVITED') {
        throw AppError.conflict('This person has already joined', 'NOT_INVITED');
      }
      const token = await this.db.$transaction(async (tx) => {
        const t = await this.invitations.reissueInTx(tx, orgId, m.id, ctx.userId);
        await this.audit.record(
          {
            action: 'platform.member_invitation_resend',
            entity: 'membership',
            entityId: m.id,
            actorId: ctx.userId,
            orgId,
          },
          tx,
        );
        return t;
      });
      return { invitationDelivered: await this.invitations.deliver(m.id, token) };
    });
  }

  async removeMember(orgId: string, membershipId: string) {
    const ctx = authContext();
    requireStepUp();
    await this.admin.organization(orgId);
    await withoutOrgScope(async () => {
      const m = await this.member(orgId, membershipId);
      await this.db.$transaction(async (tx) => {
        if (m.role.systemKey === 'OWNER' && m.status === 'ACTIVE') {
          // One at a time per organisation, so two removals can't both pass the check.
          await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`;
          const others = await tx.membership.count({
            where: {
              orgId,
              id: { not: m.id },
              status: 'ACTIVE',
              role: { systemKey: 'OWNER' },
            },
          });
          if (others === 0) {
            throw AppError.conflict(
              'An organisation needs at least one active owner. Invite the new owner first.',
              'LAST_OWNER',
            );
          }
        }
        await tx.membership.delete({ where: { id: m.id } });
        await this.audit.record(
          {
            action: 'platform.member_remove',
            entity: 'membership',
            entityId: m.id,
            actorId: ctx.userId,
            orgId,
            before: { userId: m.userId, roleName: m.role.name, status: m.status },
          },
          tx,
        );
      });
    });
  }

  // ── helpers ──

  private salesperson(): string | null {
    const ctx = authContext();
    return ctx.platformRole === 'SALESPERSON' ? ctx.userId : null;
  }

  private async bookOrgIds(salespersonId: string): Promise<string[]> {
    const rows = await this.db.organization.findMany({
      where: { onboardedById: salespersonId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async tenantUserIds(orgIds: string[] | null): Promise<string[]> {
    const rows = await this.db.tenant.findMany({
      where: { userId: { not: null }, ...(orgIds ? { orgId: { in: orgIds } } : {}) },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId!);
  }

  private async landlordUserIds(orgIds: string[] | null): Promise<string[]> {
    const rows = await this.db.landlord.findMany({
      where: { userId: { not: null }, ...(orgIds ? { orgId: { in: orgIds } } : {}) },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId!);
  }

  /** Every organisation this person is linked to: staff (any status), tenant or landlord. */
  private async userOrgIds(userId: string): Promise<Set<string>> {
    const [m, t, l] = await Promise.all([
      this.db.membership.findMany({ where: { userId }, select: { orgId: true } }),
      this.db.tenant.findMany({ where: { userId }, select: { orgId: true } }),
      this.db.landlord.findMany({ where: { userId }, select: { orgId: true } }),
    ]);
    return new Set([...m, ...t, ...l].map((r) => r.orgId));
  }

  /**
   * The customer account `id`, if the caller may see it (404 otherwise), and whether they may
   * change it. `manage` refuses a caller who may only look; `live` refuses a deleted account.
   */
  private async target(
    id: string,
    opts: { manage?: boolean; live?: boolean } = {},
  ): Promise<{ user: User; canManage: boolean }> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user || user.isPlatformAdmin || user.platformRole) throw AppError.notFound('User');
    const salesperson = this.salesperson();
    let canManage = true;
    if (salesperson) {
      if (user.deletedAt) throw AppError.notFound('User');
      const book = new Set(await this.bookOrgIds(salesperson));
      const theirs = [...(await this.userOrgIds(id))];
      if (!theirs.some((o) => book.has(o))) throw AppError.notFound('User');
      canManage = theirs.every((o) => book.has(o));
    }
    if (opts.manage && !canManage) {
      throw AppError.forbidden(
        'OUTSIDE_YOUR_BOOK',
        'This person also belongs to organisations you don’t look after. Ask a superadmin.',
      );
    }
    if (opts.live && user.deletedAt) {
      throw AppError.conflict('This account was deleted. Restore it first.', 'ACCOUNT_DELETED');
    }
    return { user, canManage };
  }

  private async member(orgId: string, membershipId: string) {
    const m = await this.db.membership.findFirst({
      where: { id: membershipId, orgId },
      include: { role: true },
    });
    if (!m) throw AppError.notFound('Member');
    return m;
  }

  private async endSessions(tx: Tx, userId: string): Promise<number> {
    const { count } = await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  private searchWhere(raw: string | undefined, deleted: boolean): Prisma.UserWhereInput | null {
    const words = raw?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (!words.length) return null;
    return {
      AND: words.map((w) => {
        const phone = normalizePhone(w);
        const or: Prisma.UserWhereInput[] = [
          { firstName: { contains: w, mode: 'insensitive' } },
          { lastName: { contains: w, mode: 'insensitive' } },
          { email: { contains: w, mode: 'insensitive' } },
          { phone: { contains: w } },
          ...(phone ? [{ phone }] : []),
        ];
        if (deleted) {
          or.push({ deletedEmail: { contains: w, mode: 'insensitive' } });
          or.push({ deletedPhone: { contains: w } });
          if (phone) or.push({ deletedPhone: phone });
        }
        return { OR: or };
      }),
    };
  }

  private contact(u: User) {
    return { firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone };
  }

  private toRow(u: User | ListedUser, isTenant: boolean, isOwner: boolean) {
    const deleted = u.deletedAt !== null;
    const purgeOn =
      deleted && !u.purgedAt
        ? new Date(u.deletedAt!.getTime() + DELETED_ACCOUNT_GRACE_DAYS * DAY_MS)
        : null;
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      status: u.status,
      hasPassword: u.passwordHash !== null,
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      isTenant,
      isOwner,
      ...('memberships' in u
        ? {
            organizations: u.memberships.map((m) => ({
              id: m.organization.id,
              name: m.organization.name,
              role: m.role.name,
              status: m.status,
            })),
          }
        : {}),
      deleted: deleted
        ? {
            deletedAt: u.deletedAt,
            email: u.deletedEmail,
            phone: u.deletedPhone,
            reason: u.deletionReason,
            purgeOn,
            purgedAt: u.purgedAt,
          }
        : null,
    };
  }
}
