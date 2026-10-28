import { resolveRequestId } from './logger.options.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a well-formed caller id', () => {
    expect(resolveRequestId('abc-123_x.y:z')).toBe('abc-123_x.y:z');
    expect(resolveRequestId(['first', 'second'])).toBe('first');
  });

  it('mints a UUID when the header is missing or unsafe', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID);
    expect(resolveRequestId('')).toMatch(UUID);
    expect(resolveRequestId('bad id with spaces')).toMatch(UUID);
    expect(resolveRequestId('x'.repeat(129))).toMatch(UUID);
    expect(resolveRequestId('<script>')).toMatch(UUID);
  });
});
