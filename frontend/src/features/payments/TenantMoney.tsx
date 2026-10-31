import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { TableSkeleton } from '../../components/Loading';
import { Sheet } from '../../components/Sheet';
import { personName } from '../portfolio/labels';
import type { Tenancy, Tenant, TenantRef } from '../portfolio/types';
import {
  AFTER_PAYMENT_KEYS, downloadStatementPdf, keys, paymentsErrorMessage, useOpenInvoices, useStatement,
} from './api';
import { STATEMENT_TYPE } from './labels';
import { StkRequestDialog } from '../mpesa/StkRequestDialog';
import { RecordPaymentSheet } from './RecordPaymentSheet';
import { checkStatementRange, describeBalance, statementTotals, unwrap } from './rules';
import type { Payment, StatementEntry } from './types';
import { PaymentsTable, SignedAmount } from './ui';

/**
 * The money parts of a tenant's page: balance / credit / deposit tiles with "Record
 * payment", "Request M-Pesa payment" (STK push) and "Apply credit", their recent
 * payments, and the Statement tab.
 */

const SHOWN = 10;

export function TenantMoneyTiles({ tenant, tenancies }: { tenant: Tenant; tenancies?: Tenancy[] }) {
  const canRecord = useCan('payments:create');
  const canSeePayments = useCan('payments:view');
  const canSeeChannels = useCan('channels:view');
  const [dialog, setDialog] = useState<'record' | 'credit' | 'stk' | null>(null);
  const credit = tenant.creditBalance ?? 0;
  const balance = tenant.balance ?? null;
  const open = useOpenInvoices(tenant.id, canSeePayments && canRecord && credit > 0);
  const openRows = open.data ?? [];
  const held = tenancies ? tenancies.reduce((sum, t) => sum + (t.depositHeld ?? 0), 0) : null;

  return (
    <>
      <div className="ad__stats pf__stats bl__stats py__tiles">
        <div className="ad__stat">
          <span className="ad__stat__label">Balance</span>
          <span className={`ad__stat__value num ${balance !== null && balance > 0 ? 'ad__owed' : ''}`}>
            {balance === null ? '—' : formatKES(Math.max(0, balance))}
          </span>
          {balance !== null && balance <= 0 ? <span className="ad__sub">{describeBalance(balance)}</span> : null}
        </div>
        <div className="ad__stat">
          <span className="ad__stat__label">Credit</span>
          <span className="ad__stat__value num">{formatKES(credit)}</span>
          <span className="ad__sub">Used automatically on the next invoice</span>
        </div>
        {held !== null ? (
          <div className="ad__stat">
            <span className="ad__stat__label">Deposit held</span>
            <span className="ad__stat__value num">{formatKES(held)}</span>
          </div>
        ) : null}
      </div>
      {canRecord ? (
        <div className="py__tileactions">
          <button type="button" className="nx-btn nx-btn--primary" onClick={() => setDialog('record')}>Record payment</button>
          {canSeeChannels ? <button type="button" className="nx-btn" onClick={() => setDialog('stk')}>Request M-Pesa payment</button> : null}
          {credit > 0 && openRows.length > 0 ? (
            <button type="button" className="nx-btn" onClick={() => setDialog('credit')}>Apply credit</button>
          ) : null}
        </div>
      ) : null}

      {dialog === 'record' ? <RecordPaymentSheet tenant={tenant} onClose={() => setDialog(null)} /> : null}
      {dialog === 'stk' ? <StkRequestDialog tenant={tenant} balance={balance} onClose={() => setDialog(null)} /> : null}
      {dialog === 'credit' ? (
        <ApplyCreditDialog tenant={tenant} credit={credit} owed={openRows.reduce((s, i) => s + i.balance, 0)} count={openRows.length}
          onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

function ApplyCreditDialog({ tenant, credit, owed, count, onClose }: {
  tenant: TenantRef;
  credit: number;
  owed: number;
  count: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const apply = useMutation({
    mutationFn: () => api.post<unknown>(`/tenants/${tenant.id}/apply-credit`),
    onSuccess: async (response) => {
      const out = unwrap<{ applied?: number; creditBalance?: number } | undefined>(response) ?? {};
      toast.saved(typeof out.applied === 'number'
        ? `${formatKES(out.applied)} of credit was applied. ${formatKES(out.creditBalance ?? 0)} credit left.`
        : 'The credit was applied.');
      await Promise.all(AFTER_PAYMENT_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
    onError: (error) => toast.failed(paymentsErrorMessage(error)),
  });
  const applies = Math.min(credit, owed);

  return (
    <Sheet
      title="Apply credit?"
      busy={apply.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={apply.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? 'Applying…' : `Apply ${formatKES(applies)}`}
          </button>
        </>
      )}
    >
      <p>
        {personName(tenant)} has <span className="num">{formatKES(credit)}</span> in credit and{' '}
        {count === 1 ? 'one open invoice' : `${count} open invoices`} totalling <span className="num">{formatKES(owed)}</span>.
        The credit pays them oldest due first{credit > owed ? `; ${formatKES(credit - owed)} stays as credit` : ''}.
      </p>
    </Sheet>
  );
}

/** A tenant's newest payments (`GET /payments?tenantId=`). */
export function TenantPayments({ tenantId }: { tenantId: string }) {
  const canView = useCan('payments:view');
  const list = useQuery({
    queryKey: [...keys.payments, 'list', { tenantId, pageSize: SHOWN }],
    queryFn: () => api.get<PageEnvelope<Payment>>('/payments', { tenantId, pageSize: SHOWN }),
    enabled: canView,
  });
  if (!canView) return null;
  const rows = list.data?.data ?? [];
  const total = list.data?.meta?.total ?? rows.length;

  return (
    <section className="fm__section">
      <div className="pf__sectionhead">
        <h2>Payments</h2>
        {total > rows.length ? <Link className="nx-btn nx-btn--sm" to={`/app/payments?tenantId=${encodeURIComponent(tenantId)}`}>See all</Link> : null}
      </div>
      {list.isError ? <p className="ad__error" role="alert">{paymentsErrorMessage(list.error)}</p>
        : list.isPending ? <TableSkeleton rows={3} />
          : rows.length === 0 ? <p className="ad__muted">No payments yet.</p>
            : (
              <>
                <PaymentsTable rows={rows} showTenant={false} />
                {total > rows.length ? <p className="ad__muted pg-gap">Showing the newest {rows.length} of {total}.</p> : null}
              </>
            )}
    </section>
  );
}

/** Where a statement row links: its invoice or its payment. */
function entryLink(entry: StatementEntry): string | null {
  if (entry.invoiceId && (entry.type === 'INVOICE' || entry.type === 'CREDIT_NOTE')) return `/app/invoices/${entry.invoiceId}`;
  if (entry.paymentId) return `/app/payments/${entry.paymentId}`;
  if (entry.invoiceId) return `/app/invoices/${entry.invoiceId}`;
  return null;
}

/**
 * The Statement tab (`GET /tenants/:id/statement?from&to`): opening balance, every
 * invoice, credit note, payment, reversal and deposit application with a running balance,
 * the closing balance, and the same as a PDF. Blank dates mean from the first activity
 * to today. Balance = owed; negative = in credit.
 */
export function TenantStatement({ tenant }: { tenant: TenantRef }) {
  const toast = useToast();
  const canView = useCan('payments:view');
  const today = todayInNairobi();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloading, setDownloading] = useState(false);
  const rangeError = checkStatementRange(from, to);
  const range = { from: from || undefined, to: to || undefined };
  const statement = useStatement(tenant.id, range, canView && !rangeError);

  if (!canView) return <p className="ad__muted">Your role cannot see payments, so it cannot open statements.</p>;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadStatementPdf(tenant, range);
    } catch (error) {
      toast.failed(paymentsErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  };

  const s = statement.data;
  const totals = statementTotals(s?.entries ?? []);

  return (
    <section className="py__statement">
      <div className="ad__filters py__statementbar">
        <label className="py__daterange">
          <span>From</span>
          <input type="date" className="ad__select" aria-label="Statement from" max={to || today} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="py__daterange">
          <span>To</span>
          <input type="date" className="ad__select" aria-label="Statement to" min={from || undefined} max={today} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {from || to ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => { setFrom(''); setTo(''); }}>All time</button> : null}
        <div className="bl__headbtns pg-push">
          <button type="button" className="nx-btn" onClick={download} disabled={downloading || Boolean(rangeError)}>
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {rangeError ? <p className="ad__error" role="alert">{rangeError}</p>
        : statement.isError ? <p className="ad__error" role="alert">{paymentsErrorMessage(statement.error)}</p>
          : statement.isPending || !s ? <TableSkeleton />
            : (
              <>
                <div className="ad__stats pf__stats bl__stats">
                  <div className="ad__stat"><span className="ad__stat__label">Opening · {formatDay(s.from)}</span><span className="ad__stat__value"><SignedAmount minor={s.openingBalance} /></span></div>
                  <div className="ad__stat"><span className="ad__stat__label">Closing · {formatDay(s.to)}</span><span className={`ad__stat__value ${s.closingBalance > 0 ? 'ad__owed' : ''}`}><SignedAmount minor={s.closingBalance} /></span></div>
                  <div className="ad__stat"><span className="ad__stat__label">Credit now</span><span className="ad__stat__value num">{formatKES(s.creditBalance)}</span></div>
                  <div className="ad__stat"><span className="ad__stat__label">Deposit held</span><span className="ad__stat__value num">{formatKES(s.depositHeld)}</span></div>
                </div>
                <div className="ad__tablewrap">
                  <table className="ad__table py__stmt">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th className="num">Debit</th>
                        <th className="num">Credit</th>
                        <th className="num">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="py__stmtedge">
                        <td>{formatDay(s.from)}</td>
                        <td colSpan={4}>Opening balance</td>
                        <td className="num"><SignedAmount minor={s.openingBalance} /></td>
                      </tr>
                      {s.entries.length === 0 ? (
                        <tr><td colSpan={6} className="ad__muted">Nothing in this period.</td></tr>
                      ) : s.entries.map((e, i) => {
                        const to2 = entryLink(e);
                        return (
                          <tr key={`${e.type}-${e.reference ?? ''}-${i}`} className={e.type === 'REVERSAL' ? 'py__reversalrow' : undefined}>
                            <td>{formatDay(e.date)}</td>
                            <td>
                              {STATEMENT_TYPE[e.type] ?? e.type}
                              {e.reference ? (
                                <span className="ad__sub num">{to2 ? <Link to={to2}>{e.reference}</Link> : e.reference}</span>
                              ) : null}
                            </td>
                            <td>{e.description ?? ''}</td>
                            <td className="num">{e.debit ? formatKES(e.debit) : ''}</td>
                            <td className="num">{e.credit ? formatKES(e.credit) : ''}</td>
                            <td className="num"><SignedAmount minor={e.balance} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={3}>Totals</th>
                        <th className="num">{formatKES(totals.debit)}</th>
                        <th className="num">{formatKES(totals.credit)}</th>
                        <th className="num"><SignedAmount minor={s.closingBalance} /></th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="ad__muted">Balance is what is owed; a negative balance means the tenant is in credit. Void invoices are left out.</p>
              </>
            )}
    </section>
  );
}
