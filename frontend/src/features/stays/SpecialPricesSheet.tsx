import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { useToast } from '../../lib/useToast';
import { Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import { fromMinor, toMinorString } from './money';
import type { Listing, SpecialPrice } from './types';

interface DraftRange {
  fromDate: string;
  toDate: string;
  nightlyKes: string;
  label: string;
}

export function SpecialPricesSheet({
  listing,
  onClose,
}: {
  listing: Listing;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<DraftRange[]>(() =>
    listing.specialPrices.map((sp) => ({
      fromDate: sp.fromDate,
      toDate: sp.toDate,
      nightlyKes: fromMinor(sp.nightlyPrice),
      label: sp.label ?? '',
    })),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (
      ranges: Array<{
        fromDate: string;
        toDate: string;
        nightlyPrice: string;
        label?: string;
      }>,
    ) =>
      api.put<DataEnvelope<SpecialPrice[]>>(
        `/host/listings/${listing.id}/special-prices`,
        { ranges },
      ),
    onSuccess: async () => {
      toast.saved('Special date prices saved.');
      await queryClient.invalidateQueries({
        queryKey: staysKeys.listing(listing.id),
      });
      await queryClient.invalidateQueries({ queryKey: staysKeys.listings });
      onClose();
    },
  });

  const addRow = () => {
    setRows((cur) => [
      ...cur,
      { fromDate: '', toDate: '', nightlyKes: '', label: '' },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((cur) => cur.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<DraftRange>) => {
    setRows((cur) =>
      cur.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const payload: Array<{
      fromDate: string;
      toDate: string;
      nightlyPrice: string;
      label?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.fromDate || !r.toDate) {
        setLocalError(`Row ${i + 1}: select both From and To dates.`);
        return;
      }
      if (r.toDate <= r.fromDate) {
        setLocalError(`Row ${i + 1}: end date must be after start date.`);
        return;
      }
      const minor = toMinorString(r.nightlyKes);
      if (!minor || BigInt(minor) <= 0n) {
        setLocalError(
          `Row ${i + 1}: enter a whole-shilling price greater than 0.`,
        );
        return;
      }
      payload.push({
        fromDate: r.fromDate,
        toDate: r.toDate,
        nightlyPrice: minor,
        label: r.label.trim() ? r.label.trim() : undefined,
      });
    }

    const sorted = [...payload].sort((a, b) =>
      a.fromDate.localeCompare(b.fromDate),
    );
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].fromDate < sorted[i - 1].toDate) {
        setLocalError('Special price date ranges cannot overlap.');
        return;
      }
    }

    save.mutate(payload);
  };

  const errMsg =
    localError ?? (save.isError ? staysErrorMessage(save.error) : null);

  return (
    <Sheet
      title="Special date prices"
      wide
      busy={save.isPending}
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
            form="special-prices-form"
            className="nx-btn nx-btn--primary"
            disabled={save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save special prices'}
          </button>
        </>
      }
    >
      <form
        id="special-prices-form"
        className="pf__dialogform"
        onSubmit={submit}
        noValidate
      >
        <p className="ad__muted">
          Set custom nightly rates for holidays or peak seasons (end date is the
          checkout morning).
        </p>

        {errMsg && (
          <p className="nx-sheet__error" role="alert">
            {errMsg}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="ad__muted">No special date ranges configured yet.</p>
        ) : (
          <div className="st__sp__list">
            {rows.map((r, idx) => (
              <div key={idx} className="st__sp__card">
                <div className="fm__grid">
                  <Field id={`sp-from-${idx}`} label="From">
                    <input
                      id={`sp-from-${idx}`}
                      className="nx-input"
                      type="date"
                      value={r.fromDate}
                      onChange={(e) =>
                        updateRow(idx, { fromDate: e.target.value })
                      }
                    />
                  </Field>
                  <Field id={`sp-to-${idx}`} label="To (checkout)">
                    <input
                      id={`sp-to-${idx}`}
                      className="nx-input"
                      type="date"
                      value={r.toDate}
                      onChange={(e) =>
                        updateRow(idx, { toDate: e.target.value })
                      }
                    />
                  </Field>
                  <Field id={`sp-price-${idx}`} label="Nightly (KES)">
                    <input
                      id={`sp-price-${idx}`}
                      className="nx-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 8500"
                      value={r.nightlyKes}
                      onChange={(e) =>
                        updateRow(idx, { nightlyKes: e.target.value })
                      }
                    />
                  </Field>
                  <Field id={`sp-label-${idx}`} label="Label" optional>
                    <input
                      id={`sp-label-${idx}`}
                      className="nx-input"
                      type="text"
                      placeholder="e.g. December holidays"
                      value={r.label}
                      onChange={(e) =>
                        updateRow(idx, { label: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="st__sp__actions">
                  <button
                    type="button"
                    className="nx-btn nx-btn--sm"
                    onClick={() => removeRow(idx)}
                  >
                    Remove range
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <button
            type="button"
            className="nx-btn nx-btn--sm"
            onClick={addRow}
          >
            + Add date range
          </button>
        </div>
      </form>
    </Sheet>
  );
}
