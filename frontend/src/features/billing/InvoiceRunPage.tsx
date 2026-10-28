import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, isDay, todayInNairobi } from '../../lib/dates';
import { formatKES } from '../../lib/money';
import { formatPeriod, periodOf } from '../../lib/periods';
import { trimQuantity } from '../../lib/quantity';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { personName } from '../portfolio/labels';
import { Field } from '../portfolio/ui';
import { AFTER_INVOICE_KEYS, billingErrorMessage, keys } from './api';
import { readRunPreview, readRunResult, sumMinor } from './rules';
import type { RunResult } from './types';

/**
 * The invoice run by hand (`/app/invoices/run`). The same run happens every night; this
 * page shows what it would create for a date (today by default, never the future) —
 * every tenancy whose billing day has come and has no monthly invoice yet — with each
 * line, the totals, and meters that have no reading (they get no line this month).
 * "Create N invoices" runs it for the active organisation.
 */
export function InvoiceRunPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canCreate = useCan('invoices:create');
  const today = todayInNairobi();
  const [date, setDate] = useState(today);
  const [result, setResult] = useState<RunResult | null>(null);

  const dateError = !isDay(date) ? 'Choose a date.' : date > today ? 'The run can’t be for a future date.' : null;

  const preview = useQuery({
    queryKey: [...keys.runPreview, date],
    queryFn: () => api.get<unknown>('/invoices/run/preview', { date }).then(readRunPreview),
    enabled: !dateError,
  });

  const run = useMutation({
    mutationFn: (runDate: string) => api.post<unknown>('/invoices/run', { date: runDate }).then(readRunResult),
    onSuccess: async (outcome) => {
      setResult(outcome);
      toast.saved(outcome.created === 0 ? 'Nothing new to invoice.' : `${outcome.created} ${outcome.created === 1 ? 'invoice was' : 'invoices were'} created.`);
      await Promise.all(AFTER_INVOICE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    onError: (error) => toast.failed(billingErrorMessage(error)),
  });

  const items = preview.data?.items ?? [];
  const period = preview.data?.period ?? (isDay(date) ? periodOf(date) : '');
  const grandTotal = sumMinor(items.map((i) => i.total));
  const missing = items.reduce((n, i) => n + i.missingReadings.length, 0);

  return (
    <div className="pg pf__page">
      <div className="ad__filters bl__runbar">
        <Field id="run-date" label="Run for" error={dateError ?? undefined}>
          <input id="run-date" type="date" value={date} max={today}
            onChange={(e) => { setDate(e.target.value); setResult(null); }} aria-invalid={Boolean(dateError)} />
        </Field>
        <p className="ad__muted pg-grow">
          Bills every active tenancy whose billing day in {formatPeriod(period, true)} has come by {formatDay(date)}, and that has no
          monthly invoice for it yet. This also runs automatically every night.
        </p>
      </div>

      {result ? (
        <div className="ad__callout" role="status">
          <p>
            {result.created === 0
              ? `Nothing new was invoiced for ${formatPeriod(result.period || period, true)}.`
              : `${result.created} ${result.created === 1 ? 'invoice was' : 'invoices were'} created for ${formatPeriod(result.period || period, true)}.`}
          </p>
          <Link className="nx-btn nx-btn--sm" to={`/app/invoices?period=${result.period || period}&kind=MONTHLY`}>See the invoices</Link>
        </div>
      ) : null}

      {dateError ? null : preview.isError ? (
        <p className="ad__error" role="alert">{billingErrorMessage(preview.error)}</p>
      ) : preview.isPending ? (
        <p className="ad__muted" role="status">Working out the run…</p>
      ) : items.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState title="Nothing to invoice" detail={`Every tenancy due by ${formatDay(date)} already has its ${formatPeriod(period)} invoice, or none is due yet.`} />
        </div>
      ) : (
        <>
          <div className="ad__stats pf__stats bl__stats">
            <div className="ad__stat"><span className="ad__stat__label">Invoices</span><span className="ad__stat__value num">{items.length}</span></div>
            <div className="ad__stat"><span className="ad__stat__label">Total to bill</span><span className="ad__stat__value num">{formatKES(grandTotal)}</span></div>
            <div className="ad__stat"><span className="ad__stat__label">Missing readings</span><span className={`ad__stat__value num ${missing > 0 ? 'bl__warntext' : ''}`}>{missing}</span></div>
          </div>

          {missing > 0 ? (
            <div className="ad__callout ad__callout--note" role="note">
              {missing} {missing === 1 ? 'meter has' : 'meters have'} no reading for {formatPeriod(period)}, so {missing === 1 ? 'it gets' : 'they get'} no line this month;
              the next reading covers both months. <Link to="/app/meter-readings">Enter readings</Link> first if you want them billed now.
            </div>
          ) : null}

          <div className="ad__tablewrap">
            <table className="ad__table bl__run">
              <thead>
                <tr><th>Tenant</th><th>Unit</th><th>Lines</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.tenancyId}>
                    <td>{personName(item.tenant)}<span className="ad__sub num">{item.tenant.code}</span></td>
                    <td>{item.unit.number}<span className="ad__sub">{item.property.name}</span></td>
                    <td>
                      <ul className="bl__runlines">
                        {item.lines.map((line, i) => (
                          <li key={i}>
                            <span>{line.description}{trimQuantity(line.quantity) !== '1' ? <span className="ad__muted num"> × {trimQuantity(line.quantity)}</span> : null}</span>
                            <span className="num">{formatKES(line.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {item.missingReadings.map((m) => (
                        <span key={m.meterId} className="ad__badge ad__badge--warn bl__missing">No {m.chargeName} reading · {m.serialNo}</span>
                      ))}
                    </td>
                    <td className="num"><strong>{formatKES(item.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th colSpan={3}>{items.length} {items.length === 1 ? 'invoice' : 'invoices'}</th><th className="num">{formatKES(grandTotal)}</th></tr>
              </tfoot>
            </table>
          </div>

          {canCreate ? (
            <div className="pg-actions">
              <button type="button" className="nx-btn nx-btn--primary" disabled={run.isPending || Boolean(dateError)} onClick={() => run.mutate(date)}>
                {run.isPending ? 'Creating…' : `Create ${items.length} ${items.length === 1 ? 'invoice' : 'invoices'}`}
              </button>
            </div>
          ) : <p className="ad__muted">Your role can preview the run but not create invoices.</p>}
        </>
      )}
    </div>
  );
}
