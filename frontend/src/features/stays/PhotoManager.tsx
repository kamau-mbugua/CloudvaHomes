import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useToast } from '../../lib/useToast';
import { useAuthedBlobUrl } from '../uploads/api';
import { staysErrorMessage, staysKeys } from './api';
import { MAX_LISTING_PHOTOS, photoUploadSummary, planPhotoUpload } from './photoUploads';
import { resizeImage } from './resizeImage';
import type { Listing, ListingPhoto } from './types';

function PhotoCard({
  photo,
  index,
  total,
  canEdit,
  onMove,
  onDelete,
  onDragStart,
  onDropOn,
}: {
  photo: ListingPhoto;
  index: number;
  total: number;
  canEdit: boolean;
  onMove: (from: number, to: number) => void;
  onDelete: (photoId: string) => void;
  onDragStart: (index: number) => void;
  onDropOn: (index: number) => void;
}) {
  const thumb = useAuthedBlobUrl(`/uploads/${photo.uploadId}/content`);
  return (
    <div
      draggable={canEdit}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDropOn(index)}
      style={{
        border: '1px solid var(--border)',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        background: 'var(--card)',
        position: 'relative',
      }}
    >
      <div style={{ aspectRatio: '4/3', background: 'var(--secondary)', position: 'relative' }}>
        {thumb.status === 'ready' ? (
          <img
            src={thumb.url}
            alt={photo.caption ?? `Photo ${index + 1}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: '0.75rem',
            }}
          >
            Photo {index + 1}
          </div>
        )}
        {index === 0 ? (
          <span
            style={{
              position: 'absolute',
              top: '0.5rem',
              left: '0.5rem',
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '0.15rem 0.45rem',
              borderRadius: '999px',
            }}
          >
            Cover
          </span>
        ) : null}
      </div>
      {canEdit ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.4rem 0.5rem',
            gap: '0.25rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              type="button"
              className="nx-btn nx-btn--sm"
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
              aria-label="Move photo left"
            >
              ←
            </button>
            <button
              type="button"
              className="nx-btn nx-btn--sm"
              disabled={index === total - 1}
              onClick={() => onMove(index, index + 1)}
              aria-label="Move photo right"
            >
              →
            </button>
          </div>
          <button
            type="button"
            className="nx-btn nx-btn--sm"
            onClick={() => onDelete(photo.id)}
            aria-label={`Delete photo ${index + 1}`}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PhotoManager({
  listing,
  canEdit,
}: {
  listing: Listing;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const uploadOne = async (file: File) => {
    const resized = await resizeImage(file, 1600, 0.8);
    return api.upload<DataEnvelope<ListingPhoto>>(`/host/listings/${listing.id}/photos`, {
      file: resized,
      filename: file.name.replace(/\.[^.]+$/, '.jpg'),
    });
  };

  /** Uploads the picked photos one after another; one failure doesn't stop the rest. */
  const uploadMany = async (picked: File[]) => {
    const { accepted, skipped } = planPhotoUpload(picked, listing.photos.length);
    const failed: { name: string; reason: string }[] = [];
    let added = 0;
    setProgress({ done: 0, total: accepted.length });
    for (const [i, file] of accepted.entries()) {
      try {
        await uploadOne(file);
        added += 1;
      } catch (err) {
        failed.push({ name: file.name, reason: staysErrorMessage(err) });
      }
      setProgress({ done: i + 1, total: accepted.length });
    }
    setProgress(null);
    await queryClient.invalidateQueries({ queryKey: staysKeys.listing(listing.id) });
    await queryClient.invalidateQueries({ queryKey: staysKeys.listings });
    const summary = photoUploadSummary({ added, failed, skipped });
    if (summary.ok) toast.saved(summary.text);
    else toast.failed(summary.text);
  };

  const reorder = useMutation({
    mutationFn: (photoIds: string[]) =>
      api.put<DataEnvelope<Listing>>(`/host/listings/${listing.id}/photos/order`, { photoIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: staysKeys.listing(listing.id) });
      await queryClient.invalidateQueries({ queryKey: staysKeys.listings });
    },
    onError: (err) => toast.failed(staysErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (photoId: string) =>
      api.delete<DataEnvelope<Listing>>(`/host/listings/${listing.id}/photos/${photoId}`),
    onSuccess: async () => {
      toast.saved('Photo removed.');
      await queryClient.invalidateQueries({ queryKey: staysKeys.listing(listing.id) });
      await queryClient.invalidateQueries({ queryKey: staysKeys.listings });
    },
    onError: (err) => toast.failed(staysErrorMessage(err)),
  });

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= listing.photos.length) return;
    const ids = listing.photos.map((p) => p.id);
    const [picked] = ids.splice(from, 1);
    ids.splice(to, 0, picked);
    reorder.mutate(ids);
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
            Photos ({listing.photos.length}/{MAX_LISTING_PHOTOS})
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Pick several at once. Drag or use arrows to reorder; the first photo is the cover on your booking site.
          </p>
        </div>
        {canEdit && listing.photos.length < MAX_LISTING_PHOTOS ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length > 0) void uploadMany(files);
              }}
            />
            <button
              type="button"
              className="nx-btn nx-btn--sm"
              disabled={progress !== null}
              onClick={() => fileRef.current?.click()}
            >
              {progress
                ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
                : '+ Add photos'}
            </button>
          </>
        ) : null}
      </div>

      {listing.photos.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          No photos uploaded yet.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {listing.photos.map((p, idx) => (
            <PhotoCard
              key={p.id}
              photo={p}
              index={idx}
              total={listing.photos.length}
              canEdit={canEdit}
              onMove={move}
              onDelete={(pid) => remove.mutate(pid)}
              onDragStart={(i) => setDragIdx(i)}
              onDropOn={(target) => {
                if (dragIdx !== null) move(dragIdx, target);
                setDragIdx(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
