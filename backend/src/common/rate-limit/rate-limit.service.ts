import { Injectable } from '@nestjs/common';
import { AppError } from '../errors/app-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface RateLimitRule {
  /** Bucket name + subject, e.g. `login:id:+254712345678`. Never include secrets. */
  key: string;
  limit: number;
  windowSeconds: number;
}

/** Window start for fixed windows aligned to the epoch (pure; exported for tests). */
export function windowStartFor(now: Date, windowSeconds: number): Date {
  const size = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / size) * size);
}

/**
 * Fixed-window counters in Postgres (no Redis at launch, design §4.1). One atomic upsert per
 * hit. Good enough for abuse protection on sign-in endpoints; not a precise traffic shaper.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /** Counts a hit against every rule; throws 429 RATE_LIMITED if any is exceeded. */
  async hit(...rules: RateLimitRule[]): Promise<void> {
    const now = new Date();
    for (const rule of rules) {
      const windowStart = windowStartFor(now, rule.windowSeconds);
      const expiresAt = new Date(windowStart.getTime() + rule.windowSeconds * 1000);
      const rows = await this.prisma.$queryRaw<{ count: number }[]>`
        INSERT INTO rate_limit_buckets ("key", "windowStart", "count", "expiresAt")
        VALUES (${rule.key}, ${windowStart}, 1, ${expiresAt})
        ON CONFLICT ("key", "windowStart")
        DO UPDATE SET "count" = rate_limit_buckets."count" + 1
        RETURNING "count"`;
      if ((rows[0]?.count ?? 0) > rule.limit) {
        const retryAfter = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
        throw AppError.rateLimited(retryAfter);
      }
    }
    // Opportunistic cleanup instead of a scheduled job.
    if (Math.random() < 0.01) {
      await this.prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
    }
  }

  /** Clears a subject's counters, e.g. after a successful sign-in. */
  async reset(keyPrefix: string): Promise<void> {
    await this.prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: keyPrefix } } });
  }
}
