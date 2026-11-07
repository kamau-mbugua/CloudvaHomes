import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import { initialCancelRefundInput } from './calendar';
import { toMinorString } from './money';
import type { Booking } from './types';

interface CancelDryRunResponse {
  suggestedRefund: string;
}

interface Props {
  booking: Booking;
  onClose: () => void;
}

export function CancelSheet({ booking, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [suggestedMinor, setSuggestedMinor] = useState<string | null>(null);
  const [refundKes, setRefundKes] = useState<string>('0');
  const [reason, setReason] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .post<DataEnvelope<CancelDryRunResponse>>(
        `/host/bookings/${booking.id}/cancel`,
        { dryRun: true },
      )
      .then((res) => {
        if (!cancelled) {
          setSuggestedMinor(res.data.suggestedRefund);
          setRefundKes(initialCancelRefundInput(res.data.suggestedRefund));
        }
      })
      .catch(() => {
        // Leave default 0 if dryRun fails
      });

    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      const refundMinor = toMinorString(refundKes || '0');
      if (refundMinor === null) {
        throw new Error('Refund must be in whole shillings.');
      }
      await api.post(`/host/bookings/${booking.id}/cancel`, {
        refund: refundMinor,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
    },
    onSuccess: async () => {
      toast.saved('Booking cancelled.');
      await queryClient.invalidateQueries({
        queryKey: staysKeys.booking(booking.id),
      });
      await queryClient.invalidateQueries({ queryKey: staysKeys.bookings });
      await queryClient.invalidateQueries({ queryKey: staysKeys.calendar });
      onClose();
    },
    onError: (err) => {
      setLocalError(staysErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    mutation.mutate();
  };

  return (
    <Sheet
      title="Cancel booking"
      busy={mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="nx-btn"
            onClick={onClose}
          >
            Keep booking
          </button>
          <button
            type="submit"
            form="stay-cancel-form"
            className="nx-btn nx-btn--danger"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Cancelling…' : 'Confirm cancel'}
          </button>
        </>
      }
    >
      <form
        id="stay-cancel-form"
        className="pf__dialogform"
        onSubmit={handleSubmit}
        noValidate
      >
        <p className="ad__muted">
          {booking.code}
          {suggestedMinor !== null
            ? ` · Suggested refund: ${formatKES(Number(suggestedMinor))}`
            : ''}
        </p>

        {localError && (
          <p className="nx-sheet__error" role="alert">
            {localError}
          </p>
        )}

        <div className="fm__grid">
          <Field id="cancel-refund" label="Refund to guest (KES)" wide>
            <input
              id="cancel-refund"
              type="text"
              inputMode="numeric"
              className="nx-input"
              value={refundKes}
              onChange={(e) => setRefundKes(e.target.value)}
            />
          </Field>

          <Field id="cancel-reason" label="Reason" optional wide>
            <input
              id="cancel-reason"
              type="text"
              className="nx-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
