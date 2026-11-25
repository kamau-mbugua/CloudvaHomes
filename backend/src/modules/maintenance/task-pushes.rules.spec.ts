import { describe, expect, it } from 'vitest';
import { SLA_HOURS } from './sla.js';
import {
  becameLateInLast24h,
  canReceive,
  formatPeriodLabel,
  isFirstOfMonth,
  nairobiDay,
  periodFromDay,
  type PushMembership,
} from './task-pushes.rules.js';

function member(overrides: Partial<PushMembership> = {}): PushMembership {
  return {
    status: 'ACTIVE',
    propertyIds: [],
    role: { systemKey: 'CARETAKER', permissions: ['meters:create', 'maintenance:update'] },
    ...overrides,
  };
}

describe('canReceive', () => {
  it('allows an active Owner even with an empty permission list or propertyIds', () => {
    const owner = member({
      propertyIds: ['other-prop'],
      role: { systemKey: 'OWNER', permissions: [] },
    });
    expect(canReceive(owner, 'meters:create', 'prop-a')).toBe(true);
    expect(canReceive(owner, 'maintenance:update', 'prop-a')).toBe(true);
  });

  it('rejects a role without the required permission', () => {
    const accountant = member({
      role: { systemKey: 'ACCOUNTANT', permissions: ['payments:view', 'invoices:view'] },
    });
    expect(canReceive(accountant, 'meters:create', 'prop-a')).toBe(false);
  });

  it('rejects a member limited to another property and allows a matching property', () => {
    const limited = member({ propertyIds: ['prop-b'] });
    expect(canReceive(limited, 'meters:create', 'prop-a')).toBe(false);
    expect(canReceive(limited, 'meters:create', 'prop-b')).toBe(true);
  });

  it('allows a member with empty propertyIds (all properties)', () => {
    const allProps = member({ propertyIds: [] });
    expect(canReceive(allProps, 'meters:create', 'prop-a')).toBe(true);
    expect(canReceive(allProps, 'meters:create', 'prop-z')).toBe(true);
  });

  it('rejects INVITED and INACTIVE memberships', () => {
    const ownerRole = { systemKey: 'OWNER', permissions: [] as string[] };
    expect(canReceive(member({ status: 'INVITED', role: ownerRole }), 'meters:create', 'p1')).toBe(
      false,
    );
    expect(canReceive(member({ status: 'INACTIVE', role: ownerRole }), 'meters:create', 'p1')).toBe(
      false,
    );
  });
});

describe('task push dates and late window', () => {
  it('detects the 1st vs the 2nd in Nairobi, including 23:30 UTC on the last day of the month', () => {
    // 2026-11-30 23:30 UTC == 2026-12-01 02:30 EAT (Africa/Nairobi, UTC+3)
    const nov30LateUtc = new Date('2026-11-30T23:30:00.000Z');
    expect(nairobiDay(nov30LateUtc)).toBe('2026-12-01');
    expect(isFirstOfMonth(nov30LateUtc)).toBe(true);
    expect(isFirstOfMonth('2026-12-01')).toBe(true);
    expect(periodFromDay('2026-12-01')).toBe('2026-12');

    // 2026-12-01 21:30 UTC == 2026-12-02 00:30 EAT
    const dec1LateUtc = new Date('2026-12-01T21:30:00.000Z');
    expect(nairobiDay(dec1LateUtc)).toBe('2026-12-02');
    expect(isFirstOfMonth(dec1LateUtc)).toBe(false);
    expect(isFirstOfMonth('2026-12-02')).toBe(false);
  });

  it('formats period labels like "December 2026"', () => {
    expect(formatPeriodLabel('2026-12')).toBe('December 2026');
    expect(formatPeriodLabel('2027-01')).toBe('January 2027');
  });

  it('keeps only open requests that became late within the last 24 hours', () => {
    const now = new Date('2026-12-10T12:00:00.000Z');
    const urgentSlaMs = SLA_HOURS.URGENT * 3_600_000;

    // Became late 1 h ago (created SLA + 1 h ago) -> in
    expect(
      becameLateInLast24h(
        {
          priority: 'URGENT',
          status: 'OPEN',
          createdAt: new Date(now.getTime() - urgentSlaMs - 1 * 3_600_000),
        },
        now,
      ),
    ).toBe(true);

    // Became late 25 h ago (created SLA + 25 h ago) -> out
    expect(
      becameLateInLast24h(
        {
          priority: 'URGENT',
          status: 'IN_PROGRESS',
          createdAt: new Date(now.getTime() - urgentSlaMs - 25 * 3_600_000),
        },
        now,
      ),
    ).toBe(false);

    // Not late yet (created SLA - 1 h ago, or exactly SLA ago) -> out
    expect(
      becameLateInLast24h(
        {
          priority: 'URGENT',
          status: 'OPEN',
          createdAt: new Date(now.getTime() - urgentSlaMs + 1 * 3_600_000),
        },
        now,
      ),
    ).toBe(false);
    expect(
      becameLateInLast24h(
        {
          priority: 'URGENT',
          status: 'OPEN',
          createdAt: new Date(now.getTime() - urgentSlaMs),
        },
        now,
      ),
    ).toBe(false);

    // Closed (RESOLVED / CANCELLED) -> out even if timestamps match
    expect(
      becameLateInLast24h(
        {
          priority: 'URGENT',
          status: 'RESOLVED',
          createdAt: new Date(now.getTime() - urgentSlaMs - 1 * 3_600_000),
        },
        now,
      ),
    ).toBe(false);
  });
});
