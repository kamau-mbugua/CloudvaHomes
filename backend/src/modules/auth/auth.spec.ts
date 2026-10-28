import { hashCode, randomCode, safeEqualHex, sha256 } from './crypto.js';
import { normalizeEmail, normalizePhone, parseIdentifier, passwordProblem } from './identifiers.js';

describe('normalizePhone', () => {
  it.each([
    ['0712345678', '+254712345678'],
    ['712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['+254 712 345 678', '+254712345678'],
    ['0110 123 456', '+254110123456'],
    ['+255 754 123 456', '+255754123456'], // Tanzania, with country code
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '123', '07123', 'not a phone'])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('parseIdentifier', () => {
  it('distinguishes email from phone', () => {
    expect(parseIdentifier('  Jane@Example.COM ')).toEqual({
      kind: 'email',
      value: 'jane@example.com',
    });
    expect(parseIdentifier('0712 345 678')).toEqual({ kind: 'phone', value: '+254712345678' });
    expect(parseIdentifier('jane@')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
  });
});

describe('passwordProblem', () => {
  it('accepts long passphrases', () => {
    expect(passwordProblem('correct horse battery')).toBeNull();
  });

  it.each([
    ['short1', /at least 10/],
    ['1234567890123', /only numbers/],
    ['aaaaaaaaaaaa', /repeat/],
    ['x'.repeat(129), /at most/],
  ])('rejects %j', (pw, reason) => {
    expect(passwordProblem(pw)).toMatch(reason);
  });

  it('rejects passwords containing the email or phone', () => {
    expect(passwordProblem('jane@example.com!!', ['jane@example.com'])).toMatch(/email or phone/);
    expect(passwordProblem('my254712345678pw', ['+254712345678'])).toMatch(/email or phone/);
  });
});

describe('codes and hashes', () => {
  it('generates 6-digit codes', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^\d{6}$/);
  });

  it('keys code hashes by secret and target', () => {
    const a = hashCode('secret-1', '123456', 'LOGIN:+254712345678');
    expect(a).toBe(hashCode('secret-1', '123456', 'LOGIN:+254712345678'));
    expect(a).not.toBe(hashCode('secret-2', '123456', 'LOGIN:+254712345678'));
    expect(a).not.toBe(hashCode('secret-1', '123456', 'LOGIN:+254700000000'));
    expect(safeEqualHex(a, a)).toBe(true);
    expect(safeEqualHex(a, sha256('x'))).toBe(false);
    expect(safeEqualHex(a, 'ab')).toBe(false);
  });
});
