import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import { fromMinor, toMinorString } from './money';
import type { Booking, StayPaymentMethod } from './types';

interface Props {
  booking: Booking;
  onClose: () => void;
}

export function RefundSheet({ booking, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const paidMinor = BigInt(booking.amountPaid ?? '0');
  const refundedMinor = BigInt(booking.amountRefunded ?? '0');
  const netPaid = paidMinor > refundedMinor ? paidMinor - refundedMinor : 0n;

  const [method, setMethod] = useState<StayPaymentMethod>('MPESA_PAYBILL');
  const [amountKes, setAmountKes] = useState<string>(
    netPaid > 0n ? fromMinor(netPaid.toString()) : '0',
  );
  const [reference, setReference] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const amountMinor = toMinorString(amountKes);
      if (!amountMinor || BigInt(amountMinor) <= 0n) {
        throw new Error('Enter a whole-shilling refund amount.');
      }
      await api.post(`/host/bookings/${booking.id}/refunds`, {
        method,
        amount: amountMinor,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: async () => {
      toast.saved('Refund recorded.');
      await queryClient.invalidateQueries({
        queryKey: staysKeys.booking(booking.id),
      });
      await queryClient.invalidateQueries({ queryKey: staysKeys.bookings });
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
      title="Record refund"
      busy={mutation.isPending}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="nx-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="stay-refund-form"
            className="nx-btn nx-btn--primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Record refund'}
          </button>
        </>
      }
    >
      <form
        id="stay-refund-form"
        className="pf__dialogform"
        onSubmit={handleSubmit}
        noValidate
      >
        <p className="ad__muted">
          {booking.code} · Net paid: {formatKES(Number(netPaid))}
        </p>

        {localError && (
          <p className="nx-sheet__error" role="alert">
            {localError}
          </p>
        )}

        <div className="fm__grid">
          <Field id="refund-method" label="Method" wide>
            <select
              id="refund-method"
              className="nx-input"
              value={method}
              onChange={(e) => setMethod(e.target.value as StayPaymentMethod)}
            >
              <option value="MPESA_PAYBILL">M-Pesa Paybill</option>
              <option value="MPESA_TILL">M-Pesa Till</option>
              <option value="CASH">Cash</option>
              <option value="BANK_ACCOUNT">Bank transfer</option>
            </select>
          </Field>

          <Field id="refund-amount" label="Refund amount (KES)" wide>
            <input
              id="refund-amount"
              type="text"
              inputMode="numeric"
              className="nx-input"
              value={amountKes}
              onChange={(e) => setAmountKes(e.target.value)}
              required
            />
          </Field>

          <Field id="refund-ref" label="Reference" optional wide>
            <input
              id="refund-ref"
              type="text"
              className="nx-input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>

          <Field id="refund-note" label="Note" optional wide>
            <input
              id="refund-note"
              type="text"
              className="nx-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}
