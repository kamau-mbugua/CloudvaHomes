import { useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { updateSessionDetails } from '../../lib/auth/session';
import type { Organization, SessionPayload } from '../../lib/auth/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { checkDueDays } from '../billing/rules';
import { isMpesaKind } from '../mpesa/rules';
import { keys as paymentKeys, paymentsErrorMessage, useChannels } from '../payments/api';
import { CHANNEL_KIND } from '../payments/labels';
import { ChannelSheet } from '../payments/PaymentChannelsPage';
import { channelDetails } from '../payments/rules';
import type { PaymentChannel } from '../payments/types';
import { usePropertyOptions } from '../portfolio/api';
import { RECORD_STATUS } from '../portfolio/labels';
import { Badge } from '../portfolio/ui';
import { keys, settingsErrorMessage } from './api';
import { checkReminders, describeReminders, overdueDaysText, readReminders } from './reminders';

/**
 * Settings → Organisation: the active organisation's name and contacts, billing
 * defaults (how many days after issue an invoice falls due), payment methods (how the
 * organisation receives payments from tenants — M-Pesa Paybill, Till, Bank Account,
 * Cash, Cheque) and SMS rent reminders. Everyone with `settings:view` sees them;
 * `settings:update` / `channels:manage` can edit.
 */

type Field = 'name' | 'phone' | 'email' | 'kraPin' | 'invoiceDueDays' | 'daysBefore' | 'overdueDays';

const KIND_LABEL: Record<string, string> = {
  LANDLORD: 'Landlord — manages its own properties',
  AGENCY: 'Agency — manages properties for landlords',
};

export function OrganizationPage() {
  const query = useQuery({
    queryKey: keys.organization,
    queryFn: () => api.get<DataEnvelope<Organization>>('/organization').then((r) => r.data),
  });

  if (query.isPending) return <p className="ad__muted" role="status">Loading…</p>;
  if (query.isError) return <p className="ad__error" role="alert">{settingsErrorMessage(query.error)}</p>;

  // Keyed by id so switching organisation starts the form afresh.
  return <OrganizationForm key={query.data.id} org={query.data} />;
}

type OrgTab = 'details' | 'payments' | 'billing' | 'reminders';

function OrganizationForm({ org }: { org: Organization }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = useCan('settings:update');
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: OrgTab =
    rawTab === 'payments' || rawTab === 'billing' || rawTab === 'reminders' ? rawTab : 'details';

  const setTab = (next: OrgTab) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'details') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  const savedReminders = readReminders(org.reminders);
  const initial: Record<Field, string> = {
    name: org.name,
    phone: org.phone ?? '',
    email: org.email ?? '',
    kraPin: org.kraPin ?? '',
    invoiceDueDays: String(org.invoiceDueDays ?? 7),
    daysBefore: String(savedReminders.daysBefore),
    overdueDays: overdueDaysText(savedReminders.overdueDays),
  };
  const [values, setValues] = useState(initial);
  const [remindersOn, setRemindersOn] = useState(savedReminders.enabled);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const dirty = remindersOn !== savedReminders.enabled || (Object.keys(initial) as Field[]).some((k) => values[k] !== initial[k]);
  const checkedReminders = checkReminders({ enabled: remindersOn, daysBefore: values.daysBefore, overdueDays: values.overdueDays });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<DataEnvelope<Organization>>('/organization', body),
    onSuccess: async () => {
      setErrors({});
      toast.saved('Organisation details saved.');
      await queryClient.invalidateQueries({ queryKey: keys.organization });
      // The sidebar shows the organisation's name from the session.
      try {
        const me = await api.get<DataEnvelope<SessionPayload>>('/me');
        updateSessionDetails(me.data);
      } catch {
        // The name catches up on the next refresh.
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
        // Reminder fields come back as `reminders.daysBefore` / `reminders.overdueDays[2]`.
        const found: Partial<Record<Field, string>> = {};
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          const key = field.replace(/^reminders\./, '').replace(/\[\d+\]$/, '') as Field;
          if (!(key in found)) found[key] = message;
        }
        setErrors(found);
        if (found.name || found.phone || found.email || found.kraPin) setTab('details');
        else if (found.invoiceDueDays) setTab('billing');
        else if (found.daysBefore || found.overdueDays) setTab('reminders');
      }
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: Partial<Record<Field, string>> = {};
    if (!values.name.trim()) found.name = 'The organisation needs a name.';
    const dueDays = checkDueDays(values.invoiceDueDays);
    if (!dueDays.ok) found.invoiceDueDays = dueDays.error;
    if (!checkedReminders.ok) Object.assign(found, checkedReminders.errors);
    setErrors(found);
    if (Object.keys(found).length > 0 || !dueDays.ok || !checkedReminders.ok) {
      if (found.name || found.phone || found.email || found.kraPin) setTab('details');
      else if (found.invoiceDueDays) setTab('billing');
      else if (found.daysBefore || found.overdueDays) setTab('reminders');
      return;
    }

    save.mutate({
      name: values.name.trim(),
      // Required on an organisation (docs/specs §5.5), so never sent as null.
      phone: values.phone.trim(),
      email: values.email.trim(),
      kraPin: values.kraPin.trim().toUpperCase() || null,
      invoiceDueDays: dueDays.days,
      // The whole object, every time (the contract's PATCH takes it whole).
      reminders: checkedReminders.reminders,
    });
  };

  const field = (name: Field, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`fld ${errors[name] ? 'is-bad' : ''}`}>
      <label htmlFor={`org-${name}`}>{label}</label>
      <input
        id={`org-${name}`}
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        disabled={!canEdit || save.isPending}
        aria-invalid={Boolean(errors[name])}
        {...props}
      />
      {errors[name] ? <span className="fld__err">{errors[name]}</span> : null}
    </div>
  );

  const showServerError = save.isError && !(save.error instanceof ApiError && save.error.code === 'VALIDATION_FAILED');
  const [editingChannel, setEditingChannel] = useState<PaymentChannel | 'new' | null>(null);

  return (
    <>
      <form className="fm fm--single pg-narrow" onSubmit={submit} noValidate>
        <div className="fm__main">
          <div className="pf__tabsrow">
            <div className="pf__tabs" role="tablist" aria-label="Organisation settings sections">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'details'}
                className="pf__tab"
                onClick={() => setTab('details')}
              >
                Organisation details
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'payments'}
                className="pf__tab"
                onClick={() => setTab('payments')}
              >
                Payment methods
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'billing'}
                className="pf__tab"
                onClick={() => setTab('billing')}
              >
                Billing
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'reminders'}
                className="pf__tab"
                onClick={() => setTab('reminders')}
              >
                Rent reminders
              </button>
            </div>
          </div>

          {tab === 'details' ? (
            <section className="fm__section">
              <h2>Organisation details</h2>
              <p>Shown on invoices, receipts and messages to tenants.</p>

              <div className="fm__grid">
                <div className="fm__wide">{field('name', 'Name', { autoComplete: 'organization', required: true })}</div>
                {field('phone', 'Phone', { type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '0712 345 678' })}
                {field('email', 'Email', { type: 'email', autoComplete: 'email', placeholder: 'office@example.com' })}
                {field('kraPin', 'KRA PIN', { placeholder: 'P051234567X', autoCapitalize: 'characters', spellCheck: false })}
                <div className="fld">
                  <label htmlFor="org-kind">Type</label>
                  <input id="org-kind" value={KIND_LABEL[org.kind] ?? org.kind} disabled readOnly />
                  <span className="hint">Set when KodiHub created the organisation.</span>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'payments' ? (
            <OrganizationPaymentMethodsSection onEdit={setEditingChannel} />
          ) : null}

          {tab === 'billing' ? (
            <section className="fm__section">
              <h2>Billing</h2>
              <p>Applies to invoices issued from now on; invoices already issued keep their due date.</p>
              <div className="fm__grid">
                <div className="fld-days">
                  {field('invoiceDueDays', 'Invoice due after (days)', { inputMode: 'numeric', autoComplete: 'off', maxLength: 2 })}
                  <span className="hint">0 to 60. 0 means due on the day it is issued.</span>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'reminders' ? (
            <section className="fm__section">
              <h2>Rent reminders</h2>
              <p>An SMS and detailed email (with their account statement PDF attached) to tenants who owe, before rent is due and when it is overdue. Each SMS costs a message credit; tenants who asked not to get reminders are skipped (untick it on their page).</p>
              <label className="tm__toggle">
                <input type="checkbox" checked={remindersOn} disabled={!canEdit || save.isPending} onChange={(e) => setRemindersOn(e.target.checked)} />
                <span>
                  <strong>Send automatic reminders</strong>
                  <span className="ad__muted">{checkedReminders.ok ? describeReminders(checkedReminders.reminders) : 'Fix the days below.'}</span>
                </span>
              </label>
              <div className="fm__grid">
                <div className="fld-days">
                  {field('daysBefore', 'Days before the due date', { inputMode: 'numeric', autoComplete: 'off', maxLength: 2 })}
                  <span className="hint">0 to 14. 0 means no reminder before the due date.</span>
                </div>
                <div>
                  {field('overdueDays', 'Days after the due date', { inputMode: 'numeric', autoComplete: 'off', placeholder: '3, 10' })}
                  <span className="hint">Up to five, separated by commas, each 1 to 90. Blank means no overdue reminders.</span>
                </div>
              </div>
              <p className="hint">Sent at 9:00, at most one message per tenant a day, adding up everything due or overdue. e.g. “Hi Tom, KES 20,500.00 is due on 5 Nov 2026. Pay to paybill 522522, account T00001.”</p>
            </section>
          ) : null}

          {showServerError ? <p className="ad__error" role="alert">{settingsErrorMessage(save.error)}</p> : null}

          {tab !== 'payments' ? (
            canEdit ? (
              <div className="pg-actions">
                <button type="button" className="nx-btn" disabled={!dirty || save.isPending}
                  onClick={() => { setValues(initial); setRemindersOn(savedReminders.enabled); setErrors({}); save.reset(); }}>
                  Discard changes
                </button>
                <button type="submit" className="nx-btn nx-btn--primary" disabled={!dirty || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            ) : (
              <p className="ad__muted">Your role can view these details but not change them.</p>
            )
          ) : null}
        </div>
      </form>

      {editingChannel ? (
        <ChannelSheet
          channel={editingChannel === 'new' ? undefined : editingChannel}
          onClose={() => setEditingChannel(null)}
        />
      ) : null}
    </>
  );
}

function OrganizationPaymentMethodsSection({
  onEdit,
}: {
  onEdit: (channel: PaymentChannel | 'new') => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canManage = useCan('channels:manage');
  const channels = useChannels({});
  const properties = usePropertyOptions(useCan('properties:view'));

  const remove = useMutation({
    mutationFn: (channel: PaymentChannel) => api.delete(`/payment-channels/${channel.id}`),
    onSuccess: async (_r, channel) => {
      toast.saved(`${channel.name} was deleted.`);
      await queryClient.invalidateQueries({ queryKey: paymentKeys.channels });
    },
    onError: (error) => toast.failed(paymentsErrorMessage(error)),
  });

  const rows = [...(channels.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const propertyName = (id: string) => properties.data?.data.find((p) => p.id === id)?.name;
  const scope = (c: PaymentChannel) => {
    if (c.propertyIds.length === 0) return 'All properties';
    const names = c.propertyIds.map(propertyName).filter(Boolean) as string[];
    if (names.length === c.propertyIds.length && names.length <= 2) return names.join(', ');
    return `${c.propertyIds.length} ${c.propertyIds.length === 1 ? 'property' : 'properties'}`;
  };

  return (
    <section className="fm__section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2>How your organisation receives payments</h2>
          <p>
            Configure the M-Pesa Paybills, Buy Goods Tills, bank accounts, cash or cheque channels
            your tenants pay into. Active M-Pesa and bank channels are automatically printed on
            tenant invoices (and PDFs), welcome emails, SMS reminders and the Tenant Portal.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/app/payment-channels" className="nx-btn nx-btn--sm">
            M-Pesa &amp; bank connections
          </Link>
          {canManage ? (
            <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => onEdit('new')}>
              Add payment method
            </button>
          ) : null}
        </div>
      </div>

      {channels.isError ? (
        <p className="ad__error" role="alert">{paymentsErrorMessage(channels.error)}</p>
      ) : channels.isPending ? (
        <p className="ad__muted" role="status">Loading payment methods…</p>
      ) : rows.length === 0 ? (
        <div className="ad__tablewrap">
          <EmptyState
            title="No payment methods configured yet"
            detail="Add each way tenants pay you — an M-Pesa paybill or till, a bank account, cash or cheque. You can apply a payment method to all properties or specific properties."
            action={
              canManage ? (
                <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => onEdit('new')}>
                  Add payment method
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
                <th>Method</th>
                <th>Kind</th>
                <th>Account / Shortcode</th>
                <th>Properties</th>
                <th>Status</th>
                {canManage ? <th className="ad__rowactions"><span className="nx-sr">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.accountName && c.kind !== 'CHEQUE' ? <span className="ad__sub">{c.accountName}</span> : null}
                  </td>
                  <td>
                    <Badge table={CHANNEL_KIND} value={c.kind} />
                    {isMpesaKind(c.kind) ? (
                      <span className="ad__sub">{c.daraja?.configured ? 'Connected to M-Pesa' : 'Manual / instructions'}</span>
                    ) : null}
                  </td>
                  <td className="num">{channelDetails(c) || <span className="nx-muted">—</span>}</td>
                  <td>{scope(c)}</td>
                  <td><Badge table={RECORD_STATUS} value={c.status} /></td>
                  {canManage ? (
                    <td className="ad__rowactions">
                      <div>
                        <button type="button" className="nx-btn nx-btn--sm" onClick={() => onEdit(c)}>Edit</button>
                        <ConfirmDelete
                          what={c.name}
                          consequence="A payment method with payments recorded on it can’t be deleted — mark it inactive instead."
                          busy={remove.isPending && remove.variables?.id === c.id}
                          onConfirm={() => remove.mutate(c)}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
