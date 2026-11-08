import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { withoutOrgScope } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors/app-error.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import type { HostSite, Prisma } from '../../../generated/prisma/client.js';
import { violatesUnique } from '../../../prisma/errors.js';
import { DB, type Db } from '../../../prisma/prisma.module.js';
import { AuditService } from '../../audit/audit.service.js';
import { orgContext } from '../../auth/decorators.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { UploadsService } from '../../files/uploads.service.js';
import { assertHostOrg } from '../host-org.js';
import { slugProblem } from '../rules/slug.js';
import { DEFAULT_RULES, rulesProblem, type StayRules } from '../rules/terms.js';
import type { WrapperType } from '../../../common/di/wrapper-type.js';
import { DarajaConfigService } from '../../mpesa/daraja-config.service.js';
import { type LegalDocKey, legalTemplate } from '../rules/legal.js';
import type { UpdateHostSiteDto } from './host-site.dto.js';

/** What guests can use to pay this host. Neither = bookings needing money upfront expire. */
export interface GuestPayments {
  /** An active M-Pesa paybill or till with a number guests can pay to. */
  paybill: boolean;
  /** The in-app M-Pesa prompt is set up (Daraja credentials, passkey, callback). */
  mpesaPrompt: boolean;
}

const REDIRECT_RETENTION_MS = 30 * 86_400_000;

@Injectable()
export class HostSiteService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    @Inject(forwardRef(() => DarajaConfigService))
    private readonly darajaConfig: WrapperType<DarajaConfigService>,
  ) {}

  private async guestPayments(orgId: string): Promise<GuestPayments> {
    const channels = await this.db.paymentChannel.findMany({
      where: { orgId, kind: { in: ['MPESA_PAYBILL', 'MPESA_TILL'] }, status: 'ACTIVE' },
    });
    return {
      paybill: channels.some((c) => !!c.shortcode),
      mpesaPrompt: channels.some((c) => {
        if (!c.shortcode || !c.callbackToken || !c.darajaEnv || !c.secretsEnc) return false;
        return !!this.darajaConfig.credentials(c)?.passkey;
      }),
    };
  }

  private async viewWithPayments(s: HostSite) {
    return { ...this.toView(s), guestPayments: await this.guestPayments(s.orgId) };
  }

  private toView(s: HostSite) {
    return {
      slug: s.slug,
      published: s.published,
      businessName: s.businessName,
      about: s.about,
      logoUploadId: s.logoUploadId,
      logoUrl: s.logoUploadId ? `/api/v1/public/photos/${s.logoUploadId}` : null,
      contactPhone: s.contactPhone,
      whatsappPhone: s.whatsappPhone,
      rules: s.rules as unknown as StayRules,
      houseRules: s.houseRules,
      checkInTime: s.checkInTime,
      checkOutTime: s.checkOutTime,
      address: s.slug ? `https://${s.slug}.${this.env.SITE_DOMAIN}` : null,
      theme: { preset: s.themePreset, brandColor: s.brandColor },
      legal: this.legalView(s),
    };
  }

  /** For the audit log: the site view without the long legal texts (just whether each is custom). */
  private auditView(s: HostSite) {
    const { legal: _legal, ...rest } = this.toView(s);
    return {
      ...rest,
      legalCustom: {
        terms: !!s.termsText,
        termsOfUse: !!s.termsOfUseText,
        privacy: !!s.privacyText,
      },
    };
  }

  /** Each legal page: the host's own text, or the starter template (isDefault) to edit. */
  private legalView(s: HostSite) {
    const ctx = {
      businessName: s.businessName,
      contactPhone: s.whatsappPhone ?? s.contactPhone,
      siteAddress: s.slug ? `https://${s.slug}.${this.env.SITE_DOMAIN}` : null,
    };
    const page = (own: string | null, key: LegalDocKey) => {
      const starter = legalTemplate(key, ctx);
      return own
        ? { text: own, isDefault: false, starter }
        : { text: starter, isDefault: true, starter };
    };
    return {
      terms: page(s.termsText, 'terms'),
      termsOfUse: page(s.termsOfUseText, 'terms-of-use'),
      privacy: page(s.privacyText, 'privacy'),
    };
  }

  private async ensureSite(orgId: string): Promise<HostSite> {
    const existing = await this.db.hostSite.findUnique({ where: { orgId } });
    if (existing) return existing;
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, phone: true },
    });
    return this.db.hostSite.create({
      data: {
        orgId,
        businessName: org.name,
        contactPhone: org.phone,
        rules: DEFAULT_RULES as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async isSlugTakenByOtherOrg(
    slug: string,
    orgId: string,
    now = new Date(),
  ): Promise<boolean> {
    return withoutOrgScope(async () => {
      const taken = await this.db.hostSite.findFirst({
        where: {
          orgId: { not: orgId },
          OR: [
            { slug },
            {
              previousSlug: slug,
              previousSlugUntil: { gt: now },
            },
          ],
        },
        select: { id: true },
      });
      return Boolean(taken);
    });
  }

  async get() {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);
    const site = await this.ensureSite(orgId);
    return this.viewWithPayments(site);
  }

  async checkSlug(rawSlug: string) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);
    const slug = (rawSlug ?? '').trim().toLowerCase();
    const problem = slugProblem(slug);
    if (problem) {
      return { available: false, problem };
    }
    const taken = await this.isSlugTakenByOtherOrg(slug, orgId);
    return {
      available: !taken,
      problem: taken ? 'That web address is already taken' : null,
    };
  }

  async update(dto: UpdateHostSiteDto) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);
    const before = await this.ensureSite(orgId);
    const now = new Date();

    let nextSlug = before.slug;
    if (dto.slug !== undefined) {
      const cleaned = dto.slug?.trim().toLowerCase() || null;
      if (cleaned !== null) {
        const problem = slugProblem(cleaned);
        if (problem) throw AppError.fieldInvalid('slug', problem);
        if (await this.isSlugTakenByOtherOrg(cleaned, orgId, now)) {
          throw AppError.conflict('That web address is already taken', 'SLUG_TAKEN');
        }
      }
      nextSlug = cleaned;
    }

    const nextPublished = dto.published !== undefined ? dto.published : before.published;
    if (nextPublished && !nextSlug) {
      throw AppError.fieldInvalid('published', 'Choose a web address first');
    }

    if (dto.rules !== undefined) {
      const problem = rulesProblem(dto.rules);
      if (problem) throw AppError.fieldInvalid('rules', problem);
    }

    let contactPhone = before.contactPhone;
    if (dto.contactPhone !== undefined) {
      if (dto.contactPhone === null || dto.contactPhone.trim() === '') {
        contactPhone = null;
      } else {
        const norm = normalizePhone(dto.contactPhone);
        if (!norm) throw AppError.fieldInvalid('contactPhone', 'Enter a valid phone number');
        contactPhone = norm;
      }
    }

    let whatsappPhone = before.whatsappPhone;
    if (dto.whatsappPhone !== undefined) {
      if (dto.whatsappPhone === null || dto.whatsappPhone.trim() === '') {
        whatsappPhone = null;
      } else {
        const norm = normalizePhone(dto.whatsappPhone);
        if (!norm) throw AppError.fieldInvalid('whatsappPhone', 'Enter a valid phone number');
        whatsappPhone = norm;
      }
    }

    const slugChanged = before.slug !== null && nextSlug !== before.slug;

    try {
      const updated = await this.db.$transaction(async (tx) => {
        if (dto.logoUploadId !== undefined && dto.logoUploadId !== before.logoUploadId) {
          if (dto.logoUploadId) {
            await this.uploads.attach(tx, dto.logoUploadId, 'SITE_LOGO', 'logoUploadId');
          }
          if (before.logoUploadId) {
            await tx.upload.updateMany({
              where: { id: before.logoUploadId },
              data: { attachedAt: null, createdAt: new Date(0) },
            });
          }
        }

        const row = await tx.hostSite.update({
          where: { orgId },
          data: {
            slug: nextSlug,
            ...(slugChanged
              ? {
                  previousSlug: before.slug,
                  previousSlugUntil: new Date(now.getTime() + REDIRECT_RETENTION_MS),
                }
              : {}),
            published: nextPublished,
            ...(dto.businessName !== undefined ? { businessName: dto.businessName.trim() } : {}),
            ...(dto.about !== undefined ? { about: dto.about?.trim() || null } : {}),
            contactPhone,
            whatsappPhone,
            ...(dto.rules !== undefined
              ? { rules: dto.rules as unknown as Prisma.InputJsonValue }
              : {}),
            ...(dto.houseRules !== undefined ? { houseRules: dto.houseRules?.trim() || null } : {}),
            ...(dto.checkInTime !== undefined ? { checkInTime: dto.checkInTime } : {}),
            ...(dto.checkOutTime !== undefined ? { checkOutTime: dto.checkOutTime } : {}),
            ...(dto.logoUploadId !== undefined ? { logoUploadId: dto.logoUploadId } : {}),
            ...(dto.themePreset !== undefined ? { themePreset: dto.themePreset } : {}),
            ...(dto.brandColor !== undefined
              ? { brandColor: dto.brandColor ? dto.brandColor.toUpperCase() : null }
              : {}),
            ...(dto.termsText !== undefined ? { termsText: dto.termsText?.trim() || null } : {}),
            ...(dto.termsOfUseText !== undefined
              ? { termsOfUseText: dto.termsOfUseText?.trim() || null }
              : {}),
            ...(dto.privacyText !== undefined
              ? { privacyText: dto.privacyText?.trim() || null }
              : {}),
          },
        });

        await this.audit.record(
          {
            action: 'host_site.update',
            entity: 'host_site',
            entityId: row.id,
            before: this.auditView(before),
            after: this.auditView(row),
          },
          tx,
        );
        return row;
      });
      return this.viewWithPayments(updated);
    } catch (e) {
      if (violatesUnique(e, 'slug')) {
        throw AppError.conflict('That web address is already taken', 'SLUG_TAKEN');
      }
      throw e;
    }
  }

  async uploadLogo(file: { buffer: Buffer; size: number } | undefined) {
    const { orgId } = orgContext();
    await assertHostOrg(this.db, orgId);
    const before = await this.ensureSite(orgId);
    const uploaded = await this.uploads.create('SITE_LOGO', file);

    const updated = await this.db.$transaction(async (tx) => {
      await this.uploads.attach(tx, uploaded.id, 'SITE_LOGO', 'file');
      if (before.logoUploadId) {
        await tx.upload.updateMany({
          where: { id: before.logoUploadId },
          data: { attachedAt: null, createdAt: new Date(0) },
        });
      }
      const row = await tx.hostSite.update({
        where: { orgId },
        data: { logoUploadId: uploaded.id },
      });
      await this.audit.record(
        {
          action: 'host_site.logo',
          entity: 'host_site',
          entityId: row.id,
          before: { logoUploadId: before.logoUploadId },
          after: { logoUploadId: row.logoUploadId },
        },
        tx,
      );
      return row;
    });
    return this.viewWithPayments(updated);
  }
}
