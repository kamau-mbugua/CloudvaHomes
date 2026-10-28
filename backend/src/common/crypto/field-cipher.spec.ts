import { randomBytes } from 'node:crypto';
import { FieldCipher, maskHint, normalizeIdNumber, parseKeyRing } from './field-cipher.js';

const k = () => randomBytes(32).toString('base64');

describe('FieldCipher', () => {
  const index = randomBytes(32);

  it('round-trips and never stores the plaintext', () => {
    const c = new FieldCipher(parseKeyRing(`a:${k()}`), index);
    const enc = c.encrypt('12345678', 'org-1');
    expect(Buffer.from(enc).includes(Buffer.from('12345678'))).toBe(false);
    expect(c.decrypt(enc, 'org-1')).toBe('12345678');
  });

  it('uses a fresh IV, so equal values encrypt differently', () => {
    const c = new FieldCipher(parseKeyRing(`a:${k()}`), index);
    expect(Buffer.from(c.encrypt('x', 'o')).equals(Buffer.from(c.encrypt('x', 'o')))).toBe(false);
  });

  it('refuses a value bound to another organisation', () => {
    const c = new FieldCipher(parseKeyRing(`a:${k()}`), index);
    const enc = c.encrypt('12345678', 'org-1');
    expect(() => c.decrypt(enc, 'org-2')).toThrow();
  });

  it('detects tampering', () => {
    const c = new FieldCipher(parseKeyRing(`a:${k()}`), index);
    const enc = Buffer.from(c.encrypt('12345678', 'o'));
    enc[enc.length - 1]! ^= 1;
    expect(() => c.decrypt(enc, 'o')).toThrow();
  });

  it('rotates: new key first, old values still decrypt, new writes use the new key', () => {
    const oldKey = k();
    const before = new FieldCipher(parseKeyRing(`k1:${oldKey}`), index);
    const old = before.encrypt('A1', 'o');
    const after = new FieldCipher(parseKeyRing(`k2:${k()},k1:${oldKey}`), index);
    expect(after.decrypt(old, 'o')).toBe('A1');
    expect(() => before.decrypt(after.encrypt('A1', 'o'), 'o')).toThrow(/k2/);
  });

  it('blind index is deterministic per value and context, and keyed', () => {
    const c = new FieldCipher(parseKeyRing(`a:${k()}`), index);
    expect(c.blindIndex('X1', 'org-1')).toBe(c.blindIndex('X1', 'org-1'));
    expect(c.blindIndex('X1', 'org-1')).not.toBe(c.blindIndex('X1', 'org-2'));
    const other = new FieldCipher(parseKeyRing(`a:${k()}`), randomBytes(32));
    expect(other.blindIndex('X1', 'org-1')).not.toBe(c.blindIndex('X1', 'org-1'));
  });

  it('rejects malformed key rings', () => {
    expect(() => parseKeyRing('')).toThrow();
    expect(() => parseKeyRing('a:short')).toThrow(/32 bytes/);
    expect(() => parseKeyRing(`bad id:${k()}`)).toThrow(/key id/);
    expect(() => parseKeyRing(`a:${k()},a:${k()}`)).toThrow(/duplicate/);
    expect(() => new FieldCipher(parseKeyRing(`a:${k()}`), randomBytes(16))).toThrow();
  });

  it('normalises and masks ID numbers', () => {
    expect(normalizeIdNumber(' ab 12-34 ')).toBe('AB1234');
    expect(maskHint('678')).toBe('•••••678');
    expect(maskHint(null)).toBeNull();
  });
});
