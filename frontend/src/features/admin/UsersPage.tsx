import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { isSuperAdmin } from '../../lib/auth/portals';
import { useSession } from '../../lib/auth/useAuth';
import { formatDateTime } from '../../lib/dates';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { useListFilters } from '../portfolio/hooks';
import { PAGE_SIZE, keys, platformErrorMessage } from '../platform/api';
import { USER_STATE, purgeText, userLinksText, userName, userState } from '../platform/rules';
import type { PlatformUser, UserFilter } from '../platform/types';

const TABS: { value: UserFilter; label: string; superAdminOnly?: boolean }[] = [
  { value: 'all', label: 'All' },
  { value: 'business', label: 'Business users' },
  { value: 'tenants', label: 'Tenants' },
  { value: 'owners', label: 'Landlords' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'deleted', label: 'Deleted accounts', superAdminOnly: true },
];

export function UserStateBadge({ user }: { user: Pick<PlatformUser, 'status' | 'deleted'> }) {
  const state = USER_STATE[userState(user)];
  return <span className={`ad__badge ${state.tone}`}>{state.label}</span>;
}

/**
 * Admin → People (`/admin/users`): customers' accounts (business staff, tenants, landlords with
 * owner-portal access), searchable by name, email or phone, filtered by kind (both in the
 * address). Salespeople see the people linked to organisations they look after; deleted
 * accounts are for superadmins. A row opens the person.
 */
export function UsersPage() {
  const { user: me } = useSession();
  const superAdmin = isSuperAdmin(me);
  const filters = useListFilters();
  const { q, page } = filters;
  const raw = filters.get('filter') as UserFilter | '';
  const tabs = TABS.filter((t) => superAdmin || !t.superAdminOnly);
  const filter: UserFilter = tabs.some((t) => t.value === raw) ? (raw as UserFilter) : 'all';
  const deletedTab = filter === 'deleted';

  const list = useQuery({
    queryKey: [...keys.users, 'list', { q, filter, page }],
    queryFn: () =>
      api.get<PageEnvelope<PlatformUser>>('/platform/users', {
        q,
        filter: filter === 'all' ? undefined : filter,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  return (
    <div className="pg">
      <div className="pf__tabsrow">
        <div className="pf__tabs" role="tablist" aria-label="Kind of account">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={filter === t.value}
              className="pf__tab"
              onClick={() => filters.setFilter({ filter: t.value === 'all' ? '' : t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by name, email or phone" aria-label="Search people"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
      </div>

      {deletedTab ? (
        <p className="ad__muted">
          People who closed their account, or whose account KodiHQ support closed. Each is erased 30 days after deletion;
          until then it can be restored.
        </p>
      ) : null}

      {list.isError ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}

      {list.isPending ? <TableSkeleton /> : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {q
            ? <EmptyState title="No one matches" detail="Try a different name, email or phone number." onClear={() => filters.clear()} />
            : <EmptyState title={deletedTab ? 'No deleted accounts' : 'No one here yet'} detail={deletedTab ? 'Accounts people close appear here for 30 days.' : 'People appear here once they have a KodiHQ login.'} />}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              {deletedTab ? (
                <tr>
                  <th>Person</th>
                  <th>Deleted</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              ) : (
                <tr>
                  <th>Person</th>
                  <th>Belongs to</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link className="ad__link" to={`/admin/users/${encodeURIComponent(u.id)}`}><strong>{userName(u)}</strong></Link>
                    <span className="ad__sub">
                      {[u.deleted ? u.deleted.email : u.email, u.deleted ? u.deleted.phone : u.phone].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </td>
                  {deletedTab ? (
                    <>
                      <td>
                        {formatDateTime(u.deleted?.deletedAt)}
                        {u.deleted?.purgeOn ? <span className="ad__sub">{purgeText(u.deleted.purgeOn)}</span> : null}
                      </td>
                      <td>{u.deleted?.reason || <span className="ad__muted">—</span>}</td>
                    </>
                  ) : (
                    <td>{userLinksText(u) || <span className="ad__muted">No organisation</span>}</td>
                  )}
                  <td><UserStateBadge user={u} /></td>
                  {deletedTab ? null : <td>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="ad__muted">Never</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
    </div>
  );
}
