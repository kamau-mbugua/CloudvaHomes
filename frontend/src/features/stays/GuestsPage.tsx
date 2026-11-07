import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { formatKES } from '../../lib/money';
import { useListFilters } from '../portfolio/hooks';
import { staysErrorMessage, staysKeys } from './api';
import type { HostGuestRow } from './ops';

const PAGE_SIZE = 25;

export function GuestsPage() {
  const session = useSession();
  const canViewPayments = new Set(session?.permissions ?? []).has(
    'stay-payments:view',
  );

  const filters = useListFilters();
  const { q, page } = filters;

  const guestsQuery = useQuery({
    queryKey: [...staysKeys.guests, { q, page, pageSize: PAGE_SIZE }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (q.trim()) {
        params.set('q', q.trim());
      }
      return api.get<PageEnvelope<HostGuestRow>>(
        `/host/guests?${params.toString()}`,
      );
    },
  });

  const rows = guestsQuery.data?.data ?? [];
  const meta = guestsQuery.data?.meta;
  const filtered = Boolean(q);
  const showMoneyColumn =
    canViewPayments || rows.some((g) => g.totalPaid !== undefined);

  return (
    <div className="pg">
      <div className="ad__filters">
        <input
          type="search"
          className="ad__search"
          placeholder="Search guest name or phone…"
          value={filters.search}
          onChange={(e) => filters.setSearch(e.target.value)}
        />
      </div>

      {guestsQuery.isError && (
        <p className="ad__error" role="alert">
          {staysErrorMessage(guestsQuery.error)}
        </p>
      )}

      {guestsQuery.isLoading ? (
        <TableSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState
            title="No guests found"
            detail="Guests appear here automatically when a booking is created."
            onClear={filtered ? () => filters.clear() : undefined}
          />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Phone</th>
                <th className="num">Stays</th>
                <th>Last stay</th>
                {showMoneyColumn && <th className="num">Total paid</th>}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link to={`/app/guests/${g.id}`} className="ad__link">
                      <strong>{g.name}</strong>
                    </Link>
                    {g.email && <span className="ad__sub">{g.email}</span>}
                  </td>
                  <td>{g.phone}</td>
                  <td className="num">{g.stays}</td>
                  <td className="num">{g.lastStay ?? '—'}</td>
                  {showMoneyColumn && (
                    <td className="num">
                      {g.totalPaid === undefined
                        ? '—'
                        : formatKES(Number(g.totalPaid))}
                    </td>
                  )}
                  <td>
                    {g.doNotAccept ? (
                      <span className="ad__badge ad__badge--bad">
                        Do not accept instant
                      </span>
                    ) : (
                      <span className="ad__badge ad__badge--ok">
                        Good standing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        meta={meta}
        onPage={(next) => filters.setFilter({ page: String(next) })}
      />
    </div>
  );
}
