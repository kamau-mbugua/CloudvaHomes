import { useDeferredValue, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { formatDateTime } from '../../lib/dates';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { keys, PAGE_SIZE, platformErrorMessage } from '../platform/api';
import { PROVIDER_LABEL } from '../sms/rules';
import type { SmsProvider, SmsUsageStatus } from '../sms/types';
import { SmsLogSheet } from './SmsLogSheet';
import {
  ORG_TYPES,
  PLATFORM_TYPES,
  smsStatus,
  smsTypeLabel,
  type SmsKind,
  type SmsLogRow,
} from './smsLog';

/**
 * Every SMS on KodiHub — its own sign-in and security messages and every organisation's —
 * newest first, with filters and a phone search. Each row opens the message. With `orgId`
 * (and a period) it lists one organisation's messages, as the SMS report's drill-down.
 */
export function AdminSmsMessages({ orgId, from: fixedFrom, to: fixedTo }: { orgId?: string; from?: string; to?: string }) {
  const [kind, setKind] = useState<SmsKind | ''>('');
  const [status, setStatus] = useState<SmsUsageStatus | ''>('');
  const [type, setType] = useState('');
  const [provider, setProvider] = useState<SmsProvider | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<string | null>(null);

  const params = {
    orgId,
    kind: orgId ? undefined : kind || undefined,
    status: status || undefined,
    type: type || undefined,
    provider: provider || undefined,
    from: fixedFrom ?? (from || undefined),
    to: fixedTo ?? (to || undefined),
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const datesWrong = Boolean(!fixedFrom && from && to && from > to);
  const list = useQuery({
    queryKey: [...keys.platform, 'sms-logs', params],
    queryFn: () => api.get<PageEnvelope<SmsLogRow>>('/platform/sms/logs', params),
    enabled: !datesWrong,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const types = orgId || kind === 'ORG' ? ORG_TYPES : kind === 'PLATFORM' ? PLATFORM_TYPES : [...PLATFORM_TYPES, ...ORG_TYPES];

  return (
    <div>
      {opened ? <SmsLogSheet id={opened} onClose={() => setOpened(null)} /> : null}
      <div className="ad__filters">
        <input
          className="ad__search"
          type="search"
          inputMode="tel"
          placeholder="Search by phone number…"
          aria-label="Search by phone number"
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
        />
        {orgId ? null : (
          <select className="ad__select" aria-label="Sent by" value={kind}
            onChange={(e) => { reset(setKind)(e.target.value as SmsKind | ''); setType(''); }}>
            <option value="">KodiHub and organisations</option>
            <option value="PLATFORM">KodiHub’s own</option>
            <option value="ORG">Organisations’</option>
          </select>
        )}
        <select className="ad__select" aria-label="Status" value={status}
          onChange={(e) => reset(setStatus)(e.target.value as SmsUsageStatus | '')}>
          <option value="">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="NO_UNITS">No units</option>
        </select>
        <select className="ad__select" aria-label="Message type" value={type} onChange={(e) => reset(setType)(e.target.value)}>
          <option value="">All messages</option>
          {types.map((t) => <option key={t} value={t}>{smsTypeLabel(t)}</option>)}
        </select>
        <select className="ad__select" aria-label="Provider" value={provider}
          onChange={(e) => reset(setProvider)(e.target.value as SmsProvider | '')}>
          <option value="">All providers</option>
          {(Object.keys(PROVIDER_LABEL) as SmsProvider[]).map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
        </select>
        {fixedFrom ? null : (
          <>
            <label className="ad__muted">From <input type="date" className="ad__select" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
            <label className="ad__muted">To <input type="date" className="ad__select" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          </>
        )}
      </div>

      {datesWrong ? <p className="ad__error" role="alert">The “From” date must be on or before the “To” date.</p> : null}
      {list.isError && !datesWrong ? <p className="ad__error" role="alert">{platformErrorMessage(list.error)}</p> : null}

      {datesWrong ? null : list.isPending ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState title="No messages" detail="SMS that match these filters show here." />
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>When</th>
                {orgId ? null : <th>From</th>}
                <th>To</th>
                <th>Message</th>
                <th>Provider</th>
                <th className="num">Units</th>
                <th>Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = smsStatus(r.status);
                return (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.at)}</td>
                    {orgId ? null : <td>{r.organization ? r.organization.name : <span className="ad__muted">KodiHub</span>}</td>}
                    <td className="num">{r.to}</td>
                    <td>{smsTypeLabel(r.type)}</td>
                    <td>{r.provider ? PROVIDER_LABEL[r.provider] : '—'}</td>
                    <td className="num">{r.units}</td>
                    <td>
                      <span className={`ad__badge ad__badge--${st.tone}`}>{st.label}</span>
                      {r.reason ? <span className="ad__sub ad__owed">{r.reason}</span> : null}
                    </td>
                    <td className="ad__rowactions">
                      <div>
                        <button
                          type="button"
                          className="nx-btn nx-btn--sm"
                          onClick={() => setOpened(r.id)}
                          aria-label={`Open the ${smsTypeLabel(r.type).toLowerCase()} SMS to ${r.to}`}
                        >
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
    </div>
  );
}
