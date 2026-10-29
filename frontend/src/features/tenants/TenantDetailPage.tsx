import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { fetchIdNumber, keys, portfolioErrorMessage } from '../portfolio/api';
import { TENANT_STATUS, personName } from '../portfolio/labels';
import type { Tenancy, Tenant } from '../portfolio/types';
import { Badge, Breadcrumbs, Fact, RevealId } from '../portfolio/ui';
import { TenantInvoices } from '../billing/InvoicesSection';
import { DepositPanel } from '../payments/DepositPanel';
import { TenantMoneyTiles, TenantPayments, TenantStatement } from '../payments/TenantMoney';
import { MoveInSheet } from './MoveInSheet';
import { TenancyTable } from './TenancyTable';
import { TenantPortalPanel } from './TenantPortalPanel';
import { TenantSheet } from './TenantSheet';

/**
 * One tenant: balance, credit and deposit tiles (with "Record payment" and "Apply
 * credit"), profile, masked ID number (the full number only on "Show", which is audited),
 * every tenancy they have had with the notice and move-out actions, deposits, invoices
 * and payments, then tenant-portal access, reminders and the messages sent to them. The
 * Statement tab (`?tab=statement`) is their running account.
 */
export function TenantDetailPage() {
  const { tenantId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('tenants:update');
  const canDelete = useCan('tenants:delete');
  const canMoveIn = useCan('tenancies:create');
  const canSeeTenancies = useCan('tenancies:view');
  const canSeePayments = useCan('payments:view');
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  type TenantTab = 'overview' | 'invoices' | 'payments' | 'statement' | 'portal';
  const tab: TenantTab =
    rawTab === 'invoices'
      ? 'invoices'
      : rawTab === 'payments' && canSeePayments
        ? 'payments'
        : rawTab === 'statement' && canSeePayments
          ? 'statement'
          : rawTab === 'portal'
            ? 'portal'
            : 'overview';
  const [editing, setEditing] = useState(false);
  const [movingIn, setMovingIn] = useState(false);

  const tenant = useQuery({
    queryKey: [...keys.tenants, tenantId],
    queryFn: () => api.get<DataEnvelope<Tenant>>(`/tenants/${tenantId}`).then((r) => r.data),
  });
  const tenancies = useQuery({
    queryKey: [...keys.tenancies, { tenantId }],
    queryFn: () => api.get<PageEnvelope<Tenancy>>('/tenancies', { tenantId, pageSize: 50 }),
    enabled: canSeeTenancies,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/tenants/${tenantId}`),
    onSuccess: async () => {
      toast.saved(`${tenant.data ? personName(tenant.data) : 'The tenant'} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.tenants });
      navigate('/app/tenants', { replace: true });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  if (tenant.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (tenant.isError) {
    return (
      <div className="ph">
        <EmptyState title="Tenant not available" detail={portfolioErrorMessage(tenant.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/tenants">Back to tenants</Link>} />
      </div>
    );
  }

  const t = tenant.data;
  const rows = tenancies.data?.data ?? [];
  // A deposit panel for every tenancy still running, or ended with money still held.
  const deposits = rows.filter((r) => r.status !== 'ENDED' || r.depositHeld > 0);

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[{ label: 'Tenants', to: '/app/tenants' }, { label: personName(t) }]} />

      <div className="pf__head">
        <div>
          <h1>{personName(t)} <Badge table={TENANT_STATUS} value={t.status} /></h1>
          <p><span className="num">{t.code}</span> · <span className="num">{t.phone}</span>{t.email ? ` · ${t.email}` : ''}</p>
        </div>
        <div className="sl__headactions">
          {canMoveIn ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setMovingIn(true)}>Move in</button> : null}
          {canUpdate ? <button type="button" className="nx-btn" onClick={() => setEditing(true)}>Edit</button> : null}
          {canDelete && t.status === 'PROSPECT' ? (
            <ConfirmDelete size="md" what={personName(t)}
              consequence="Only someone who has never had a tenancy can be deleted. This cannot be undone."
              busy={remove.isPending} onConfirm={() => remove.mutate()} />
          ) : null}
        </div>
      </div>

      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Tenant">
          {(
            [
              { id: 'overview', label: 'Overview', show: true },
              { id: 'invoices', label: 'Invoices', show: true },
              { id: 'payments', label: 'Payments', show: canSeePayments },
              { id: 'statement', label: 'Statement', show: canSeePayments },
              { id: 'portal', label: 'Portal & reminders', show: true },
            ] as const
          )
            .filter((item) => item.show)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className="pf__tab"
                onClick={() =>
                  setParams(
                    (p) => {
                      const next = new URLSearchParams(p);
                      if (item.id === 'overview') next.delete('tab');
                      else next.set('tab', item.id);
                      return next;
                    },
                    { replace: true },
                  )
                }
              >
                {item.label}
              </button>
            ))}
        </div>
      </div>

      {tab === 'statement' ? <TenantStatement tenant={t} /> : null}
      {tab === 'invoices' ? <TenantInvoices tenantId={t.id} currentTenancy={rows.find((r) => r.status === 'ACTIVE' || r.status === 'NOTICE')} /> : null}
      {tab === 'payments' ? <TenantPayments tenantId={t.id} /> : null}
      {tab === 'portal' ? <TenantPortalPanel tenant={t} /> : null}

      {tab === 'overview' ? (
        <>
          <TenantMoneyTiles tenant={t} tenancies={canSeeTenancies && tenancies.isSuccess ? rows : undefined} />

          <section className="fm__section">
            <h2>Profile</h2>
            <dl className="pf__facts">
              <Fact label="Phone"><span className="num">{t.phone}</span></Fact>
              <Fact label="Email">{t.email}</Fact>
              <Fact label="ID number">
                <RevealId masked={t.idNumberMasked}
                  load={() => fetchIdNumber('tenants', t.id)} />
              </Fact>
              <Fact label="KRA PIN">{t.kraPin}</Fact>
              <Fact label="Emergency contact">
                {t.emergencyContactName || t.emergencyContactPhone
                  ? <>{t.emergencyContactName}{t.emergencyContactPhone ? <span className="ad__sub num">{t.emergencyContactPhone}</span> : null}</>
                  : null}
              </Fact>
              <Fact label="Registered">{formatDateTime(t.createdAt)}</Fact>
              {t.notes ? <Fact label="Notes" wide>{t.notes}</Fact> : null}
            </dl>
          </section>

          {canSeeTenancies ? (
            <section className="fm__section">
              <div className="pf__sectionhead"><h2>Tenancies</h2></div>
              {tenancies.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(tenancies.error)}</p>
                : tenancies.isPending ? <p className="ad__muted" role="status">Loading…</p>
                  : rows.length === 0 ? <p className="ad__muted">No tenancies yet.{canMoveIn ? ' Use “Move in” to give them a unit.' : ''}</p>
                    : <TenancyTable rows={rows} showTenant={false} />}
            </section>
          ) : null}

          {canSeePayments && deposits.length > 0 ? (
            <section className="fm__section">
              <div className="pf__sectionhead"><h2>Deposits</h2></div>
              <div className="py__deposits">
                {deposits.map((r) => (
                  <DepositPanel key={r.id} who={personName(t)} owed={t.balance ?? null}
                    tenancy={{ id: r.id, status: r.status, label: `${r.unit.number}, ${r.unit.property.name}` }} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {editing ? <TenantSheet tenant={t} onClose={() => setEditing(false)} /> : null}
      {movingIn ? <MoveInSheet tenant={t} onClose={() => setMovingIn(false)} /> : null}
    </div>
  );
}
