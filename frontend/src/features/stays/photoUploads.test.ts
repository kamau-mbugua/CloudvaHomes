import { describe, expect, it } from 'vitest';
import { MAX_LISTING_PHOTOS, photoUploadSummary, planPhotoUpload } from './photoUploads';

const f = (name: string) => ({ name });

describe('uploading several listing photos', () => {
  it('takes as many as still fit under the 20-photo limit, in the order picked', () => {
    expect(MAX_LISTING_PHOTOS).toBe(20);
    expect(planPhotoUpload([f('a'), f('b'), f('c')], 0)).toEqual({ accepted: [f('a'), f('b'), f('c')], skipped: 0 });
    expect(planPhotoUpload([f('a'), f('b'), f('c')], 18)).toEqual({ accepted: [f('a'), f('b')], skipped: 1 });
    expect(planPhotoUpload([f('a')], 20)).toEqual({ accepted: [], skipped: 1 });
  });

  it('sums up what happened in plain words', () => {
    expect(photoUploadSummary({ added: 1, failed: [], skipped: 0 })).toEqual({ ok: true, text: '1 photo added.' });
    expect(photoUploadSummary({ added: 5, failed: [], skipped: 0 })).toEqual({ ok: true, text: '5 photos added.' });
    expect(photoUploadSummary({ added: 2, failed: [], skipped: 3 })).toEqual({
      ok: true,
      text: '2 photos added. 3 not added: a listing holds up to 20 photos.',
    });
    expect(photoUploadSummary({ added: 4, failed: [{ name: 'big.heic', reason: 'Use a JPEG, PNG or WebP image.' }], skipped: 0 })).toEqual({
      ok: false,
      text: '4 photos added. big.heic: Use a JPEG, PNG or WebP image.',
    });
    expect(photoUploadSummary({ added: 0, failed: [{ name: 'x.jpg', reason: 'Too large.' }, { name: 'y.jpg', reason: 'Too large.' }], skipped: 0 })).toEqual({
      ok: false,
      text: 'No photos added. 2 failed (first: x.jpg: Too large.).',
    });
  });
});
