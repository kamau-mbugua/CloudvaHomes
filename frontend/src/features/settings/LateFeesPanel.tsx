import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { Organization } from '../../lib/auth/types';
import { minorToInput } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { keys, settingsErrorMessage } from './api';
import { agencyLateFeeNotice, checkLateFees, lateFeeExample, readLateFees, type LateFeeDraft } from './lateFees';

/**
 * Organisation settings → Late fees. Its own save, because it sits inside the main settings
 * form (no nested <form>; the buttons are type="button").
 */
export function LateFeesPanel({ org, canEdit }: { org: Organization; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const saved = readLateFees(org.lateFees);
  const initial: LateFeeDraft = {
    enabled: saved.enabled,
    mode: saved.mode,
    amount: saved.amount ? minorToInput(saved.amount) : '',
    percent: String(saved.percentBps / 100),
    graceDays: String(saved.graceDays),
  };
  const [draft, setDraft] = useState<LateFeeDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<'amount' | 'percent' | 'graceDays', string>>>({});
  const checked = checkLateFees(draft);
  const dirty = (Object.keys(initial) as (keyof LateFeeDraft)[]).some((k) => draft[k] !== initial[k]);
  const set = (patch: Partial<LateFeeDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const save = useMutation({
    mutationFn: (lateFees: object) => api.patch('/organization', { lateFees }),
    onSuccess: async () => {
      toast.saved(draft.enabled ? 'Late fees saved.' : 'Late fees are off.');
      await queryClient.invalidateQueries({ queryKey: keys.organization });
    },
  });

  const submit = () => {
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    save.mutate(checked.lateFees);
  };

  const disabled = !canEdit || save.isPending;
  return (
    <section className="fm__section">
      <h2>Late fees</h2>
      <p>
        One fee per overdue monthly rent invoice, issued as its own invoice once the grace days have passed. To
        waive a fee, void that fee invoice. Voiding the original invoice also voids its unpaid fee.
      </p>
      {org.kind === 'AGENCY' ? (
        <p className={saved.agreementsMissingRecipient > 0 ? 'lf__notice lf__notice--warn' : 'lf__notice'} role="status">
          {agencyLateFeeNotice(saved.agreementsMissingRecipient)}{' '}
          {saved.agreementsMissingRecipient > 0 ? <Link to="/app/agreements">Set it on the agreements</Link> : null}
        </p>
      ) : null}

      <label className="tm__toggle">
        <input type="checkbox" checked={draft.enabled} disabled={disabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span>
          <strong>Charge late fees</strong>
          <span className="ad__muted">{checked.ok && draft.enabled ? lateFeeExample(checked.lateFees) : 'Off — no late fees are charged.'}</span>
        </span>
      </label>

      <fieldset className="lf__mode" disabled={disabled || !draft.enabled}>
        <legend>The fee</legend>
        <label className="lf__radio">
          <input type="radio" name="lf-mode" checked={draft.mode === 'PERCENT'} onChange={() => set({ mode: 'PERCENT' })} />
          A percentage of what is still unpaid
        </label>
        <label className="lf__radio">
          <input type="radio" name="lf-mode" checked={draft.mode === 'FLAT'} onChange={() => set({ mode: 'FLAT' })} />
          A fixed amount
        </label>
        <div className="fm__grid">
          {draft.mode === 'PERCENT' ? (
            <label className="fld">
              <span>Percentage</span>
              <input className="nx-input" inputMode="decimal" value={draft.percent} aria-invalid={!!errors.percent}
                onChange={(e) => set({ percent: e.target.value })} />
              {errors.percent ? <span className="fld__err">{errors.percent}</span> : <span className="hint">For example 5 for 5%.</span>}
            </label>
          ) : (
            <label className="fld">
              <span>Amount (KES)</span>
              <input className="nx-input" inputMode="decimal" value={draft.amount} aria-invalid={!!errors.amount}
                onChange={(e) => set({ amount: e.target.value })} />
              {errors.amount ? <span className="fld__err">{errors.amount}</span> : null}
            </label>
          )}
          <label className="fld">
            <span>Grace days</span>
            <input className="nx-input" inputMode="numeric" value={draft.graceDays} aria-invalid={!!errors.graceDays}
              onChange={(e) => set({ graceDays: e.target.value })} />
            {errors.graceDays ? <span className="fld__err">{errors.graceDays}</span> : <span className="hint">Days after the due date before the fee.</span>}
          </label>
        </div>
      </fieldset>

      {save.isError ? <p className="ad__error" role="alert">{settingsErrorMessage(save.error)}</p> : null}
      {canEdit ? (
        <div className="pg-actions">
          <button type="button" className="nx-btn" disabled={!dirty || save.isPending} onClick={() => { setDraft(initial); setErrors({}); save.reset(); }}>
            Discard changes
          </button>
          <button type="button" className="nx-btn nx-btn--primary" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save late fees'}
          </button>
        </div>
      ) : (
        <p className="ad__muted">Your role can view these settings but not change them.</p>
      )}
    </section>
  );
}
