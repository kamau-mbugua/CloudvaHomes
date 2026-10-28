import { Injectable } from '@nestjs/common';
import {
  currentContext,
  emptyContext,
  runWithContext,
} from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authContext } from '../auth/decorators.js';

/**
 * The owner portal (read-only). A signed-in user linked to a landlord (`Landlord.userId`) sees
 * that landlord's figures. Each call runs as the landlord's organisation, limited to the
 * landlord's properties, with view-only permissions — never as staff.
 */
@Injectable()
export class OwnerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Users are global, landlords belong to organisations: look them up unscoped, by user. */
  async mine() {
    const { userId } = authContext();
    const rows = await this.prisma.landlord.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        organization: { kind: 'AGENCY', status: { not: 'CLOSED' } },
      },
      select: {
        id: true,
        code: true,
        name: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      landlordId: r.id,
      code: r.code,
      name: r.name,
      organization: r.organization,
    }));
  }

  /** Runs `fn` as the landlord's agency, limited to their properties; 404 if not mine. */
  async as<T>(landlordId: string, fn: () => Promise<T>): Promise<T> {
    const { userId, sessionId } = authContext();
    const l = await this.prisma.landlord.findFirst({
      where: {
        id: landlordId,
        userId,
        status: 'ACTIVE',
        organization: { kind: 'AGENCY', status: { not: 'CLOSED' } },
      },
      select: { orgId: true, properties: { select: { id: true } } },
    });
    if (!l) throw AppError.notFound('Landlord');
    const ids = l.properties.map((p) => p.id);
    const ctx = currentContext();
    return runWithContext(
      {
        ...emptyContext({ requestId: ctx?.requestId ?? null, ip: ctx?.ip ?? null }),
        userId,
        sessionId,
        orgId: l.orgId,
        propertyIds: ids.length ? ids : ['00000000-0000-0000-0000-000000000000'],
        permissions: new Set(['landlords:view', 'reports:view']),
      },
      fn,
    );
  }
}
