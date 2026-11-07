import { normalizeSlug, RESERVED_SLUGS, slugProblem } from './slug.js';

describe('stays slug rules', () => {
  it.each([
    ['ab', false],
    ['my-bnb', true],
    ['-bnb', false],
    ['app', false],
    ['Cozy Stays', false],
    ['cozy123', true],
  ])('%s ok=%s', (s, ok) => expect(slugProblem(s) === null).toBe(ok));

  it('explains why a slug is invalid', () => {
    expect(slugProblem('ab')).toBe('Use 3–30 letters, numbers or hyphens');
    expect(slugProblem('-bnb')).toBe("Can't start or end with a hyphen");
    expect(slugProblem('bnb-')).toBe("Can't start or end with a hyphen");
    expect(slugProblem('app')).toBe('That name is reserved');
  });

  it('normalizes raw slugs by trimming and lower-casing', () => {
    expect(normalizeSlug('  Cozy-Stays  ')).toBe('cozy-stays');
    expect(RESERVED_SLUGS.has('www')).toBe(true);
    expect(RESERVED_SLUGS.has('docs')).toBe(true);
  });
});
