import { describe, expect, it } from 'vitest';
import { rateKeyFor } from './short-links.service.js';

describe('short link rate-limit keys', () => {
  it('limits IPv4 by address', () => {
    expect(rateKeyFor('41.90.12.7')).toBe('41.90.12.7');
    expect(rateKeyFor('::ffff:41.90.12.7')).toBe('41.90.12.7');
  });

  it('limits IPv6 by /64 block, however the address is written', () => {
    expect(rateKeyFor('2c0f:fe38:2101:9a00:1c2d:3e4f:5a6b:7c8d')).toBe('2c0f:fe38:2101:9a00::/64');
    expect(rateKeyFor('2c0f:fe38:2101:9a00::1')).toBe('2c0f:fe38:2101:9a00::/64');
    expect(rateKeyFor('2C0F:FE38:2101:9A00:0000:0000:0000:0002')).toBe('2c0f:fe38:2101:9a00::/64');
    expect(rateKeyFor('2c0f:fe38::5')).toBe('2c0f:fe38:0:0::/64');
  });
});
