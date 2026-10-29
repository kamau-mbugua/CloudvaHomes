import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { useListFilters } from '../portfolio/hooks';
import { PAGE_SIZE, keys, platformErrorMessage } from '../platform/api';
import type { PlatformPayment } from '../platform/types';
import { PlatformPaymentsTable } from '../platform/ui';

/**
 * Admin → Payments (`/admin/payments`): every payment received by Hodi across organisations
 * (M-Pesa STK, C2B paybill, or manually recorded bank/cheque/M-Pesa transfers).
 */
export function AdminPaymentsPage() {
  const filters = useListFilters();
  const { page } = filters;
  const orgId = filters.get('orgId');

  const list = useQuery({
    queryKey: [...keys.payments, 'list', { orgId, page }],
    queryFn: () => api.get<PageEnvelope<PlatformPayment>>('/platform/payments', { orgId, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  return (
    <div className="pg">
      {orgId ? (
        <div className="ad__filters">
          <button type="button" className="nx-btn nx-btn--sm" onClick={() => filters.setFilter({ orgId: '' })}>
            One organisation · show all
          </button>
        </div>
      ) : null}

      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}

      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          <EmptyState
            title="No KodiHub payments yet"
            detail="Payments appear here when organisations pay via M-Pesa or when you record a payment on an organisation’s page."
          />
        </div>
      ) : (
        <PlatformPaymentsTable rows={rows} showOrg />
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
    </div>
  );
}
