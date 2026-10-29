import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { formatKES } from '../../lib/money';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { useListFilters } from '../portfolio/hooks';
import { optionsOf } from '../portfolio/labels';
import { PAGE_SIZE, keys, platformErrorMessage } from '../platform/api';
import { ORG_STATUS } from '../platform/labels';
import { formatDayish, ownerText } from '../platform/rules';
import type { PlatformOrganization } from '../platform/types';
import { CustomBadge, OrgStatusBadge } from '../platform/ui';

/**
 * Admin → Organisations (`/admin/organizations`): every organisation on Hodi, searchable
 * and filtered by status (both in the address), with its plan and price ("Custom" when it
 * has its own), let units now and what it owes Hodi. A row opens the organisation.
 */
export function OrganizationsPage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status');

  const list = useQuery({
    queryKey: [...keys.organizations, 'list', { q, status, page }],
    queryFn: () => api.get<PageEnvelope<PlatformOrganization>>('/platform/organizations', { q, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || status);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by name or billing account (H00001)" aria-label="Search organisations"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          {optionsOf(ORG_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Link className="nx-btn nx-btn--primary pg-push" to="/admin/organizations/new">+ New organisation</Link>
      </div>

      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}

      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered
            ? <EmptyState title="No organisations match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
            : <EmptyState title="No organisations yet" detail="Organisations appear here once Hodi creates them." />}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Status</th>
                <th>Plan and price</th>
                <th>Salesperson</th>
                <th className="num">Let units</th>
                <th className="num">Owes</th>
                <th>Trial ends</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((org) => (
                <tr key={org.id}>
                  <td>
                    <Link className="ad__link" to={`/admin/organizations/${encodeURIComponent(org.id)}`}><strong>{org.name}</strong></Link>
                    <span className="ad__sub"><span className="num">{org.billingRef}</span> · {ownerText(org.owner)}</span>
                  </td>
                  <td><OrgStatusBadge status={org.status} /></td>
                  <td>
                    <span className="hb__price">{org.plan?.name ?? 'No plan'}{org.price?.custom ? <CustomBadge /> : null}</span>
                    {org.price ? <span className="ad__sub num">{formatKES(org.price.pricePerUnit)} / unit · min {formatKES(org.price.minimumMonthly)}</span> : null}
                  </td>
                  <td>
                    {org.onboardedBy
                      ? `${org.onboardedBy.firstName} ${org.onboardedBy.lastName}`.trim()
                      : <span className="ad__muted">—</span>}
                  </td>
                  <td className="num">{org.occupiedUnits ?? '—'}</td>
                  <td className={`num ${org.balance > 0 && (org.status === 'GRACE' || org.status === 'SUSPENDED') ? 'ad__owed' : ''}`}>{formatKES(org.balance ?? 0)}</td>
                  <td>{formatDayish(org.trialEndsAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
    </div>
  );
}
