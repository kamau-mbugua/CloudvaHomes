import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto, toSkipTake } from '../../common/http/pagination.js';
import { paginated } from '../../common/http/response.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { DB, type Db } from '../../prisma/prisma.module.js';
import { RequirePermission } from '../auth/decorators.js';

class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'membership' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T21:00:00.000Z',
    description: 'Inclusive ISO timestamp (clients send the start of the local day)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    example: '2026-10-31T20:59:59.999Z',
    description: 'Inclusive ISO timestamp (clients send the end of the local day)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  @RequirePermission('audit:view')
  async list(@Query() q: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: q.from } : {}),
              ...(q.to ? { lte: q.to } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
      this.db.auditLog.count({ where }),
    ]);
    // Resolve actor names in one query (users are global, not org-scoped).
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const actors = actorIds.length
      ? await this.db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const names = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
    return paginated(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        actor: r.actorId ? { id: r.actorId, name: names.get(r.actorId) ?? 'Unknown user' } : null,
        before: r.before,
        after: r.after,
        ip: r.ip,
        createdAt: r.createdAt,
      })),
      total,
      q,
    );
  }
}
