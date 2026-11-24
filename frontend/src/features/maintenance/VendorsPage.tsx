import { useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, errorMessage } from '../../lib/api/client';
import type { PageEnvelope } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { TableSkeleton } from '../../components/Loading';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { useListFilters } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';
import { MAINTENANCE_CATEGORIES, type Vendor } from './types';
import { VENDORS_KEY } from './vendorsApi';

/**
 * Vendors (`/app/vendors`, phase 18 first step): artisans and companies the organisation sends
 * maintenance jobs to, with their trades. Archiving keeps their past jobs.
 */
export function VendorsPage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const trade = filters.get('trade');
  const showArchived = filters.get('active') === 'all';
  const canEdit = useCan('maintenance:update');
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
  const list = useQuery({
    queryKey: [...VENDORS_KEY, 'list', { q, trade, showArchived, page }],
    queryFn: () =>
      api.get<PageEnvelope<Vendor>>('/vendors', { q, trade, active: showArchived ? 'all' : undefined, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.data ?? [];

  return (
    <div className="pg">
      <div className="ad__filters">
        <input className="ad__search" type="search" placeholder="Search by name or phone" aria-label="Search vendors"
          value={filters.search} onChange={(e) => filters.setSearch(e.target.value)} />
        <select className="ad__select" aria-label="Trade" value={trade} onChange={(e) => filters.setFilter({ trade: e.target.value })}>
          <option value="">All trades</option>
          {Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="py__daterange">
          <input type="checkbox" checked={showArchived} onChange={(e) => filters.setFilter({ active: e.target.checked ? 'all' : '' })} />
          <span>Show archived</span>
        </label>
        {canEdit ? (
          <button type="button" className="nx-btn nx-btn--primary pg-push" onClick={() => setEditing('new')}>Add vendor</button>
        ) : null}
      </div>
      {list.isError ? <p className="ad__error" role="alert">{errorMessage(list.error)}</p> : null}
      {list.isPending ? <TableSkeleton /> : rows.length === 0 ? (
        <EmptyState title="No vendors yet" detail="Add the plumbers, electricians and others you send jobs to." />
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead><tr><th>Vendor</th><th>Trades</th><th className="num">Open jobs</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="pf__row" onClick={() => canEdit && setEditing(v)}>
                  <td><strong>{v.name}</strong><span className="ad__sub">{[v.phone, v.email].filter(Boolean).join(' · ')}</span></td>
                  <td>{v.trades.map((t) => MAINTENANCE_CATEGORIES[t] ?? t).join(', ') || <span className="ad__muted">—</span>}</td>
                  <td className="num">{v.openJobs ?? 0}</td>
                  <td><span className={`ad__badge ${v.active ? 'ad__badge--ok' : 'ad__badge--off'}`}>{v.active ? 'Active' : 'Archived'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={(next) => filters.setFilter({ page: String(next) })} />
      {editing ? <VendorSheet vendor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function VendorSheet({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(vendor?.name ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [email, setEmail] = useState(vendor?.email ?? '');
  const [trades, setTrades] = useState<string[]>(vendor?.trades ?? []);
  const [notes, setNotes] = useState(vendor?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      vendor ? api.patch(`/vendors/${encodeURIComponent(vendor.id)}`, body) : api.post('/vendors', body),
    onSuccess: async () => {
      toast.saved(vendor ? `${name.trim()} updated.` : `${name.trim()} added.`);
      await qc.invalidateQueries({ queryKey: VENDORS_KEY });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) setErrors(error.fieldErrors);
      else toast.failed(errorMessage(error));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter the vendor’s name.';
    if (!phone.trim()) next.phone = 'Enter a phone number for job texts.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ name: name.trim(), phone: phone.trim(), email: email.trim() || null, trades, notes: notes.trim() || null });
  };
  const toggle = (t: string) => setTrades((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  return (
    <Sheet title={vendor ? `Edit ${vendor.name}` : 'Add vendor'} onClose={onClose}
      footer={(
        <>
          {vendor ? (
            <button type="button" className="nx-btn" disabled={save.isPending} onClick={() => save.mutate({ active: !vendor.active })}>
              {vendor.active ? 'Archive' : 'Restore'}
            </button>
          ) : null}
          <button type="button" className="nx-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="vendor-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      )}>
      <form id="vendor-form" className="sheet-form" onSubmit={submit} noValidate>
        <div className="fm__grid sheet-grid">
          <Field id="v-name" label="Name" error={errors.name}><input id="v-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field id="v-phone" label="Phone" error={errors.phone} hint="Jobs are texted here."><input id="v-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field id="v-email" label="Email" optional error={errors.email}><input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field id="v-notes" label="Notes" optional wide error={errors.notes}><textarea id="v-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <fieldset style={{ border: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <legend>Trades</legend>
          {Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => (
            <label key={k} className="py__daterange"><input type="checkbox" checked={trades.includes(k)} onChange={() => toggle(k)} /><span>{v}</span></label>
          ))}
        </fieldset>
      </form>
    </Sheet>
  );
}
