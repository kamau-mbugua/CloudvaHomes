import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api/client';
import { useCan } from '../../lib/auth/useAuth';
import { formatDay, todayInNairobi } from '../../lib/dates';
import { formatKES, minorToInput } from '../../lib/money';
import { useToast } from '../../lib/useToast';
import { ConfirmDelete } from '../../components/ConfirmDelete';
import { EmptyState } from '../../components/EmptyState';
import { Sheet } from '../../components/Sheet';
import { PropertySelect } from '../billing/ui';
import { unwrap, unwrapList } from '../payments/rules';
import { splitFormError } from '../portfolio/formErrors';
import { useForm, useListFilters } from '../portfolio/hooks';
import { RECORD_STATUS, optionsOf } from '../portfolio/labels';
import { Badge, Field } from '../portfolio/ui';
import { expensesErrorMessage, keys, reportKeys } from './api';
import { EXPENSE_CATEGORY, categoryText } from './labels';
import { RECURRING_FIELDS, checkRecurring, describeSchedule, readCreated, repeatDay } from './rules';
import type { RecurringField } from './rules';
import type { RecurringExpense } from './types';

/**
 * Recurring expenses (the second tab of `/app/expenses`): regular costs — a guard's
 * salary, a cleaning contract — that a daily job turns into expenses when they fall due.
 * "Generate due now" runs that job for this organisation straight away.
 */
export function RecurringTab() {
  const filters = useListFilters();
  const queryClient = useQueryClient();
  const toast = useToast();
  const propertyId = filters.get('propertyId');
  const status = filters.get('status');
  const canCreate = useCan('expenses:create');
  const canUpdate = useCan('expenses:update');
  const canDelete = useCan('expenses:delete');
  const [editing, setEditing] = useState<RecurringExpense | 'new' | null>(null);

  const list = useQuery({
    queryKey: [...keys.recurring, { propertyId, status }],
    queryFn: () => api.get<unknown>('/recurring-expenses', { propertyId, status })
      .then((body) => unwrapList<RecurringExpense>(body)),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.recurring });
    await queryClient.invalidateQueries({ queryKey: keys.expenses });
    await queryClient.invalidateQueries({ queryKey: reportKeys });
  };

  const run = useMutation({
    mutationFn: () => api.post<unknown>('/recurring-expenses/run'),
    onSuccess: async (body) => {
      const created = readCreated(body);
      toast.saved(created === 0 ? 'Nothing was due — no expenses were created.' : `${created} ${created === 1 ? 'expense was' : 'expenses were'} created.`);
      await refresh();
    },
    onError: (error) => toast.failed(expensesErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (item: RecurringExpense) => api.delete<unknown>(`/recurring-expenses/${item.id}`),
    onSuccess: async (body, item) => {
      // It is only deleted if it never created anything; otherwise the API marks it inactive.
      const after = body ? unwrap<Partial<RecurringExpense> | undefined>(body) : undefined;
      toast.saved(after?.status === 'INACTIVE'
        ? `${item.name} has already created expenses, so it was marked inactive instead of deleted.`
        : `${item.name} was deleted.`);
      await refresh();
    },
    onError: (error) => toast.failed(expensesErrorMessage(error)),
  });

  const rows = list.data ?? [];
  const filtered = Boolean(propertyId || status);

  return (
    <section>
      <div className="ad__filters">
        <PropertySelect allowAll value={propertyId} onChange={(id) => filters.setFilter({ propertyId: id })} />
        <select className="ad__select" aria-label="Status" value={status} onChange={(e) => filters.setFilter({ status: e.target.value })}>
          <option value="">Active and inactive</option>
          {optionsOf(RECORD_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {canCreate ? (
          <div className="bl__headbtns pg-push">
            <button type="button" className="nx-btn" disabled={run.isPending} onClick={() => run.mutate()}
              title="Create every recurring expense that has fallen due, now instead of overnight">
              {run.isPending ? 'Generating…' : 'Generate due now'}
            </button>
            <button type="button" className="nx-btn nx-btn--primary" onClick={() => setEditing('new')}>Add recurring</button>
          </div>
        ) : null}
      </div>

      {list.isError ? <p className="ad__error" role="alert">{expensesErrorMessage(list.error)}</p> : null}

      {list.isPending ? (
        <p className="ad__muted" role="status">Loading…</p>
      ) : rows.length === 0 && !list.isError ? (
        <div className="ad__tablewrap">
          {filtered ? (
            <EmptyState title="No recurring expenses match" detail="Clear the filters to see them all." onClear={() => filters.clear(['tab'])} />
          ) : (
            <EmptyState
              title="No recurring expenses"
              detail="Set up costs that repeat — a night guard every month, insurance every year — and Hodi records each one on its day."
              action={canCreate ? <button type="button" className="nx-btn nx-btn--sm nx-btn--primary" onClick={() => setEditing('new')}>Add recurring</button> : undefined}
            />
          )}
        </div>
      ) : (
        <div className="ad__tablewrap">
          <table className="ad__table ex__table">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Property</th>
                <th>Schedule</th>
                <th>Next due</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th className="ad__rowactions"><span className="nx-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <span className="ad__sub">{categoryText(r.category)}{r.payee ? ` · ${r.payee}` : ''}</span>
                  </td>
                  <td>{r.property.name}<span className="ad__sub num">{r.property.code}</span></td>
                  <td>
                    {describeSchedule(r.everyMonths, r.dayOfMonth)}
                    {r.endDate ? <span className="ad__sub">Until {formatDay(r.endDate)}</span> : null}
                  </td>
                  <td>{r.status === 'ACTIVE' ? formatDay(r.nextDue) : <span className="nx-muted">—</span>}</td>
                  <td className="num">{formatKES(r.amount)}</td>
                  <td><Badge table={RECORD_STATUS} value={r.status} /></td>
                  <td className="ad__rowactions">
                    <div>
                      {canUpdate ? <button type="button" className="nx-btn nx-btn--sm" onClick={() => setEditing(r)}>Edit</button> : null}
                      {canDelete ? (
                        <ConfirmDelete what={r.name} busy={remove.isPending && remove.variables?.id === r.id}
                          consequence="Expenses it already created stay. If it has created any, it is marked inactive instead of deleted."
                          onConfirm={() => remove.mutate(r)} />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? <RecurringSheet item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

const MONTH_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1);

function RecurringSheet({ item, onClose }: { item?: RecurringExpense; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const canSeeProperties = useCan('properties:view');
  const editing = Boolean(item);
  const form = useForm<RecurringField>({
    propertyId: item?.property.id ?? '',
    category: item?.category ?? '',
    name: item?.name ?? '',
    payee: item?.payee ?? '',
    amount: item ? minorToInput(item.amount) : '',
    everyMonths: String(item?.everyMonths ?? 1),
    dayOfMonth: String(item?.dayOfMonth ?? 1),
    startDate: todayInNairobi(),
    endDate: item?.endDate ?? '',
    status: item?.status ?? 'ACTIVE',
  });
  const { values, errors, set } = form;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => (item
      ? api.patch(`/recurring-expenses/${item.id}`, body)
      : api.post('/recurring-expenses', body)),
    onSuccess: async () => {
      toast.saved(`${values.name.trim()} was ${item ? 'saved' : 'set up'}.`);
      await queryClient.invalidateQueries({ queryKey: keys.recurring });
      onClose();
    },
    onError: (error) => {
      const { fieldErrors, general } = splitFormError(error, { fields: RECURRING_FIELDS, describe: (e) => expensesErrorMessage(e) });
      form.setErrors(fieldErrors);
      form.setGeneral(general);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = checkRecurring(values, { editing });
    form.setGeneral(null);
    if (!checked.ok) {
      form.setErrors(checked.errors);
      return;
    }
    form.setErrors({});
    save.mutate({ ...checked.body });
  };

  const every = Number(values.everyMonths);
  const day = item ? item.dayOfMonth : repeatDay(values.startDate);

  return (
    <Sheet
      title={item ? `Edit ${item.name}` : 'Add a recurring expense'}
      wide
      busy={save.isPending}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="nx-btn" onClick={onClose} disabled={save.isPending}>Cancel</button>
          <button type="submit" form="recurring-form" className="nx-btn nx-btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : item ? 'Save' : 'Add recurring expense'}
          </button>
        </>
      )}
    >
      <form id="recurring-form" className="fm__grid ex__form" onSubmit={submit} noValidate>
        {item ? (
          <p className="ad__muted fm__wide">
            {item.property.name} ({item.property.code}).{' '}
            {item.status === 'ACTIVE' ? `Next due ${formatDay(item.nextDue)}.` : 'Inactive — it creates nothing until it is made active again.'}
          </p>
        ) : (
          <Field id="rx-property" label="Property" error={errors.propertyId}
            hint={!canSeeProperties ? 'Your role can’t list properties.' : undefined}>
            {canSeeProperties ? (
              <PropertySelect id="rx-property" className="" value={values.propertyId} onChange={(id) => set('propertyId', id)} />
            ) : <input id="rx-property" disabled />}
          </Field>
        )}
        <Field id="rx-category" label="Category" error={errors.category}>
          <select id="rx-category" value={values.category} onChange={(e) => set('category', e.target.value)} aria-invalid={Boolean(errors.category)}>
            <option value="">Choose a category…</option>
            {optionsOf(EXPENSE_CATEGORY).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field id="rx-name" label="What it is" error={errors.name} wide={editing}>
          <input id="rx-name" value={values.name} maxLength={200} autoComplete="off" placeholder="e.g. Night guard"
            onChange={(e) => set('name', e.target.value)} aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field id="rx-payee" label="Paid to" optional error={errors.payee}>
          <input id="rx-payee" value={values.payee} maxLength={200} autoComplete="off" placeholder="e.g. Sample Security Ltd"
            onChange={(e) => set('payee', e.target.value)} />
        </Field>
        <Field id="rx-amount" label="Amount each time (KES)" error={errors.amount}>
          <input id="rx-amount" className="num" value={values.amount} inputMode="decimal" autoComplete="off" placeholder="0.00"
            onChange={(e) => set('amount', e.target.value)} aria-invalid={Boolean(errors.amount)} />
        </Field>
        <Field id="rx-every" label="Every" error={errors.everyMonths}>
          <select id="rx-every" value={values.everyMonths} onChange={(e) => set('everyMonths', e.target.value)}>
            {MONTH_CHOICES.map((n) => <option key={n} value={n}>{n === 1 ? 'month' : `${n} months`}</option>)}
          </select>
        </Field>
        {item ? null : (
          <Field id="rx-start" label="First one on" error={errors.startDate ?? errors.dayOfMonth}
            hint="It repeats on this day of the month (the 28th for days after the 28th).">
            <input id="rx-start" type="date" value={values.startDate} onChange={(e) => set('startDate', e.target.value)}
              aria-invalid={Boolean(errors.startDate)} />
          </Field>
        )}
        <Field id="rx-end" label="Ending" optional error={errors.endDate} hint="Leave empty to keep going.">
          <input id="rx-end" type="date" min={item ? undefined : values.startDate || undefined} value={values.endDate}
            onChange={(e) => set('endDate', e.target.value)} aria-invalid={Boolean(errors.endDate)} />
        </Field>
        {item ? (
          <Field id="rx-status" label="Status" error={errors.status} hint="Inactive ones create nothing.">
            <select id="rx-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
        ) : null}
        {Number.isInteger(every) && day !== null ? (
          <p className="ad__muted fm__wide" aria-live="polite">{describeSchedule(every, day)}.</p>
        ) : null}
        {form.general ? <p className="nx-sheet__error fm__wide" role="alert">{form.general}</p> : null}
      </form>
    </Sheet>
  );
}
