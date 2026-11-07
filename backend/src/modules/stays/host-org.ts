import { AppError } from '../../common/errors/app-error.js';
import type { Db, Tx } from '../../prisma/prisma.module.js';
import { orgContext } from '../auth/decorators.js';

export async function isHostOrg(db: Db | Tx, orgId: string): Promise<boolean> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { kind: true },
  });
  return org?.kind === 'HOST';
}

export async function assertHostOrg(db: Db | Tx, orgId = orgContext().orgId): Promise<void> {
  if (!(await isHostOrg(db, orgId))) {
    throw AppError.conflict('This is for short-stay hosts only', 'HOST_ONLY');
  }
}
