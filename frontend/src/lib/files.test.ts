import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, PHOTO_TYPES, checkUploadFile, csvFilename, fileSlug, fileTypeOf, formatBytes, isImageType } from './files';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('checkUploadFile', () => {
  it.each([
    ['receipt.jpg', 'image/jpeg'],
    ['receipt.png', 'image/png'],
    ['receipt.webp', 'image/webp'],
    ['receipt.pdf', 'application/pdf'],
  ])('accepts %s', (name, type) => {
    expect(checkUploadFile(f(name, type))).toEqual({ ok: true, type });
  });

  it('refuses other types, naming what is allowed', () => {
    expect(checkUploadFile(f('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')))
      .toEqual({ ok: false, error: 'Choose a photo (JPEG, PNG or WebP) or a PDF.' });
    expect(checkUploadFile(f('photo.heic', 'image/heic'), PHOTO_TYPES)).toEqual({ ok: false, error: 'Choose a photo (JPEG, PNG or WebP).' });
    expect(checkUploadFile(f('scan.pdf', 'application/pdf'), PHOTO_TYPES).ok).toBe(false);
  });

  it('guesses the type from the extension when the browser gives none', () => {
    expect(fileTypeOf(f('IMG_0001.JPG', ''))).toBe('image/jpeg');
    expect(fileTypeOf(f('noext', ''))).toBe('');
    expect(checkUploadFile(f('scan.PDF', '')).ok).toBe(true);
  });

  it('allows exactly 10 MB and refuses a byte more, or an empty file', () => {
    expect(checkUploadFile(f('a.png', 'image/png', MAX_UPLOAD_BYTES)).ok).toBe(true);
    const over = checkUploadFile(f('a.png', 'image/png', MAX_UPLOAD_BYTES + 1));
    expect(over).toEqual({ ok: false, error: 'That file (10 MB) is over the 10 MB limit. Try a smaller photo or scan.' });
    expect(checkUploadFile(f('a.png', 'image/png', 12 * 1024 * 1024))).toMatchObject({ error: expect.stringContaining('12 MB') });
    expect(checkUploadFile(f('a.png', 'image/png', 0))).toEqual({ ok: false, error: 'That file is empty.' });
  });
});

describe('formatBytes', () => {
  it('reads like a person would say it', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('isImageType', () => {
  it('is true only for images', () => {
    expect(isImageType('image/png')).toBe(true);
    expect(isImageType('application/pdf')).toBe(false);
    expect(isImageType(null)).toBe(false);
  });
});

describe('csv file names', () => {
  it('slugs a part', () => {
    expect(fileSlug('Profit & loss')).toBe('profit-loss');
    expect(fileSlug('  KC/01 ')).toBe('kc-01');
  });

  it('names the report and its range', () => {
    expect(csvFilename('expenses', { from: '2026-10-01', to: '2026-10-31' })).toBe('expenses-2026-10-01-to-2026-10-31.csv');
    expect(csvFilename('expenses', { from: '2026-10-01' })).toBe('expenses-2026-10-01-to-today.csv');
    expect(csvFilename('expenses')).toBe('expenses.csv');
    expect(csvFilename('profit-and-loss', { from: '2026-01', to: '2026-10', extra: 'KC' })).toBe('profit-and-loss-kc-2026-01-to-2026-10.csv');
    expect(csvFilename('arrears', { asOf: '2026-10-27' })).toBe('arrears-2026-10-27.csv');
  });
});
