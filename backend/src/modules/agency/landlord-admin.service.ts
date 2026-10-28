import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldCipher } from '../../common/crypto/field-cipher.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext, requireStepUp } from '../auth/decorators.js';
import { normalizeEmail, normalizePhone } from '../auth/identifiers.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { requiredPhone } from '../portfolio/fields.js';
import type { PayoutDto } from './agency.dto.js';
import { LandlordLedgerService } from './landlord-ledger.service.js';

/** Last 4 of an account/phone, or a short payee name, for masked display. */
export function payoutHint(d: PayoutDto, phone?: string): string {
  if (d.method === 'BANK')
    return `${d.bankName ?? 'Bank'} •••• ${(d.accountNumber ?? '').replace(/\D/g, '').slice(-4)}`;
  if (d.method === 'MPESA') return `M-Pesa •••• ${(phone ?? '').slice(-4)}`;
  return `Cheque to ${(d.payeeName ?? '').trim().slice(0, 40)}`;
}

/** Landlord extras for agencies: balances, payout details (sensitive) and owner-portal access. */
@Injectable()
export class LandlordAdminService {
  private readonly log = new Logger(LandlordAdminService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly audit: AuditService,
    private readonly ledger: LandlordLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async summary(landlordId: string) {
    const l = await this.ledger.findLandlord(landlordId);
    const [balances, activeAgreements] = await Promise.all([
      this.ledger.balances(this.db, l.id),
      this.db.managementAgreement.count({
        where: {
          landlordId: l.id,
          startDate: { lte: new Date() },
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        },
      }),
    ]);
    return {
      balances,
      hasActiveAgreement: activeAgreements > 0,
      payout: l.payoutMethod
        ? { method: l.payoutMethod, masked: l.payoutHint, updatedAt: l.payoutUpdatedAt }
        : null,
      portal: { hasAccess: !!l.userId, invitedAt: l.portalInvitedAt },
    };
  }

  async setPayout(landlordId: string, dto: PayoutDto) {
    requireStepUp();
    const l = await this.ledger.findLandlord(landlordId);
    const details: Record<string, string> = { method: dto.method };
    let phone: string | undefined;
    if (dto.method === 'BANK') {
      for (const f of ['bankName', 'accountName', 'accountNumber'] as const) {
        if (!dto[f]?.trim()) throw AppError.fieldInvalid(f, 'Required for bank payouts');
      }
      Object.assign(details, {
        bankName: dto.bankName!.trim(),
        branch: dto.branch?.trim() ?? '',
        accountName: dto.accountName!.trim(),
        accountNumber: dto.accountNumber!.replace(/\s/g, ''),
      });
    } else if (dto.method === 'MPESA') {
      phone = requiredPhone('phone', dto.phone ?? '');
      details.phone = phone;
    } else {
      if (!dto.payeeName?.trim())
        throw AppError.fieldInvalid('payeeName', 'Who should cheques be made out to?');
      details.payeeName = dto.payeeName.trim();
    }
    const hint = payoutHint(dto, phone);
    await this.db.$transaction(async (tx) => {
      await tx.landlord.update({
        where: { id: l.id },
        data: {
          payoutMethod: dto.method,
          payoutEnc: this.cipher.encrypt(
            JSON.stringify(details),
            `${l.orgId}:landlord.${l.id}.payout`,
          ),
          payoutHint: hint,
          payoutUpdatedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          action: 'landlord.payout_set',
          entity: 'landlord',
          entityId: l.id,
          before: { method: l.payoutMethod, masked: l.payoutHint },
          after: { method: dto.method, masked: hint },
        },
        tx,
      );
    });
    await this.tellLandlord(l, hint);
    return this.summary(l.id);
  }

  async removePayout(landlordId: string) {
    requireStepUp();
    const l = await this.ledger.findLandlord(landlordId);
    await this.db.$transaction(async (tx) => {
      await tx.landlord.update({
        where: { id: l.id },
        data: {
          payoutMethod: null,
          payoutEnc: null,
          payoutHint: null,
          payoutUpdatedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          action: 'landlord.payout_remove',
          entity: 'landlord',
          entityId: l.id,
          before: { masked: l.payoutHint },
        },
        tx,
      );
    });
    await this.tellLandlord(l, null);
    return this.summary(l.id);
  }

  /** Best effort: the change stands even if the message fails, but it is logged. */
  private async tellLandlord(
    l: { orgId: string; phone: string; email: string | null; id: string },
    masked: string | null,
  ) {
    try {
      const org = await this.db.organization.findUniqueOrThrow({
        where: { id: l.orgId },
        select: { name: true },
      });
      await this.notifications.sendPayoutChanged(
        { phone: l.phone, email: l.email },
        { organizationName: org.name, masked },
      );
    } catch (e) {
      this.log.warn(
        { err: e, landlordId: l.id },
        'Could not tell the landlord their payout details changed',
      );
    }
  }

  /** Links (or creates) a user for the landlord's phone/e-mail; they sign in with a code. */
  async grantPortal(landlordId: string) {
    const l = await this.ledger.findLandlord(landlordId);
    const phone = normalizePhone(l.phone);
    const email = l.email ? normalizeEmail(l.email) : null;
    if (!phone && !email) {
      throw AppError.conflict('Add a phone number or e-mail for this landlord first', 'NO_CONTACT');
    }
    // Users are global (not per organisation): use the unscoped client.
    const existing = await this.prisma.user.findFirst({
      where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] },
    });
    const [firstName, ...rest] = l.name.trim().split(/\s+/);
    const user =
      existing ??
      (await this.prisma.user.create({
        data: {
          phone,
          email: existing ? undefined : email,
          firstName: firstName ?? l.name,
          lastName: rest.join(' ') || '-',
        },
      }));
    await this.db.$transaction(async (tx) => {
      await tx.landlord.update({
        where: { id: l.id },
        data: { userId: user.id, portalInvitedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'landlord.portal_grant',
          entity: 'landlord',
          entityId: l.id,
          after: { userId: user.id },
        },
        tx,
      );
    });
    try {
      const org = await this.db.organization.findUniqueOrThrow({
        where: { id: orgContext().orgId },
        select: { name: true },
      });
      await this.notifications.sendOwnerPortalAccess(
        { phone, email },
        { organizationName: org.name },
      );
    } catch (e) {
      this.log.warn({ err: e, landlordId: l.id }, 'Owner-portal message failed');
    }
    return this.summary(l.id);
  }

  async revokePortal(landlordId: string) {
    const l = await this.ledger.findLandlord(landlordId);
    await this.db.$transaction(async (tx) => {
      await tx.landlord.update({ where: { id: l.id }, data: { userId: null } });
      await this.audit.record(
        {
          action: 'landlord.portal_revoke',
          entity: 'landlord',
          entityId: l.id,
          before: { userId: l.userId },
        },
        tx,
      );
    });
    return this.summary(l.id);
  }
}
