import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, randomToken, sha256 } from '../auth/crypto.js';
import { passwordProblem } from '../auth/identifiers.js';
import { type IssuedSession, SessionsService } from '../auth/sessions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export const INVITATION_TTL_DAYS = 7;

export interface Invitee {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Invitations are how anyone joins an organisation (owners on onboarding, staff later).
 * A person is one User across organisations, matched by email or phone.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Finds or creates the user and an INVITED membership, inside the caller's transaction.
   * Returns the raw token — call `deliver()` after the transaction commits.
   */
  async createInTx(
    tx: Tx,
    p: {
      orgId: string;
      roleId: string;
      propertyIds: string[];
      invitee: Invitee;
      invitedById: string | null;
    },
  ): Promise<{ userId: string; membershipId: string; token: string }> {
    const { email, phone } = p.invitee;
    if (!email && !phone) {
      throw AppError.validation([
        { field: 'email', message: 'Give an email address or a phone number' },
        { field: 'phone', message: 'Give an email address or a phone number' },
      ]);
    }
    const [byEmail, byPhone] = await Promise.all([
      email ? tx.user.findUnique({ where: { email } }) : null,
      phone ? tx.user.findUnique({ where: { phone } }) : null,
    ]);
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      throw AppError.conflict(
        'That email and phone number belong to two different people',
        'IDENTITY_CONFLICT',
      );
    }
    let user = byEmail ?? byPhone;
    if (user) {
      // Fill in a missing contact detail, never overwrite an existing one.
      const fill = {
        ...(!user.email && email ? { email } : {}),
        ...(!user.phone && phone ? { phone } : {}),
      };
      if (Object.keys(fill).length)
        user = await tx.user.update({ where: { id: user.id }, data: fill });
    } else {
      user = await tx.user.create({
        data: { firstName: p.invitee.firstName, lastName: p.invitee.lastName, email, phone },
      });
    }

    const existing = await tx.membership.findFirst({ where: { orgId: p.orgId, userId: user.id } });
    if (existing)
      throw AppError.conflict(
        'This person is already a member of the organisation',
        'ALREADY_MEMBER',
      );

    const membership = await tx.membership.create({
      data: {
        orgId: p.orgId,
        userId: user.id,
        roleId: p.roleId,
        propertyIds: p.propertyIds,
        status: 'INVITED',
      },
    });
    const token = await this.newToken(tx, p.orgId, membership.id, p.invitedById);
    return { userId: user.id, membershipId: membership.id, token };
  }

  /** Revokes outstanding invitations for the membership and issues a new one. */
  async reissueInTx(
    tx: Tx,
    orgId: string,
    membershipId: string,
    invitedById: string | null,
  ): Promise<string> {
    await tx.invitation.updateMany({
      where: { membershipId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return this.newToken(tx, orgId, membershipId, invitedById);
  }

  /** Sends the invitation. Delivery failure is reported, not thrown: the invite can be resent. */
  async deliver(membershipId: string, token: string): Promise<boolean> {
    const m = await this.prisma.membership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { user: true, organization: true },
    });
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { invitedBy: true },
    });
    try {
      await this.notifications.sendInvitation(
        { email: m.user.email, phone: m.user.phone },
        {
          firstName: m.user.firstName,
          organizationName: m.organization.name,
          inviterName: invitation?.invitedBy
            ? `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`
            : null,
          token,
        },
      );
      return true;
    } catch (e) {
      this.logger.error({ err: e, membershipId }, 'Invitation delivery failed');
      return false;
    }
  }

  async preview(token: string) {
    const inv = await this.findUsable(token);
    return {
      organizationName: inv.membership.organization.name,
      inviterName: inv.invitedBy ? `${inv.invitedBy.firstName} ${inv.invitedBy.lastName}` : null,
      firstName: inv.membership.user.firstName,
      lastName: inv.membership.user.lastName,
      email: inv.membership.user.email,
      phone: inv.membership.user.phone,
      hasPassword: inv.membership.user.passwordHash !== null,
    };
  }

  async accept(token: string, password: string | undefined): Promise<IssuedSession> {
    const inv = await this.findUsable(token);
    const user = inv.membership.user;
    let passwordHash: string | undefined;
    if (!user.passwordHash) {
      if (!password) throw AppError.fieldInvalid('password', 'Choose a password');
      const problem = passwordProblem(password, [user.email, user.phone]);
      if (problem) throw AppError.fieldInvalid('password', problem);
      passwordHash = await hashPassword(password);
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw this.invalid();
      if (passwordHash) await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.membership.update({
        where: { id: inv.membershipId },
        data: { status: 'ACTIVE', joinedAt: new Date() },
      });
    });
    await withoutOrgScope(() =>
      this.audit.record({
        action: 'user.invitation_accept',
        entity: 'membership',
        entityId: inv.membershipId,
        orgId: inv.orgId,
        actorId: user.id,
      }),
    );
    return this.sessions.start(user.id, inv.orgId);
  }

  private async newToken(tx: Tx, orgId: string, membershipId: string, invitedById: string | null) {
    const token = randomToken();
    await tx.invitation.create({
      data: {
        orgId,
        membershipId,
        invitedById,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000),
      },
    });
    return token;
  }

  private invalid() {
    return new AppError(
      410,
      'INVITATION_INVALID',
      'This invitation has expired or was already used. Ask for a new one.',
    );
  }

  private async findUsable(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        invitedBy: true,
        membership: { include: { user: true, organization: true } },
      },
    });
    if (
      !inv ||
      inv.acceptedAt ||
      inv.revokedAt ||
      inv.expiresAt <= new Date() ||
      inv.membership.status !== 'INVITED' ||
      inv.membership.organization.status === 'CLOSED' ||
      inv.membership.user.status !== 'ACTIVE'
    ) {
      throw this.invalid();
    }
    return inv;
  }
}
