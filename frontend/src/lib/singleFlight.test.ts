import { describe, expect, it, vi } from 'vitest';
import { singleFlight } from './singleFlight';

describe('singleFlight', () => {
  it('shares one call between concurrent callers', async () => {
    let release!: (value: number) => void;
    const fn = vi.fn(() => new Promise<number>((resolve) => { release = resolve; }));
    const shared = singleFlight(fn);

    const a = shared();
    const b = shared();
    await Promise.resolve();
    release(7);

    await expect(Promise.all([a, b])).resolves.toEqual([7, 7]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('starts a new call once the previous one settled', async () => {
    let n = 0;
    const shared = singleFlight(async () => (n += 1));
    await expect(shared()).resolves.toBe(1);
    await expect(shared()).resolves.toBe(2);
  });

  it('shares a rejection, then allows a fresh attempt', async () => {
    let fail = true;
    const fn = vi.fn(async () => {
      if (fail) throw new Error('nope');
      return 'ok';
    });
    const shared = singleFlight(fn);

    const results = await Promise.allSettled([shared(), shared()]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(fn).toHaveBeenCalledTimes(1);

    fail = false;
    await expect(shared()).resolves.toBe('ok');
  });

  it('recovers from a function that throws synchronously', async () => {
    let calls = 0;
    const shared = singleFlight((): Promise<string> => {
      calls += 1;
      if (calls === 1) throw new Error('sync');
      return Promise.resolve('ok');
    });
    await expect(shared()).rejects.toThrow('sync');
    await expect(shared()).resolves.toBe('ok');
  });
});
