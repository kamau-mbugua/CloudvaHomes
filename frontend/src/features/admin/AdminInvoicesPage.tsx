import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { isSuperAdmin } from '../../lib/auth/portals';
import { useSession } from '../../lib/auth/useAuth';
import { currentPeriod, formatPeriod, shiftPeriod } from '../../lib/periods';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { INVOICE_STATUS } from '../billing/labels';
import { MonthPicker } from '../billing/ui';
import { unwrap } from '../payments/rules';
import { useListFilters } from '../portfolio/hooks';
import { optionsOf } from '../portfolio/labels';
import { PAGE_SIZE, keys, platformErrorMessage } from '../platform/api';
import { lastMonth } from '../platform/rules';
import type { PlatformInvoice } from '../platform/types';
import { HodiInvoicesTable } from '../platform/ui';
import { AdminInvoiceActions, VoidHodiInvoiceSheet } from './sheets';

/**
 * Admin → Invoices (`/admin/invoices`): Hodi's invoices to every organisation, filtered by
 * status and month (in the address), each with its PDF and Void. "Run a month" bills a
 * finished month by hand (`POST /platform/invoices/run`); it is idempotent, so running a
 * month twice never bills an organisation twice.
 */
export function AdminInvoicesPage() {
  const { user } = useSession();
  const superAdmin = isSuperAdmin(user);
  const filters = useListFilters();
  const { page } = filters;
  const status = filters.get('status');
  const period = filters.get('period');
  const orgId = filters.get('orgId');
  const [running, setRunning] = useState(false);
  const [voiding, setVoiding] = useState<PlatformInvoice | null>(null);

  const list = useQuery({
    queryKey: [...keys.invoices, 'list', { status, period, orgId, page }],
    queryFn: () => api.get<PageEnvelope<PlatformInvoice>>('/platform/invoices', { status, period, orgId, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];
  const filtered = Boolean(status || period || orgId);
  const months = Array.from({ length: 13 }, (_, i) => shiftPeriod(currentPeriod(), -i));

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Invoice status">
          <button
            type="button"
            role="tab"
            aria-selected={!status}
            className="pf__tab"
            onClick={() => filters.setFilter({ status: '' })}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={status === 'OVERDUE'}
            className="pf__tab"
            onClick={() => filters.setFilter({ status: 'OVERDUE' })}
          >
            Overdue
          </button>
          {optionsOf(INVOICE_STATUS).map((o) => (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={status === o.value}
              className="pf__tab"
              onClick={() => filters.setFilter({ status: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
        {superAdmin ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setRunning(true)}>Run a month</button>
        ) : null}
      </div>

      <div className="ad__filters">
        <select className="ad__select" aria-label="Month" value={period} onChange={(e) => filters.setFilter({ period: e.target.value })}>
          <option value="">Any month</option>
          {period && !months.includes(period) ? <option value={period}>{formatPeriod(period)}</option> : null}
          {months.map((m) => <option key={m} value={m}>{formatPeriod(m)}</option>)}
        </select>
        {orgId ? (
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => filters.setFilter({ orgId: '' })}>One organisation · show all</button>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}

      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered
            ? <EmptyState title="No invoices match" detail="Try a different month or status." onClear={() => filters.clear()} />
            : <EmptyState title="No KodiHub invoices yet" detail="They are issued on the 1st for the month before. Run a finished month to issue them now." />}
        </div>
      ) : (
        <HodiInvoicesTable rows={rows} showOrg actions={(inv) => <AdminInvoiceActions invoice={inv} onVoid={superAdmin ? setVoiding : undefined} />} />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />

      {running ? <RunMonthSheet onClose={() => setRunning(false)} onDone={(p) => filters.setFilter({ period: p, status: '' })} /> : null}
      {voiding ? <VoidHodiInvoiceSheet invoice={voiding} onClose={() => setVoiding(null)} /> : null}
    </div>
  );
}

function RunMonthSheet({ onClose, onDone }: { onClose: () => void; onDone: (period: string) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const latest = lastMonth();
  const [period, setPeriod] = useState(latest);
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: (p: string) => api.post<unknown>('/platform/invoices/run', { period: p }).then((body) => unwrap<{ period?: string; created: number }>(body)),
    onSuccess: async (result, p) => {
      const month = formatPeriod(result.period ?? p, true);
      toast.saved(result.created > 0
        ? `${result.created} ${result.created === 1 ? 'invoice' : 'invoices'} issued for ${month}.`
        : `Nothing new for ${month}: every organisation was already billed, in its trial, or closed.`);
      await queryClient.invalidateQueries({ queryKey: keys.platform });
      onDone(result.period ?? p);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 422 && e.fieldErrors.period) {
        setError(`${formatPeriod(period, true)} hasn’t ended yet. Only a finished month can be billed.`);
        return;
      }
      setError(platformErrorMessage(e));
    },
  });

  return (
    <Sheet
      title="Run a month"
      busy={run.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={run.isPending}>Cancel</button>
          <button type="button" className="nx-btn nx-btn--primary" disabled={run.isPending}
            onClick={() => { setError(null); run.mutate(period); }}>
            {run.isPending ? 'Running…' : `Bill ${formatPeriod(period, true)}`}
          </button>
        </>
      )}
    >
      <div className="sheet-form">
        <p className="ad__muted">
          Issues one invoice per organisation for the month: the units let on its last day × its price, never less than its minimum.
          Organisations still in their trial at the month’s end, closed ones, and any already billed for it are skipped.
        </p>
        <MonthPicker value={period} onChange={setPeriod} max={latest} label="Month to bill" />
        {error ? <p className="nx-sheet__error" role="alert">{error}</p> : null}
      </div>
    </Sheet>
  );
}
