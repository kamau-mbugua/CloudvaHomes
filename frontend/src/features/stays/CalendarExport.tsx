import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { copyText } from '../../lib/clipboard';
import { useToast } from '../../lib/useToast';
import { ConfirmDialog } from '../../components/ConfirmDelete';
import { unwrap } from '../payments/rules';
import { staysErrorMessage } from './api';

/**
 * A listing's calendar export link (phase 20): paste it into Airbnb, Booking.com or VRBO
 * ("Import calendar") so nights booked or blocked on KodiHQ are blocked there too. Dates only,
 * no guest details. "New link" retires the old one.
 */
export function CalendarExport({ listingId, canEdit }: { listingId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const key = ['stays', 'listing-ical', listingId];
  const link = useQuery({
    queryKey: key,
    queryFn: () => api.get<unknown>(`/host/listings/${encodeURIComponent(listingId)}/ical`).then((b) => unwrap<{ url: string }>(b).url),
    enabled: canEdit,
  });
  const rotate = useMutation({
    mutationFn: () => api.post<unknown>(`/host/listings/${encodeURIComponent(listingId)}/ical/rotate`, {}).then((b) => unwrap<{ url: string }>(b).url),
    onSuccess: (url) => {
      queryClient.setQueryData(key, url);
      setConfirming(false);
      toast.saved('New calendar link made. Update it on Airbnb and Booking.com; the old one has stopped working.');
    },
    onError: (error) => toast.failed(staysErrorMessage(error)),
  });
  if (!canEdit) return null;

  const copy = async () => {
    if (!link.data) return;
    try {
      await copyText(link.data);
      toast.saved('Calendar link copied.');
    } catch {
      toast.failed('Couldn’t copy. Select the link and copy it yourself.');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Calendar link (Airbnb, Booking.com)</h3>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Paste this link where those sites ask to import a calendar. Nights booked or blocked here are then blocked
          there too. It shares dates only, never guest details.
        </p>
      </div>
      {link.isError ? <p className="ad__error" role="alert">{staysErrorMessage(link.error)}</p> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="ad__search" readOnly aria-label="Calendar link" value={link.data ?? 'Loading…'}
          onFocus={(e) => e.currentTarget.select()} style={{ flex: '1 1 280px', minWidth: 0 }} />
        <button type="button" className="nx-btn nx-btn--sm" disabled={!link.data} onClick={() => void copy()}>Copy link</button>
        <button type="button" className="nx-btn nx-btn--sm" disabled={!link.data || rotate.isPending} onClick={() => setConfirming(true)}>
          New link
        </button>
      </div>
      {confirming ? (
        <ConfirmDialog
          verb="Make"
          what="a new calendar link"
          consequence="The current link stops working at once. Paste the new one into every site that imports this calendar."
          busy={rotate.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => rotate.mutate()}
        />
      ) : null}
    </div>
  );
}
