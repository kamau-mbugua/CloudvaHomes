import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useSession } from '../../lib/auth/useAuth';
import { PropertySelect } from '../billing/ui';
import { useListFilters } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';
import { staysErrorMessage, staysKeys } from './api';
import type { HostCleaningTask } from './ops';
import type { Listing } from './types';

const PAGE_SIZE = 25;

export function CleaningPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canUpdate = new Set(session?.permissions ?? []).has('cleaning:update');

  const filters = useListFilters();
  const statusFilter =
    (filters.get('status') as 'OPEN' | 'DONE' | '') || 'OPEN';
  const propertyId = filters.get('propertyId') || session?.activePropertyId || '';
  const { page } = filters;

  const [addingTask, setAddingTask] = useState(false);
  const [newUnitId, setNewUnitId] = useState('');
  const [newNote, setNewNote] = useState('');

  const cleaningQuery = useQuery({
    queryKey: [
      ...staysKeys.cleaning,
      { status: statusFilter, propertyId, page, pageSize: PAGE_SIZE },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (propertyId) {
        params.set('propertyId', propertyId);
      }
      return api.get<PageEnvelope<HostCleaningTask>>(
        `/host/cleaning?${params.toString()}`,
      );
    },
  });

  const listingsQuery = useQuery({
    queryKey: [...staysKeys.listings, { propertyId }],
    enabled: canUpdate && addingTask,
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (propertyId) {
        params.set('propertyId', propertyId);
      }
      const res = await api.get<PageEnvelope<Listing>>(
        `/host/listings?${params.toString()}`,
      );
      return res.data;
    },
  });

  const doneMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await api.post(`/host/cleaning/${taskId}/done`, {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: staysKeys.cleaning });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { unitId: string; note?: string }) => {
      await api.post('/host/cleaning', payload);
    },
    onSuccess: async () => {
      setAddingTask(false);
      setNewUnitId('');
      setNewNote('');
      await queryClient.invalidateQueries({ queryKey: staysKeys.cleaning });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitId) return;
    createMutation.mutate({
      unitId: newUnitId,
      note: newNote.trim() || undefined,
    });
  };

  const tasks = cleaningQuery.data?.data ?? [];
  const meta = cleaningQuery.data?.meta;
  const listings = listingsQuery.data ?? [];

  return (
    <div className="pg">
      <div className="ad__filters">
        <PropertySelect
          allowAll
          value={propertyId}
          onChange={(v) => filters.setFilter({ propertyId: v })}
        />
        <select
          className="ad__select"
          value={statusFilter}
          onChange={(e) => filters.setFilter({ status: e.target.value })}
          aria-label="Cleaning status"
        >
          <option value="OPEN">To clean</option>
          <option value="DONE">Completed</option>
        </select>

        {canUpdate && (
          <div className="bl__headbtns pg-push">
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              onClick={() => setAddingTask(true)}
            >
              Add cleaning task
            </button>
          </div>
        )}
      </div>

      {cleaningQuery.isError && (
        <p className="ad__error" role="alert">
          {staysErrorMessage(cleaningQuery.error)}
        </p>
      )}

      {cleaningQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : tasks.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState
            title={
              statusFilter === 'OPEN'
                ? 'All units are clean'
                : 'No completed cleaning tasks yet'
            }
            detail={
              statusFilter === 'OPEN'
                ? 'Turnover cleaning tasks appear here automatically when a guest checks out.'
                : 'Completed turnover and ad-hoc cleaning tasks will appear here.'
            }
            action={
              canUpdate ? (
                <button
                  type="button"
                  className="nx-btn nx-btn--primary"
                  onClick={() => setAddingTask(true)}
                >
                  Add cleaning task
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Next check-in</th>
                <th>Note</th>
                <th className="ad__rowactions">
                  <span className="nx-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.unit.title || t.unit.number}</strong>
                    <span className="ad__sub">
                      {t.property.name} · {t.unit.number}
                    </span>
                  </td>
                  <td>
                    {t.nextCheckIn ? (
                      <span className="ad__badge ad__badge--warn">
                        {t.nextCheckIn}
                      </span>
                    ) : (
                      <span className="ad__sub">No upcoming check-in</span>
                    )}
                  </td>
                  <td>{t.note ?? '—'}</td>
                  <td className="ad__rowactions">
                    <div>
                      {t.status === 'OPEN' && canUpdate ? (
                        <button
                          type="button"
                          className="nx-btn"
                          disabled={doneMutation.isPending}
                          onClick={() => doneMutation.mutate(t.id)}
                        >
                          Mark done
                        </button>
                      ) : t.doneAt ? (
                        <span className="ad__sub">
                          Done {t.doneAt.slice(0, 10)}
                        </span>
                      ) : null}
                    </div>
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

      {addingTask && canUpdate && (
        <Sheet
          title="Add cleaning task"
          busy={createMutation.isPending}
          onClose={() => setAddingTask(false)}
          footer={
            <>
              <button
                type="button"
                className="nx-btn"
                onClick={() => setAddingTask(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="clean-task-form"
                className="nx-btn nx-btn--primary"
                disabled={!newUnitId || createMutation.isPending}
              >
                {createMutation.isPending ? 'Saving…' : 'Create task'}
              </button>
            </>
          }
        >
          <form
            id="clean-task-form"
            className="pf__dialogform"
            onSubmit={handleCreate}
            noValidate
          >
            <p className="ad__muted">
              Schedule an ad-hoc turnover or deep-cleaning task for a unit.
            </p>

            {createMutation.isError && (
              <p className="nx-sheet__error" role="alert">
                {staysErrorMessage(createMutation.error)}
              </p>
            )}

            <div className="fm__grid">
              <Field id="clean-unit" label="Unit" wide>
                <select
                  id="clean-unit"
                  className="nx-input"
                  value={newUnitId}
                  onChange={(e) => setNewUnitId(e.target.value)}
                  required
                >
                  <option value="">Choose a unit…</option>
                  {listings.map((l) => (
                    <option key={l.unitId} value={l.unitId}>
                      {l.title} ({l.unit.number})
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="clean-note" label="Note" optional wide>
                <input
                  id="clean-note"
                  type="text"
                  className="nx-input"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="e.g. Deep clean kitchen"
                />
              </Field>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}
