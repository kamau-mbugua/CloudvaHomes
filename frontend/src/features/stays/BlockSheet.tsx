import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import { useToast } from '../../lib/useToast';
import { Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import { addDays, todayIso } from './calendar';
import type { CalendarUnit } from './types';

interface Props {
  units: CalendarUnit[];
  initialUnitId?: string;
  initialFrom?: string;
  onClose: () => void;
}

export function BlockSheet({
  units,
  initialUnitId,
  initialFrom,
  onClose,
}: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const defaultFrom = initialFrom ?? todayIso();
  const [unitId, setUnitId] = useState<string>(
    initialUnitId ?? units[0]?.unitId ?? '',
  );
  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo] = useState<string>(addDays(defaultFrom, 2));
  const [reason, setReason] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/host/blocks', {
        unitId,
        from,
        to,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
    },
    onSuccess: async () => {
      toast.saved('Dates blocked.');
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
    if (!unitId) {
      setLocalError('Select a unit.');
      return;
    }
    if (!from || !to || to <= from) {
      setLocalError('End date must be after start date.');
      return;
    }
    mutation.mutate();
  };

  return (
    <Sheet
      title="Block dates"
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
            form="block-sheet-form"
            className="nx-btn nx-btn--primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Blocking…' : 'Block dates'}
          </button>
        </>
      }
    >
      <form
        id="block-sheet-form"
        className="pf__dialogform"
        onSubmit={handleSubmit}
        noValidate
      >
        <p className="ad__muted">
          Hold a unit off the market for maintenance or personal use.
        </p>

        {localError && (
          <p className="nx-sheet__error" role="alert">
            {localError}
          </p>
        )}

        <div className="fm__grid">
          <Field id="block-unit" label="Unit" wide>
            <select
              id="block-unit"
              className="nx-input"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.title} ({u.property.name} · {u.unitNumber})
                </option>
              ))}
            </select>
          </Field>

          <Field id="block-from" label="From">
            <input
              id="block-from"
              type="date"
              className="nx-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>

          <Field id="block-to" label="To (checkout morning)">
            <input
              id="block-to"
              type="date"
              className="nx-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>

          <Field id="block-reason" label="Reason" optional wide>
            <input
              id="block-reason"
              type="text"
              placeholder="e.g. Painting, owner stay"
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
