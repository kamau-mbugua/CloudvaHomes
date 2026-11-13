import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { api, errorMessage } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { PAYMENT_METHOD } from '../payments/labels';
import { checkStatementRange } from '../payments/rules';
import type { Payment } from '../payments/types';
import { PaymentsTable } from '../payments/ui';
import { useListFilters } from '../portfolio/hooks';
import { ReceiptActions } from './ReceiptActions';
import { rentReceiptRef, stayReceiptRef } from './receipts';

const PAGE_SIZE = 25;

/** A row of `GET /host/stay-payments`. */
export interface StayReceiptRow {
  id: string;
  number: string;
  kind: 'PAYMENT' | 'REFUND';
  method: keyof typeof PAYMENT_METHOD;
  amount: string;
  reference: string | null;
  receivedAt: string;
  voidedAt: string | null;
  booking: { id: string; code: string; listingTitle: string };
  guest: {
    name: string;
    phone: string | null;
    email: string | null;
    hasPhone: boolean;
    hasEmail: boolean;
  } | null;
}

const STAY_METHODS = ['CASH', 'BANK_ACCOUNT', 'MPESA_PAYBILL', 'MPESA_TILL'] as const;

/** Filters shared by both receipt lists: search, method and received-date range. */
function useReceiptFilters() {
  const filters = useListFilters();
  const from = filters.get('from');
  const to = filters.get('to');
  return { filters, from, to, rangeError: checkStatementRange(from, to) };
}

function DateRange({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from?: string; to?: string }) => void;
}) {
  const today = todayInNairobi();
  return (
    <>
      <label className="py__daterange">
        <span>From</span>
        <input type="date" className="ad__select" aria-label="Received from" max={to || today}
          value={from} onChange={(e) => onChange({ from: e.target.value })} />
      </label>
      <label className="py__daterange">
        <span>To</span>
        <input type="date" className="ad__select" aria-label="Received to" min={from || undefined}
          max={today} value={to} onChange={(e) => onChange({ to: e.target.value })} />
      </label>
    </>
  );
}

/**
 * Money → Receipts for short stays (`GET /host/stay-payments`): every receipt, with Preview,
 * Send (SMS link + email PDF) and Download. Refunds are listed for the record; they have no
 * receipt to send.
 */
export function StayReceiptsPage() {
  const { filters, from, to, rangeError } = useReceiptFilters();
  const { q, page } = filters;
  const kind = filters.get('kind');
  const method = filters.get('method');
  const canSend = useCan('stay-payments:create');

  const list = useQuery({
    queryKey: ['stays', 'receipts', { q, kind, method, from, to, page }],
    queryFn: () =>
      api.get<PageEnvelope<StayReceiptRow>>('/host/stay-payments', {
        page, pageSize: PAGE_SIZE, q, kind, method, from, to,
      }),
    placeholderData: keepPreviousData,
    enabled: !rangeError,
  });
  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || kind || method || from || to);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" aria-label="Search receipts"
          placeholder="Search receipt, booking, guest or reference"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Kind" value={kind}
          onChange={(e) => filters.setFilter({ kind: e.target.value })}>
          <option value="">Payments and refunds</option>
          <option value="PAYMENT">Payments</option>
          <option value="REFUND">Refunds</option>
        </select>
        <select className="ad__select" aria-label="Method" value={method}
          onChange={(e) => filters.setFilter({ method: e.target.value })}>
          <option value="">All methods</option>
          {STAY_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD[m].label}</option>)}
        </select>
        <DateRange from={from} to={to} onChange={(next) => filters.setFilter(next)} />
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p> : null}
      {list.isError ? <p className="ad__error" role="alert">{errorMessage(list.error)}</p> : null}

      {rangeError ? null : list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No receipts match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState title="No receipts yet" detail="Every payment on a booking gets a receipt (SRC-…). They appear here as payments come in." />
          )}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table py__table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Guest</th>
                <th>Booking</th>
                <th>Received</th>
                <th>Method</th>
                <th className="num">Amount</th>
                <th className="num">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stands = r.kind === 'PAYMENT' && !r.voidedAt;
                return (
                  <tr key={r.id} className={r.voidedAt ? 'py__reversedrow' : undefined}>
                    <td>
                      <strong className="code">{r.number}</strong>{' '}
                      {r.voidedAt ? <span className="ad__badge ad__badge--off">Voided</span>
                        : r.kind === 'REFUND' ? <span className="ad__badge ad__badge--bad">Refund</span> : null}
                      {r.reference ? <span className="ad__sub code">Ref {r.reference}</span> : null}
                    </td>
                    <td>
                      {r.guest?.name ?? '—'}
                      {r.guest?.phone ? <span className="ad__sub">{r.guest.phone}</span> : null}
                    </td>
                    <td>
                      <Link className="ad__link code" to={`/app/bookings/${r.booking.id}`}>{r.booking.code}</Link>
                      <span className="ad__sub">{r.booking.listingTitle}</span>
                    </td>
                    <td>{formatDay(r.receivedAt.slice(0, 10))}</td>
                    <td>{PAYMENT_METHOD[r.method]?.label ?? r.method}</td>
                    <td className="num">{r.kind === 'REFUND' ? '-' : ''}{formatKES(Number(r.amount))}</td>
                    <td className="num">
                      {stands ? (
                        <ReceiptActions
                          canSend={canSend}
                          receipt={stayReceiptRef(r.booking.id, r, {
                            name: r.guest?.name ?? 'Guest',
                            phone: r.guest?.phone,
                            email: r.guest?.email,
                            hasPhone: r.guest?.hasPhone ?? false,
                            hasEmail: r.guest?.hasEmail ?? false,
                          })}
                        />
                      ) : <span className="nx-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
    </div>
  );
}

/**
 * Money → Receipts for rent (`GET /payments`, reversals left out): every receipt with Preview,
 * Send (SMS link + email PDF) and Download.
 */
export function RentReceiptsPage() {
  const { filters, from, to, rangeError } = useReceiptFilters();
  const { q, page } = filters;
  const method = filters.get('method');
  const canSend = useCan('payments:create');

  const list = useQuery({
    queryKey: ['payments', 'receipts', { q, method, from, to, page }],
    queryFn: () =>
      api.get<PageEnvelope<Payment>>('/payments', {
        page, pageSize: PAGE_SIZE, q, method, from, to, reversed: 'false',
      }),
    placeholderData: keepPreviousData,
    enabled: !rangeError,
  });
  const rows = list.data?.data ?? [];
  const filtered = Boolean(q || method || from || to);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" aria-label="Search receipts"
          placeholder="Search receipt, reference or tenant"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Method" value={method}
          onChange={(e) => filters.setFilter({ method: e.target.value })}>
          <option value="">All methods</option>
          {Object.entries(PAYMENT_METHOD).map(([value, l]) => <option key={value} value={value}>{l.label}</option>)}
        </select>
        <DateRange from={from} to={to} onChange={(next) => filters.setFilter(next)} />
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p> : null}
      {list.isError ? <p className="ad__error" role="alert">{errorMessage(list.error)}</p> : null}

      {rangeError ? null : list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No receipts match" detail="Try a different search, or clear the filters." onClear={() => filters.clear()} />
          ) : (
            <EmptyState title="No receipts yet" detail="Every payment recorded gets a receipt (RCT-…). They appear here as payments come in." />
          )}
        </div>
      ) : (
        <PaymentsTable
          rows={rows}
          actions={(p) => <ReceiptActions canSend={canSend} receipt={rentReceiptRef(p)} />}
        />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
    </div>
  );
}
