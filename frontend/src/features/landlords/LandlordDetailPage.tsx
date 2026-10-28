import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { fetchIdNumber, keys, portfolioErrorMessage } from '../portfolio/api';
import { LANDLORD_KIND, RECORD_STATUS } from '../portfolio/labels';
import { PropertySheet } from '../portfolio/PropertySheet';
import type { Landlord, Property } from '../portfolio/types';
import { Badge, Breadcrumbs, Fact, RevealId } from '../portfolio/ui';
import { LandlordSheet } from './LandlordSheet';
import { agencyErrorMessage, useLandlordAccount } from '../agency/api';
import { AgreementNotice, LedgerTab, PayoutCard, PortalCard, StatementTab } from '../agency/LandlordMoney';
import { BalanceTiles } from '../agency/ui';

type Tab = 'overview' | 'ledger' | 'statement';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'statement', label: 'Statement' },
];

/**
 * One landlord: balance tiles (payable, deposits held), then three tabs. Overview has the
 * agreement in force (or a warning), contact details, masked ID number with "Show"
 * (audited), payout details, owner-portal access and the properties the agency manages
 * for them. Ledger and Statement are the landlord's money (phase 6b).
 */
export function LandlordDetailPage() {
  const { landlordId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('landlords:update');
  const canDelete = useCan('landlords:delete');
  const canSeeProperties = useCan('properties:view');
  const canAddProperty = useCan('properties:create');
  const [editing, setEditing] = useState(false);
  const [addingProperty, setAddingProperty] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') as Tab : 'overview';
  const account = useLandlordAccount(landlordId);

  const landlord = useQuery({
    queryKey: [...keys.landlords, landlordId],
    queryFn: () => api.get<DataEnvelope<Landlord>>(`/landlords/${landlordId}`).then((r) => r.data),
  });
  const properties = useQuery({
    queryKey: [...keys.properties, { landlordId }],
    queryFn: () => api.get<PageEnvelope<Property>>('/properties', { landlordId, pageSize: 100 }),
    enabled: canSeeProperties,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/landlords/${landlordId}`),
    onSuccess: async () => {
      toast.saved(`${landlord.data?.name ?? 'The landlord'} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.landlords });
      navigate('/app/landlords', { replace: true });
    },
    onError: (error) => toast.failed(portfolioErrorMessage(error)),
  });

  if (landlord.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (landlord.isError) {
    return (
      <div className="ph">
        <EmptyState title="Landlord not available" detail={portfolioErrorMessage(landlord.error)}
          action={<Link className="nx-btn nx-btn--sm" to="/app/landlords">Back to landlords</Link>} />
      </div>
    );
  }

  const l = landlord.data;
  const rows = properties.data?.data ?? [];

  return (
    <div className="pg pf__page">
      <Breadcrumbs trail={[{ label: 'Landlords', to: '/app/landlords' }, { label: l.name }]} />

      <div className="pf__head">
        <div>
          <h1>{l.name} {l.status === 'INACTIVE' ? <Badge table={RECORD_STATUS} value={l.status} /> : null}</h1>
          <p><span className="num">{l.code}</span> · {LANDLORD_KIND[l.kind] ?? l.kind} · <span className="num">{l.phone}</span></p>
        </div>
        <div className="sl__headactions">
          {canAddProperty ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setAddingProperty(true)}>Add property</button> : null}
          {canUpdate ? <button type="button" className="nx-btn" onClick={() => setEditing(true)}>Edit</button> : null}
          {canDelete ? (
            <ConfirmDelete size="md" what={l.name}
              consequence={l.propertyCount > 0
                ? `They still have ${l.propertyCount} ${l.propertyCount === 1 ? 'property' : 'properties'}, so they can’t be deleted. Mark them inactive instead.`
                : 'This cannot be undone.'}
              busy={remove.isPending} onConfirm={() => remove.mutate()} />
          ) : null}
        </div>
      </div>

      <BalanceTiles payable={account.data?.balances.payable ?? null} depositHeld={account.data?.balances.depositHeld ?? null} />
      {account.isError ? <p className="ad__error" role="alert">{agencyErrorMessage(account.error)}</p> : null}

      <div className="pf__tabs" role="tablist" aria-label="Landlord">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="pf__tab"
            onClick={() => setParams((p) => { const next = new URLSearchParams(p); if (t.id === 'overview') next.delete('tab'); else next.set('tab', t.id); return next; }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ledger' ? <LedgerTab landlord={l} account={account.data} /> : null}
      {tab === 'statement' ? <StatementTab landlord={l} /> : null}

      {tab === 'overview' ? <>
      <AgreementNotice landlordId={l.id} hasActiveAgreement={account.data?.hasActiveAgreement} />

      <section className="fm__section">
        <h2>Details</h2>
        <dl className="pf__facts">
          <Fact label="Phone"><span className="num">{l.phone}</span></Fact>
          <Fact label="Email">{l.email}</Fact>
          <Fact label={l.kind === 'COMPANY' ? 'Registration number' : 'ID number'}>
            <RevealId masked={l.idNumberMasked} load={() => fetchIdNumber('landlords', l.id)} />
          </Fact>
          <Fact label="KRA PIN">{l.kraPin}</Fact>
        </dl>
      </section>

      {account.data ? (
        <div className="ag__cards">
          <PayoutCard landlord={l} account={account.data} />
          <PortalCard landlord={l} account={account.data} />
        </div>
      ) : null}

      {canSeeProperties ? (
        <section className="fm__section">
          <div className="pf__sectionhead"><h2>Properties</h2></div>
          {properties.isError ? <p className="ad__error" role="alert">{portfolioErrorMessage(properties.error)}</p>
            : properties.isPending ? <p className="ad__muted" role="status">Loading…</p>
              : rows.length === 0 ? <p className="ad__muted">No properties yet.</p>
                : (
                  <div className="ad__tablewrap">
                    <table className="ad__table ad__table--compact">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Location</th>
                          <th className="num">Units</th>
                          <th className="num">Occupied</th>
                          <th className="num">Vacant</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <Link className="ad__link" to={`/app/properties/${p.id}`}><strong>{p.name}</strong></Link>
                              <span className="ad__sub num">{p.code}</span>
                            </td>
                            <td>{p.location ?? '—'}</td>
                            <td className="num">{p.unitCount}</td>
                            <td className="num">{p.occupiedCount}</td>
                            <td className="num">{p.vacantCount}</td>
                            <td><Badge table={RECORD_STATUS} value={p.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
        </section>
      ) : null}
      </> : null}

      {editing ? <LandlordSheet landlord={l} onClose={() => setEditing(false)} /> : null}
      {addingProperty ? <PropertySheet landlordId={l.id} onClose={() => setAddingProperty(false)} /> : null}
    </div>
  );
}
