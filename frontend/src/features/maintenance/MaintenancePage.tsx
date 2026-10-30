import { useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api/client';
import type { DataEnvelope, PageEnvelope, PageMeta } from '../../lib/api/types';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES, parseAmount } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { EmptyState } from '../../components/EmptyState';
import { Pager } from '../../components/Pager';
import { Sheet } from '../../components/Sheet';
import { PropertySelect } from '../billing/ui';
import { useListFilters } from '../portfolio/hooks';
import { Field } from '../portfolio/ui';
import type { AttachmentDraft } from '../uploads/api';
import { AttachmentField, PrivateFilePreview } from '../uploads/ui';
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type MaintenanceRequestItem,
} from './types';

type MaintenancePageEnvelope = PageEnvelope<MaintenanceRequestItem> & {
  meta: PageMeta & {
    counts?: {
      open: number;
      inProgress: number;
      resolved: number;
      urgentOpen: number;
    };
  };
};

const PAGE_SIZE = 25;
const KEY = ['maintenance-requests'] as const;

export function MaintenancePage() {
  const filters = useListFilters();
  const { q, page } = filters;
  const propertyId = filters.get('propertyId');
  const status = filters.get('status');
  const priority = filters.get('priority');
  const category = filters.get('category');

  const canCreate = useCan('maintenance:create');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<MaintenanceRequestItem | null>(null);
  const [converting, setConverting] = useState<MaintenanceRequestItem | null>(null);

  const query = { q, propertyId, status, priority, category };
  const list = useQuery({
    queryKey: [...KEY, 'list', { ...query, page }],
    queryFn: () =>
      api.get<MaintenancePageEnvelope>('/maintenance-requests', {
        ...query,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const meta = list.data?.meta;
  const counts = meta?.counts;
  const filtered = Boolean(q || propertyId || status || priority || category);

  return (
    <div className="pg">
      {counts ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div className="ag__card" style={{ padding: '0.85rem 1rem' }}>
            <span className="ad__sub">Open</span>
            <strong className="num" style={{ display: 'block', fontSize: '1.35rem' }}>
              {counts.open}
            </strong>
          </div>
          <div className="ag__card" style={{ padding: '0.85rem 1rem' }}>
            <span className="ad__sub">In progress</span>
            <strong className="num" style={{ display: 'block', fontSize: '1.35rem' }}>
              {counts.inProgress}
            </strong>
          </div>
          <div className="ag__card" style={{ padding: '0.85rem 1rem' }}>
            <span className="ad__sub">Urgent open</span>
            <strong
              className="num"
              style={{
                display: 'block',
                fontSize: '1.35rem',
                color: counts.urgentOpen > 0 ? '#c92a2a' : undefined,
              }}
            >
              {counts.urgentOpen}
            </strong>
          </div>
          <div className="ag__card" style={{ padding: '0.85rem 1rem' }}>
            <span className="ad__sub">Resolved</span>
            <strong className="num" style={{ display: 'block', fontSize: '1.35rem' }}>
              {counts.resolved}
            </strong>
          </div>
        </div>
      ) : null}

      <div className="pf__bar">
        <input
          className="nx-input pf__search"
          type="search"
          placeholder="Search by code, title, unit or tenant"
          value={q}
          onChange={(e) => filters.setSearch(e.target.value)}
        />
        <PropertySelect
          value={propertyId}
          onChange={(id) => filters.setFilter({ propertyId: id })}
        />
        <select
          className="nx-select"
          aria-label="Status"
          value={status}
          onChange={(e) => filters.setFilter({ status: e.target.value })}
        >
          <option value="">All statuses</option>
          {Object.entries(MAINTENANCE_STATUSES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="nx-select"
          aria-label="Priority"
          value={priority}
          onChange={(e) => filters.setFilter({ priority: e.target.value })}
        >
          <option value="">All priorities</option>
          {Object.entries(MAINTENANCE_PRIORITIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="pf__actions">
          {canCreate ? (
            <button
              type="button"
              className="nx-btn nx-btn--primary"
              onClick={() => setCreating(true)}
            >
              New request
            </button>
          ) : null}
        </div>
      </div>

      {list.isPending ? <p className="ad__muted" role="status">Loading…</p> : null}
      {list.isError ? <p className="ad__error" role="alert">{errorMessage(list.error)}</p> : null}

      {!list.isPending && !list.isError && rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matching maintenance requests' : 'No maintenance requests yet'}
          detail={
            filtered
              ? 'Try clearing one of the filters above.'
              : 'Repair requests submitted by tenants or logged by your team will appear here.'
          }
          action={
            canCreate && !filtered ? (
              <button
                type="button"
                className="nx-btn nx-btn--primary"
                onClick={() => setCreating(true)}
              >
                New request
              </button>
            ) : null
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="ad__tablewrap">
          <table className="ad__table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Unit & tenant</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Expense</th>
                <th className="ad__right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="pf__row" onClick={() => setSelected(r)}>
                  <td>
                    <strong className="num">{r.number}</strong>
                    <span className="ad__sub">
                      {r.title} · {formatDay(r.createdAt.slice(0, 10))}
                    </span>
                  </td>
                  <td>
                    <strong>
                      {r.property.name} · {r.unit.number}
                    </strong>
                    <span className="ad__sub">
                      {r.tenant ? `${r.tenant.name} (${r.tenant.code})` : 'Vacant / no tenant'}
                    </span>
                  </td>
                  <td>{MAINTENANCE_CATEGORIES[r.category] ?? r.category}</td>
                  <td>
                    <span
                      className={`ad__badge ${
                        r.priority === 'URGENT'
                          ? 'ad__badge--bad'
                          : r.priority === 'HIGH'
                            ? 'ad__badge--warn'
                            : 'ad__badge--neutral'
                      }`}
                    >
                      {MAINTENANCE_PRIORITIES[r.priority] ?? r.priority}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`ad__badge ${
                        r.status === 'RESOLVED'
                          ? 'ad__badge--ok'
                          : r.status === 'IN_PROGRESS'
                            ? 'ad__badge--warn'
                            : r.status === 'CANCELLED'
                              ? 'ad__badge--neutral'
                              : 'ad__badge--bad'
                      }`}
                    >
                      {MAINTENANCE_STATUSES[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>
                    {r.expense ? (
                      <span className="num">{formatKES(r.expense.amount)}</span>
                    ) : (
                      <span className="ad__muted">—</span>
                    )}
                  </td>
                  <td className="ad__right" onClick={(e) => e.stopPropagation()}>
                    <div className="ad__rowbtns">
                      {r.canConvertToExpense ? (
                        <button
                          type="button"
                          className="nx-btn nx-btn--sm"
                          onClick={() => setConverting(r)}
                        >
                          Record expense
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="nx-btn nx-btn--sm"
                        onClick={() => setSelected(r)}
                      >
                        Open
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta ? (
            <Pager meta={meta} onPage={(p) => filters.setFilter({ page: p > 1 ? String(p) : '' })} />
          ) : null}
        </div>
      ) : null}

      {creating ? <CreateMaintenanceSheet onClose={() => setCreating(false)} /> : null}
      {selected ? (
        <MaintenanceDetailSheet
          request={selected}
          onClose={() => setSelected(null)}
          onConvert={() => {
            const req = selected;
            setSelected(null);
            setConverting(req);
          }}
        />
      ) : null}
      {converting ? (
        <ConvertToExpenseSheet request={converting} onClose={() => setConverting(null)} />
      ) : null}
    </div>
  );
}

function CreateMaintenanceSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [category, setCategory] = useState('PLUMBING');
  const [priority, setPriority] = useState('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<AttachmentDraft>({ kind: 'keep' });
  const [uploading, setUploading] = useState(false);

  const unitsQuery = useQuery({
    queryKey: ['units', 'for-maintenance', propertyId],
    queryFn: () =>
      api.get<PageEnvelope<{ id: string; number: string; property: { id: string; name: string } }>>(
        '/units',
        { propertyId: propertyId || undefined, pageSize: 200 },
      ),
  });
  const units = unitsQuery.data?.data ?? [];

  const create = useMutation({
    mutationFn: (body: {
      unitId: string;
      category: string;
      priority: string;
      title: string;
      description: string;
      photoUploadIds?: string[];
    }) => api.post<DataEnvelope<MaintenanceRequestItem>>('/maintenance-requests', body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.saved(`Request ${res.data.number} logged.`);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({
      unitId,
      category,
      priority,
      title: title.trim(),
      description: description.trim(),
      photoUploadIds: attachment.kind === 'new' ? [attachment.upload.id] : undefined,
    });
  };

  return (
    <Sheet title="New maintenance request" onClose={onClose}>
      <form className="fm" onSubmit={submit}>
        <div className="fm__grid">
          <Field id="maint-prop" label="Property">
            <PropertySelect
              id="maint-prop"
              value={propertyId}
              onChange={(id) => {
                setPropertyId(id);
                setUnitId('');
              }}
            />
          </Field>

          <Field id="maint-unit" label="Unit">
            <select
              id="maint-unit"
              className="nx-select"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              required
            >
              <option value="">Select unit…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.property.name} · Unit {u.number}
                </option>
              ))}
            </select>
          </Field>

          <Field id="maint-cat" label="Category">
            <select
              id="maint-cat"
              className="nx-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field id="maint-prio" label="Priority">
            <select
              id="maint-prio"
              className="nx-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {Object.entries(MAINTENANCE_PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field id="maint-title" label="Issue summary" wide>
            <input
              id="maint-title"
              className="nx-input"
              type="text"
              placeholder="e.g. Leaking kitchen tap"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Field>

          <Field id="maint-desc" label="Details" wide>
            <textarea
              id="maint-desc"
              className="nx-textarea"
              rows={3}
              placeholder="Describe the issue and access instructions…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </Field>

          <AttachmentField
            id="maint-photo"
            label="Photo"
            purpose="MAINTENANCE_PHOTO"
            saved={null}
            value={attachment}
            onChange={setAttachment}
            onBusy={setUploading}
            describeError={errorMessage}
          />
        </div>

        {create.isError ? (
          <p className="ad__error" role="alert">
            {errorMessage(create.error)}
          </p>
        ) : null}

        <div className="sh__foot">
          <button type="button" className="nx-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="nx-btn nx-btn--primary"
            disabled={create.isPending || uploading || !unitId}
          >
            {create.isPending ? 'Saving…' : 'Create request'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function MaintenanceDetailSheet({
  request,
  onClose,
  onConvert,
}: {
  request: MaintenanceRequestItem;
  onClose: () => void;
  onConvert: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const canUpdate = useCan('maintenance:update');
  const [status, setStatus] = useState(request.status);
  const [priority, setPriority] = useState(request.priority);
  const [category, setCategory] = useState(request.category);
  const [resolutionNote, setResolutionNote] = useState(request.resolutionNote ?? '');

  const update = useMutation({
    mutationFn: (body: {
      status: string;
      priority: string;
      category: string;
      resolutionNote: string | null;
    }) =>
      api.patch<DataEnvelope<MaintenanceRequestItem>>(
        `/maintenance-requests/${encodeURIComponent(request.id)}`,
        body,
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.saved(`Updated ${res.data.number}.`);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({
      status,
      priority,
      category,
      resolutionNote: resolutionNote.trim() || null,
    });
  };

  return (
    <Sheet title={`${request.number} — ${request.title}`} onClose={onClose}>
      <form className="fm" onSubmit={submit}>
        <dl className="tp__facts" style={{ marginBottom: '1rem' }}>
          <div>
            <dt>Property & unit</dt>
            <dd>
              {request.property.name} · Unit {request.unit.number}
            </dd>
          </div>
          <div>
            <dt>Tenant</dt>
            <dd>{request.tenant ? `${request.tenant.name} (${request.tenant.phone})` : 'Vacant'}</dd>
          </div>
          <div>
            <dt>Reported</dt>
            <dd>{formatDay(request.createdAt.slice(0, 10))}</dd>
          </div>
        </dl>

        <div className="ag__card" style={{ marginBottom: '1rem', padding: '0.85rem' }}>
          <strong>Description</strong>
          <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>{request.description}</p>
        </div>

        {request.photoUploadIds.length > 0 ? (
          <div style={{ marginBottom: '1rem', display: 'grid', gap: '0.5rem' }}>
            <strong>Attached photos</strong>
            {request.photoUploadIds.map((pid) => (
              <PrivateFilePreview
                key={pid}
                path={`/maintenance-requests/${encodeURIComponent(request.id)}/photos/${encodeURIComponent(pid)}`}
                alt="Maintenance photo"
              />
            ))}
          </div>
        ) : null}

        {request.expense ? (
          <div className="ag__card" style={{ marginBottom: '1rem', padding: '0.85rem' }}>
            <strong>Linked repair expense</strong>
            <p className="num" style={{ margin: '0.25rem 0 0' }}>
              {formatKES(request.expense.amount)} · {request.expense.name} (
              {formatDay(request.expense.incurredOn)})
            </p>
          </div>
        ) : null}

        <div className="fm__grid">
          <Field id="upd-status" label="Status">
            <select
              id="upd-status"
              className="nx-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as MaintenanceRequestItem['status'])}
              disabled={!canUpdate}
            >
              {Object.entries(MAINTENANCE_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field id="upd-priority" label="Priority">
            <select
              id="upd-priority"
              className="nx-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as MaintenanceRequestItem['priority'])}
              disabled={!canUpdate}
            >
              {Object.entries(MAINTENANCE_PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field id="upd-cat" label="Category" wide>
            <select
              id="upd-cat"
              className="nx-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!canUpdate}
            >
              {Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field id="upd-note" label="Resolution / progress note" wide>
            <textarea
              id="upd-note"
              className="nx-textarea"
              rows={3}
              placeholder="Note work done, technician details or resolution…"
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              disabled={!canUpdate}
            />
          </Field>
        </div>

        {update.isError ? (
          <p className="ad__error" role="alert">
            {errorMessage(update.error)}
          </p>
        ) : null}

        <div className="sh__foot">
          {request.canConvertToExpense ? (
            <button type="button" className="nx-btn" onClick={onConvert}>
              Record repair expense
            </button>
          ) : null}
          <button type="button" className="nx-btn" onClick={onClose}>
            Close
          </button>
          {canUpdate ? (
            <button
              type="submit"
              className="nx-btn nx-btn--primary"
              disabled={update.isPending}
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </button>
          ) : null}
        </div>
      </form>
    </Sheet>
  );
}

function ConvertToExpenseSheet({
  request,
  onClose,
}: {
  request: MaintenanceRequestItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [amountShillings, setAmountShillings] = useState('');
  const [incurredOn, setIncurredOn] = useState(todayInNairobi());
  const [payee, setPayee] = useState('');
  const [name, setName] = useState(
    `${request.number}: ${request.title} (Unit ${request.unit.number})`,
  );

  const convert = useMutation({
    mutationFn: (body: { amount: number; incurredOn: string; payee?: string; name?: string }) =>
      api.post<DataEnvelope<MaintenanceRequestItem>>(
        `/maintenance-requests/${encodeURIComponent(request.id)}/expense`,
        body,
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.saved(`Repair expense recorded for ${res.data.number}.`);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAmount(amountShillings);
    if (!parsed.ok || parsed.minor <= 0) return;
    convert.mutate({
      amount: parsed.minor,
      incurredOn,
      payee: payee.trim() || undefined,
      name: name.trim() || undefined,
    });
  };

  return (
    <Sheet title={`Record repair expense — ${request.number}`} onClose={onClose}>
      <form className="fm" onSubmit={submit}>
        <div className="fm__grid">
          <Field id="exp-amount" label="Amount (KES)">
            <input
              id="exp-amount"
              className="nx-input num"
              type="text"
              inputMode="decimal"
              placeholder="e.g. 3500"
              value={amountShillings}
              onChange={(e) => setAmountShillings(e.target.value)}
              required
            />
          </Field>

          <Field id="exp-date" label="Incurred on">
            <input
              id="exp-date"
              className="nx-input"
              type="date"
              max={todayInNairobi()}
              value={incurredOn}
              onChange={(e) => setIncurredOn(e.target.value)}
              required
            />
          </Field>

          <Field id="exp-payee" label="Payee / technician (optional)" wide>
            <input
              id="exp-payee"
              className="nx-input"
              type="text"
              placeholder="e.g. QuickFix Plumbers"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
            />
          </Field>

          <Field id="exp-name" label="Description" wide>
            <input
              id="exp-name"
              className="nx-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
        </div>

        {convert.isError ? (
          <p className="ad__error" role="alert">
            {errorMessage(convert.error)}
          </p>
        ) : null}

        <div className="sh__foot">
          <button type="button" className="nx-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="nx-btn nx-btn--primary"
            disabled={convert.isPending}
          >
            {convert.isPending ? 'Recording…' : 'Record expense'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
