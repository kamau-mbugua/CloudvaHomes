import { isOverdue } from './sla.js';

describe('maintenance SLA', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);

  it('is late after the priority’s hours, only while open', () => {
    expect(isOverdue({ priority: 'URGENT', status: 'OPEN', createdAt: ago(25) }, now)).toBe(true);
    expect(isOverdue({ priority: 'URGENT', status: 'OPEN', createdAt: ago(23) }, now)).toBe(false);
    expect(isOverdue({ priority: 'LOW', status: 'IN_PROGRESS', createdAt: ago(200) }, now)).toBe(
      false,
    );
    expect(isOverdue({ priority: 'LOW', status: 'IN_PROGRESS', createdAt: ago(400) }, now)).toBe(
      true,
    );
    expect(isOverdue({ priority: 'HIGH', status: 'RESOLVED', createdAt: ago(400) }, now)).toBe(
      false,
    );
  });
});
