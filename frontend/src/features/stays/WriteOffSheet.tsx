import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import type { Booking } from './types';

interface Props {
  booking: Booking;
  /** What the guest still owes, in minor units. */
  balance: bigint;
  onClose: () => void;
}

/**
 * Gives up on what a checked-in guest still owes (e.g. they left without paying), so the stay can
 * be checked out. Payments stay as recorded; if the guest pays later, it comes off the write-off.
 */
export function WriteOffSheet({ booking, balance, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/host/bookings/${booking.id}/write-off`, {
        reason: reason.trim(),
      }),
    onSuccess: async () => {
      toast.saved('Balance written off.');
      await queryClient.invalidateQueries({
        queryKey: staysKeys.booking(booking.id),
      });
      await queryClient.invalidateQueries({ queryKey: staysKeys.bookings });
      onClose();
    },
    onError: (err) => setLocalError(staysErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (reason.trim().length < 3) {
      setLocalError('Say why the balance is written off.');
      return;
    }
    mutation.mutate();
  };

  return (
    <Sheet
      title="Write off balance"
      busy={mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="nx-btn" onClick={onClose}>
            Keep balance
          </button>
          <button
            type="submit"
            form="stay-writeoff-form"
            className="nx-btn nx-btn--danger"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Writing off…'
              : `Write off ${formatKES(Number(balance))}`}
          </button>
        </>
      }
    >
      <form
        id="stay-writeoff-form"
        className="pf__dialogform"
        onSubmit={handleSubmit}
        noValidate
      >
        <p>
          {booking.code} · {booking.guest?.name ?? 'Guest'} still owes{' '}
          <strong>{formatKES(Number(balance))}</strong>. Writing it off clears
          the balance so you can check the guest out. Payments stay as they
          are, and if the guest pays later, it comes off the write-off.
        </p>

        {localError && (
          <p className="nx-sheet__error" role="alert">
            {localError}
          </p>
        )}

        <div className="fm__grid">
          <Field id="writeoff-reason" label="Reason" wide>
            <input
              id="writeoff-reason"
              type="text"
              className="nx-input"
              maxLength={300}
              placeholder="e.g. Guest left without paying"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
