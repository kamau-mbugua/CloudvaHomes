import sharp from 'sharp';
import { PHOTO_WIDTHS, makePhotoVariant, photoVariantKey, photoWidth } from './photo-variants.js';

describe('files/photo-variants — smaller WebP copies of public photos', () => {
  it('offers three widths and only those', () => {
    expect(PHOTO_WIDTHS).toEqual([160, 480, 1024]);
    expect(photoWidth('480')).toBe(480);
    expect(photoWidth('999')).toBeNull();
    expect(photoWidth(undefined)).toBeNull();
    expect(photoWidth('abc')).toBeNull();
  });

  it('stores each size next to the original', () => {
    expect(photoVariantKey('uploads/org/abc.jpg', 480)).toBe('uploads/org/abc.jpg.w480.webp');
  });

  it('shrinks a large photo to the width as WebP, keeping its shape', async () => {
    const big = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#336699' },
    })
      .jpeg()
      .toBuffer();
    const out = await makePhotoVariant(big, 480);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(270);
    expect(out.length).toBeLessThan(big.length);
  });

  it('never enlarges a small photo', async () => {
    const small = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const meta = await sharp(await makePhotoVariant(small, 1024)).metadata();
    expect(meta.width).toBe(300);
  });
});
