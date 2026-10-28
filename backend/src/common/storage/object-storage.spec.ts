import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorage, sniffType } from './object-storage.js';

describe('sniffType', () => {
  it('recognises the accepted formats by their first bytes', () => {
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(sniffType(Buffer.from('RIFF0000WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
  });

  it('rejects everything else, whatever it is called', () => {
    expect(sniffType(Buffer.from('MZ\x90\x00'))).toBeNull(); // Windows executable
    expect(sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffType(Buffer.alloc(0))).toBeNull();
  });
});

describe('LocalStorage', () => {
  it('stores, reads and deletes, and refuses keys that escape its folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hodi-storage-'));
    try {
      const s = new LocalStorage(dir);
      await s.put('org/a/receipt/1', Buffer.from('hello'), 'text/plain');
      expect((await s.get('org/a/receipt/1')).toString()).toBe('hello');
      await s.delete('org/a/receipt/1');
      await expect(s.get('org/a/receipt/1')).rejects.toThrow();
      await expect(s.put('../outside', Buffer.from('x'), 'text/plain')).rejects.toThrow(/escapes/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
