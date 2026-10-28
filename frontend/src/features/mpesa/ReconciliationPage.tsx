import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { countText } from '../../app/navigation';
import { formatDateTime, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { useChannels } from '../payments/api';
import { checkStatementRange } from '../payments/rules';
import { useListFilters } from '../portfolio/hooks';
import { optionsOf, personName } from '../portfolio/labels';
import { Badge } from '../portfolio/ui';
import { keys, mpesaErrorMessage, useUnmatchedCount } from './api';
import { MATCHED_BY, SOURCE } from './labels';
import { isMpesaKind } from './rules';
import type { InboundTransaction, MatchStatus } from './types';

/**
 * Reconciliation (`/app/reconciliation`): every M-Pesa transaction Safaricom told Hodi
 * about (`GET /inbound-transactions`), newest first, in three tabs — Unmatched (waiting
 * for someone to say whose money it is), Matched (recorded as a payment) and Ignored.
 * Filters (channel, source, received dates, search) live in the address. A row opens the
 * transaction, where it can be assigned or ignored.
 */

const PAGE_SIZE = 25;
const TABS: { id: MatchStatus; label: string }[] = [
  { id: 'UNMATCHED', label: 'Unmatched' },
  { id: 'MATCHED', label: 'Matched' },
  { id: 'IGNORED', label: 'Ignored' },
];

export function ReconciliationPage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const statusParam = filters.get('status');
  const status: MatchStatus = statusParam === 'MATCHED' || statusParam === 'IGNORED' ? statusParam : 'UNMATCHED';
  const channelId = filters.get('channelId');
  const source = filters.get('source');
  const from = filters.get('from');
  const to = filters.get('to');
  const canSeeChannels = useCan('channels:view');
  const channels = useChannels({}, canSeeChannels);
  const mpesaChannels = (channels.data ?? []).filter((c) => isMpesaKind(c.kind)).sort((a, b) => a.name.localeCompare(b.name));
  const unmatched = useUnmatchedCount(true);
  const rangeError = checkStatementRange(from, to);
  const today = todayInNairobi();

  const list = useQuery({
    queryKey: [...keys.inbound, 'list', { status, channelId, source, q, from, to, page }],
    queryFn: () => api.get<PageEnvelope<InboundTransaction>>('/inbound-transactions', {
      status, channelId, source, q, from, to, page, pageSize: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
    enabled: !rangeError,
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(channelId || source || q || from || to);
  const count = countText(unmatched.data ?? 0);

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Match status">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={status === t.id} className="pf__tab"
              onClick={() => filters.setFilter({ status: t.id === 'UNMATCHED' ? '' : t.id })}>
              {t.label}
              {t.id === 'UNMATCHED' && count ? <span className="mp__tabcount num">{count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search receipt, payer, phone or account" aria-label="Search transactions"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        {canSeeChannels ? (
          <select className="ad__select" aria-label="Channel" value={channelId} onChange={(e) => filters.setFilter({ channelId: e.target.value })}>
            <option value="">All M-Pesa channels</option>
            {mpesaChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : null}
        <select className="ad__select" aria-label="Source" value={source} onChange={(e) => filters.setFilter({ source: e.target.value })}>
          <option value="">All sources</option>
          {optionsOf(SOURCE).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p> : null}
      {list.isError ? <p className="ad__error" role="alert">{mpesaErrorMessage(list.error)}</p> : null}

      {rangeError ? null : list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No transactions match" detail="Try a different search, or clear the filters." onClear={() => filters.clear(['status'])} />
          ) : status === 'UNMATCHED' ? (
            <EmptyState title="Nothing to match"
              detail="Every M-Pesa payment Hodi has been told about found its tenant. Payments it can’t place wait here — for example a wrong account number." />
          ) : status === 'MATCHED' ? (
            <EmptyState title="No matched transactions yet"
              detail="M-Pesa payments that were recorded — automatically or by hand — show here once a paybill or till is connected under Payment channels." />
          ) : (
            <EmptyState title="Nothing ignored" detail="Transactions marked as not rent (for example a personal payment) show here, with the reason." />
          )}
        </div>
      ) : (
        <InboundTable rows={rows} status={status} />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
    </div>
  );
}

function InboundTable({ rows, status }: { rows: InboundTransaction[]; status: MatchStatus }) {
  return (
    <div className="ad__tablewrap">
      <table className="ad__table mp__table">
        <thead>
          <tr>
            <th>M-Pesa receipt</th>
            <th>Paid</th>
            <th>Payer</th>
            <th>Account</th>
            <th>Channel</th>
            <th className="num">Amount</th>
            {status === 'MATCHED' ? <th>Recorded as</th> : status === 'IGNORED' ? <th>Why ignored</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className="ad__link" to={`/app/reconciliation/${r.id}`}><strong className="num">{r.providerRef}</strong></Link>
                <span className="ad__sub"><Badge table={SOURCE} value={r.source} /></span>
              </td>
              <td>{formatDateTime(r.occurredAt)}</td>
              <td>
                {r.payerName ?? <span className="nx-muted">—</span>}
                {r.payerPhone ? <span className="ad__sub num">{r.payerPhone}</span> : null}
              </td>
              <td className="num">{r.accountRef ?? <span className="nx-muted">—</span>}</td>
              <td>{r.channel.name}</td>
              <td className="num">{formatKES(r.amount)}</td>
              {status === 'MATCHED' ? (
                <td>
                  {r.payment ? <Link to={`/app/payments/${r.payment.id}`} className="num">{r.payment.number}</Link> : <span className="nx-muted">—</span>}
                  {r.tenant ? <span className="ad__sub">{personName(r.tenant)} · <span className="num">{r.tenant.code}</span></span> : null}
                  {r.matchedBy ? <span className="ad__sub">{MATCHED_BY[r.matchedBy] ?? r.matchedBy}</span> : null}
                </td>
              ) : status === 'IGNORED' ? (
                <td>
                  {r.ignoredReason ?? <span className="nx-muted">—</span>}
                  {r.resolvedBy ? <span className="ad__sub">{r.resolvedBy.name} · {formatDateTime(r.resolvedAt)}</span> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
