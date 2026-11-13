import { Inject, Injectable, Logger } from '@nestjs/common';
import { emptyContext, runWithContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext } from '../auth/decorators.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { allowedPropertyIds, propertyScope } from '../portfolio/property-scope.js';
import { broadcastRecipients, noticeSmsText, type Recipient } from './broadcast-rules.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CreateBroadcastDto } from './broadcasts.dto.js';
import { MessagesService } from './messages.service.js';
import { SmsService } from '../notifications/sms/sms.service.js';

const RATE_SECONDS = 60;
const STALE_MS = 2 * 60_000;

/**
 * Notices to the current tenants of chosen properties (phase 13): SMS to everyone, an
 * optional email copy, and an in-app notice with push for tenants who use the portal.
 * Sent in the background; a sweep finishes any broadcast a restart interrupted, skipping
 * tenants already messaged for it.
 */
@Injectable()
export class BroadcastsService {
  private readonly log = new Logger(BroadcastsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
    private readonly sms: SmsService,
  ) {}

  /** The properties, each visible to the caller (property-limited staff included). */
  private async properties(ids: string[]) {
    const unique = [...new Set(ids)];
    const found = await this.db.property.findMany({
      where: { AND: [{ id: { in: unique } }, propertyScope()] },
      select: { id: true },
    });
    if (found.length !== unique.length) throw AppError.notFound('Property');
    return unique;
  }

  private async recipients(propertyIds: string[]): Promise<Recipient[]> {
    const rows = await this.db.tenancy.findMany({
      where: { status: { in: ['ACTIVE', 'NOTICE'] }, unit: { propertyId: { in: propertyIds } } },
      orderBy: { tenant: { firstName: 'asc' } },
      select: {
        status: true,
        tenant: { select: { id: true, phone: true, email: true, userId: true, firstName: true } },
      },
    });
    return broadcastRecipients(
      rows.map((r) => ({
        tenantId: r.tenant.id,
        phone: r.tenant.phone,
        email: r.tenant.email,
        userId: r.tenant.userId,
        firstName: r.tenant.firstName,
        status: r.status,
      })),
    );
  }

  async preview(propertyIds: string[], text?: string) {
    const list = await this.recipients(await this.properties(propertyIds));
    const counts = {
      recipients: list.length,
      withEmail: list.filter((r) => r.email).length,
      withPortal: list.filter((r) => r.userId).length,
    };
    if (!text?.trim()) return counts;
    const orgId = orgContext().orgId;
    const sms = noticeSmsText(await this.orgName(orgId), text);
    return { ...counts, sms, ...(await this.sms.bulkUnits(orgId, sms, list.length)) };
  }

  private async orgName(orgId: string): Promise<string> {
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true },
    });
    return org.name;
  }

  async create(dto: CreateBroadcastDto) {
    const ctx = orgContext();
    const propertyIds = await this.properties(dto.propertyIds);
    const last = await this.db.broadcast.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const since = last ? (Date.now() - last.createdAt.getTime()) / 1000 : Infinity;
    if (since < RATE_SECONDS) throw AppError.rateLimited(Math.ceil(RATE_SECONDS - since));
    const recipients = (await this.recipients(propertyIds)).length;
    const sms = noticeSmsText(await this.orgName(ctx.orgId), dto.text);
    await this.sms.bulkUnits(ctx.orgId, sms, recipients, true);
    const row = await this.db.$transaction(async (tx) => {
      const b = await tx.broadcast.create({
        data: {
          orgId: ctx.orgId,
          propertyIds,
          text: dto.text.trim(),
          alsoEmail: dto.alsoEmail ?? false,
          recipients,
          createdById: ctx.userId!,
        },
      });
      await this.audit.record(
        {
          action: 'broadcast.create',
          entity: 'broadcast',
          entityId: b.id,
          before: null,
          after: { propertyIds, recipients, alsoEmail: b.alsoEmail, text: b.text },
        },
        tx,
      );
      return b;
    });
    const orgId = ctx.orgId;
    setImmediate(() => {
      runWithContext(emptyContext({ orgId }), () => this.process(row.id)).catch((err: unknown) =>
        this.log.error({ err, broadcastId: row.id }, 'Broadcast failed'),
      );
    });
    return row;
  }

  /** Sends a broadcast once (a claim stops two workers sending it twice). */
  async process(id: string): Promise<void> {
    const { count } = await this.db.broadcast.updateMany({
      where: {
        id,
        OR: [
          { status: 'QUEUED' },
          { status: 'SENDING', startedAt: { lt: new Date(Date.now() - STALE_MS) } },
        ],
      },
      data: { status: 'SENDING', startedAt: new Date() },
    });
    if (!count) return;
    const b = await this.db.broadcast.findUniqueOrThrow({ where: { id } });
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: b.orgId },
      select: { name: true },
    });
    const done = new Set(
      (
        await this.db.message.findMany({ where: { broadcastId: id }, select: { tenantId: true } })
      ).map((m) => m.tenantId),
    );
    const subject = `Notice from ${org.name}`;
    for (const r of await this.recipients(b.propertyIds)) {
      if (done.has(r.tenantId)) continue;
      await this.messages.sms({
        orgId: b.orgId,
        tenantId: r.tenantId,
        kind: 'BROADCAST',
        to: r.phone,
        text: noticeSmsText(org.name, b.text),
        broadcastId: id,
      });
      if (b.alsoEmail && r.email) {
        try {
          await this.notifications.sendRawEmail({
            to: r.email,
            subject,
            text: b.text,
            kind: 'broadcast',
          });
          await this.db.broadcast.update({ where: { id }, data: { emailed: { increment: 1 } } });
        } catch (err) {
          this.log.warn({ err, broadcastId: id, tenantId: r.tenantId }, 'Broadcast email failed');
        }
      }
      if (r.userId) {
        try {
          await this.notifications.notifyUser({
            userId: r.userId,
            orgId: b.orgId,
            tenantId: r.tenantId,
            kind: 'BROADCAST',
            title: subject,
            body: b.text,
            actionUrl: '/tenant',
          });
          await this.db.broadcast.update({ where: { id }, data: { notified: { increment: 1 } } });
        } catch (err) {
          this.log.warn({ err, broadcastId: id, tenantId: r.tenantId }, 'Broadcast notice failed');
        }
      }
    }
    const [sent, failed] = await Promise.all([
      this.db.message.count({ where: { broadcastId: id, status: 'SENT' } }),
      this.db.message.count({ where: { broadcastId: id, status: 'FAILED' } }),
    ]);
    await this.db.broadcast.update({
      where: { id },
      data: { status: 'DONE', sent, failed, finishedAt: new Date() },
    });
  }

  /** Every minute: finish broadcasts that were interrupted (any organisation). */
  async sweep() {
    const stuck = await this.prisma.broadcast.findMany({
      where: {
        status: { in: ['QUEUED', 'SENDING'] },
        createdAt: { lt: new Date(Date.now() - STALE_MS) },
      },
      select: { id: true, orgId: true },
    });
    for (const b of stuck) {
      await runWithContext(emptyContext({ orgId: b.orgId }), () => this.process(b.id)).catch(
        (err: unknown) => this.log.error({ err, broadcastId: b.id }, 'Broadcast sweep failed'),
      );
    }
    return { resumed: stuck.length };
  }

  /**
   * Staff limited to some properties see a broadcast only when every property it went to is
   * one of theirs — otherwise its message list would show other properties' tenants.
   */
  private async visible(): Promise<Prisma.BroadcastWhereInput> {
    const allowed = allowedPropertyIds();
    if (!allowed) return {};
    const others = await this.db.property.findMany({
      where: { id: { notIn: [...allowed] } },
      select: { id: true },
    });
    return others.length ? { NOT: { propertyIds: { hasSome: others.map((p) => p.id) } } } : {};
  }

  async list(q: { page: number; pageSize: number }) {
    const where = await this.visible();
    const [rows, total] = await Promise.all([
      this.db.broadcast.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
      this.db.broadcast.count({ where }),
    ]);
    return paginated(rows, total, q);
  }

  async get(id: string) {
    const b = await this.db.broadcast.findFirst({ where: { AND: [{ id }, await this.visible()] } });
    if (!b) throw AppError.notFound('Broadcast');
    const messages = await this.db.message.findMany({
      where: { broadcastId: id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tenantId: true, to: true, status: true, error: true, createdAt: true },
    });
    return { ...b, messages };
  }
}
