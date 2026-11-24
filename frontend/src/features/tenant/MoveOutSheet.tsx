import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { formatDay, isDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { Sheet } from '../../components/Sheet';
import { unwrap } from '../payments/rules';
import { Field } from '../portfolio/ui';
import { keys, tenantErrorMessage } from './api';
import { addDaysToDay, homeText } from './rules';
import type { ConsolidatedTenancy } from './types';

interface NoticePreview {
  noticeDays: number;
  earliestMoveOut: string;
  shortNotice: boolean;
  noticeEndsOn: string | null;
  rentInLieu: number;
}

/**
 * "I'm moving out" (phase 14): the tenant picks a move-out date and sees what it means before
 * confirming: the notice period, and on short notice the rent still due in lieu. Their
 * landlord or agent is told, and can waive that rent.
 */
export function MoveOutSheet({ home, onClose }: { home: ConsolidatedTenancy; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = todayInNairobi();
  const [date, setDate] = useState(addDaysToDay(today, 30));
  const [reason, setReason] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const base = `/tenant/accounts/${encodeURIComponent(home.tenantId)}/tenancies/${encodeURIComponent(home.id)}/notice`;
  const validDate = isDay(date) && date >= today;

  const preview = useQuery({
    queryKey: ['tenant-portal', 'notice', home.id, date],
    queryFn: () => api.get<unknown>(base, { moveOutDate: date }).then((b) => unwrap<NoticePreview>(b)),
    enabled: validDate,
  });

  const give = useMutation({
    mutationFn: () =>
      api.post<unknown>(base, {
        moveOutDate: date,
        reason: reason.trim() || undefined,
        forwardingPhone: phone.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.saved(`Notice given. ${home.orgName} has been told you’re moving out on ${formatDay(date)}.`);
      await queryClient.invalidateQueries({ queryKey: keys.all });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        return;
      }
      setGeneral(tenantErrorMessage(error, home.orgName));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    if (!validDate) {
      setErrors({ moveOutDate: 'Choose today or a later date.' });
      return;
    }
    setErrors({});
    give.mutate();
  };

  const p = preview.data;
  return (
    <Sheet
      title="I’m moving out"
      busy={give.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={give.isPending}>Cancel</button>
          <button type="submit" form="move-out" className="nx-btn nx-btn--primary" disabled={give.isPending || !validDate}>
            {give.isPending ? 'Sending…' : 'Give notice'}
          </button>
        </>
      )}
    >
      <form id="move-out" className="sheet-form" onSubmit={submit} noValidate>
        <p>Give notice to {home.orgName} that you’re leaving {homeText(home)}.</p>
        <div className="fm__grid sheet-grid">
          <Field id="mo-date" label="Moving out on" error={errors.moveOutDate}>
            <input id="mo-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="mo-phone" label="Phone to reach you after you leave" optional error={errors.forwardingPhone}
            hint="For your deposit refund, if it’s a different number.">
            <input id="mo-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field id="mo-reason" label="Why you’re leaving" optional wide error={errors.reason}>
            <textarea id="mo-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        {p ? (
          p.shortNotice ? (
            <p className="nx-sheet__warn" role="status">
              Your notice period is {p.noticeDays} days, so it ends on {formatDay(p.earliestMoveOut)}.
              {p.rentInLieu > 0
                ? ` Moving out sooner, ${formatKES(p.rentInLieu)} in rent is still due for the rest of the notice period, unless ${home.orgName} agrees to waive it.`
                : ' Moving out sooner is fine: no further rent falls due before then.'}
            </p>
          ) : (
            <p className="ad__muted">That gives the {p.noticeDays} days’ notice {home.orgName} asks for. Rent is billed up to your move-out date.</p>
          )
        ) : null}
        <p className="ad__muted">Your deposit is settled after the move-out inspection.</p>
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
