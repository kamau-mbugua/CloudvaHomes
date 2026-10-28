import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { displayName } from '../../lib/auth/permissions';
import type { AuditEntry } from '../../lib/auth/types';
import { formatDateTime, nairobiDayBoundary } from '../../lib/dates';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { keys, settingsErrorMessage } from './api';

/**
 * Settings → Audit log: every sensitive change, newest first, with what it looked like
 * before and after (the server redacts secrets and personal data).
 *
 * Filters live in the address. Dates are whole days in Nairobi time.
 */

const PAGE_SIZE = 25;

/** The entities phase 1 records; free text is still accepted for later ones. */
const ENTITIES = ['organization', 'membership', 'invitation', 'role', 'user', 'session'];

export function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);

  const entity = params.get('entity') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const setFilter = (changes: Record<string, string>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace: true });
  };

  const list = useQuery({
    queryKey: [...keys.audit, { entity, from, to, page }],
    queryFn: () => api.get<PageEnvelope<AuditEntry>>('/audit-logs', {
      page,
      pageSize: PAGE_SIZE,
      entity,
      from: nairobiDayBoundary(from),
      to: nairobiDayBoundary(to, true),
    }),
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const filtered = Boolean(entity || from || to);

  return (
    <div className="pg">
      <div className="ad__filters">
        <div className="ad__filter">
          <label htmlFor="audit-entity">Record type</label>
          <input
            id="audit-entity"
            className="ad__select"
            list="audit-entities"
            placeholder="Any"
            value={entity}
            onChange={(e) => setFilter({ entity: e.target.value.trim() })}
          />
          <datalist id="audit-entities">
            {ENTITIES.map((e) => <option key={e} value={e} />)}
          </datalist>
        </div>
        <div className="ad__filter">
          <label htmlFor="audit-from">From</label>
          <input id="audit-from" className="ad__select" type="date" value={from} max={to || undefined}
            onChange={(e) => setFilter({ from: e.target.value })} />
        </div>
        <div className="ad__filter">
          <label htmlFor="audit-to">To</label>
          <input id="audit-to" className="ad__select" type="date" value={to} min={from || undefined}
            onChange={(e) => setFilter({ to: e.target.value })} />
        </div>
        {filtered ? (
          <button type="button" className="nx-btn nx-btn--sm ad__filterclear" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </button>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{settingsErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="Nothing recorded for these filters" onClear={() => setParams({}, { replace: true })} />
          ) : (
            <EmptyState title="Nothing recorded yet" detail="Changes to users, roles and settings will appear here." />
          )}
        </div>
      ) : rows.length > 0 ? (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
                <th className="ad__rowactions"><span className="nx-sr">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const expanded = open === entry.id;
                const hasDiff = entry.before != null || entry.after != null;
                return (
                  <Fragment key={entry.id}>
                    <tr className={expanded ? 'is-expanded' : undefined}>
                      <td className="audit__when"><span className="num">{formatDateTime(entry.createdAt)}</span></td>
                      <td>
                        {actorName(entry)}
                        {entry.ip ? <span className="ad__sub num">{entry.ip}</span> : null}
                      </td>
                      <td><code className="audit__action">{entry.action}</code></td>
                      <td>
                        {entry.entity}
                        {entry.entityId ? <span className="ad__sub num" title={entry.entityId}>{shortId(entry.entityId)}</span> : null}
                      </td>
                      <td className="ad__rowactions">
                        <div>
                          {hasDiff ? (
                            <button
                              type="button"
                              className="nx-btn nx-btn--sm"
                              aria-expanded={expanded}
                              aria-controls={`audit-${entry.id}`}
                              onClick={() => setOpen(expanded ? null : entry.id)}
                            >
                              {expanded ? 'Hide changes' : 'Show changes'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="audit__detailrow">
                        <td colSpan={5} id={`audit-${entry.id}`}>
                          <div className="audit__diff">
                            <JsonBlock title="Before" value={entry.before} />
                            <JsonBlock title="After" value={entry.after} />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Pager meta={list.data?.meta} onPage={(next) => setFilter({ page: String(next) })} />
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="audit__json">
      <span className="audit__jsontitle">{title}</span>
      {value == null ? <p className="ad__muted">Nothing</p> : <pre className="num">{JSON.stringify(value, null, 2)}</pre>}
    </div>
  );
}

function actorName(entry: AuditEntry): string {
  if (entry.actor) return entry.actor.name || displayName(entry.actor);
  return entry.actorId ? `User ${shortId(entry.actorId)}` : 'System';
}

function shortId(id: string): string {
  return id.length > 10 ? `…${id.slice(-8)}` : id;
}
