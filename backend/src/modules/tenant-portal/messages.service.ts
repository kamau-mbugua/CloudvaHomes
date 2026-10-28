import { Inject, Injectable, Logger } from '@nestjs/common';
import { currentContext } from '../../common/context/request-context.js';
import { parseDateOnly } from '../../common/dates/date-only.js';
import { toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { MessageKind, Prisma } from '../../generated/prisma/client.js';
import { violatesUnique } from '../../prisma/errors.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { todayInNairobi } from '../billing/billing-math.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { tenantScope } from '../portfolio/property-scope.js';
import type { ListMessagesQueryDto } from './tenant-portal.dto.js';

/**
 * Sends SMS to tenants and keeps a log of every one. The log row is written first, so an
 * automatic reminder that already exists for the day (unique index) is never sent twice.
 */
@Injectable()
export class MessagesService {
  private readonly log = new Logger(MessagesService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notifications: NotificationsService,
  ) {}

  /** Returns the message, or null when this automatic reminder was already sent today. */
  async sms(p: { orgId: string; tenantId: string; kind: MessageKind; to: string; text: string }) {
    let row;
    try {
      row = await this.db.message.create({
        data: {
          orgId: p.orgId,
          tenantId: p.tenantId,
          kind: p.kind,
          channel: 'SMS',
          to: p.to,
          text: p.text,
          status: 'SENT',
          day: parseDateOnly(todayInNairobi()),
          createdById: currentContext()?.userId ?? null,
        },
      });
    } catch (e) {
      if (violatesUnique(e, 'messages_one_reminder_per_day')) return null;
      throw e;
    }
    try {
      await this.notifications.sendSms(p.to, p.text);
      return row;
    } catch (e) {
      this.log.warn({ err: e, messageId: row.id }, 'SMS to a tenant failed');
      return this.db.message.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          error: e instanceof Error ? e.message.slice(0, 300) : 'Send failed',
        },
      });
    }
  }

  async list(q: ListMessagesQueryDto) {
    const where: Prisma.MessageWhereInput = {
      AND: [
        q.tenantId ? { tenantId: q.tenantId } : {},
        q.kind ? { kind: q.kind } : {},
        q.status ? { status: q.status } : {},
        q.from ? { day: { gte: parseDateOnly(q.from) } } : {},
        q.to ? { day: { lte: parseDateOnly(q.to) } } : {},
      ],
    };
    // Messages have no tenant relation: limit property-restricted staff through their tenants.
    const visible = await this.db.tenant.findMany({ where: tenantScope(), select: { id: true } });
    const ids = new Set(visible.map((t) => t.id));
    const scoped: Prisma.MessageWhereInput = {
      AND: [where, { OR: [{ tenantId: { in: [...ids] } }, { tenantId: null }] }],
    };
    const [rows, total] = await Promise.all([
      this.db.message.findMany({ where: scoped, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
      this.db.message.count({ where: scoped }),
    ]);
    return paginated(
      rows.map((m) => ({
        id: m.id,
        tenantId: m.tenantId,
        kind: m.kind,
        channel: m.channel,
        to: m.to,
        text: m.text,
        status: m.status,
        error: m.error,
        automatic: m.createdById === null,
        createdAt: m.createdAt,
      })),
      total,
      q,
    );
  }
}
