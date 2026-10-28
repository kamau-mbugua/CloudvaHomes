import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request identity, available anywhere in the call stack (services, the Prisma org-scope
 * extension, the audit log) without threading it through every function signature.
 * Filled in two steps: the middleware creates it, the auth guard adds who is calling.
 */
export interface RequestContext {
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  userId: string | null;
  /** Organisation the caller is acting in. Every org-scoped query is filtered by it. */
  orgId: string | null;
  /** Its account status (phase 8): SUSPENDED makes staff access read-only. */
  orgStatus: string | null;
  /** Refresh-token family of the caller's session. */
  sessionId: string | null;
  isPlatformAdmin: boolean;
  isOwner: boolean;
  permissions: ReadonlySet<string>;
  /**
   * Properties the caller is limited to in the active organisation; null = all of them.
   * Enforced by the portfolio services (src/modules/portfolio/property-scope.ts).
   */
  propertyIds: readonly string[] | null;
  /** Set when the request carried a valid `X-Step-Up` token for this session. */
  stepUpVerified: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function emptyContext(partial: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: null,
    ip: null,
    userAgent: null,
    userId: null,
    orgId: null,
    orgStatus: null,
    sessionId: null,
    isPlatformAdmin: false,
    isOwner: false,
    permissions: new Set(),
    propertyIds: null,
    stepUpVerified: false,
    ...partial,
  };
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The current request's context, or null outside a request (scripts, jobs, tests). */
export function currentContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

/**
 * Runs `fn` with org scoping switched off — for the few flows that legitimately cross
 * organisations (sign-in, platform admin). Keep these rare and obvious.
 */
export function withoutOrgScope<T>(fn: () => T): T {
  const ctx = currentContext();
  return storage.run({ ...(ctx ?? emptyContext()), orgId: null }, fn);
}
