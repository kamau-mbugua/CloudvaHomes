import { Global, Module } from '@nestjs/common';
import { orgScopeExtension } from './org-scope.extension.js';
import { PrismaService } from './prisma.service.js';

/** Org-scoped database client. Use this (`@Inject(DB) db: Db`) in all feature code. */
export const DB = Symbol('DB');

export function createDb(prisma: PrismaService) {
  return prisma.$extends(orgScopeExtension);
}
export type Db = ReturnType<typeof createDb>;
/** Interactive-transaction client of `Db` (same scoping applies). */
export type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

@Global()
@Module({
  providers: [PrismaService, { provide: DB, inject: [PrismaService], useFactory: createDb }],
  exports: [PrismaService, DB],
})
export class PrismaModule {}
