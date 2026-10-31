import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { TableSkeleton } from '../../components/Loading';
import type { Tenancy } from '../portfolio/types';
import { billingErrorMessage, keys } from './api';
import { InvoiceSheet } from './InvoiceSheet';
import type { Invoice } from './types';
import { InvoicesTable } from './ui';

/**
 * The "Invoices" section on a tenant's page and a unit's page. Renders nothing without
 * `invoices:view`. Shows the newest few; "See all" opens the full list.
 */

const SHOWN = 10;

/** A tenant's invoices (`GET /invoices?tenantId=`). "New invoice" bills their current tenancy. */
export function TenantInvoices({ tenantId, currentTenancy }: { tenantId: string; currentTenancy?: Tenancy }) {
  const canView = useCan('invoices:view');
  const canCreate = useCan('invoices:create');
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: [...keys.invoices, 'list', { tenantId, pageSize: SHOWN }],
    queryFn: () => api.get<PageEnvelope<Invoice>>('/invoices', { tenantId, pageSize: SHOWN }),
    enabled: canView,
  });
  if (!canView) return null;

  const rows = list.data?.data ?? [];
  const total = list.data?.meta?.total ?? rows.length;

  return (
    <section className="fm__section">
      <div className="pf__sectionhead">
        <h2>Invoices</h2>
        {canCreate && currentTenancy ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setCreating(true)}>New invoice</button> : null}
      </div>
      {list.isError ? <p className="ad__error" role="alert">{billingErrorMessage(list.error)}</p>
        : list.isPending ? <TableSkeleton rows={3} />
          : rows.length === 0 ? <p className="ad__muted">No invoices yet.</p>
            : (
              <>
                <InvoicesTable rows={rows} showTenant={false} />
                {total > rows.length ? <p className="ad__muted pg-gap">Showing the newest {rows.length} of {total}.</p> : null}
              </>
            )}
      {creating && currentTenancy ? <InvoiceSheet tenancy={currentTenancy} onClose={() => setCreating(false)} /> : null}
    </section>
  );
}

/** A unit's invoices across every tenancy it has had (`GET /invoices?unitId=`). */
export function UnitInvoices({ unitId }: { unitId: string }) {
  const canView = useCan('invoices:view');
  const list = useQuery({
    queryKey: [...keys.invoices, 'list', { unitId, pageSize: SHOWN }],
    queryFn: () => api.get<PageEnvelope<Invoice>>('/invoices', { unitId, pageSize: SHOWN }),
    enabled: canView,
  });
  if (!canView) return null;

  const rows = list.data?.data ?? [];
  const total = list.data?.meta?.total ?? rows.length;

  return (
    <section className="fm__section">
      <div className="pf__sectionhead"><h2>Invoices</h2></div>
      {list.isError ? <p className="ad__error" role="alert">{billingErrorMessage(list.error)}</p>
        : list.isPending ? <TableSkeleton rows={3} />
          : rows.length === 0 ? <p className="ad__muted">No invoices yet.</p>
            : (
              <>
                <InvoicesTable rows={rows} showUnit={false} />
                {total > rows.length ? <p className="ad__muted pg-gap">Showing the newest {rows.length} of {total}.</p> : null}
              </>
            )}
    </section>
  );
}
