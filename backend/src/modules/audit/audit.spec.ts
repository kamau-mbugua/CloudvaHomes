import { windowStartFor } from '../../common/rate-limit/rate-limit.service.js';
import { redact } from './audit.service.js';

describe('audit redact', () => {
  it('hides secrets and personal identifiers at any depth', () => {
    expect(
      redact({
        name: 'Jane',
        passwordHash: 'argon2…',
        nested: [{ idNumber: '12345678', tokenHash: 'abc', ok: true }],
      }),
    ).toEqual({
      name: 'Jane',
      passwordHash: '[redacted]',
      nested: [{ idNumber: '[redacted]', tokenHash: '[redacted]', ok: true }],
    });
  });

  it('makes BigInt and Date JSON-safe', () => {
    expect(redact({ amount: 150000n, at: new Date('2026-10-27T10:00:00Z') })).toEqual({
      amount: '150000',
      at: '2026-10-27T10:00:00.000Z',
    });
    expect(redact(undefined)).toBeNull();
  });
});

describe('rate limit windows', () => {
  it('aligns fixed windows to the epoch', () => {
    const at = new Date('2026-10-27T10:07:30Z');
    expect(windowStartFor(at, 15 * 60).toISOString()).toBe('2026-10-27T10:00:00.000Z');
    expect(windowStartFor(at, 3600).toISOString()).toBe('2026-10-27T10:00:00.000Z');
    expect(windowStartFor(new Date('2026-10-27T10:15:00Z'), 15 * 60).toISOString()).toBe(
      '2026-10-27T10:15:00.000Z',
    );
  });
});
