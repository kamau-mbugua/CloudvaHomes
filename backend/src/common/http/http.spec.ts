import { bigintJsonReplacer } from './json-replacer.js';
import { pageMeta, toSkipTake } from './pagination.js';
import { ok, paginated } from './response.js';

describe('pagination', () => {
  it('converts 1-based pages to skip/take', () => {
    expect(toSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 });
  });

  it('computes page counts, including empty results', () => {
    expect(pageMeta(0, { page: 1, pageSize: 20 })).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      pages: 0,
    });
    expect(pageMeta(41, { page: 2, pageSize: 20 }).pages).toBe(3);
    expect(pageMeta(40, { page: 2, pageSize: 20 }).pages).toBe(2);
  });
});

describe('response envelopes', () => {
  it('wraps single resources and pages', () => {
    expect(ok({ id: 'u1' })).toEqual({ data: { id: 'u1' } });
    expect(paginated(['a'], 1, { page: 1, pageSize: 10 })).toEqual({
      data: ['a'],
      meta: { page: 1, pageSize: 10, total: 1, pages: 1 },
    });
  });
});

describe('bigintJsonReplacer', () => {
  const stringify = (v: unknown) => JSON.stringify(v, bigintJsonReplacer);

  it('serialises BigInt money as JSON integers', () => {
    expect(stringify({ amount: 150_000n, nested: [{ total: -25n }] })).toBe(
      '{"amount":150000,"nested":[{"total":-25}]}',
    );
  });

  it('refuses values clients cannot represent exactly', () => {
    expect(() => stringify({ amount: BigInt(Number.MAX_SAFE_INTEGER) + 1n })).toThrow(RangeError);
  });
});
