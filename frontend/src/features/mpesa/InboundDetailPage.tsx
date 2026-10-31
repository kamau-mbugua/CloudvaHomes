import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { CardSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { AllocationEditor } from '../payments/AllocationEditor';
import { useAllocationDraft } from '../payments/useAllocationDraft';
import { AFTER_PAYMENT_KEYS, useOpenInvoices } from '../payments/api';
import { splitPaymentError, unwrap } from '../payments/rules';
import type { OpenInvoice } from '../payments/types';
import { keys as portfolioKeys } from '../portfolio/api';
import { useDebounced, useForm } from '../portfolio/hooks';
import { personName } from '../portfolio/labels';
import type { Tenant } from '../portfolio/types';
import { Badge, Breadcrumbs, Fact, Field } from '../portfolio/ui';
import { keys, mpesaErrorMessage, useInboundDetail } from './api';
import { MATCHED_BY, MATCH_STATUS, SOURCE } from './labels';
import { payerText, prettyJson } from './rules';
import type { InboundDetail, InboundTransaction, MatchSuggestion, MpesaTenantRef } from './types';

/**
 * One M-Pesa transaction (`GET /inbound-transactions/:id`): who paid, how much, the
 * account reference they typed, what Safaricom sent (collapsed), and — while it is
 * unmatched — tenants it might belong to. With `reconciliation:update`: assign it to a
 * tenant (records the payment, optionally choosing invoices), ignore it with a reason,
 * or un-ignore it.
 */
export function InboundDetailPage() {
  const { inboundId = '' } = useParams();
  const canUpdate = useCan('reconciliation:update');
  const canSeeTenants = useCan('tenants:view');
  const [dialog, setDialog] = useState<{ kind: 'assign'; tenant?: MpesaTenantRef } | { kind: 'ignore' } | null>(null);
  const [tab, setTab] = useState<'details' | 'suggestions' | 'raw'>('details');
  const inbound = useInboundDetail(inboundId);

  if (inbound.isPending) return <CardSkeleton count={3} />;
  if (inbound.isError) {
    return (
      <div className="ph">
        <EmptyState title="Transaction not available" detail={mpesaErrorMessage(inbound.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/reconciliation">Back to reconciliation</Link>} />
      </div>
    );
  }

  const t = inbound.data;
  const unmatched = t.matchStatus === 'UNMATCHED';
  const suggestions = t.suggestions ?? [];
  const tenantLink = (ref: MpesaTenantRef) => (canSeeTenants ? <Link to={`/app/tenants/${ref.id}`}>{personName(ref)}</Link> : personName(ref));

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[{ label: 'Reconciliation', to: '/app/reconciliation' }, { label: t.providerRef }]} />

      <div className="pf__head">
        <div>
          <h1><span className="num">{t.providerRef}</span> <Badge table={MATCH_STATUS} value={t.matchStatus} /></h1>
          <p>
            <span className="num">{formatKES(t.amount)}</span> from {payerText(t)} · {formatDateTime(t.occurredAt)}
          </p>
        </div>
        {canUpdate ? (
          <div className="sl__headactions">
            {unmatched ? (
              <>
                <button type="button" className="nx-btn nx-btn--primary" onClick={() => setDialog({ kind: 'assign' })}>Assign to tenant</button>
                <button type="button" className="nx-btn" onClick={() => setDialog({ kind: 'ignore' })}>Ignore</button>
              </>
            ) : t.matchStatus === 'IGNORED' ? <UnignoreButton inbound={t} /> : null}
          </div>
        ) : null}
      </div>

      {t.matchStatus === 'MATCHED' ? (
        <div className="ad__callout ad__callout--info mp__resolved" role="note">
          <p>
            Recorded as{' '}
            {t.payment ? <Link to={`/app/payments/${t.payment.id}`} className="num">{t.payment.number}</Link> : 'a payment'}
            {t.tenant ? <> for {tenantLink(t.tenant)} (<span className="num">{t.tenant.code}</span>)</> : null}
            {t.matchedBy ? ` — ${(MATCHED_BY[t.matchedBy] ?? t.matchedBy).toLowerCase()}` : ''}
            {t.resolvedBy ? `, by ${t.resolvedBy.name}` : ''}{t.resolvedAt ? ` on ${formatDateTime(t.resolvedAt)}` : ''}.
          </p>
        </div>
      ) : t.matchStatus === 'IGNORED' ? (
        <div className="ad__callout ad__callout--note" role="note">
          Ignored{t.resolvedBy ? ` by ${t.resolvedBy.name}` : ''}{t.resolvedAt ? ` on ${formatDateTime(t.resolvedAt)}` : ''}
          {t.ignoredReason ? ` — ${t.ignoredReason}` : ''}. It is not counted as a payment from anyone.
          {canUpdate ? ' Un-ignore it to assign it to a tenant after all.' : ''}
        </div>
      ) : (
        <div className="ad__callout ad__callout--info" role="note">
          <p>
            KodiHub couldn’t tell whose payment this is
            {t.accountRef ? <> — the account reference “<span className="num">{t.accountRef}</span>” isn’t a tenant code, invoice or unit</> : ' — there was no account reference'}.
            {canUpdate ? ' Assign it to the tenant who paid, or ignore it if it isn’t rent.' : ''}
          </p>
        </div>
      )}

      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Inbound transaction sections">
          <button type="button" role="tab" aria-selected={tab === 'details'} className="pf__tab" onClick={() => setTab('details')}>
            Details
          </button>
          {unmatched ? (
            <button type="button" role="tab" aria-selected={tab === 'suggestions'} className="pf__tab" onClick={() => setTab('suggestions')}>
              Might be ({suggestions.length})
            </button>
          ) : null}
          <button type="button" role="tab" aria-selected={tab === 'raw'} className="pf__tab" onClick={() => setTab('raw')}>
            Raw payload
          </button>
        </div>
      </div>

      {tab === 'details' ? (
        <section className="fm__section">
          <h2>Details</h2>
          <dl className="pf__facts">
            <Fact label="Amount"><span className="num">{formatKES(t.amount)}</span></Fact>
            <Fact label={t.source.startsWith('BANK') ? 'Bank reference' : 'M-Pesa receipt'}><span className="num">{t.providerRef}</span></Fact>
            <Fact label="Paid at">{formatDateTime(t.occurredAt)}</Fact>
            <Fact label="Source"><Badge table={SOURCE} value={t.source} /></Fact>
            <Fact label="Payer">{t.payerName}</Fact>
            <Fact label="Payer’s phone">{t.payerPhone ? <span className="num">{t.payerPhone}</span> : null}</Fact>
            <Fact label="Account reference">{t.accountRef ? <span className="num">{t.accountRef}</span> : null}</Fact>
            <Fact label="Into">{t.channel.name}</Fact>
            <Fact label="KodiHub was told">{formatDateTime(t.createdAt)}</Fact>
          </dl>
        </section>
      ) : null}

      {unmatched && tab === 'suggestions' ? (
        <section className="fm__section">
          <div className="pf__sectionhead"><h2>Might be</h2></div>
          {suggestions.length === 0 ? (
            <p className="ad__muted">No likely tenants. {canUpdate ? 'Use “Assign to tenant” to search for the right one.' : ''}</p>
          ) : (
            <ul className="mp__suggestions">
              {suggestions.map((s) => (
                <li key={s.tenant.id} className="mp__suggestion">
                  <div>
                    <strong>{tenantLink(s.tenant)}</strong> <span className="ad__muted num">{s.tenant.code}</span>
                    <span className="ad__sub">{s.reason}</span>
                  </div>
                  {canUpdate ? (
                    <button type="button" className="nx-btn nx-btn--sm" onClick={() => setDialog({ kind: 'assign', tenant: s.tenant })}>Assign</button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'raw' ? (
        <section className="fm__section">
          <h2>What Safaricom sent</h2>
          <p className="hint">The notice exactly as received, kept unchanged for the record.</p>
          <pre className="num">{prettyJson(t.raw)}</pre>
        </section>
      ) : null}

      {dialog?.kind === 'assign' ? <AssignSheet inbound={t} suggestions={suggestions} initial={dialog.tenant} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'ignore' ? <IgnoreSheet inbound={t} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

/** After any change, every list, count and this transaction are stale. */
function useRefreshInbound() {
  const queryClient = useQueryClient();
  return (withPayments = false) => Promise.all(
    [keys.inbound, ...(withPayments ? AFTER_PAYMENT_KEYS : [])].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

function UnignoreButton({ inbound }: { inbound: InboundTransaction }) {
  const toast = useToast();
  const refresh = useRefreshInbound();
  const unignore = useMutation({
    mutationFn: () => api.post<unknown>(`/inbound-transactions/${inbound.id}/unignore`),
    onSuccess: async () => {
      toast.saved(`${inbound.providerRef} is back on the unmatched list.`);
      await refresh();
    },
    onError: async (error) => {
      toast.failed(mpesaErrorMessage(error));
      if (error instanceof ApiError && error.code === 'ALREADY_RESOLVED') await refresh();
    },
  });
  return (
    <button type="button" className="nx-btn" disabled={unignore.isPending} onClick={() => unignore.mutate()}
      title="Put it back on the unmatched list so it can be assigned">
      {unignore.isPending ? 'Un-ignoring…' : 'Un-ignore'}
    </button>
  );
}

function IgnoreSheet({ inbound, onClose }: { inbound: InboundTransaction; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshInbound();
  const form = useForm<'reason'>({ reason: '' });
  const ignore = useMutation({
    mutationFn: (reason: string) => api.post<unknown>(`/inbound-transactions/${inbound.id}/ignore`, { reason }),
    onSuccess: async () => {
      toast.saved(`${inbound.providerRef} was ignored.`);
      await refresh();
      onClose();
    },
    onError: async (error) => {
      form.setErrors(error instanceof ApiError && error.fieldErrors.reason ? { reason: error.fieldErrors.reason } : {});
      form.setGeneral(mpesaErrorMessage(error));
      if (error instanceof ApiError && error.code === 'ALREADY_RESOLVED') await refresh();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const reason = form.values.reason.trim();
    form.setErrors(reason ? {} : { reason: 'Say why, e.g. “Not rent — the landlord’s personal payment”.' });
    form.setGeneral(null);
    if (reason) ignore.mutate(reason);
  };

  return (
    <Sheet
      title={`Ignore ${inbound.providerRef}?`}
      busy={ignore.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={ignore.isPending}>Cancel</button>
          <button type="submit" form="ignore-form" className="nx-btn nx-btn--primary" disabled={ignore.isPending}>
            {ignore.isPending ? 'Ignoring…' : 'Ignore'}
          </button>
        </>
      )}
    >
      <form id="ignore-form" className="pf__dialogform" onSubmit={submit} noValidate>
        <p className="ad__muted">
          <span className="num">{formatKES(inbound.amount)}</span> from {payerText(inbound)} won’t be recorded as anyone’s payment.
          It stays on the Ignored tab, with your reason, and can be un-ignored later.
        </p>
        <Field id="ig-reason" label="Reason" error={form.errors.reason}>
          <textarea id="ig-reason" rows={2} maxLength={500} value={form.values.reason} onChange={(e) => form.set('reason', e.target.value)}
            aria-invalid={Boolean(form.errors.reason)} placeholder="e.g. Not rent — refunded to the sender" />
        </Field>
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

/**
 * Assign to tenant (`POST /inbound-transactions/:id/assign`): pick the tenant (a
 * suggestion, or search), then the invoices it pays — automatically oldest first, or by
 * hand with the same allocation editor as "Record payment". The amount is fixed: it is
 * what M-Pesa received.
 */
function AssignSheet({ inbound, suggestions, initial, onClose }: {
  inbound: InboundDetail;
  suggestions: MatchSuggestion[];
  initial?: MpesaTenantRef;
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefreshInbound();
  const canSearch = useCan('tenants:view');
  const [picked, setPicked] = useState<MpesaTenantRef | null>(initial ?? null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const [error, setError] = useState<{ tenant?: string; allocations?: string; general?: string }>({});

  const tenants = useQuery({
    queryKey: [...portfolioKeys.tenants, 'search', term],
    queryFn: () => api.get<PageEnvelope<Tenant>>('/tenants', { q: term, pageSize: 8 }),
    enabled: canSearch && !picked && term.length > 0,
  });
  const open = useOpenInvoices(picked?.id);
  const invoices: OpenInvoice[] = open.data ?? [];
  const allocation = useAllocationDraft(invoices, inbound.amount);

  const assign = useMutation({
    mutationFn: ({ body }: { body: Record<string, unknown>; sent: string[] }) =>
      api.post<unknown>(`/inbound-transactions/${inbound.id}/assign`, body),
    onSuccess: async (response) => {
      const done = unwrap<InboundTransaction | undefined>(response);
      const who = picked ? personName(picked) : 'the tenant';
      toast.saved(done?.payment?.number
        ? `${inbound.providerRef} was recorded for ${who} as ${done.payment.number}.`
        : `${inbound.providerRef} was assigned to ${who}.`);
      await refresh(true);
      onClose();
    },
    onError: async (caught, { sent }) => {
      const split = splitPaymentError(caught, sent, ['tenantId', 'allocations'], {}, (e) => mpesaErrorMessage(e));
      allocation.setRowErrors(split.byInvoice);
      setError({ tenant: split.byField.tenantId, allocations: split.byField.allocations, general: split.general ?? undefined });
      if (caught instanceof ApiError && caught.code === 'ALREADY_RESOLVED') await refresh();
    },
  });

  const pick = (tenant: MpesaTenantRef | null) => {
    setPicked(tenant);
    allocation.reset(true);
    setError({});
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!picked) { setError({ tenant: 'Choose the tenant who paid.' }); return; }
    const checked = allocation.check(inbound.amount);
    if (!checked.ok) { setError({ allocations: checked.general ?? undefined }); return; }
    setError({});
    const body: Record<string, unknown> = { tenantId: picked.id };
    if (checked.allocations) body.allocations = checked.allocations;
    assign.mutate({ body, sent: (checked.allocations ?? []).map((a) => a.invoiceId) });
  };

  const results = tenants.data?.data ?? [];

  return (
    <Sheet
      title={`Assign ${inbound.providerRef}`}
      wide
      busy={assign.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={assign.isPending}>Cancel</button>
          <button type="submit" form="assign-form" className="nx-btn nx-btn--primary" disabled={assign.isPending || !picked}>
            {assign.isPending ? 'Recording…' : `Record ${formatKES(inbound.amount)}`}
          </button>
        </>
      )}
    >
      <form id="assign-form" className="sheet-form" onSubmit={submit} noValidate>
        <p className="ad__muted">
          Records <span className="num">{formatKES(inbound.amount)}</span> from {payerText(inbound)} as the chosen tenant’s payment, with
          M-Pesa receipt <span className="num">{inbound.providerRef}</span>, and sends them the SMS and email receipt (with PDF attached).
        </p>

        <div className={`fld ${error.tenant ? 'is-bad' : ''}`}>
          <span className="fld__label">Tenant</span>
          {picked ? (
            <div className="py__picked">
              <span><strong>{personName(picked)}</strong> <span className="ad__muted num">{picked.code}{picked.phone ? ` · ${picked.phone}` : ''}</span></span>
              <button type="button" className="nx-btn nx-btn--sm" onClick={() => pick(null)}>Change</button>
            </div>
          ) : (
            <>
              {suggestions.length > 0 ? (
                <div className="pf__results" role="listbox" aria-label="Suggested tenants">
                  {suggestions.map((s) => (
                    <button key={s.tenant.id} type="button" role="option" aria-selected={false} className="pf__result" onClick={() => pick(s.tenant)}>
                      <strong>{personName(s.tenant)}</strong>
                      <span>{s.tenant.code} · {s.reason}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {canSearch ? (
                <>
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off"
                    placeholder="Search by name, phone or tenant code" aria-label="Search tenants" />
                  {term ? (
                    <div className="pf__results" role="listbox" aria-label="Tenants">
                      {results.map((r) => (
                        <button key={r.id} type="button" role="option" aria-selected={false} className="pf__result" onClick={() => pick(r)}>
                          <strong>{personName(r)}</strong>
                          <span className="num">{r.code} · {r.phone}</span>
                        </button>
                      ))}
                      {tenants.isSuccess && results.length === 0 ? <span className="hint">No tenants match.</span> : null}
                      {tenants.isError ? <span className="fld__err">{mpesaErrorMessage(tenants.error)}</span> : null}
                    </div>
                  ) : null}
                </>
              ) : suggestions.length === 0 ? (
                <p className="ad__muted">Your role cannot look up tenants, and there are no suggestions to choose from.</p>
              ) : null}
            </>
          )}
          {error.tenant ? <span className="fld__err">{error.tenant}</span> : null}
        </div>

        {picked ? (
          <AllocationEditor draft={allocation} amountMinor={inbound.amount} invoicesState={{ pending: open.isPending, error: open.error }}
            tenantName={personName(picked)} error={error.allocations} />
        ) : null}

        {error.general ? <p className="nx-sheet__error" role="alert">{error.general}</p> : null}
      </form>
    </Sheet>
  );
}
