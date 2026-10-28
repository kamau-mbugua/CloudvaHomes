import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { currentPeriod, formatPeriod, shiftPeriod } from '../../lib/periods';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { useListFilters } from '../portfolio/hooks';
import { optionsOf } from '../portfolio/labels';
import { billingErrorMessage, keys } from './api';
import { INVOICE_KIND, INVOICE_STATUS } from './labels';
import { InvoiceSheet } from './InvoiceSheet';
import type { Invoice } from './types';
import { InvoicesTable, PropertySelect } from './ui';

/**
 * Invoices, newest first, with filters in the address (status, kind, month, property,
 * overdue) and search by number, tenant or unit. "New invoice" is a one-off (ADHOC)
 * invoice; monthly ones come from the invoice run.
 */

const PAGE_SIZE = 25;

/** This month and the twelve before it, newest first, for the month filter. */
function recentPeriods(count = 13): string[] {
  const now = currentPeriod();
  return Array.from({ length: count }, (_, i) => shiftPeriod(now, -i));
}

export function InvoicesPage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const status = filters.get('status');
  const kind = filters.get('kind');
  const period = filters.get('period');
  const propertyId = filters.get('propertyId');
  const overdue = filters.get('overdue') === 'true' ? 'true' : '';
  const canCreate = useCan('invoices:create');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: [...keys.invoices, 'list', { q, status, kind, period, propertyId, overdue, page }],
    queryFn: () => api.get<PageEnvelope<Invoice>>('/invoices', {
      page, pageSize: PAGE_SIZE, q, status, kind, period, propertyId, overdue,
    }),
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || status || kind || period || propertyId || overdue);
  const periods = recentPeriods();

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by number, tenant or unit" aria-label="Search invoices"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">All statuses</option>
          {optionsOf(INVOICE_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="ad__select" aria-label="Kind" value={kind} onChange={(e) => filters.setFilter({ kind: e.target.value })}>
          <option value="">All kinds</option>
          {optionsOf(INVOICE_KIND).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="ad__select" aria-label="Month" value={period} onChange={(e) => filters.setFilter({ period: e.target.value })}>
          <option value="">Any month</option>
          {period && !periods.includes(period) ? <option value={period}>{formatPeriod(period)}</option> : null}
          {periods.map((p) => <option key={p} value={p}>{formatPeriod(p)}</option>)}
        </select>
        <PropertySelect value={propertyId} allowAll onChange={(id) => filters.setFilter({ propertyId: id })} />
        <label className="fld__check bl__toggle">
          <input type="checkbox" checked={overdue === 'true'} onChange={(e) => filters.setFilter({ overdue: e.target.checked ? 'true' : '' })} />
          Overdue only
        </label>
        <div className="bl__headbtns pg-push">
          <Link className="nx-btn" to="/app/invoices/run">Invoice run</Link>
          {canCreate ? <button type="button" className="nx-btn nx-btn--primary" onClick={() => setCreating(true)}>New invoice</button> : null}
        </div>
      </div>

      {list.isError ? <p className="ad__error" role="alert">{billingErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No invoices match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState
              title="No invoices yet"
              detail="Monthly invoices are created by the invoice run each day once a tenancy’s billing day comes. You can preview and run it by hand."
              action={<Link className="nx-btn nx-btn--sm nx-btn--primary" to="/app/invoices/run">Open the invoice run</Link>}
            />
          )}
        </div>
      ) : (
        <InvoicesTable rows={rows} />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />

      {creating ? <InvoiceSheet onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
