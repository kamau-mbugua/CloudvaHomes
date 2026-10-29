import { useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { isSuperAdmin } from '../../lib/auth/portals';
import { useSession } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { unwrap } from '../payments/rules';
import { Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { PAGE_SIZE, keys, platformErrorMessage, usePlans, usePlatformOperators } from '../platform/api';
import { checkTerms, formatDayish, monthlyTotal, overridesOf, ownerText, priceText, termsDraft } from '../platform/rules';
import type { TermsDraft } from '../platform/rules';
import type { PlatformInvoice, PlatformOrganization, PlatformPayment } from '../platform/types';
import { CustomBadge, HodiInvoicesTable, OrgStatusBadge, PlatformPaymentsTable } from '../platform/ui';
import { AdminInvoiceActions, RecordHodiPaymentSheet, VoidHodiInvoiceSheet } from './sheets';

/**
 * Admin → an organisation (`/admin/organizations/:id`): its status, billing account, owner
 * and let units; its billing terms — plan, its own price and minimum (empty = the plan's,
 * shown "Custom" when set), trial end and "no suspension until"; close or reopen; and its
 * Hodi invoices (void) and payments ("Record payment"). Every change is audited.
 */
export function OrganizationDetailPage() {
  const { organizationId = '' } = useParams();
  const org = useQuery({
    queryKey: [...keys.organizations, 'detail', organizationId],
    queryFn: () => api.get<unknown>(`/platform/organizations/${encodeURIComponent(organizationId)}`).then((body) => unwrap<PlatformOrganization>(body)),
  });

  if (org.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (org.isError) {
    return (
      <div className="ph">
        <EmptyState title="Organisation not available" detail={platformErrorMessage(org.error)} />
      </div>
    );
  }
  return <OrganizationDetail org={org.data} />;
}

type OrgDetailTab = 'terms' | 'invoices' | 'payments';

function OrganizationDetail({ org }: { org: PlatformOrganization }) {
  const { user } = useSession();
  const superAdmin = isSuperAdmin(user);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const defaultTab: OrgDetailTab = superAdmin ? 'terms' : 'invoices';
  const tab: OrgDetailTab =
    rawTab === 'invoices' || rawTab === 'payments'
      ? rawTab
      : rawTab === 'terms' && superAdmin
        ? 'terms'
        : defaultTab;

  const selectTab = (nextTab: OrgDetailTab) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextTab === defaultTab) next.delete('tab');
        else next.set('tab', nextTab);
        return next;
      },
      { replace: true },
    );
  };

  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'CLOSED') => api.patch<unknown>(`/platform/organizations/${encodeURIComponent(org.id)}`, { status }),
    onSuccess: async (_r, status) => {
      toast.saved(status === 'CLOSED' ? `${org.name} was closed.` : `${org.name} was reopened.`);
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => toast.failed(platformErrorMessage(error)),
  });

  const closed = org.status === 'CLOSED';

  return (
    <div className="pg">
      <Breadcrumbs trail={[{ label: 'Organisations', to: '/admin/organizations' }, { label: org.name }]} />
      <div className="adm__head">
        <div>
          <h1 className="adm__h1">{org.name}</h1>
          <span className="ad__muted"><span className="num">{org.billingRef}</span> · {org.kind === 'AGENCY' ? 'Agency' : 'Landlord'}</span>
        </div>
        <OrgStatusBadge status={org.status} />
        {superAdmin ? (
          <div className="pg-actions pg-push">
            {!closed ? (
              <button type="button" className="nx-btn nx-btn--primary" onClick={() => setRecording(true)}>Record payment</button>
            ) : null}
            {closed ? (
              <button type="button" className="nx-btn" disabled={setStatus.isPending} onClick={() => setStatus.mutate('ACTIVE')}>
                {setStatus.isPending ? 'Reopening…' : 'Reopen'}
              </button>
            ) : (
              <ConfirmDelete size="md" label="Close organisation" verb="Close" what={org.name} busy={setStatus.isPending}
                consequence="Its staff can no longer change anything and it is no longer billed. The daily status check leaves a closed organisation alone; you can reopen it at any time."
                onConfirm={() => setStatus.mutate('CLOSED')} />
            )}
          </div>
        ) : null}
      </div>

      <dl className="pf__facts adm__facts">
        <Fact label="Owes KodiHub"><span className={`num ${org.balance > 0 ? 'ad__owed' : ''}`}>{formatKES(org.balance ?? 0)}</span></Fact>
        {typeof org.credit === 'number' && org.credit > 0 ? <Fact label="Credit"><span className="num">{formatKES(org.credit)}</span></Fact> : null}
        <Fact label="Units let now"><span className="num">{org.occupiedUnits ?? '—'}</span></Fact>
        <Fact label="A month now comes to">
          {org.price ? <span className="num">{formatKES(monthlyTotal(org.occupiedUnits ?? 0, org.price))}</span> : null}
        </Fact>
        <Fact label="Owner">
          {ownerText(org.owner)}
          {org.owner?.phone || org.owner?.email ? <span className="ad__sub">{[org.owner?.phone, org.owner?.email].filter(Boolean).join(' · ')}</span> : null}
        </Fact>
        <Fact label="Salesperson">
          {org.onboardedBy ? `${org.onboardedBy.firstName} ${org.onboardedBy.lastName}`.trim() : null}
          {org.onboardedBy?.email ? <span className="ad__sub">{org.onboardedBy.email}</span> : null}
        </Fact>
        <Fact label="Trial ends">{org.trialEndsAt ? formatDayish(org.trialEndsAt) : null}</Fact>
        <Fact label="No suspension until">{org.noSuspendUntil ? formatDayish(org.noSuspendUntil) : null}</Fact>
      </dl>

      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Organisation sections">
          {superAdmin ? (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'terms'}
              className="pf__tab"
              onClick={() => selectTab('terms')}
            >
              Billing terms
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'invoices'}
            className="pf__tab"
            onClick={() => selectTab('invoices')}
          >
            KodiHub invoices
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'payments'}
            className="pf__tab"
            onClick={() => selectTab('payments')}
          >
            Payments
          </button>
        </div>
      </div>

      {tab === 'terms' && superAdmin ? (
        <TermsForm key={`${org.id}-${org.plan?.id ?? ''}-${org.priceOverride ?? ''}-${org.minimumOverride ?? ''}-${org.trialEndsAt ?? ''}-${org.noSuspendUntil ?? ''}-${org.price?.pricePerUnit}-${org.price?.minimumMonthly}-${org.onboardedById ?? ''}`} org={org} />
      ) : tab === 'invoices' ? (
        <OrgInvoices orgId={org.id} superAdmin={superAdmin} />
      ) : (
        <OrgPayments orgId={org.id} />
      )}

      {recording ? <RecordHodiPaymentSheet org={org} onClose={() => setRecording(false)} /> : null}
    </div>
  );
}

function TermsForm({ org }: { org: PlatformOrganization }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const plans = usePlans();
  const operators = usePlatformOperators();
  const initial = termsDraft(org);
  const initialSalespersonId = org.onboardedById ?? org.onboardedBy?.id ?? '';
  const [draft, setDraft] = useState<TermsDraft>(initial);
  const [salespersonId, setSalespersonId] = useState(initialSalespersonId);
  const [errors, setErrors] = useState<Partial<Record<keyof TermsDraft, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const set = (field: keyof TermsDraft, value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const own = overridesOf(org);

  const allPlans = plans.data ?? [];
  const chosenPlan = allPlans.find((p) => p.id === draft.planId) ?? null;
  // Inactive plans are offered only if it is the organisation's current one.
  const offered = allPlans.filter((p) => p.active || p.id === org.plan?.id);
  const dirty = (Object.keys(initial) as (keyof TermsDraft)[]).some((k) => draft[k].trim() !== initial[k]) || salespersonId !== initialSalespersonId;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<unknown>(`/platform/organizations/${encodeURIComponent(org.id)}`, body),
    onSuccess: async () => {
      toast.saved(`${org.name}’s billing terms were saved.`);
      await queryClient.invalidateQueries({ queryKey: keys.platform });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        const found: Partial<Record<keyof TermsDraft, string>> = {};
        for (const f of Object.keys(initial) as (keyof TermsDraft)[]) if (error.fieldErrors[f]) found[f] = error.fieldErrors[f];
        if (Object.keys(found).length > 0) { setErrors(found); return; }
      }
      setGeneral(platformErrorMessage(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setGeneral(null);
    const checked = checkTerms(org, draft);
    if (!checked.ok) { setErrors(checked.errors); return; }
    setErrors({});
    const payload: Record<string, unknown> = { ...checked.body };
    if (salespersonId !== initialSalespersonId) {
      payload.onboardedById = salespersonId || null;
    }
    if (Object.keys(payload).length === 0) return;
    save.mutate(payload);
  };

  const planPrice = chosenPlan ? formatKES(chosenPlan.pricePerUnit) : null;
  const planMinimum = chosenPlan ? formatKES(chosenPlan.minimumMonthly) : null;
  const allOperators = (operators.data ?? []).filter((op) => op.status === 'ACTIVE' || op.id === initialSalespersonId);

  return (
    <form className="fm__section adm__terms" onSubmit={submit} noValidate>
      <h2>Billing terms</h2>
      <p>
        Now: {org.price ? priceText(org.price) : '—'}{org.price?.custom ? ' (its own price)' : ''}. Changes apply from the next invoice;
        invoices already issued keep their figures.
      </p>
      <div className="fm__grid">
        <Field id="ot-plan" label="Plan" error={errors.planId}>
          <select id="ot-plan" value={draft.planId} aria-invalid={Boolean(errors.planId)} onChange={(e) => set('planId', e.target.value)}
            disabled={plans.isPending}>
            {!draft.planId ? <option value="">{plans.isPending ? 'Loading…' : 'Choose a plan…'}</option> : null}
            {offered.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inactive)'}</option>)}
            {org.plan?.id && !offered.some((p) => p.id === org.plan?.id) ? <option value={org.plan.id}>{org.plan.name}</option> : null}
          </select>
        </Field>
        <Field id="ot-salesperson" label="Salesperson / account owner" optional>
          <select id="ot-salesperson" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)} disabled={operators.isPending}>
            <option value="">Unassigned</option>
            {allOperators.map((op) => (
              <option key={op.id} value={op.id}>{op.firstName} {op.lastName} ({op.email})</option>
            ))}
          </select>
        </Field>
        <Field id="ot-price" label="Price per let unit (KES)" optional error={errors.priceOverride}
          hint={draft.priceOverride.trim() ? 'This organisation’s own price. Empty it to use the plan’s.' : planPrice ? `Empty: the plan’s ${planPrice}.` : 'Empty: the plan’s price.'}>
          <span className="adm__override">
            <input id="ot-price" inputMode="decimal" autoComplete="off" value={draft.priceOverride} placeholder={planPrice ?? ''}
              aria-invalid={Boolean(errors.priceOverride)} onChange={(e) => set('priceOverride', e.target.value)} />
            {draft.priceOverride.trim() ? <CustomBadge /> : null}
          </span>
        </Field>
        <Field id="ot-min" label="Monthly minimum (KES)" optional error={errors.minimumOverride}
          hint={draft.minimumOverride.trim() ? 'This organisation’s own minimum. Empty it to use the plan’s.' : planMinimum ? `Empty: the plan’s ${planMinimum}.` : 'Empty: the plan’s minimum.'}>
          <span className="adm__override">
            <input id="ot-min" inputMode="decimal" autoComplete="off" value={draft.minimumOverride} placeholder={planMinimum ?? ''}
              aria-invalid={Boolean(errors.minimumOverride)} onChange={(e) => set('minimumOverride', e.target.value)} />
            {draft.minimumOverride.trim() ? <CustomBadge /> : null}
          </span>
        </Field>
        <Field id="ot-trial" label="Trial ends" optional error={errors.trialEndsAt}
          hint="Months ending on or before this day aren’t billed. Empty: no trial.">
          <input id="ot-trial" type="date" value={draft.trialEndsAt} aria-invalid={Boolean(errors.trialEndsAt)}
            onChange={(e) => set('trialEndsAt', e.target.value)} />
        </Field>
        <Field id="ot-nosuspend" label="No suspension until" optional error={errors.noSuspendUntil}
          hint="Until this day an unpaid organisation stays in grace (banner only) instead of becoming read-only.">
          <input id="ot-nosuspend" type="date" value={draft.noSuspendUntil} aria-invalid={Boolean(errors.noSuspendUntil)}
            onChange={(e) => set('noSuspendUntil', e.target.value)} />
        </Field>
      </div>
      {own.price !== null || own.minimum !== null ? (
        <p className="hint">Saved now: {own.price !== null ? `own price ${formatKES(own.price)}` : 'the plan’s price'}, {own.minimum !== null ? `own minimum ${formatKES(own.minimum)}` : 'the plan’s minimum'}.</p>
      ) : null}
      {plans.isError ? <p className="ad__error" role="alert">{platformErrorMessage(plans.error)}</p> : null}
      {general ? <p className="ad__error" role="alert">{general}</p> : null}
      <div className="pg-actions">
        <button type="button" className="nx-btn" disabled={!dirty || save.isPending}
          onClick={() => { setDraft(initial); setSalespersonId(initialSalespersonId); setErrors({}); setGeneral(null); }}>Discard changes</button>
        <button type="submit" className="nx-btn nx-btn--primary" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save terms'}
        </button>
      </div>
    </form>
  );
}

function OrgInvoices({ orgId, superAdmin }: { orgId: string; superAdmin: boolean }) {
  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<PlatformInvoice | null>(null);
  const list = useQuery({
    queryKey: [...keys.invoices, 'list', { orgId, page }],
    queryFn: () => api.get<PageEnvelope<PlatformInvoice>>('/platform/invoices', { orgId, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  return (
    <section className="ad__section" aria-labelledby="oi-title">
      <div className="pf__sectionhead"><h2 id="oi-title">KodiHub invoices</h2></div>
      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}
      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap"><EmptyState title="No invoices yet" detail="Months in the trial aren’t billed. Run a month from Invoices." /></div>
      ) : (
        <HodiInvoicesTable rows={rows} actions={(inv) => <AdminInvoiceActions invoice={inv} onVoid={superAdmin ? setVoiding : undefined} />} />
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      {voiding ? <VoidHodiInvoiceSheet invoice={voiding} onClose={() => setVoiding(null)} /> : null}
    </section>
  );
}

function OrgPayments({ orgId }: { orgId: string }) {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...keys.payments, 'list', { orgId, page }],
    queryFn: () => api.get<PageEnvelope<PlatformPayment>>('/platform/payments', { orgId, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  return (
    <section className="ad__section" aria-labelledby="op-title">
      <div className="pf__sectionhead"><h2 id="op-title">Payments</h2></div>
      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}
      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap"><EmptyState title="No payments yet" /></div>
      ) : <PlatformPaymentsTable rows={rows} />}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </section>
  );
}
