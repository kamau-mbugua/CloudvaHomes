import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, buildUrl, errorMessage } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { formatDay, todayInNairobi } from '../../lib/dates';
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type PublicVendorJob,
} from './types';

/**
 * Public vendor job page (`/r/:token`, phase 18): shows a vendor the job details,
 * problem photos, and the organisation's contact number (never tenant PII), and lets
 * the vendor upload completion photos and report the job done.
 */
export function VendorJobPage() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const jobQuery = useQuery({
    queryKey: ['public-vendor-job', token],
    queryFn: () =>
      api
        .get<DataEnvelope<PublicVendorJob>>(`/public/vendor-jobs/${encodeURIComponent(token)}`, undefined)
        .then((r) => r.data),
    retry: false,
  });

  const complete = useMutation({
    mutationFn: (body: { note?: string }) =>
      api
        .post<DataEnvelope<PublicVendorJob>>(
          `/public/vendor-jobs/${encodeURIComponent(token)}/complete`,
          body,
          { skipAuthRetry: true },
        )
        .then((r) => r.data),
    onSuccess: (updated) => qc.setQueryData(['public-vendor-job', token], updated),
  });

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await api.upload<DataEnvelope<{ id: string }>>(
        `/public/vendor-jobs/${encodeURIComponent(token)}/photos`,
        { file },
        { skipAuthRetry: true },
      );
      // The server attaches it to the job straight away; show the job as it now stands.
      await qc.invalidateQueries({ queryKey: ['public-vendor-job', token] });
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const job = jobQuery.data;
  const closed = job ? job.status === 'RESOLVED' || job.status === 'CANCELLED' : false;
  const currentNote = note ?? job?.vendorNote ?? '';
  const allVendorPhotos = job?.vendorPhotoUploadIds ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    complete.mutate({ note: currentNote.trim() || undefined });
  };

  return (
    <main className="pg" style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
      <h1 className="adm__h1">Maintenance job</h1>

      {jobQuery.isPending ? <p className="ad__muted">Loading job…</p> : null}

      {jobQuery.isError ? (
        <div className="ag__card" style={{ padding: '1.25rem' }}>
          <strong>This job link is not valid or has been replaced</strong>
          <p className="ad__muted" style={{ marginTop: '0.5rem' }}>
            Check the latest SMS you received, or call the property manager for an updated link.
          </p>
        </div>
      ) : null}

      {job ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="ag__card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <span className="code">{job.number}</span>
                <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.2rem' }}>{job.title}</h2>
              </div>
              <span
                className={`ad__badge ${
                  job.status === 'RESOLVED'
                    ? 'ad__badge--ok'
                    : job.status === 'IN_PROGRESS'
                      ? 'ad__badge--warn'
                      : 'ad__badge--neutral'
                }`}
              >
                {MAINTENANCE_STATUSES[job.status] ?? job.status}
              </span>
            </div>

            <dl className="tp__facts" style={{ marginTop: '0.85rem' }}>
              <div>
                <dt>Property & unit</dt>
                <dd>
                  {job.property.name} · Unit {job.unit.number}
                  {job.property.location ? ` (${job.property.location})` : ''}
                </dd>
              </div>
              <div>
                <dt>Category & priority</dt>
                <dd>
                  {MAINTENANCE_CATEGORIES[job.category] ?? job.category} ·{' '}
                  {MAINTENANCE_PRIORITIES[job.priority] ?? job.priority}
                </dd>
              </div>
              <div>
                <dt>Managed by</dt>
                <dd>
                  {job.organization.name} ·{' '}
                  <a href={`tel:${job.organization.phone}`}>{job.organization.phone}</a>
                </dd>
              </div>
              {job.vendor ? (
                <div>
                  <dt>Assigned to</dt>
                  <dd>{job.vendor.name}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="ag__card" style={{ padding: '1rem' }}>
            <strong>What needs fixing</strong>
            <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{job.description}</p>
            {job.photoUploadIds.length > 0 ? (
              <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.5rem' }}>
                <span className="ad__sub">Photos from the unit</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {job.photoUploadIds.map((pid) => (
                    <img
                      key={pid}
                      src={buildUrl(
                        `/public/vendor-jobs/${encodeURIComponent(token)}/photos/${encodeURIComponent(pid)}`,
                      )}
                      alt="Reported issue"
                      style={{
                        width: 120,
                        height: 120,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid var(--nx-border, #e2e8f0)',
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="ag__card" style={{ padding: '1rem' }}>
            <strong>Completion report</strong>
            {job.vendorCompletedAt ? (
              <p className="ad__badge ad__badge--ok" style={{ display: 'inline-block', marginTop: 6 }}>
                Reported done on {formatDay(todayInNairobi(new Date(job.vendorCompletedAt)))}
              </p>
            ) : null}

            {allVendorPhotos.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {allVendorPhotos.map((pid) => (
                  <img
                    key={pid}
                    src={buildUrl(
                      `/public/vendor-jobs/${encodeURIComponent(token)}/photos/${encodeURIComponent(pid)}`,
                    )}
                    alt="Vendor completion"
                    style={{
                      width: 100,
                      height: 100,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid var(--nx-border, #e2e8f0)',
                    }}
                  />
                ))}
              </div>
            ) : null}

            {closed ? (
              <p className="ad__muted" style={{ marginTop: '0.75rem' }}>
                {job.vendorNote || 'This job has been closed by the property manager.'}
              </p>
            ) : (
              <form className="fm" onSubmit={submit} style={{ marginTop: '0.75rem' }}>
                <label className="fm__label" htmlFor="vendor-note">
                  Work done / parts used
                </label>
                <textarea
                  id="vendor-note"
                  className="nx-textarea"
                  rows={3}
                  placeholder="Describe what was repaired or replaced…"
                  value={currentNote}
                  onChange={(e) => setNote(e.target.value)}
                />

                {allVendorPhotos.length < 10 ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <label className="nx-btn nx-btn--sm" style={{ cursor: 'pointer' }}>
                      {uploading ? 'Uploading photo…' : 'Add photo of finished work'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoSelect}
                        disabled={uploading}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                ) : null}

                {uploadError ? (
                  <p className="ad__error" role="alert" style={{ marginTop: '0.5rem' }}>
                    {uploadError}
                  </p>
                ) : null}

                {complete.isError ? (
                  <p className="ad__error" role="alert" style={{ marginTop: '0.5rem' }}>
                    {errorMessage(complete.error)}
                  </p>
                ) : null}

                <div style={{ marginTop: '1rem' }}>
                  <button
                    type="submit"
                    className="nx-btn nx-btn--primary"
                    disabled={complete.isPending || uploading}
                  >
                    {complete.isPending
                      ? 'Saving…'
                      : job.vendorCompletedAt
                        ? 'Update report'
                        : 'Mark job done'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
