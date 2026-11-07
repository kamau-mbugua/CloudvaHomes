import { BLOCKING, canMove } from './status.js';

describe('stays booking status rules', () => {
  it('lists the four blocking statuses', () => {
    expect(BLOCKING).toEqual(['HELD', 'REQUESTED', 'CONFIRMED', 'CHECKED_IN']);
  });

  it('does not let a completed stay be cancelled', () =>
    expect(canMove('COMPLETED', 'CANCELLED')).toBe(false));

  it('lets a request be accepted into a hold', () =>
    expect(canMove('REQUESTED', 'HELD')).toBe(true));
});
