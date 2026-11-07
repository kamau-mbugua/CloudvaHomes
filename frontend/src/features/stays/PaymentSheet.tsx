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
  mode: 'manual' | 'prompt';
  onClose: () => void;
}

export function PaymentSheet({ booking, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const totalMinor = BigInt(booking.total ?? '0');
  const paidMinor = BigInt(booking.amountPaid ?? '0');
  const refundedMinor = BigInt(booking.amountRefunded ?? '0');
  const netPaid = paidMinor - refundedMinor;
  const remaining = totalMinor > netPaid ? totalMinor - netPaid : 0n;

  const [method, setMethod] = useState<StayPaymentMethod>('MPESA_PAYBILL');
  const [amountKes, setAmountKes] = useState<string>(
    remaining > 0n ? fromMinor(remaining.toString()) : '',
  );
  const [phone, setPhone] = useState<string>(booking.guest?.phone ?? '');
  const [reference, setReference] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const amountMinor = toMinorString(amountKes);
      if (!amountMinor || BigInt(amountMinor) <= 0n) {
        throw new Error('Enter a whole-shilling amount greater than zero.');
      }

      if (mode === 'prompt') {
        if (!phone.trim()) {
          throw new Error('Phone number is required for M-Pesa prompt.');
        }
        await api.post(`/host/bookings/${booking.id}/mpesa-prompt`, {
          phone: phone.trim(),
          amount: amountMinor,
        });
        return;
      }

      await api.post(`/host/bookings/${booking.id}/payments`, {
        method,
        amount: amountMinor,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    },
    onSuccess: async () => {
      toast.saved(
        mode === 'prompt' ? 'M-Pesa prompt sent to guest.' : 'Payment recorded.',
      );
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
      title={mode === 'prompt' ? 'Send M-Pesa prompt' : 'Record payment'}
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
            form="stay-payment-form"
            className="nx-btn nx-btn--primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Processing…'
              : mode === 'prompt'
                ? 'Send prompt'
                : 'Record payment'}
          </button>
        </>
      }
    >
      <form
        id="stay-payment-form"
        className="pf__dialogform"
        onSubmit={handleSubmit}
        noValidate
      >
        <p className="ad__muted">
          {booking.code} · Balance due: {formatKES(Number(remaining))}
        </p>

        {localError && (
          <p className="nx-sheet__error" role="alert">
            {localError}
          </p>
        )}

        <div className="fm__grid">
          {mode === 'manual' ? (
            <Field id="pay-method" label="Payment method" wide>
              <select
                id="pay-method"
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
          ) : (
            <Field id="pay-phone" label="M-Pesa phone number" wide>
              <input
                id="pay-phone"
                type="tel"
                className="nx-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>
          )}

          <Field id="pay-amount" label="Amount (KES)" wide>
            <input
              id="pay-amount"
              type="text"
              inputMode="numeric"
              className="nx-input"
              value={amountKes}
              onChange={(e) => setAmountKes(e.target.value)}
              required
            />
          </Field>

          {mode === 'manual' && (
            <>
              <Field id="pay-ref" label="Reference / receipt code" optional wide>
                <input
                  id="pay-ref"
                  type="text"
                  className="nx-input"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
              <Field id="pay-note" label="Note" optional wide>
                <input
                  id="pay-note"
                  type="text"
                  className="nx-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      </form>
    </Sheet>
  );
}
