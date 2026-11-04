import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { formatDay } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { currentPeriod, formatPeriod, shiftPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { MonthPicker } from '../billing/ui';
import { OCCUPANCY_KEYS, portfolioErrorMessage } from '../portfolio/api';
import { Field } from '../portfolio/ui';
import { checkRenewal, checkRentChange, pendingChangeText } from './leaseTerms';

/** What the lease sheets need to know about a tenancy. */
export interface LeaseTenancy {
  id: string;
  startDate: string;
  rentAmount?: number;
  leaseEndDate?: string | null;
  rentChanges?: { id: string; effectivePeriod: string; newRent: number; note: string | null }[];
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all(OCCUPANCY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** "Change rent": schedule a new rent from a month not yet invoiced, or cancel a scheduled one. */
export function RentChangeSheet({ tenancy, who, onClose }: { tenancy: LeaseTenancy; who: string; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [newRent, setNewRent] = useState('');
  const [period, setPeriod] = useState(shiftPeriod(currentPeriod(), 1));
  const [note, setNote] = useState('');
  const [notifyTenant, setNotifyTenant] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<'newRent' | 'effectivePeriod', string>>>({});

  const schedule = useMutation({
    mutationFn: (body: object) => api.post(`/tenancies/${tenancy.id}/rent-changes`, body),
    onSuccess: async () => {
      toast.saved(`${who}’s rent changes from ${formatPeriod(period)}.`);
      await refresh();
      onClose();
    },
  });
  const cancel = useMutation({
    mutationFn: (changeId: string) => api.delete(`/tenancies/${tenancy.id}/rent-changes/${changeId}`),
    onSuccess: async () => {
      toast.saved('The scheduled rent change was cancelled.');
      await refresh();
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  const submit = () => {
    const checked = checkRentChange({ newRent, effectivePeriod: period, note, notifyTenant });
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    schedule.mutate(checked.body);
  };

  const pending = tenancy.rentChanges ?? [];
  return (
    <Sheet
      title={`Change ${who}’s rent`}
      busy={schedule.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={schedule.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={submit} disabled={schedule.isPending}>
            {schedule.isPending ? 'Saving…' : 'Schedule rent change'}
          </button>
        </>
      )}
    >
      <p className="ad__muted">
        Current rent {typeof tenancy.rentAmount === 'number' ? formatKES(tenancy.rentAmount) : '—'}. The new rent starts with the
        first invoice of the month you choose; months already invoiced can’t change.
      </p>
      {pending.length ? (
        <ul className="ls__pending">
          {pending.map((c) => (
            <li key={c.id}>
              <span>{pendingChangeText(c)}{c.note ? ` · ${c.note}` : ''}</span>
              <button type="button" className="nx-btn nx-btn--sm" disabled={cancel.isPending} onClick={() => cancel.mutate(c.id)}>
                Cancel change
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="fm__grid">
        <Field id="rc-rent" label="New monthly rent (KES)" error={errors.newRent}>
          <input id="rc-rent" inputMode="decimal" value={newRent} aria-invalid={!!errors.newRent}
            onChange={(e) => { setNewRent(e.target.value); setErrors({}); }} />
        </Field>
        <Field id="rc-month" label="From" error={errors.effectivePeriod}>
          <MonthPicker value={period} onChange={(p) => { setPeriod(p); setErrors({}); }} label="First month at the new rent" />
        </Field>
        <Field id="rc-note" label="Note" optional wide>
          <input id="rc-note" value={note} maxLength={200} placeholder="e.g. Annual review" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <label className="fld__check">
        <input type="checkbox" checked={notifyTenant} onChange={(e) => setNotifyTenant(e.target.checked)} />
        Text the tenant about the new rent (and notify them in the tenant app)
      </label>
      {schedule.isError ? <p className="nx-sheet__error" role="alert">{portfolioErrorMessage(schedule.error)}</p> : null}
    </Sheet>
  );
}

/** "Renew lease": a later lease end date, optionally with a new rent from a chosen month. */
export function RenewLeaseSheet({ tenancy, who, onClose }: { tenancy: LeaseTenancy; who: string; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [changeRent, setChangeRent] = useState(false);
  const [newRent, setNewRent] = useState('');
  const [period, setPeriod] = useState(shiftPeriod(currentPeriod(), 1));
  const [notifyTenant, setNotifyTenant] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<'leaseEndDate' | 'newRent' | 'effectivePeriod', string>>>({});

  const renew = useMutation({
    mutationFn: (body: object) => api.post(`/tenancies/${tenancy.id}/renew`, body),
    onSuccess: async () => {
      toast.saved(`${who}’s lease was renewed.`);
      await refresh();
      onClose();
    },
  });

  const submit = () => {
    const checked = checkRenewal({ leaseEndDate, changeRent, newRent, effectivePeriod: period, notifyTenant }, tenancy.startDate);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    renew.mutate(checked.body);
  };

  return (
    <Sheet
      title={`Renew ${who}’s lease`}
      busy={renew.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={renew.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" onClick={submit} disabled={renew.isPending}>
            {renew.isPending ? 'Saving…' : 'Renew lease'}
          </button>
        </>
      )}
    >
      <p className="ad__muted">
        {tenancy.leaseEndDate ? `The lease currently ends ${formatDay(tenancy.leaseEndDate)}.` : 'The lease has no end date yet.'} Renewing keeps the
        same tenancy, deposit and history.
      </p>
      <Field id="rn-end" label="New lease end date" error={errors.leaseEndDate}>
        <input id="rn-end" type="date" min={tenancy.startDate} value={leaseEndDate} aria-invalid={!!errors.leaseEndDate}
          onChange={(e) => { setLeaseEndDate(e.target.value); setErrors({}); }} />
      </Field>
      <label className="fld__check">
        <input type="checkbox" checked={changeRent} onChange={(e) => setChangeRent(e.target.checked)} />
        Change the rent with the renewal
      </label>
      {changeRent ? (
        <>
          <div className="fm__grid">
            <Field id="rn-rent" label="New monthly rent (KES)" error={errors.newRent}>
              <input id="rn-rent" inputMode="decimal" value={newRent} aria-invalid={!!errors.newRent}
                onChange={(e) => { setNewRent(e.target.value); setErrors({}); }} />
            </Field>
            <Field id="rn-month" label="From" error={errors.effectivePeriod}>
              <MonthPicker value={period} onChange={(p) => { setPeriod(p); setErrors({}); }} label="First month at the new rent" />
            </Field>
          </div>
          <label className="fld__check">
            <input type="checkbox" checked={notifyTenant} onChange={(e) => setNotifyTenant(e.target.checked)} />
            Text the tenant about the new rent
          </label>
        </>
      ) : null}
      {renew.isError ? <p className="nx-sheet__error" role="alert">{portfolioErrorMessage(renew.error)}</p> : null}
    </Sheet>
  );
}
