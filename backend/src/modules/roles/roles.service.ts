import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { DB, type Db, type Tx } from '../../prisma/prisma.module.js';
import type { Role } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { orgContext, requireStepUp } from '../auth/decorators.js';
import {
  ALL_PERMISSIONS,
  isKnownPermission,
  SYSTEM_ROLE_DEFAULTS,
  type SystemRole,
} from './permissions.js';
import type { CreateRoleDto, UpdateRoleDto } from './roles.dto.js';

function toRole(r: Role & { _count?: { memberships: number } }) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.systemKey !== null,
    systemKey: r.systemKey,
    // The Owner role always means "everything", including permissions added in later releases.
    permissions: r.systemKey === 'OWNER' ? [...ALL_PERMISSIONS] : r.permissions,
    memberCount: r._count?.memberships ?? 0,
    updatedAt: r.updatedAt,
  };
}

function cleanPermissions(list: string[]): string[] {
  const unknown = list.filter((p) => !isKnownPermission(p));
  if (unknown.length) {
    throw AppError.fieldInvalid('permissions', `Unknown permissions: ${unknown.join(', ')}`);
  }
  return [...new Set(list)].sort();
}

@Injectable()
export class RolesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** Creates the four system roles for a new organisation (inside its creation transaction). */
  static async seedSystemRoles(tx: Tx, orgId: string): Promise<Record<SystemRole, string>> {
    const ids = {} as Record<SystemRole, string>;
    for (const [key, def] of Object.entries(SYSTEM_ROLE_DEFAULTS) as [
      SystemRole,
      (typeof SYSTEM_ROLE_DEFAULTS)[SystemRole],
    ][]) {
      const role = await tx.role.create({
        data: {
          orgId,
          systemKey: key,
          name: def.name,
          description: def.description,
          permissions: key === 'OWNER' ? [] : [...def.permissions].sort(),
        },
      });
      ids[key] = role.id;
    }
    return ids;
  }

  async list() {
    const roles = await this.db.role.findMany({
      include: { _count: { select: { memberships: true } } },
      orderBy: [{ systemKey: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    });
    return roles.map(toRole);
  }

  async get(id: string) {
    const role = await this.db.role.findUnique({
      where: { id },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw AppError.notFound('Role');
    return toRole(role);
  }

  async create(dto: CreateRoleDto) {
    const permissions = cleanPermissions(dto.permissions);
    return this.db.$transaction(async (tx) => {
      await this.assertNameFree(tx, dto.name);
      const role = await tx.role.create({
        data: {
          orgId: orgContext().orgId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          permissions,
        },
      });
      await this.audit.record(
        { action: 'role.create', entity: 'role', entityId: role.id, after: toRole(role) },
        tx,
      );
      return toRole(role);
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.db.role.findUnique({ where: { id } });
    if (!role) throw AppError.notFound('Role');
    if (role.systemKey === 'OWNER') {
      throw AppError.forbidden(
        'ROLE_IMMUTABLE',
        'The Owner role always has full access and cannot be changed',
      );
    }
    if (role.systemKey && dto.name !== undefined && dto.name.trim() !== role.name) {
      throw AppError.forbidden(
        'ROLE_IMMUTABLE',
        'Built-in roles keep their names; create a new role instead',
      );
    }
    const permissions = dto.permissions ? cleanPermissions(dto.permissions) : undefined;
    const permsChanged =
      permissions !== undefined && permissions.join() !== [...role.permissions].sort().join();
    // Changing what a role can do changes it for everyone holding it — confirm it's really you.
    if (permsChanged) requireStepUp();

    return this.db.$transaction(async (tx) => {
      if (dto.name !== undefined && dto.name.trim() !== role.name)
        await this.assertNameFree(tx, dto.name);
      const updated = await tx.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(permsChanged ? { permissions } : {}),
        },
        include: { _count: { select: { memberships: true } } },
      });
      await this.audit.record(
        {
          action: 'role.update',
          entity: 'role',
          entityId: id,
          before: toRole(role),
          after: toRole(updated),
        },
        tx,
      );
      return toRole(updated);
    });
  }

  async remove(id: string) {
    const role = await this.db.role.findUnique({
      where: { id },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw AppError.notFound('Role');
    if (role.systemKey)
      throw AppError.forbidden('ROLE_IMMUTABLE', "Built-in roles can't be deleted");
    if (role._count.memberships > 0) {
      throw AppError.conflict(
        `${role._count.memberships} member(s) still have this role. Move them to another role first.`,
        'ROLE_IN_USE',
      );
    }
    await this.db.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.record(
        { action: 'role.delete', entity: 'role', entityId: id, before: toRole(role) },
        tx,
      );
    });
  }

  private async assertNameFree(tx: Tx, name: string) {
    const clash = await tx.role.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (clash) throw AppError.conflict('A role with that name already exists', 'NAME_TAKEN');
  }
}
