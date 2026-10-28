import { Prisma } from '../generated/prisma/client.js';

/**
 * Whether `e` is a unique-constraint violation involving `column` (or the hand-written index
 * named `column`). Use it to turn races that slip past a pre-check into a 409.
 *
 * With the pg driver adapter Prisma reports only the index name (e.g.
 * "units_propertyId_number_key"), so columns are matched against Prisma's default index
 * naming, `<table>_<col>_<col>_key`, as well as against `meta.target` when present.
 */
export function violatesUnique(e: unknown, column: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  const meta = (e.meta ?? {}) as {
    target?: string | string[];
    driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } };
  };
  const constraint = meta.driverAdapterError?.cause?.constraint;
  const fields = [
    ...(constraint?.fields ?? []).map((f) => f.replace(/"/g, '')),
    ...(Array.isArray(meta.target) ? meta.target : meta.target ? [meta.target] : []),
  ];
  if (fields.includes(column)) return true;
  const index = constraint?.index;
  return !!index && (index === column || index.includes(`_${column}_`));
}
