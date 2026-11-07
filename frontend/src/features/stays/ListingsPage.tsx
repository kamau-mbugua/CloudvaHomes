import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { usePropertyOptions } from '../portfolio/api';
import { useListFilters } from '../portfolio/hooks';
import { useAuthedBlobUrl } from '../uploads/api';
import { staysErrorMessage, staysKeys } from './api';
import { formatKES } from '../../lib/money';
import type { Listing } from './types';

const PAGE_SIZE = 20;

function CoverThumb({ uploadId, title }: { uploadId: string | null; title: string }) {
  const thumb = useAuthedBlobUrl(uploadId ? `/uploads/${uploadId}/content` : null);
  return (
    <div
      style={{
        width: '48px',
        height: '36px',
        borderRadius: '0.35rem',
        overflow: 'hidden',
        background: 'var(--secondary)',
        flexShrink: 0,
      }}
    >
      {thumb.status === 'ready' ? (
        <img
          src={thumb.url}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}
    </div>
  );
}

export function ListingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const filters = useListFilters();
  const { page } = filters;
  const propertyId = filters.get('propertyId');
  const published = filters.get('published');

  const canCreate = useCan('listings:create');
  const canUpdate = useCan('listings:update');

  const properties = usePropertyOptions(true);
  const list = useQuery({
    queryKey: [...staysKeys.listings, { propertyId, published, page }],
    queryFn: () =>
      api.get<PageEnvelope<Listing>>('/host/listings', {
        page,
        pageSize: PAGE_SIZE,
        propertyId,
        published: published === '' ? undefined : published,
      }),
    placeholderData: keepPreviousData,
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      api.patch<DataEnvelope<Listing>>(`/host/listings/${id}`, { published: next }),
    onSuccess: async (_res, vars) => {
      toast.saved(vars.next ? 'Listing published.' : 'Listing unpublished.');
      await queryClient.invalidateQueries({ queryKey: staysKeys.listings });
    },
    onError: (err) => toast.failed(staysErrorMessage(err)),
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(propertyId || published);

  return (
    <div className="pg">
      <div className="ad__filters">
        <select
          className="ad__select"
          aria-label="Property"
          value={propertyId}
          onChange={(e) => filters.setFilter({ propertyId: e.target.value })}
        >
          <option value="">All properties</option>
          {(properties.data?.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          className="ad__select"
          aria-label="Published status"
          value={published}
          onChange={(e) => filters.setFilter({ published: e.target.value })}
        >
          <option value="">All listings</option>
          <option value="true">Published</option>
          <option value="false">Draft / unpublished</option>
        </select>

        {canCreate ? (
          <Link to="/app/listings/new" className="nx-btn nx-btn--primary pg-push">
            Add listing
          </Link>
        ) : null}
      </div>

      {list.isError ? (
        <p className="ad__error" role="alert">
          {staysErrorMessage(list.error)}
        </p>
      ) : null}

      {list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState
              title="No listings match"
              detail="Try clearing the filters."
              onClear={() => filters.clear()}
            />
          ) : (
            <EmptyState
              title="No short-stay listings yet"
              detail="Add your first nightly unit with photos and pricing to start taking bookings."
              action={
                canCreate ? (
                  <Link to="/app/listings/new" className="nx-btn nx-btn--sm nx-btn--primary">
                    Add listing
                  </Link>
                ) : undefined
              }
            />
          )}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Property</th>
                <th className="num">Max guests</th>
                <th className="num">Nightly price</th>
                <th>Status</th>
                <th className="ad__rowactions">
                  <span className="nx-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <CoverThumb uploadId={l.coverUploadId} title={l.title} />
                      <div>
                        <Link className="ad__link" to={`/app/listings/${l.id}`}>
                          {l.title}
                        </Link>
                        <div className="ad__sub">
                          Unit {l.unit.number} · {l.bedrooms} BR · {l.bathrooms} bath
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{l.property.name}</div>
                    <div className="ad__sub">{l.area ?? l.property.location ?? l.property.code}</div>
                  </td>
                  <td className="num">{l.maxGuests}</td>
                  <td className="num">
                    <strong>{formatKES(Number(l.nightlyPrice))}</strong>
                    {l.weekendPrice ? (
                      <div className="ad__sub">Wknd {formatKES(Number(l.weekendPrice))}</div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`ad__badge ${l.published ? 'ad__badge--ok' : 'ad__badge--off'}`}>
                      {l.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="ad__rowactions">
                    {canUpdate ? (
                      <button
                        type="button"
                        className="nx-btn nx-btn--sm"
                        onClick={() =>
                          togglePublish.mutate({ id: l.id, next: !l.published })
                        }
                      >
                        {l.published ? 'Unpublish' : 'Publish'}
                      </button>
                    ) : null}
                    <Link to={`/app/listings/${l.id}`} className="nx-btn nx-btn--sm">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data ? (
            <Pager meta={list.data.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
          ) : null}
        </div>
      )}
    </div>
  );
}
