/**
 * Creates (or promotes) a platform admin — the bootstrap for a new environment.
 *
 *   HODI_ADMIN_PASSWORD='…' npm run cli:create-platform-admin -- \
 *     --email you@example.com --phone 0712345678 --first Jane --last Doe
 *
 * The password comes from the environment so it never lands in shell history. Run it locally
 * against a database, or as a one-off Cloud Run job in an environment.
 */
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../modules/auth/crypto.js';
import { normalizeEmail, normalizePhone, passwordProblem } from '../modules/auth/identifiers.js';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile();
  } catch {
    // no .env
  }
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    phone: { type: 'string' },
    first: { type: 'string' },
    last: { type: 'string' },
  },
});

const email = values.email ? normalizeEmail(values.email) : null;
const phone = values.phone ? normalizePhone(values.phone) : null;
if (values.email && !email) fail('--email is not a valid email address');
if (values.phone && !phone) fail('--phone is not a valid phone number');
if (!email && !phone) fail('Give --email and/or --phone');

const password = process.env.HODI_ADMIN_PASSWORD ?? '';
const problem = passwordProblem(password, [email, phone]);
if (problem) fail(`HODI_ADMIN_PASSWORD: ${problem}`);
if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const existing = await prisma.user.findFirst({
    where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
  });
  const passwordHash = await hashPassword(password);
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { isPlatformAdmin: true, passwordHash, status: 'ACTIVE' },
      })
    : await prisma.user.create({
        data: {
          email,
          phone,
          firstName: values.first ?? 'Platform',
          lastName: values.last ?? 'Admin',
          passwordHash,
          isPlatformAdmin: true,
        },
      });
  await prisma.auditLog.create({
    data: {
      action: existing ? 'platform.admin_promote' : 'platform.admin_create',
      entity: 'user',
      entityId: user.id,
      after: { email: user.email, phone: user.phone, via: 'cli' },
    },
  });
  console.log(
    `✓ Platform admin ${existing ? 'updated' : 'created'}: ${user.email ?? user.phone} (${user.id})`,
  );
} finally {
  await prisma.$disconnect();
}
