import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { hashPassword } from '../src/modules/auth/crypto.js';
import { outbox } from '../src/modules/notifications/senders.js';

export const PASSWORD = 'Correct-horse-2026';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  http: () => TestAgent;
  close: () => Promise<void>;
}

export async function createTestApp(
  extraImports: unknown[] = [],
  customise: (b: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<TestApp> {
  const moduleRef = await customise(
    Test.createTestingModule({ imports: [AppModule, ...(extraImports as never[])] }),
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()), close: () => app.close() };
}

/** Empties every table (keeps migrations) and the in-memory message outbox. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
  outbox.length = 0;
}

export async function clearRateLimits(prisma: PrismaService): Promise<void> {
  await prisma.rateLimitBucket.deleteMany();
}

/** Latest 6-digit code sent by SMS or email to `to`. */
export function lastCode(to: string): string {
  for (let i = outbox.length - 1; i >= 0; i--) {
    const m = outbox[i]!;
    if (m.to === to) {
      const code = /\b(\d{6})\b/.exec(m.text)?.[1];
      if (code) return code;
    }
  }
  throw new Error(`No code sent to ${to}`);
}

/** Latest invitation token sent to `to`. */
export function lastInviteToken(to: string): string {
  for (let i = outbox.length - 1; i >= 0; i--) {
    const m = outbox[i]!;
    const token = m.to === to ? /\/invite\/([A-Za-z0-9_-]+)/.exec(m.text)?.[1] : undefined;
    if (token) return token;
  }
  throw new Error(`No invitation sent to ${to}`);
}

export async function createPlatformAdmin(prisma: PrismaService, email = 'admin@example.invalid') {
  return prisma.user.create({
    data: {
      email,
      phone: '+254700000099',
      firstName: 'Platform',
      lastName: 'Admin',
      isPlatformAdmin: true,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
}

export interface Session {
  token: string;
  refreshCookie: string | null;
  body: {
    activeOrganization: { id: string } | null;
    permissions: string[];
    user: { id: string };
    organizations: { id: string }[];
  };
}

export function refreshCookieFrom(res: request.Response): string | null {
  const set = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = set?.find((c) => c.startsWith('hodi_rt='));
  return cookie ? cookie.split(';')[0]! : null;
}

export async function login(t: TestApp, identifier: string, password = PASSWORD): Promise<Session> {
  const res = await t.http().post('/api/v1/auth/login').send({ identifier, password }).expect(200);
  return {
    token: res.body.data.accessToken,
    refreshCookie: refreshCookieFrom(res),
    body: res.body.data,
  };
}

export const auth = (s: Session | string) => ({
  Authorization: `Bearer ${typeof s === 'string' ? s : s.token}`,
});

/** Platform admin onboards an organisation; its owner accepts → owner session. */
export async function onboardOrg(
  t: TestApp,
  admin: Session,
  p: { name: string; ownerEmail: string; ownerPhone: string; kind?: 'LANDLORD' | 'AGENCY' },
) {
  const res = await t
    .http()
    .post('/api/v1/platform/organizations')
    .set(auth(admin))
    .send({
      name: p.name,
      kind: p.kind ?? 'LANDLORD',
      phone: '0711000000',
      email: `office+${p.ownerEmail}`,
      owner: { firstName: 'Olive', lastName: 'Owner', email: p.ownerEmail, phone: p.ownerPhone },
    })
    .expect(201);
  const orgId: string = res.body.data.id;
  const owner = await acceptInvite(t, p.ownerEmail);
  return { orgId, owner };
}

export async function acceptInvite(t: TestApp, to: string, password = PASSWORD): Promise<Session> {
  const res = await t
    .http()
    .post('/api/v1/auth/invitations/accept')
    .send({ token: lastInviteToken(to), password })
    .expect(200);
  return {
    token: res.body.data.accessToken,
    refreshCookie: refreshCookieFrom(res),
    body: res.body.data,
  };
}

export async function roleId(t: TestApp, s: Session, systemKey: string): Promise<string> {
  const res = await t.http().get('/api/v1/roles').set(auth(s)).expect(200);
  return res.body.data.find((r: { systemKey: string }) => r.systemKey === systemKey).id;
}

/** Owner invites someone with a system role; they accept and sign in. */
export async function addMember(
  t: TestApp,
  owner: Session,
  p: { email: string; phone?: string; role: 'MANAGER' | 'ACCOUNTANT' | 'CARETAKER' },
): Promise<Session & { userId: string }> {
  // Resolve before building the request: an await inside a pending supertest chain lets the
  // other request tear down the ephemeral server this one is bound to.
  const role = await roleId(t, owner, p.role);
  const res = await t
    .http()
    .post('/api/v1/users/invitations')
    .set(auth(owner))
    .send({ firstName: 'Mem', lastName: 'Ber', email: p.email, phone: p.phone, roleId: role })
    .expect(201);
  const session = await acceptInvite(t, p.email);
  return { ...session, userId: res.body.data.userId };
}

/** Completes a step-up for the session and returns the X-Step-Up header value. */
export async function stepUp(t: TestApp, s: Session, sendTo: string): Promise<string> {
  await t.http().post('/api/v1/auth/step-up/request').set(auth(s)).expect(202);
  const res = await t
    .http()
    .post('/api/v1/auth/step-up/verify')
    .set(auth(s))
    .send({ code: lastCode(sendTo) })
    .expect(200);
  return res.body.data.stepUpToken;
}
