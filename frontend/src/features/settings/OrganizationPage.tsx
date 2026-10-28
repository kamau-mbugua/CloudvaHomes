import { useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../lib/api/client';
import type { DataEnvelope } from '../../lib/api/types';
import { updateSessionDetails } from '../../lib/auth/session';
import type { Organization, SessionPayload } from '../../lib/auth/types';
import { useCan } from '../../lib/auth/useAuth';
import { useToast } from '../../lib/useToast';
import { checkDueDays } from '../billing/rules';
import { keys, settingsErrorMessage } from './api';
import { checkReminders, describeReminders, overdueDaysText, readReminders } from './reminders';

/**
 * Settings → Organisation: the active organisation's name and contacts, billing
 * defaults (how many days after issue an invoice falls due) and SMS rent reminders
 * (phase 7: off by default; days before the due date and days after it). Everyone with
 * `settings:view` sees them; `settings:update` can edit.
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

function OrganizationForm({ org }: { org: Organization }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = useCan('settings:update');

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
    if (Object.keys(found).length > 0 || !dueDays.ok || !checkedReminders.ok) return;

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

  return (
    <form className="fm fm--single pg-narrow" onSubmit={submit} noValidate>
      <div className="fm__main">
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
              <span className="hint">Set when Hodi created the organisation.</span>
            </div>
          </div>
        </section>

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

        <section className="fm__section">
          <h2>Rent reminders</h2>
          <p>An SMS to tenants who owe, before rent is due and when it is overdue. Each message costs an SMS; tenants who asked not to get them are skipped (untick it on their page).</p>
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

        {showServerError ? <p className="ad__error" role="alert">{settingsErrorMessage(save.error)}</p> : null}

        {canEdit ? (
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
        )}
      </div>
    </form>
  );
}
