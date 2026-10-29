import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { Field } from '../portfolio/ui';
import { keys, platformErrorMessage, usePlans } from '../platform/api';
import { checkPlan, planDraft } from '../platform/rules';
import type { PlanBody, PlanDraft } from '../platform/rules';
import type { Plan } from '../platform/types';

/**
 * Admin → Plans (`/admin/plans`): Hodi's prices. A plan is a price per let unit a month, a
 * monthly minimum and free trial days; one is the default for new organisations. Add,
 * edit, make default, delete (only when no organisation is on it — `409 PLAN_IN_USE`).
 * Inactive plans stay on their organisations but aren't offered for new ones.
 */
export function PlansPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const plans = usePlans();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.platform });
  const makeDefault = useMutation({
    mutationFn: (plan: Plan) => api.patch<unknown>(`/platform/plans/${encodeURIComponent(plan.id)}`, { isDefault: true }),
    onSuccess: async (_r, plan) => { toast.saved(`${plan.name} is now the default plan for new organisations.`); await refresh(); },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (plan: Plan) => api.delete<unknown>(`/platform/plans/${encodeURIComponent(plan.id)}`),
    onSuccess: async (_r, plan) => { toast.saved(`${plan.name} was deleted.`); await refresh(); },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const rows = plans.data ?? [];

  return (
    <div className="pg">
      <div className="ad__filters">
        <p className="ad__muted pg-grow">Prices are per unit let on the last day of the month, never less than the monthly minimum.</p>
        <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setEditing('new')}>New plan</button>
      </div>

      {plans.isError ? <p className="ad__error" role="alert">{platformErrorMessage(plans.error)}</p> : null}

      {plans.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !plans.isError ? (
        <div className="ad__tablewrap">
          <EmptyState title="No plans yet" detail="Add a plan and make it the default, so new organisations get a price."
            action={<button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>New plan</button>} />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Plan</th>
                <th className="num">Per let unit</th>
                <th className="num">Monthly minimum</th>
                <th className="num">Trial</th>
                <th className="num">Organisations</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <span className="hb__price">
                      <strong>{plan.name}</strong>
                      {plan.isDefault ? <span className="ad__badge ad__badge--ok">Default</span> : null}
                      {!plan.active ? <span className="ad__badge ad__badge--off">Inactive</span> : null}
                    </span>
                    {plan.description ? <span className="ad__sub">{plan.description}</span> : null}
                  </td>
                  <td className="num">{formatKES(plan.pricePerUnit)}</td>
                  <td className="num">{formatKES(plan.minimumMonthly)}</td>
                  <td className="num">{plan.trialDays} {plan.trialDays === 1 ? 'day' : 'days'}</td>
                  <td className="num">{plan.organizationCount}</td>
                  <td className="ad__rowactions">
                    <div>
                      <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(plan)}>Edit</button>
                      {!plan.isDefault && plan.active ? (
                        <button type="button" className="nx-btn nx-btn--sm" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(plan)}>
                          Make default
                        </button>
                      ) : null}
                      {!plan.isDefault ? (
                        <ConfirmDelete what={`the “${plan.name}” plan`} busy={remove.isPending} onConfirm={() => remove.mutate(plan)}
                          consequence={plan.organizationCount > 0
                            ? `${plan.organizationCount} ${plan.organizationCount === 1 ? 'organisation is' : 'organisations are'} on it, so KodiHub will refuse. Move them first, or mark the plan inactive.`
                            : 'No organisation is on it. This cannot be undone.'} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((p) => p.organizationCount > 0) ? (
        <p className="hint pg-gap">A plan organisations are on can’t be deleted; mark it inactive instead, or move them to another plan first.</p>
      ) : null}

      {editing ? <PlanSheet plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function PlanSheet({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<PlanDraft>(planDraft(plan));
  const [errors, setErrors] = useState<Partial<Record<keyof PlanDraft, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = <K extends keyof PlanDraft>(field: K, value: PlanDraft[K]) => setDraft((d) => ({ ...d, [field]: value }));

  const save = useMutation({
    mutationFn: (body: PlanBody) => {
      if (plan) return api.patch<unknown>(`/platform/plans/${encodeURIComponent(plan.id)}`, body);
      // A new plan is active; `active` is only taken by PATCH.
      const { active: _active, ...create } = body;
      return api.post<unknown>('/platform/plans', create);
    },
    onSuccess: async (_r, body) => {
      toast.saved(plan ? `${body.name} was saved.` : `${body.name} was added.`);
      await queryClient.invalidateQueries({ queryKey: keys.platform });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const found: Partial<Record<keyof PlanDraft, string>> = {};
        for (const f of Object.keys(draft) as (keyof PlanDraft)[]) if (error.fieldErrors[f]) found[f] = error.fieldErrors[f];
        if (Object.keys(found).length > 0) { setErrors(found); return; }
      }
      setGeneral(platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkPlan(draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    save.mutate(checked.body);
  };

  const wasDefault = Boolean(plan?.isDefault);

  return (
    <Sheet
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="plan-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : plan ? 'Save plan' : 'Add plan'}
          </button>
        </>
      )}
    >
      <form id="plan-form" className="sheet-form" onSubmit={submit} noValidate>
        {plan && plan.organizationCount > 0 ? (
          <p className="ad__callout ad__callout--info">
            {plan.organizationCount} {plan.organizationCount === 1 ? 'organisation is' : 'organisations are'} on this plan. New prices apply
            from their next invoice; organisations with their own price keep it.
          </p>
        ) : null}
        <div className="fm__grid sheet-grid">
          <Field id="pl-name" label="Name" error={errors.name} wide>
            <input id="pl-name" autoComplete="off" maxLength={80} value={draft.name} aria-invalid={Boolean(errors.name)} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field id="pl-desc" label="Description" optional error={errors.description} wide>
            <input id="pl-desc" autoComplete="off" maxLength={500} value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field id="pl-price" label="Price per let unit a month (KES)" error={errors.pricePerUnit} hint="Cents allowed, e.g. 149.50.">
            <input id="pl-price" inputMode="decimal" autoComplete="off" value={draft.pricePerUnit} aria-invalid={Boolean(errors.pricePerUnit)}
              onChange={(e) => set('pricePerUnit', e.target.value)} />
          </Field>
          <Field id="pl-min" label="Monthly minimum (KES)" error={errors.minimumMonthly} hint="The least a month costs. 0 for none.">
            <input id="pl-min" inputMode="decimal" autoComplete="off" value={draft.minimumMonthly} aria-invalid={Boolean(errors.minimumMonthly)}
              onChange={(e) => set('minimumMonthly', e.target.value)} />
          </Field>
          <Field id="pl-trial" label="Free trial (days)" error={errors.trialDays} hint="For organisations that start on this plan. 0 to 365.">
            <input id="pl-trial" inputMode="numeric" autoComplete="off" maxLength={3} value={draft.trialDays} aria-invalid={Boolean(errors.trialDays)}
              onChange={(e) => set('trialDays', e.target.value)} />
          </Field>
        </div>
        {plan ? (
          <label className="fld__check">
            <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} disabled={wasDefault} />
            Active — offered for organisations{wasDefault ? ' (the default plan stays active)' : ''}
          </label>
        ) : null}
        <label className="fld__check">
          <input type="checkbox" checked={draft.isDefault} onChange={(e) => set('isDefault', e.target.checked)} disabled={wasDefault} />
          Default plan for new organisations{wasDefault ? ' — make another plan the default to change this' : ''}
        </label>
        {errors.isDefault ? <span className="fld__err">{errors.isDefault}</span> : null}
        {general ? <p className="nx-sheet__error" role="alert">{general}</p> : null}
      </form>
    </Sheet>
  );
}
