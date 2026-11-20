import { describe, expect, it } from 'vitest';
import { rankOrgs } from './sms-logs.service.js';

const org = (orgId: string, sent: number, failed = 0, noUnits = 0, logged = 0) => ({
  orgId,
  sent,
  failed,
  noUnits,
  logged,
});
const ids = (rows: { orgId: string }[]) => rows.map((r) => r.orgId);

describe('SMS dashboard: organisations by volume', () => {
  it('puts the busiest first, counting every message', () => {
    expect(ids(rankOrgs([org('a', 1), org('b', 0, 3), org('c', 2)]))).toEqual(['b', 'c', 'a']);
  });

  it('breaks a tie by messages that got through, whatever order the rows arrive in', () => {
    const sentBoth = org('org-1', 2);
    const sentNone = org('org-2', 0, 0, 1, 1);
    expect(rankOrgs([sentNone, sentBoth])).toEqual([sentBoth, sentNone]);
    expect(rankOrgs([sentBoth, sentNone])).toEqual([sentBoth, sentNone]);
  });

  it('then puts the older organisation first, and leaves its input as it was', () => {
    const rows = [org('org-2', 1), org('org-1', 1)];
    expect(ids(rankOrgs(rows))).toEqual(['org-1', 'org-2']);
    expect(ids(rows)).toEqual(['org-2', 'org-1']);
  });
});
