import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { todayInNairobi } from '../../lib/dates';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { useListFilters } from '../portfolio/hooks';
import { optionsOf } from '../portfolio/labels';
import { keys, paymentsErrorMessage, useChannels } from './api';
import { PAYMENT_METHOD } from './labels';
import { RecordPaymentSheet } from './RecordPaymentSheet';
import { checkStatementRange } from './rules';
import type { Payment } from './types';
import { PaymentsTable } from './ui';

/**
 * Payments, newest first (`GET /payments`), with filters in the address: search (receipt,
 * reference, tenant), channel, method, received-date range and reversals. "Record
 * payment" opens the sheet.
 */

const PAGE_SIZE = 25;

export function PaymentsPage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const tenantId = filters.get('tenantId');
  const channelId = filters.get('channelId');
  const method = filters.get('method');
  const from = filters.get('from');
  const to = filters.get('to');
  const reversedParam = filters.get('reversed');
  const reversed = reversedParam === 'true' || reversedParam === 'false' ? reversedParam : '';
  const canCreate = useCan('payments:create');
  const canSeeChannels = useCan('channels:view');
  const channels = useChannels({}, canSeeChannels);
  const [recording, setRecording] = useState(false);
  const rangeError = checkStatementRange(from, to);

  const list = useQuery({
    queryKey: [...keys.payments, 'list', { q, tenantId, channelId, method, from, to, reversed, page }],
    queryFn: () => api.get<PageEnvelope<Payment>>('/payments', {
      page, pageSize: PAGE_SIZE, q, tenantId, channelId, method, from, to, reversed,
    }),
    placeholderData: keepPreviousData,
    enabled: !rangeError,
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || tenantId || channelId || method || from || to || reversed);
  const today = todayInNairobi();

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search receipt, reference or tenant" aria-label="Search payments"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        {canSeeChannels ? (
          <select className="ad__select" aria-label="Channel" value={channelId} onChange={(e) => filters.setFilter({ channelId: e.target.value })}>
            <option value="">All channels</option>
            {(channels.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : null}
        <select className="ad__select" aria-label="Method" value={method} onChange={(e) => filters.setFilter({ method: e.target.value })}>
          <option value="">All methods</option>
          {optionsOf(PAYMENT_METHOD).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="py__daterange">
          <span>From</span>
          <input type="date" className="ad__select" aria-label="Received from" max={to || today} value={from}
            onChange={(e) => filters.setFilter({ from: e.target.value })} />
        </label>
        <label className="py__daterange">
          <span>To</span>
          <input type="date" className="ad__select" aria-label="Received to" min={from || undefined} max={today} value={to}
            onChange={(e) => filters.setFilter({ to: e.target.value })} />
        </label>
        <select className="ad__select" aria-label="Reversals" value={reversed} onChange={(e) => filters.setFilter({ reversed: e.target.value })}>
          <option value="">Include reversals</option>
          <option value="false">Hide reversed and reversals</option>
          <option value="true">Only reversed and reversals</option>
        </select>
        {tenantId ? (
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => filters.setFilter({ tenantId: '' })}>
            {rows[0] ? `Only ${rows[0].tenant.code}` : 'One tenant only'} ×
          </button>
        ) : null}
        {canCreate ? (
          <div className="bl__headbtns pg-push">
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setRecording(true)}>Record payment</button>
          </div>
        ) : null}
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p> : null}
      {list.isError ? <p className="ad__error" role="alert">{paymentsErrorMessage(list.error)}</p> : null}

      {rangeError ? null : list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No payments match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState
              title="No payments yet"
              detail="Record money received by cash, cheque, bank deposit or an M-Pesa code. It is allocated to the tenant’s invoices, oldest first."
              action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setRecording(true)}>Record payment</button> : undefined}
            />
          )}
        </div>
      ) : (
        <PaymentsTable rows={rows} />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />

      {recording ? <RecordPaymentSheet onClose={() => setRecording(false)} /> : null}
    </div>
  );
}
