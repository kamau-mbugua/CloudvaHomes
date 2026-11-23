import { Inject, Injectable } from '@nestjs/common';
import { withoutOrgScope } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { authContext, requireStepUp } from './decorators.js';

/**
 * A person closes their own account (Google Play's account-deletion rule; the privacy policy at
 * cloudvalabs.com/privacy promises it). Soft delete:
 *
 * - the user row stays, marked `deletedAt` and DISABLED, because payments, receipts and the audit
 *   log name who did what, and organisations must keep those records;
 * - the email, phone and password are cleared (kept aside in deletedEmail / deletedPhone for the
 *   grace period), so nobody can sign in as them and the same email or phone can open a new
 *   account later;
 * - every session ends at once, push tokens go, staff memberships end, and tenant / landlord
 *   records stop pointing at the login (the organisation's records themselves stay theirs).
 *
 * It needs a fresh one-time code (step-up), whichever way the person signs in.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    @Inject(DB) private readonly prisma: Db,
    private readonly audit: AuditService,
  ) {}

  async deleteOwnAccount(reason?: string): Promise<void> {
    const ctx = authContext();
    requireStepUp();
    await withoutOrgScope(async () => {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
      if (user.isPlatformAdmin || user.platformRole) {
        throw AppError.conflict(
          'KodiHQ team accounts are closed by another super admin, not from the app.',
          'PLATFORM_ACCOUNT',
        );
      }
      const soleOwnerOf = await this.organisationsOnlyOwnedBy(user.id);
      if (soleOwnerOf.length > 0) {
        const names = soleOwnerOf.join(', ');
        throw AppError.conflict(
          `You're the only owner of ${names}. Make someone else an owner, or ask KodiHQ support to close it, then delete your account.`,
          'SOLE_OWNER',
        );
      }

      const now = new Date();
      const note = reason?.trim() || null;
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            status: 'DISABLED',
            deletedAt: now,
            deletionReason: note,
            deletedEmail: user.email,
            deletedPhone: user.phone,
            email: null,
            phone: null,
            passwordHash: null,
            mustChangePassword: false,
            defaultOrgId: null,
            defaultPropertyId: null,
            defaultTenantId: null,
            defaultLandlordId: null,
            defaultHomeId: null,
            defaultPlace: null,
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.deviceToken.deleteMany({ where: { userId: user.id } });
        await tx.membership.updateMany({
          where: { userId: user.id, status: { not: 'INACTIVE' } },
          data: { status: 'INACTIVE' },
        });
        await tx.tenant.updateMany({ where: { userId: user.id }, data: { userId: null } });
        await tx.landlord.updateMany({ where: { userId: user.id }, data: { userId: null } });
        await tx.otpCode.deleteMany({ where: { userId: user.id, usedAt: null } });
        await this.audit.record(
          {
            action: 'user.account_delete',
            entity: 'user',
            entityId: user.id,
            orgId: null,
            // Not the email or phone themselves: the audit log outlives the grace period.
            after: { hadEmail: !!user.email, hadPhone: !!user.phone, reason: note },
          },
          tx,
        );
      });
    });
  }

  /** Organisations (still open) where this person is the only active owner. */
  private async organisationsOnlyOwnedBy(userId: string): Promise<string[]> {
    const owned = await this.prisma.membership.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        role: { systemKey: 'OWNER' },
        organization: { status: { not: 'CLOSED' } },
      },
      select: { orgId: true, organization: { select: { name: true } } },
    });
    const alone: string[] = [];
    for (const m of owned) {
      const others = await this.prisma.membership.count({
        where: {
          orgId: m.orgId,
          userId: { not: userId },
          status: 'ACTIVE',
          role: { systemKey: 'OWNER' },
          user: { status: 'ACTIVE' },
        },
      });
      if (others === 0) alone.push(m.organization.name);
    }
    return alone;
  }
}
