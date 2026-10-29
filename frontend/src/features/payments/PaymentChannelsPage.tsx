import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { portfolioErrorMessage, usePropertyOptions } from '../portfolio/api';
import { splitFormError } from '../portfolio/formErrors';
import { nullable } from '../portfolio/forms';
import { useForm, useListFilters } from '../portfolio/hooks';
import { RECORD_STATUS } from '../portfolio/labels';
import { Badge, CheckList, Field } from '../portfolio/ui';
import { keys, paymentsErrorMessage, useChannels } from './api';
import { DarajaPanel } from '../mpesa/DarajaPanel';
import { BankPanel } from '../banks/BankPanel';
import { isMpesaKind } from '../mpesa/rules';
import { CHANNEL_KIND } from './labels';
import { CHANNEL_FIELDS, channelDetails, checkShortcode } from './rules';
import type { ChannelKind, PaymentChannel } from './types';

/**
 * Payment channels (`/app/payment-channels`): the paybills, tills, bank accounts, cash
 * and cheque the organisation takes money through. Payments are recorded against one.
 * A channel can be limited to some properties. One with payments can't be deleted, only
 * made inactive (inactive channels can't take new payments). Changes need `channels:manage`.
 * M-Pesa channels also get an "M-Pesa connection" section (phase 5: Daraja keys,
 * callback URLs, registering the paybill URLs). Bank accounts get a "Bank accounts"
 * section (phase 10: statement import, bank notifications).
 */
export function PaymentChannelsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canManage = useCan('channels:manage');
  const filters = useListFilters();
  const status = filters.get('status');
  const channels = useChannels(status ? { status } : {});
  const properties = usePropertyOptions(useCan('properties:view'));
  const [editing, setEditing] = useState<PaymentChannel | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (channel: PaymentChannel) => api.delete(`/payment-channels/${channel.id}`),
    onSuccess: async (_r, channel) => {
      toast.saved(`${channel.name} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: keys.channels });
    },
    onError: (error) => toast.failed(paymentsErrorMessage(error)),
  });

  const rows = [...(channels.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const mpesaRows = rows.filter((c) => isMpesaKind(c.kind));
  const bankRows = rows.filter((c) => c.kind === 'BANK_ACCOUNT');
  const propertyName = (id: string) => properties.data?.data.find((p) => p.id === id)?.name;
  const scope = (c: PaymentChannel) => {
    if (c.propertyIds.length === 0) return 'All properties';
    const names = c.propertyIds.map(propertyName).filter(Boolean) as string[];
    if (names.length === c.propertyIds.length && names.length <= 2) return names.join(', ');
    return `${c.propertyIds.length} ${c.propertyIds.length === 1 ? 'property' : 'properties'}`;
  };

  return (
    <div className="pg">
      <div className="ad__filters">
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">Active and inactive</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        {canManage ? (
          <div className="bl__headbtns pg-push">
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setEditing('new')}>Add channel</button>
          </div>
        ) : null}
      </div>

      {channels.isError ? <p className="ad__error" role="alert">{paymentsErrorMessage(channels.error)}</p>
        : channels.isPending ? <p className="ad__muted" role="status">Loading…</p>
          : rows.length === 0 ? (
            <div className="ad__tablewrap">
              {status ? (
                <EmptyState title="No channels match" onClear={() => filters.clear()} />
              ) : (
                <EmptyState title="No payment channels yet"
                  detail="Add each way tenants pay you — an M-Pesa paybill or till, a bank account, cash or cheque. Payments are recorded against a channel."
                  action={canManage ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add channel</button> : undefined} />
              )}
            </div>
          ) : (
            <div className="ad__tablewrap">
              <table className="ad__table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Kind</th>
                    <th>Details</th>
                    <th>Properties</th>
                    <th>Status</th>
                    {canManage ? <th className="ad__rowactions"><span className="nx-sr">Actions</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong>{c.accountName && c.kind !== 'CHEQUE' ? <span className="ad__sub">{c.accountName}</span> : null}</td>
                      <td>
                        <Badge table={CHANNEL_KIND} value={c.kind} />
                        {isMpesaKind(c.kind) ? (
                          <span className="ad__sub">{c.daraja?.configured ? 'Connected to M-Pesa' : 'Entered by hand'}</span>
                        ) : null}
                      </td>
                      <td className="num">{channelDetails(c) || <span className="nx-muted">—</span>}</td>
                      <td>{scope(c)}</td>
                      <td><Badge table={RECORD_STATUS} value={c.status} /></td>
                      {canManage ? (
                        <td className="ad__rowactions">
                          <div>
                            <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(c)}>Edit</button>
                            <ConfirmDelete what={c.name}
                              consequence="A channel with payments recorded on it can’t be deleted — mark it inactive instead."
                              busy={remove.isPending && remove.variables?.id === c.id} onConfirm={() => remove.mutate(c)} />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      {mpesaRows.length > 0 && !channels.isError ? <DarajaPanel channels={mpesaRows} canManage={canManage} /> : null}
      {bankRows.length > 0 && !channels.isError ? <BankPanel channels={bankRows} canManage={canManage} /> : null}

      {editing ? <ChannelSheet channel={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

const FIELDS = ['name', 'kind', 'shortcode', 'bankName', 'accountNumber', 'accountName', 'propertyIds', 'status'] as const;
type FieldName = (typeof FIELDS)[number];

function ChannelSheet({ channel, onClose }: { channel?: PaymentChannel; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<FieldName>({
    name: channel?.name ?? '',
    kind: channel?.kind ?? 'MPESA_PAYBILL',
    shortcode: channel?.shortcode ?? '',
    bankName: channel?.bankName ?? '',
    accountNumber: channel?.accountNumber ?? '',
    accountName: channel?.accountName ?? '',
    propertyIds: '',
    status: channel?.status ?? 'ACTIVE',
  });
  const { values, errors, set } = form;
  const kind = values.kind as ChannelKind;
  const [limited, setLimited] = useState((channel?.propertyIds.length ?? 0) > 0);
  const [propertyIds, setPropertyIds] = useState<string[]>(channel?.propertyIds ?? []);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (channel
      ? api.patch(`/payment-channels/${channel.id}`, body)
      : api.post('/payment-channels', body)),
    onSuccess: async () => {
      toast.saved(`${values.name.trim()} was ${channel ? 'saved' : 'added'}.`);
      await queryClient.invalidateQueries({ queryKey: keys.channels });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, {
        fields: FIELDS, conflicts: { NAME_TAKEN: 'name' }, describe: (e) => paymentsErrorMessage(e),
      });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<FieldName, string>> = {};
    if (!values.name.trim()) found.name = 'Name the channel, e.g. Main paybill.';
    for (const spec of CHANNEL_FIELDS[kind]) {
      const text = values[spec.field].trim();
      if (spec.required && !text) found[spec.field] = `Enter the ${spec.label.toLowerCase()}.`;
      else if (spec.field === 'shortcode' && text) {
        const error = checkShortcode(text);
        if (error) found.shortcode = error;
      }
    }
    if (limited && propertyIds.length === 0) found.propertyIds = 'Tick at least one property, or choose All properties.';
    form.setErrors(found);
    form.setGeneral(null);
    if (Object.keys(found).length > 0) return;

    // Only the fields this kind has; the others are cleared (null) on an edit.
    const used = new Set(CHANNEL_FIELDS[kind].map((s) => s.field));
    const body: Record<string, unknown> = { name: values.name.trim(), propertyIds: limited ? propertyIds : [] };
    for (const field of ['shortcode', 'bankName', 'accountNumber', 'accountName'] as const) {
      const value = used.has(field) ? nullable(values[field]) : null;
      if (value !== null || channel) body[field] = value;
    }
    if (channel) body.status = values.status;
    else body.kind = kind;
    save.mutate(body);
  };

  return (
    <Sheet
      title={channel ? `Edit ${channel.name}` : 'Add a payment channel'}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="channel-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : channel ? 'Save channel' : 'Add channel'}
          </button>
        </>
      )}
    >
      <form id="channel-form" className="sheet-form" onSubmit={submit} noValidate>
        <div className="fm__grid sheet-grid">
          <Field id="pc-name" label="Name" error={errors.name} hint="How staff pick it when recording a payment.">
            <input id="pc-name" value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="e.g. Main paybill"
              autoComplete="off" aria-invalid={Boolean(errors.name)} />
          </Field>
          <Field id="pc-kind" label="Kind" error={errors.kind} hint={channel ? 'The kind can’t be changed once added.' : undefined}>
            <select id="pc-kind" value={values.kind} onChange={(e) => set('kind', e.target.value)} disabled={Boolean(channel)}>
              {(Object.keys(CHANNEL_KIND) as ChannelKind[]).map((k) => <option key={k} value={k}>{CHANNEL_KIND[k].label}</option>)}
            </select>
          </Field>
          {CHANNEL_FIELDS[kind].map((spec) => (
            <Field key={spec.field} id={`pc-${spec.field}`} label={spec.label} optional={!spec.required} error={errors[spec.field]} hint={spec.hint}>
              <input id={`pc-${spec.field}`} value={values[spec.field]} onChange={(e) => set(spec.field, e.target.value)} autoComplete="off"
                maxLength={spec.field === 'shortcode' ? 7 : 120} inputMode={spec.field === 'shortcode' || spec.field === 'accountNumber' ? 'numeric' : undefined}
                aria-invalid={Boolean(errors[spec.field])} />
            </Field>
          ))}
          {channel ? (
            <Field id="pc-status" label="Status" error={errors.status} hint="Inactive channels can’t take new payments.">
              <select id="pc-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          ) : null}
          <ChannelProperties limited={limited} onLimitedChange={setLimited} value={propertyIds} onChange={setPropertyIds}
            error={errors.propertyIds} />
        </div>
        {kind === 'MPESA_PAYBILL' || kind === 'MPESA_TILL' ? (
          <p className="ad__muted">Once saved, connect it to M-Pesa under “M-Pesa connection” on this page and payments to it are recorded automatically.</p>
        ) : null}
        {form.general ? <p className="nx-sheet__error" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}

/** All properties, or only some — tenants of other properties won't be told to pay here. */
function ChannelProperties({ limited, onLimitedChange, value, onChange, error }: {
  limited: boolean;
  onLimitedChange: (limited: boolean) => void;
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const canSee = useCan('properties:view');
  const properties = usePropertyOptions(canSee);
  const rows = properties.data?.data ?? [];
  return (
    <div className={`fld fm__wide ${error ? 'is-bad' : ''}`}>
      <span className="fld__label">Used for</span>
      <div className="pf__radios" role="radiogroup" aria-label="Used for">
        <label className="fld__check">
          <input type="radio" name="pc-scope" checked={!limited} onChange={() => onLimitedChange(false)} />All properties
        </label>
        <label className="fld__check">
          <input type="radio" name="pc-scope" checked={limited} disabled={!canSee} onChange={() => onLimitedChange(true)} />Only some properties
        </label>
      </div>
      {limited ? (
        properties.isPending ? <span className="hint">Loading properties…</span>
          : properties.isError ? <span className="fld__err">{portfolioErrorMessage(properties.error)}</span>
            : rows.length === 0 ? <span className="hint">There are no properties yet.</span>
              : <CheckList name="Properties" options={rows.map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }))} value={value} onChange={onChange} />
      ) : null}
      {error ? <span className="fld__err">{error}</span>
        : <span className="hint">{limited ? 'Staff limited to other properties won’t see it.' : 'Including properties added later.'}</span>}
    </div>
  );
}
